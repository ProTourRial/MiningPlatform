/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { createHash, randomUUID } from 'node:crypto';
import type { DomainEvent } from '@mining/event-bus';
import { assertBalanced } from '@mining/ledger';
import {
  allocateSettledReward,
  resolveEffectiveFeePolicy,
  snapshotFeePolicy,
  type FeePolicyCandidate,
} from '@mining/reward-engine';
import {
  MiningEvents,
  type ContributionAcceptedPayload,
  type SettlementImportedPayload,
} from '@mining/shared';
import { serializableTransaction } from './serializable-transaction.js';

const CONTRIBUTION_SCALE = 12;
const STRATEGY_VERSION = 'follow-upstream-atomic-v1';
const ROUNDING_POLICY = 'largest-remainder-user-favouring-v1';
const PARTS_PER_MILLION_PER_BASIS_POINT = 100;

export type AccountingResult =
  | { processed: true; resultReference: string }
  | { processed: false; reason: 'DUPLICATE' | 'RECONCILIATION_EXCEPTION'; resultReference: string };

function eventHash(event: DomainEvent): string {
  return createHash('sha256').update(JSON.stringify(event)).digest('hex');
}

export function decimalToScaledInteger(value: string, scale: number): bigint {
  const match = /^([0-9]+)(?:\.([0-9]+))?$/.exec(value);
  if (!match) throw new Error(`Invalid non-negative decimal: ${value}`);
  const fraction = match[2] ?? '';
  if (fraction.length > scale && /[1-9]/.test(fraction.slice(scale))) {
    throw new Error(`Decimal exceeds supported scale ${scale}: ${value}`);
  }
  const whole = match[1] ?? '0';
  const normalizedFraction = fraction.slice(0, scale).padEnd(scale, '0');
  return BigInt(`${whole}${normalizedFraction}`);
}

export function scaledIntegerToDecimal(value: bigint, scale: number): string {
  if (value < 0n) throw new Error('Accounting amounts cannot be negative');
  if (scale === 0) return value.toString();
  const digits = value.toString().padStart(scale + 1, '0');
  return `${digits.slice(0, -scale)}.${digits.slice(-scale)}`;
}

function sameContribution(
  existing: {
    sourceEventId: string;
    shareId: string;
    miningAccountId: string;
    assetId: string;
    upstreamPoolId: string;
    acceptedDifficulty: { toString(): string };
    acceptedAt: Date;
    correlationId: string;
  },
  event: DomainEvent<ContributionAcceptedPayload>,
): boolean {
  const payload = event.payload;
  return (
    existing.sourceEventId === payload.sourceEventId &&
    existing.shareId === payload.shareId &&
    existing.miningAccountId === payload.miningAccountId &&
    existing.assetId === payload.assetId &&
    existing.upstreamPoolId === payload.upstreamPoolId &&
    decimalToScaledInteger(existing.acceptedDifficulty.toString(), CONTRIBUTION_SCALE) ===
      decimalToScaledInteger(payload.acceptedDifficulty, CONTRIBUTION_SCALE) &&
    existing.acceptedAt.toISOString() === new Date(payload.acceptedAt).toISOString() &&
    existing.correlationId === event.correlationId
  );
}

export class AccountingService {
  async handle(event: DomainEvent): Promise<AccountingResult> {
    if (event.eventVersion !== 1) {
      throw new Error(`Unsupported event version ${event.eventVersion} for ${event.eventName}`);
    }
    if (event.eventName === MiningEvents.contributionAccepted) {
      return this.recordContribution(event as DomainEvent<ContributionAcceptedPayload>);
    }
    if (event.eventName === MiningEvents.settlementImported) {
      return this.processSettlement(event as DomainEvent<SettlementImportedPayload>);
    }
    throw new Error(`Unsupported accounting event: ${event.eventName}`);
  }

  private async recordContribution(
    event: DomainEvent<ContributionAcceptedPayload>,
  ): Promise<AccountingResult> {
    const payload = event.payload;
    const acceptedAt = new Date(payload.acceptedAt);
    if (Number.isNaN(acceptedAt.getTime())) throw new Error('Contribution acceptedAt is invalid');
    if (decimalToScaledInteger(payload.acceptedDifficulty, CONTRIBUTION_SCALE) <= 0n) {
      throw new Error('Contribution difficulty must be greater than zero');
    }

    return serializableTransaction(async (tx) => {
      const inserted = await tx.contributionFact.createMany({
        data: [
          {
            sourceEventId: payload.sourceEventId,
            shareId: payload.shareId,
            miningAccountId: payload.miningAccountId,
            assetId: payload.assetId,
            upstreamPoolId: payload.upstreamPoolId,
            acceptedDifficulty: payload.acceptedDifficulty,
            acceptedAt,
            correlationId: event.correlationId,
          },
        ],
        skipDuplicates: true,
      });
      const contribution = await tx.contributionFact.findFirstOrThrow({
        where: {
          OR: [{ sourceEventId: payload.sourceEventId }, { shareId: payload.shareId }],
        },
      });
      if (!sameContribution(contribution, event)) {
        throw new Error(`Contribution idempotency conflict: ${payload.shareId}`);
      }
      return inserted.count === 1
        ? { processed: true, resultReference: contribution.id }
        : { processed: false, reason: 'DUPLICATE', resultReference: contribution.id };
    });
  }

  private async processSettlement(
    event: DomainEvent<SettlementImportedPayload>,
  ): Promise<AccountingResult> {
    return serializableTransaction(async (tx) => {
      const payload = event.payload;
      const reconciliation = await tx.upstreamReconciliation.findUniqueOrThrow({
        where: { id: payload.reconciliationId },
        include: {
          asset: true,
          rewardPeriod: true,
        },
      });
      if (
        reconciliation.rewardPeriodId !== payload.rewardPeriodId ||
        reconciliation.importIdempotencyKey !== payload.importIdempotencyKey
      ) {
        throw new Error(`Settlement event does not match reconciliation ${reconciliation.id}`);
      }
      if (reconciliation.rewardPeriod.status === 'CLOSED') {
        return {
          processed: false,
          reason: 'DUPLICATE',
          resultReference: reconciliation.rewardPeriodId,
        };
      }
      if (
        reconciliation.status !== 'MATCHED' ||
        reconciliation.varianceAtomic !== 0n ||
        reconciliation.toleranceAtomic !== 0n
      ) {
        return {
          processed: false,
          reason: 'RECONCILIATION_EXCEPTION',
          resultReference: reconciliation.id,
        };
      }

      const claimed = await tx.rewardPeriod.updateMany({
        where: { id: reconciliation.rewardPeriodId, status: { in: ['OPEN', 'FAILED'] } },
        data: { status: 'CALCULATING', failureCode: null },
      });
      if (claimed.count !== 1) {
        throw new Error(
          `Reward period is already being processed: ${reconciliation.rewardPeriodId}`,
        );
      }

      const facts = await tx.contributionFact.findMany({
        where: {
          assetId: reconciliation.assetId,
          upstreamPoolId: reconciliation.upstreamPoolId,
          rewardPeriodId: null,
          acceptedAt: {
            gte: reconciliation.rewardPeriod.periodStart,
            lt: reconciliation.rewardPeriod.periodEnd,
          },
        },
        orderBy: [{ miningAccountId: 'asc' }, { acceptedAt: 'asc' }, { id: 'asc' }],
      });
      if (facts.length === 0 && reconciliation.upstreamGrossAtomic > 0n) {
        await tx.rewardPeriod.update({
          where: { id: reconciliation.rewardPeriodId },
          data: { status: 'FAILED', failureCode: 'NO_ACCEPTED_CONTRIBUTIONS' },
        });
        return {
          processed: false,
          reason: 'RECONCILIATION_EXCEPTION',
          resultReference: reconciliation.rewardPeriodId,
        };
      }

      const grouped = new Map<string, { units: bigint; factIds: string[]; shareCount: number }>();
      for (const fact of facts) {
        const current = grouped.get(fact.miningAccountId) ?? {
          units: 0n,
          factIds: [],
          shareCount: 0,
        };
        current.units += decimalToScaledInteger(
          fact.acceptedDifficulty.toString(),
          CONTRIBUTION_SCALE,
        );
        current.factIds.push(`${fact.id}:${fact.sourceEventId}`);
        current.shareCount += 1;
        grouped.set(fact.miningAccountId, current);
      }

      if (facts.length > 0) {
        const assigned = await tx.contributionFact.updateMany({
          where: { id: { in: facts.map((fact) => fact.id) }, rewardPeriodId: null },
          data: { rewardPeriodId: reconciliation.rewardPeriodId },
        });
        if (assigned.count !== facts.length) {
          throw new Error('Concurrent contribution assignment detected');
        }
      }

      const snapshots = [...grouped.entries()].map(([miningAccountId, contribution]) => ({
        rewardPeriodId: reconciliation.rewardPeriodId,
        miningAccountId,
        acceptedDifficulty: scaledIntegerToDecimal(contribution.units, CONTRIBUTION_SCALE),
        shareCount: contribution.shareCount,
        sourceDigest: createHash('sha256').update(contribution.factIds.join('|')).digest('hex'),
      }));
      if (snapshots.length > 0) {
        await tx.rewardPeriodContribution.createMany({ data: snapshots });
      }

      const miningAccountIds = [...grouped.keys()];
      const accounts = await tx.miningAccount.findMany({
        where: { id: { in: miningAccountIds }, enabled: true, deletedAt: null },
        include: {
          user: true,
          referralAttribution: {
            include: {
              referralCode: { include: { program: true } },
            },
          },
        },
      });
      if (accounts.length !== miningAccountIds.length) {
        throw new Error('Settlement includes a disabled or missing mining account');
      }
      const policyRecords = await tx.miningFeePolicy.findMany({
        where: {
          status: 'ACTIVE',
          effectiveFrom: { lte: reconciliation.rewardPeriod.periodEnd },
          OR: [
            { effectiveUntil: null },
            { effectiveUntil: { gt: reconciliation.rewardPeriod.periodEnd } },
          ],
        },
      });
      const policies: FeePolicyCandidate[] = policyRecords.map((policy) => ({
        ...policy,
        feeBasisPoints: Number(policy.feeBasisPoints.toString()),
      }));
      const policyByAccount = new Map(
        accounts.map((account) => {
          const policy = resolveEffectiveFeePolicy(
            policies,
            {
              assetId: reconciliation.assetId,
              algorithm: reconciliation.asset.algorithm,
              miningAccountId: account.id,
            },
            reconciliation.rewardPeriod.periodEnd,
          );
          return [account.id, policy] as const;
        }),
      );
      const referralByAccount = new Map(
        accounts.map((account) => {
          const attribution = account.referralAttribution;
          const program = attribution?.referralCode.program;
          const accountFacts = facts.filter((fact) => fact.miningAccountId === account.id);
          const effective = Boolean(
            attribution &&
              attribution.referralCode.active &&
              program?.status === 'ACTIVE' &&
              program.effectiveFrom <= reconciliation.rewardPeriod.periodEnd &&
              (!program.effectiveUntil ||
                program.effectiveUntil > reconciliation.rewardPeriod.periodEnd) &&
              accountFacts.every((fact) => fact.acceptedAt >= attribution.attributedAt),
          );
          return [account.id, effective ? attribution : null] as const;
        }),
      );
      const allocations = allocateSettledReward({
        grossAtomic: reconciliation.upstreamGrossAtomic,
        upstreamFeeAtomic: reconciliation.upstreamFeeAtomic,
        networkFeeAtomic: reconciliation.networkFeeAtomic,
        contributions: [...grouped.entries()].map(([miningAccountId, contribution]) => {
          const attribution = referralByAccount.get(miningAccountId);
          const program = attribution?.referralCode.program;
          const policy = policyByAccount.get(miningAccountId)!;
          return {
            miningAccountId,
            contributionUnits: contribution.units,
            feePartsPerMillion: BigInt(
              attribution ? program!.minerFeePartsPerMillion : policy.feePartsPerMillion,
            ),
            referralCommissionPartsPerMillion: BigInt(
              attribution ? program!.commissionPartsPerMillion : 0,
            ),
          };
        }),
      });

      const clearing = await tx.ledgerAccount.findUniqueOrThrow({
        where: { code: `${reconciliation.asset.symbol}-REWARD-CLEARING` },
      });
      const platformRevenue = await tx.ledgerAccount.findUniqueOrThrow({
        where: { code: `${reconciliation.asset.symbol}-PLATFORM-FEE` },
      });
      let platformFeeAtomic = 0n;
      let referralCommissionAtomic = 0n;
      let platformRetainedAtomic = 0n;
      let userNetAtomic = 0n;
      const accountById = new Map(accounts.map((account) => [account.id, account]));

      for (const allocation of allocations) {
        const account = accountById.get(allocation.miningAccountId)!;
        const policy = policyByAccount.get(allocation.miningAccountId)!;
        const attribution = referralByAccount.get(allocation.miningAccountId);
        const referralCode = attribution?.referralCode;
        const referralProgram = referralCode?.program;
        const snapshot = {
          ...snapshotFeePolicy(policy, reconciliation.importedAt),
          effectiveFeePartsPerMillion: Number(
            attribution ? referralProgram!.minerFeePartsPerMillion : policy.feePartsPerMillion,
          ),
          referralApplied: Boolean(attribution),
        };
        const postedAtomic = allocation.netAtomic + allocation.platformFeeAtomic;
        let journalEntryId: string | undefined;
        if (postedAtomic > 0n) {
          const liability = await tx.ledgerAccount.upsert({
            where: { code: `${reconciliation.asset.symbol}-USER-LIABILITY-${account.userId}` },
            create: {
              code: `${reconciliation.asset.symbol}-USER-LIABILITY-${account.userId}`,
              name: `${reconciliation.asset.symbol} User Reward Liability`,
              type: 'LIABILITY',
              userId: account.userId,
              assetId: reconciliation.assetId,
              systemAccount: false,
            },
            update: {},
          });
          const referralLiability =
            allocation.referralCommissionAtomic > 0n
              ? await tx.ledgerAccount.upsert({
                  where: {
                    code:
                      referralCode!.beneficiaryType === 'SITE_DONATION'
                        ? `${reconciliation.asset.symbol}-SITE-DONATION-REFERRAL-LIABILITY`
                        : `${reconciliation.asset.symbol}-REFERRAL-LIABILITY-${
                            referralCode!.ownerUserId
                          }`,
                  },
                  create: {
                    code:
                      referralCode!.beneficiaryType === 'SITE_DONATION'
                        ? `${reconciliation.asset.symbol}-SITE-DONATION-REFERRAL-LIABILITY`
                        : `${reconciliation.asset.symbol}-REFERRAL-LIABILITY-${
                            referralCode!.ownerUserId
                          }`,
                    name:
                      referralCode!.beneficiaryType === 'SITE_DONATION'
                        ? `${reconciliation.asset.symbol} Site Donation Referral Liability`
                        : `${reconciliation.asset.symbol} User Referral Commission Liability`,
                    type: 'LIABILITY',
                    userId:
                      referralCode!.beneficiaryType === 'USER' ? referralCode!.ownerUserId : null,
                    assetId: reconciliation.assetId,
                    systemAccount: referralCode!.beneficiaryType === 'SITE_DONATION',
                  },
                  update: {},
                })
              : null;
          const journalLines = [
            { accountCode: clearing.code, debit: postedAtomic, credit: 0n },
            { accountCode: liability.code, debit: 0n, credit: allocation.netAtomic },
            ...(allocation.platformRetainedAtomic > 0n
              ? [
                  {
                    accountCode: platformRevenue.code,
                    debit: 0n,
                    credit: allocation.platformRetainedAtomic,
                  },
                ]
              : []),
            ...(allocation.referralCommissionAtomic > 0n
              ? [
                  {
                    accountCode: referralLiability!.code,
                    debit: 0n,
                    credit: allocation.referralCommissionAtomic,
                  },
                ]
              : []),
          ];
          assertBalanced(journalLines);
          const ledgerAccountByCode = new Map([
            [clearing.code, clearing.id],
            [liability.code, liability.id],
            [platformRevenue.code, platformRevenue.id],
            ...(referralLiability
              ? ([[referralLiability.code, referralLiability.id]] as const)
              : []),
          ]);
          const journal = await tx.journalEntry.create({
            data: {
              idempotencyKey: `reward-allocation:${reconciliation.rewardPeriodId}:${account.id}:v1`,
              referenceType: 'RewardAllocation',
              referenceId: `${reconciliation.rewardPeriodId}:${account.id}`,
              description: `Follow-upstream reward allocation for ${reconciliation.asset.symbol}`,
              correlationId: event.correlationId,
              causationId: event.eventId,
              status: 'PENDING',
              effectiveAt: reconciliation.rewardPeriod.periodEnd,
              lines: {
                create: journalLines.map((line) => ({
                  ledgerAccountId: ledgerAccountByCode.get(line.accountCode)!,
                  assetId: reconciliation.assetId,
                  debit: scaledIntegerToDecimal(line.debit, reconciliation.asset.decimals),
                  credit: scaledIntegerToDecimal(line.credit, reconciliation.asset.decimals),
                  debitAtomic: line.debit,
                  creditAtomic: line.credit,
                })),
              },
            },
          });
          await tx.journalEntry.update({
            where: { id: journal.id },
            data: { status: 'POSTED', postedAt: new Date() },
          });
          journalEntryId = journal.id;
          await tx.outboxEvent.create({
            data: {
              eventId: randomUUID(),
              eventName: MiningEvents.journalPosted,
              eventVersion: 1,
              producer: 'accounting-worker',
              aggregateType: 'JournalEntry',
              aggregateId: journal.id,
              correlationId: event.correlationId,
              causationId: event.eventId,
              idempotencyKey: `journal-posted:${journal.id}:v1`,
              payload: {
                journalEntryId: journal.id,
                rewardPeriodId: reconciliation.rewardPeriodId,
              },
              occurredAt: new Date(),
            },
          });
        }

        await tx.rewardAllocation.create({
          data: {
            rewardPeriodId: reconciliation.rewardPeriodId,
            miningAccountId: account.id,
            feePolicyId: policy.id,
            feePolicyVersion: policy.version,
            feeBasisPoints: (
              Number(
                attribution ? referralProgram!.minerFeePartsPerMillion : policy.feePartsPerMillion,
              ) / PARTS_PER_MILLION_PER_BASIS_POINT
            ).toString(),
            feePartsPerMillion: Number(
              attribution ? referralProgram!.minerFeePartsPerMillion : policy.feePartsPerMillion,
            ),
            feePolicySnapshot: { ...snapshot },
            referralAttributionId: attribution?.id,
            referralProgramId: referralProgram?.id,
            referralProgramVersion: referralProgram?.version,
            referralCommissionPartsPerMillion: referralProgram?.commissionPartsPerMillion ?? 0,
            referralCodeSnapshot: referralCode
              ? {
                  id: referralCode.id,
                  code: referralCode.code,
                  beneficiaryType: referralCode.beneficiaryType,
                  ownerUserId: referralCode.ownerUserId,
                  attributedAt: attribution!.attributedAt.toISOString(),
                }
              : undefined,
            referralProgramSnapshot: referralProgram
              ? {
                  id: referralProgram.id,
                  programKey: referralProgram.programKey,
                  version: referralProgram.version,
                  minerFeePartsPerMillion: referralProgram.minerFeePartsPerMillion,
                  commissionPartsPerMillion: referralProgram.commissionPartsPerMillion,
                  effectiveFrom: referralProgram.effectiveFrom.toISOString(),
                  effectiveUntil: referralProgram.effectiveUntil?.toISOString() ?? null,
                }
              : undefined,
            contribution: scaledIntegerToDecimal(allocation.contributionUnits, CONTRIBUTION_SCALE),
            grossAmount: scaledIntegerToDecimal(
              allocation.grossAtomic,
              reconciliation.asset.decimals,
            ),
            upstreamFeeAmount: scaledIntegerToDecimal(
              allocation.upstreamFeeAtomic,
              reconciliation.asset.decimals,
            ),
            networkFeeAmount: scaledIntegerToDecimal(
              allocation.networkFeeAtomic,
              reconciliation.asset.decimals,
            ),
            platformFeeAmount: scaledIntegerToDecimal(
              allocation.platformFeeAtomic,
              reconciliation.asset.decimals,
            ),
            netAmount: scaledIntegerToDecimal(allocation.netAtomic, reconciliation.asset.decimals),
            contributionUnits: allocation.contributionUnits,
            grossAtomic: allocation.grossAtomic,
            upstreamFeeAtomic: allocation.upstreamFeeAtomic,
            networkFeeAtomic: allocation.networkFeeAtomic,
            platformFeeAtomic: allocation.platformFeeAtomic,
            referralCommissionAtomic: allocation.referralCommissionAtomic,
            platformRetainedAtomic: allocation.platformRetainedAtomic,
            netAtomic: allocation.netAtomic,
            strategyVersion: STRATEGY_VERSION,
            roundingPolicy: ROUNDING_POLICY,
            journalEntryId,
          },
        });
        platformFeeAtomic += allocation.platformFeeAtomic;
        referralCommissionAtomic += allocation.referralCommissionAtomic;
        platformRetainedAtomic += allocation.platformRetainedAtomic;
        userNetAtomic += allocation.netAtomic;
      }

      const distributableAtomic =
        reconciliation.upstreamGrossAtomic -
        reconciliation.upstreamFeeAtomic -
        reconciliation.networkFeeAtomic;
      const totalContribution = [...grouped.values()].reduce((sum, row) => sum + row.units, 0n);
      await tx.rewardPeriod.update({
        where: { id: reconciliation.rewardPeriodId },
        data: {
          status: 'ALLOCATED',
          reconciliationStatus: 'MATCHED',
          strategyVersion: STRATEGY_VERSION,
          grossReward: scaledIntegerToDecimal(
            reconciliation.upstreamGrossAtomic,
            reconciliation.asset.decimals,
          ),
          upstreamFee: scaledIntegerToDecimal(
            reconciliation.upstreamFeeAtomic,
            reconciliation.asset.decimals,
          ),
          networkFee: scaledIntegerToDecimal(
            reconciliation.networkFeeAtomic,
            reconciliation.asset.decimals,
          ),
          platformFee: scaledIntegerToDecimal(platformFeeAtomic, reconciliation.asset.decimals),
          distributableReward: scaledIntegerToDecimal(
            distributableAtomic,
            reconciliation.asset.decimals,
          ),
          grossAtomic: reconciliation.upstreamGrossAtomic,
          upstreamFeeAtomic: reconciliation.upstreamFeeAtomic,
          networkFeeAtomic: reconciliation.networkFeeAtomic,
          platformFeeAtomic,
          referralCommissionAtomic,
          platformRetainedAtomic,
          distributableAtomic,
          userNetAtomic,
          totalContribution: scaledIntegerToDecimal(totalContribution, CONTRIBUTION_SCALE),
          shareCount: facts.length,
          allocatedAt: new Date(),
        },
      });
      await tx.upstreamReconciliation.update({
        where: { id: reconciliation.id },
        data: { reconciledAt: new Date() },
      });
      await tx.rewardPeriod.update({
        where: { id: reconciliation.rewardPeriodId },
        data: { status: 'RECONCILED', reconciledAt: new Date() },
      });
      await tx.rewardPeriod.update({
        where: { id: reconciliation.rewardPeriodId },
        data: { status: 'CLOSED', closedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          action: 'UPSTREAM_SETTLEMENT_ACCOUNTED',
          resourceType: 'RewardPeriod',
          resourceId: reconciliation.rewardPeriodId,
          metadata: {
            reconciliationId: reconciliation.id,
            sourceReference: reconciliation.sourceReference,
            sourceChecksum: reconciliation.sourceChecksum,
            grossAtomic: reconciliation.upstreamGrossAtomic.toString(),
            platformFeeAtomic: platformFeeAtomic.toString(),
            referralCommissionAtomic: referralCommissionAtomic.toString(),
            platformRetainedAtomic: platformRetainedAtomic.toString(),
            userNetAtomic: userNetAtomic.toString(),
            eventHash: eventHash(event),
          },
        },
      });
      await tx.outboxEvent.create({
        data: {
          eventId: randomUUID(),
          eventName: MiningEvents.rewardPeriodClosed,
          eventVersion: 1,
          producer: 'accounting-worker',
          aggregateType: 'RewardPeriod',
          aggregateId: reconciliation.rewardPeriodId,
          correlationId: event.correlationId,
          causationId: event.eventId,
          idempotencyKey: `reward-period-closed:${reconciliation.rewardPeriodId}:v1`,
          payload: {
            rewardPeriodId: reconciliation.rewardPeriodId,
            reconciliationId: reconciliation.id,
            platformFeeAtomic: platformFeeAtomic.toString(),
            referralCommissionAtomic: referralCommissionAtomic.toString(),
            platformRetainedAtomic: platformRetainedAtomic.toString(),
            userNetAtomic: userNetAtomic.toString(),
          },
          occurredAt: new Date(),
        },
      });

      return { processed: true, resultReference: reconciliation.rewardPeriodId };
    });
  }

  async reverseJournal(input: {
    journalEntryId: string;
    actorUserId: string;
    reason: string;
    correlationId?: string;
  }): Promise<AccountingResult> {
    const reason = input.reason.trim();
    if (reason.length < 10)
      throw new Error('Journal reversal reason must contain at least 10 characters');
    return serializableTransaction(async (tx) => {
      const original = await tx.journalEntry.findUniqueOrThrow({
        where: { id: input.journalEntryId },
        include: { lines: true },
      });
      if (original.status === 'REVERSED' && original.reversedEntryId) {
        return {
          processed: false,
          reason: 'DUPLICATE',
          resultReference: original.reversedEntryId,
        };
      }
      if (original.status !== 'POSTED' || !original.postedAt) {
        throw new Error('Only posted journal entries can be reversed');
      }
      const correlationId = input.correlationId ?? original.correlationId;
      const reversal = await tx.journalEntry.create({
        data: {
          idempotencyKey: `journal-reversal:${original.id}:v1`,
          referenceType: 'JournalReversal',
          referenceId: original.id,
          description: `Reversal: ${original.description}`,
          correlationId,
          causationId: original.id,
          status: 'PENDING',
          effectiveAt: new Date(),
          lines: {
            create: original.lines.map((line) => ({
              ledgerAccountId: line.ledgerAccountId,
              assetId: line.assetId,
              debit: line.credit,
              credit: line.debit,
              debitAtomic: line.creditAtomic,
              creditAtomic: line.debitAtomic,
            })),
          },
        },
      });
      const now = new Date();
      await tx.journalEntry.update({
        where: { id: reversal.id },
        data: { status: 'POSTED', postedAt: now },
      });
      await tx.journalEntry.update({
        where: { id: original.id },
        data: {
          status: 'REVERSED',
          reversedEntryId: reversal.id,
          reversalReason: reason,
          reversedAt: now,
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: input.actorUserId,
          action: 'JOURNAL_ENTRY_REVERSED',
          resourceType: 'JournalEntry',
          resourceId: original.id,
          metadata: { reversalJournalEntryId: reversal.id, reason, correlationId },
        },
      });
      await tx.outboxEvent.create({
        data: {
          eventId: randomUUID(),
          eventName: MiningEvents.journalPosted,
          eventVersion: 1,
          producer: 'accounting-worker',
          aggregateType: 'JournalEntry',
          aggregateId: reversal.id,
          correlationId,
          causationId: original.id,
          idempotencyKey: `journal-reversal-posted:${original.id}:v1`,
          payload: { journalEntryId: reversal.id, reversalOfJournalEntryId: original.id },
          occurredAt: now,
        },
      });
      return { processed: true, resultReference: reversal.id };
    });
  }
}
