/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { createHash, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { validateBitcoinAddress } from '@mining/blockchain-adapters';
import { prisma, type Prisma } from '@mining/database';
import { hashSensitiveValue } from '@mining/security';
import type { AuthPrincipal } from '../auth/auth.decorators.js';
import { StepUpService } from '../auth/step-up.service.js';

const PAYOUT_ADDRESS_SCOPE = 'PAYOUT_ADDRESS_WRITE' as const;
const PAYOUT_EXECUTION_VERSION = 2;

type PayoutRequestInput = {
  miningAccountId: string;
  amountAtomic: string;
  idempotencyKey: string;
};

type PayoutDecisionInput = {
  payoutId: string;
  decision: 'APPROVED' | 'REJECTED';
  reason: string;
  idempotencyKey: string;
};

function isSerializableConflict(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2034';
}

function isUniqueConflict(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}

async function databaseNow(): Promise<Date> {
  const [result] = await prisma.$queryRaw<Array<{ now: Date }>>`
    SELECT CURRENT_TIMESTAMP AS "now"
  `;
  if (!result) throw new Error('Database did not return its current time');
  return result.now;
}

async function serializableTransaction<T>(
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: 'Serializable',
        maxWait: 10_000,
        timeout: 30_000,
      });
    } catch (error) {
      if (!isSerializableConflict(error) || attempt === 4) throw error;
    }
  }
  throw new Error('Serializable transaction retry budget exhausted');
}

function maskAddress(address: string): string {
  if (address.length <= 16) return `${address.slice(0, 4)}…${address.slice(-4)}`;
  return `${address.slice(0, 8)}…${address.slice(-8)}`;
}

function atomicToDecimal(value: bigint, decimals: number): string {
  if (value < 0n) throw new Error('Atomic amount cannot be negative');
  const scale = 10n ** BigInt(decimals);
  const whole = value / scale;
  const fraction = (value % scale).toString().padStart(decimals, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

function parsePositiveAtomic(value: string): bigint {
  if (!/^[1-9][0-9]{0,18}$/.test(value)) {
    throw new BadRequestException('amountAtomic must be a positive base-10 integer');
  }
  const amount = BigInt(value);
  if (amount > 9_223_372_036_854_775_807n) {
    throw new BadRequestException('amountAtomic exceeds the supported range');
  }
  return amount;
}

function digestEvidence(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function payoutEnvironmentGate(kind: 'requests' | 'signing' | 'broadcast'): boolean {
  if (process.env.PAYOUTS_ENABLED !== 'true') return false;
  const key =
    kind === 'requests'
      ? 'PAYOUT_REQUESTS_ENABLED'
      : kind === 'signing'
      ? 'PAYOUT_SIGNING_ENABLED'
      : 'PAYOUT_BROADCAST_ENABLED';
  return process.env[key] === 'true';
}

const addressViewSelect = {
  id: true,
  address: true,
  addressHash: true,
  label: true,
  status: true,
  verified: true,
  verifiedAt: true,
  active: true,
  cooldownUntil: true,
  activatedAt: true,
  disabledAt: true,
  createdAt: true,
  asset: { select: { symbol: true } },
  assetNetwork: { select: { id: true, networkKey: true, displayName: true, isTestnet: true } },
  payoutRoute: {
    select: {
      id: true,
      routeKey: true,
      version: true,
      status: true,
      addressCooldownSeconds: true,
      manualApprovalRequired: true,
    },
  },
} satisfies Prisma.PayoutAddressSelect;

type AddressViewRecord = Prisma.PayoutAddressGetPayload<{ select: typeof addressViewSelect }>;

function addressView(address: AddressViewRecord) {
  const { address: rawAddress, addressHash, ...rest } = address;
  return {
    ...rest,
    addressDisplay: maskAddress(rawAddress),
    addressFingerprint: addressHash.slice(0, 16),
    payoutCapable: address.active && address.payoutRoute.status === 'ACTIVE',
  };
}

const payoutViewSelect = {
  id: true,
  idempotencyKey: true,
  miningAccountId: true,
  amountAtomic: true,
  networkFeeAtomic: true,
  requestSource: true,
  executionVersion: true,
  status: true,
  transactionId: true,
  failureCode: true,
  scheduledAt: true,
  requestedAt: true,
  approvedAt: true,
  signingAt: true,
  broadcastAt: true,
  confirmingAt: true,
  completedAt: true,
  failedAt: true,
  cancelledAt: true,
  asset: { select: { symbol: true, decimals: true } },
  payoutAddress: { select: { address: true, addressHash: true, label: true } },
  payoutRoute: {
    select: { routeKey: true, version: true, status: true, requiredConfirmations: true },
  },
  eligibility: {
    select: {
      availableBalanceAtomic: true,
      reservationAmountAtomic: true,
      eligible: true,
      blockers: true,
      evaluatedAt: true,
    },
  },
  reservation: { select: { amountAtomic: true, status: true, createdAt: true } },
  approvals: {
    select: { decision: true, reason: true, createdAt: true, actor: { select: { role: true } } },
    orderBy: { createdAt: 'asc' as const },
  },
} satisfies Prisma.PayoutSelect;

type PayoutViewRecord = Prisma.PayoutGetPayload<{ select: typeof payoutViewSelect }>;

function payoutView(payout: PayoutViewRecord) {
  return {
    ...payout,
    amountAtomic: payout.amountAtomic?.toString() ?? null,
    networkFeeAtomic: payout.networkFeeAtomic.toString(),
    payoutAddress: {
      label: payout.payoutAddress.label,
      addressDisplay: maskAddress(payout.payoutAddress.address),
      addressFingerprint: payout.payoutAddress.addressHash.slice(0, 16),
    },
    eligibility: payout.eligibility
      ? {
          ...payout.eligibility,
          availableBalanceAtomic: payout.eligibility.availableBalanceAtomic.toString(),
          reservationAmountAtomic: payout.eligibility.reservationAmountAtomic.toString(),
        }
      : null,
    reservation: payout.reservation
      ? { ...payout.reservation, amountAtomic: payout.reservation.amountAtomic.toString() }
      : null,
  };
}

@Injectable()
export class PayoutsService {
  constructor(private readonly stepUpService: StepUpService) {}

  async routes() {
    const now = await databaseNow();
    const routes = await prisma.payoutRoute.findMany({
      where: {
        status: { not: 'DISABLED' },
        effectiveFrom: { lte: now },
        OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: now } }],
        assetNetwork: { enabled: true, asset: { enabled: true } },
      },
      select: {
        id: true,
        routeKey: true,
        version: true,
        status: true,
        minimumPayoutAtomic: true,
        maximumPayoutAtomic: true,
        fixedNetworkFeeAtomic: true,
        addressCooldownSeconds: true,
        requiredConfirmations: true,
        manualApprovalRequired: true,
        effectiveFrom: true,
        effectiveUntil: true,
        assetNetwork: {
          select: {
            id: true,
            networkKey: true,
            displayName: true,
            chainFamily: true,
            isTestnet: true,
            addressValidator: true,
            asset: { select: { id: true, symbol: true, decimals: true } },
          },
        },
      },
      orderBy: [{ assetNetwork: { asset: { symbol: 'asc' } } }, { version: 'desc' }],
    });
    return routes.map((route) => ({
      ...route,
      minimumPayoutAtomic: route.minimumPayoutAtomic.toString(),
      maximumPayoutAtomic: route.maximumPayoutAtomic?.toString() ?? null,
      fixedNetworkFeeAtomic: route.fixedNetworkFeeAtomic.toString(),
      fundsEnabled: route.status === 'ACTIVE' && process.env.PAYOUTS_ENABLED === 'true',
      registrationOnly: route.status === 'ADDRESS_REGISTRATION',
    }));
  }

  async addresses(userId: string) {
    const addresses = await prisma.payoutAddress.findMany({
      where: { userId },
      select: addressViewSelect,
      orderBy: { createdAt: 'desc' },
    });
    return addresses.map(addressView);
  }

  async selectDestination(
    principal: AuthPrincipal,
    miningAccountId: string,
    payoutAddressId: string,
    stepUpToken: string | undefined,
  ) {
    if (principal.authenticationType !== 'access-token') {
      throw new ForbiddenException(
        'Payout destination changes require an interactive user session',
      );
    }
    await serializableTransaction(async (tx) => {
      const authorization = await this.stepUpService.consume(
        tx,
        principal,
        PAYOUT_ADDRESS_SCOPE,
        stepUpToken,
      );
      const account = await tx.miningAccount.findFirst({
        where: { id: miningAccountId, userId: principal.userId, deletedAt: null, enabled: true },
        select: { id: true, assetId: true },
      });
      if (!account) throw new NotFoundException('Mining account not found');
      const destination = await tx.payoutAddress.findFirst({
        where: {
          id: payoutAddressId,
          userId: principal.userId,
          assetId: account.assetId,
          status: 'ACTIVE',
          active: true,
          verified: true,
          payoutRoute: { status: { in: ['PILOT', 'ACTIVE'] } },
        },
        select: { id: true, addressHash: true, payoutRouteId: true },
      });
      if (!destination) {
        throw new ConflictException(
          'Destination must be an active verified payout-capable address',
        );
      }
      await tx.miningAccount.update({
        where: { id: account.id },
        data: { selectedPayoutAddressId: destination.id },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: principal.userId,
          action: 'PAYOUT_DESTINATION_SELECTED',
          resourceType: 'MiningAccount',
          resourceId: account.id,
          metadata: {
            payoutAddressId: destination.id,
            payoutRouteId: destination.payoutRouteId,
            addressFingerprint: destination.addressHash.slice(0, 16),
            stepUpAuthorizationId: authorization.id,
          },
        },
      });
    });
    return this.preference(principal.userId, miningAccountId);
  }

  async registerAddress(
    principal: AuthPrincipal,
    input: { payoutRouteId: string; address: string; label?: string },
    stepUpToken: string | undefined,
  ) {
    const now = await databaseNow();
    const route = await prisma.payoutRoute.findFirst({
      where: {
        id: input.payoutRouteId,
        status: { in: ['ADDRESS_REGISTRATION', 'PILOT', 'ACTIVE'] },
        effectiveFrom: { lte: now },
        OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: now } }],
        assetNetwork: { enabled: true, asset: { enabled: true } },
      },
      include: { assetNetwork: { include: { asset: true } } },
    });
    if (!route) throw new NotFoundException('Payout route not found');

    const candidate = input.address.trim();
    if (route.assetNetwork.addressValidator !== 'BITCOIN') {
      throw new BadRequestException('This payout route does not have an address validator');
    }
    const validation = validateBitcoinAddress(
      candidate,
      route.assetNetwork.isTestnet ? 'testnet' : 'mainnet',
    );
    if (!validation.valid) throw new BadRequestException('Invalid payout address for this network');

    const normalizedAddress = validation.normalized;
    const addressHash = hashSensitiveValue(`${route.assetNetwork.id}:${normalizedAddress}`);
    const cooldownUntil = new Date(now.getTime() + route.addressCooldownSeconds * 1_000);
    try {
      const createdId = await serializableTransaction(async (tx) => {
        const authorization = await this.stepUpService.consume(
          tx,
          principal,
          PAYOUT_ADDRESS_SCOPE,
          stepUpToken,
        );
        const address = await tx.payoutAddress.create({
          data: {
            userId: principal.userId,
            assetId: route.assetNetwork.assetId,
            assetNetworkId: route.assetNetwork.id,
            payoutRouteId: route.id,
            address: normalizedAddress,
            addressHash,
            label: input.label?.trim() || null,
            status: 'COOLDOWN',
            verified: true,
            verifiedAt: now,
            active: false,
            cooldownUntil,
          },
          select: { id: true },
        });
        await tx.auditLog.create({
          data: {
            actorUserId: principal.userId,
            action: 'PAYOUT_ADDRESS_REGISTERED',
            resourceType: 'PayoutAddress',
            resourceId: address.id,
            metadata: {
              stepUpAuthorizationId: authorization.id,
              asset: route.assetNetwork.asset.symbol,
              networkKey: route.assetNetwork.networkKey,
              payoutRouteId: route.id,
              addressFingerprint: addressHash.slice(0, 16),
              addressEncoding: validation.encoding,
              checksumValidated: true,
              cooldownUntil: cooldownUntil.toISOString(),
              payoutGateEnabled: process.env.PAYOUTS_ENABLED === 'true',
            },
          },
        });
        return address.id;
      });
      const created = await prisma.payoutAddress.findFirstOrThrow({
        where: { id: createdId, userId: principal.userId },
        select: addressViewSelect,
      });
      return addressView(created);
    } catch (error) {
      if (isUniqueConflict(error)) {
        throw new ConflictException('Payout address cannot be registered');
      }
      throw error;
    }
  }

  async activateAddress(
    principal: AuthPrincipal,
    payoutAddressId: string,
    stepUpToken: string | undefined,
  ) {
    const now = await databaseNow();
    const activatedId = await serializableTransaction(async (tx) => {
      const authorization = await this.stepUpService.consume(
        tx,
        principal,
        PAYOUT_ADDRESS_SCOPE,
        stepUpToken,
      );
      const current = await tx.payoutAddress.findFirst({
        where: { id: payoutAddressId, userId: principal.userId },
        include: { payoutRoute: true },
      });
      if (!current) throw new NotFoundException('Payout address not found');
      if (current.status !== 'COOLDOWN' || !current.verified) {
        throw new ConflictException('Only a verified address in cooldown can be activated');
      }
      if (current.cooldownUntil > now) {
        throw new ConflictException(
          `Payout address cooldown ends at ${current.cooldownUntil.toISOString()}`,
        );
      }
      if (
        current.payoutRoute.status === 'DISABLED' ||
        current.payoutRoute.effectiveFrom > now ||
        (current.payoutRoute.effectiveUntil && current.payoutRoute.effectiveUntil <= now)
      ) {
        throw new ConflictException('Payout route is not available for address activation');
      }

      const replaced = await tx.payoutAddress.findMany({
        where: {
          userId: principal.userId,
          payoutRouteId: current.payoutRouteId,
          status: 'ACTIVE',
          active: true,
          id: { not: current.id },
        },
        select: { id: true },
      });
      if (replaced.length > 0) {
        await tx.miningAccount.updateMany({
          where: { selectedPayoutAddressId: { in: replaced.map((address) => address.id) } },
          data: { selectedPayoutAddressId: null },
        });
      }
      await tx.payoutAddress.updateMany({
        where: { id: { in: replaced.map((address) => address.id) } },
        data: { status: 'DISABLED', active: false, disabledAt: now },
      });
      const address = await tx.payoutAddress.update({
        where: { id: current.id },
        data: { status: 'ACTIVE', active: true, activatedAt: now, disabledAt: null },
        select: { id: true },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: principal.userId,
          action: 'PAYOUT_ADDRESS_ACTIVATED',
          resourceType: 'PayoutAddress',
          resourceId: address.id,
          metadata: {
            stepUpAuthorizationId: authorization.id,
            payoutRouteId: current.payoutRouteId,
            payoutGateEnabled: process.env.PAYOUTS_ENABLED === 'true',
          },
        },
      });
      return address.id;
    });
    const activated = await prisma.payoutAddress.findFirstOrThrow({
      where: { id: activatedId, userId: principal.userId },
      select: addressViewSelect,
    });
    return addressView(activated);
  }

  async disableAddress(
    principal: AuthPrincipal,
    payoutAddressId: string,
    stepUpToken: string | undefined,
  ) {
    const now = await databaseNow();
    const disabledId = await serializableTransaction(async (tx) => {
      const authorization = await this.stepUpService.consume(
        tx,
        principal,
        PAYOUT_ADDRESS_SCOPE,
        stepUpToken,
      );
      const current = await tx.payoutAddress.findFirst({
        where: { id: payoutAddressId, userId: principal.userId },
      });
      if (!current) throw new NotFoundException('Payout address not found');
      if (current.status === 'DISABLED')
        throw new ConflictException('Payout address is already disabled');

      await tx.miningAccount.updateMany({
        where: { userId: principal.userId, selectedPayoutAddressId: current.id },
        data: { selectedPayoutAddressId: null },
      });
      const address = await tx.payoutAddress.update({
        where: { id: current.id },
        data: { status: 'DISABLED', active: false, disabledAt: now },
        select: { id: true },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: principal.userId,
          action: 'PAYOUT_ADDRESS_DISABLED',
          resourceType: 'PayoutAddress',
          resourceId: address.id,
          metadata: {
            stepUpAuthorizationId: authorization.id,
            payoutRouteId: current.payoutRouteId,
          },
        },
      });
      return address.id;
    });
    const disabled = await prisma.payoutAddress.findFirstOrThrow({
      where: { id: disabledId, userId: principal.userId },
      select: addressViewSelect,
    });
    return addressView(disabled);
  }

  async list(userId: string) {
    const payouts = await prisma.payout.findMany({
      where: { userId, executionVersion: PAYOUT_EXECUTION_VERSION },
      select: payoutViewSelect,
      orderBy: [{ requestedAt: 'desc' }, { id: 'desc' }],
      take: 200,
    });
    return { payouts: payouts.map(payoutView) };
  }

  async request(principal: AuthPrincipal, input: PayoutRequestInput) {
    if (principal.authenticationType !== 'access-token') {
      throw new ForbiddenException('Payout requests require an interactive user session');
    }
    if (!/^[A-Za-z0-9:_-]{16,128}$/.test(input.idempotencyKey)) {
      throw new BadRequestException('A valid Idempotency-Key header is required');
    }
    const requestedAmountAtomic = parsePositiveAtomic(input.amountAtomic);
    const payoutId = await serializableTransaction(async (tx) => {
      const existing = await tx.payout.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });
      if (existing) {
        if (
          existing.userId !== principal.userId ||
          existing.miningAccountId !== input.miningAccountId ||
          existing.amountAtomic !== requestedAmountAtomic
        ) {
          throw new ConflictException('Idempotency key is already bound to another payout request');
        }
        return existing.id;
      }

      const [clock] = await tx.$queryRaw<Array<{ now: Date }>>`SELECT CURRENT_TIMESTAMP AS "now"`;
      if (!clock) throw new Error('Database did not return its current time');
      const now = clock.now;
      const account = await tx.miningAccount.findFirst({
        where: {
          id: input.miningAccountId,
          userId: principal.userId,
          deletedAt: null,
          enabled: true,
        },
        include: {
          asset: { include: { payoutControls: true } },
          selectedPayoutAddress: {
            include: {
              payoutRoute: {
                include: {
                  payoutWallet: {
                    include: {
                      reconciliations: { orderBy: { reconciledAt: 'desc' }, take: 1 },
                    },
                  },
                },
              },
            },
          },
        },
      });
      if (!account) throw new NotFoundException('Mining account not found');
      const destination = account.selectedPayoutAddress;
      const route = destination?.payoutRoute;
      const control = account.asset.payoutControls[0];
      const wallet = route?.payoutWallet;
      if (wallet) {
        await tx.$queryRaw`SELECT "id" FROM "Wallet" WHERE "id" = ${wallet.id} FOR UPDATE`;
      }
      const latestWalletReconciliation = wallet?.reconciliations[0];
      const healthMaximumAgeSeconds = Number.parseInt(
        process.env.PAYOUT_WALLET_HEALTH_MAX_AGE_SECONDS ?? '300',
        10,
      );
      const networkFeeAtomic = route?.fixedNetworkFeeAtomic ?? 0n;
      const reservationAmountAtomic = requestedAmountAtomic + networkFeeAtomic;
      const blockers: string[] = [];
      if (!payoutEnvironmentGate('requests'))
        blockers.push('PAYOUT_REQUEST_ENVIRONMENT_GATE_DISABLED');
      if (!control) blockers.push('PAYOUT_CONTROL_NOT_CONFIGURED');
      if (control?.paused) blockers.push('PAYOUT_CONTROL_PAUSED');
      if (control && !control.requestsEnabled) blockers.push('PAYOUT_REQUEST_CONTROL_DISABLED');
      if (!destination) blockers.push('NO_SELECTED_PAYOUT_DESTINATION');
      if (
        destination &&
        (!destination.active || !destination.verified || destination.status !== 'ACTIVE')
      ) {
        blockers.push('SELECTED_PAYOUT_DESTINATION_INACTIVE');
      }
      if (!route || !['PILOT', 'ACTIVE'].includes(route.status))
        blockers.push('PAYOUT_ROUTE_NOT_ACTIVE');
      if (
        route &&
        (route.effectiveFrom > now ||
          (route.effectiveUntil !== null && route.effectiveUntil <= now))
      ) {
        blockers.push('PAYOUT_ROUTE_NOT_EFFECTIVE');
      }
      if (route && requestedAmountAtomic < route.minimumPayoutAtomic)
        blockers.push('BELOW_MINIMUM_PAYOUT');
      if (route?.maximumPayoutAtomic && requestedAmountAtomic > route.maximumPayoutAtomic) {
        blockers.push('ABOVE_MAXIMUM_PAYOUT');
      }
      if (!wallet) blockers.push('PAYOUT_ROUTE_WALLET_NOT_CONFIGURED');
      if (wallet && !wallet.enabled) blockers.push('PAYOUT_ROUTE_WALLET_DISABLED');
      if (wallet && !wallet.signerKeyReference) blockers.push('ISOLATED_SIGNER_KEY_NOT_CONFIGURED');
      if (wallet && wallet.maximumSinglePayoutAtomic === null)
        blockers.push('SINGLE_PAYOUT_LIMIT_NOT_CONFIGURED');
      if (wallet && wallet.dailyPayoutLimitAtomic === null)
        blockers.push('DAILY_PAYOUT_LIMIT_NOT_CONFIGURED');
      if (
        wallet?.maximumSinglePayoutAtomic &&
        reservationAmountAtomic > wallet.maximumSinglePayoutAtomic
      ) {
        blockers.push('SINGLE_PAYOUT_LIMIT_EXCEEDED');
      }
      if (
        !latestWalletReconciliation ||
        latestWalletReconciliation.status !== 'MATCHED' ||
        now.getTime() - latestWalletReconciliation.reconciledAt.getTime() >
          healthMaximumAgeSeconds * 1_000
      ) {
        blockers.push('HOT_WALLET_NOT_RECENTLY_RECONCILED');
      }

      const availableAccount = await tx.ledgerAccount.findUnique({
        where: { code: `${account.asset.symbol}-USER-LIABILITY-${principal.userId}` },
      });
      let availableBalanceAtomic = 0n;
      if (!availableAccount) {
        blockers.push('NO_POSTED_REWARD_BALANCE');
      } else {
        await tx.$queryRaw`SELECT "id" FROM "LedgerAccount" WHERE "id" = ${availableAccount.id} FOR UPDATE`;
        const balance = await tx.journalLine.aggregate({
          where: {
            ledgerAccountId: availableAccount.id,
            journalEntry: { status: { in: ['POSTED', 'REVERSED'] } },
          },
          _sum: { debitAtomic: true, creditAtomic: true },
        });
        availableBalanceAtomic =
          (balance._sum.creditAtomic ?? 0n) - (balance._sum.debitAtomic ?? 0n);
        if (availableBalanceAtomic < reservationAmountAtomic)
          blockers.push('INSUFFICIENT_AVAILABLE_BALANCE');
      }

      if (wallet?.dailyPayoutLimitAtomic) {
        const rollingDay = new Date(now.getTime() - 86_400_000);
        const day = await tx.payout.aggregate({
          where: {
            assetId: account.assetId,
            executionVersion: PAYOUT_EXECUTION_VERSION,
            requestedAt: { gte: rollingDay },
            status: { notIn: ['FAILED', 'CANCELLED'] },
          },
          _sum: { amountAtomic: true, networkFeeAtomic: true },
        });
        const committed = (day._sum.amountAtomic ?? 0n) + (day._sum.networkFeeAtomic ?? 0n);
        if (committed + reservationAmountAtomic > wallet.dailyPayoutLimitAtomic) {
          blockers.push('DAILY_PAYOUT_LIMIT_EXCEEDED');
        }
      }
      if (latestWalletReconciliation && wallet) {
        const activeReservations = await tx.balanceReservation.aggregate({
          where: {
            status: 'ACTIVE',
            payout: { payoutRoute: { payoutWalletId: wallet.id } },
          },
          _sum: { amountAtomic: true },
        });
        const spendableNodeBalance =
          latestWalletReconciliation.nodeBalanceAtomic -
          wallet.minimumReserveAtomic -
          (activeReservations._sum.amountAtomic ?? 0n);
        if (spendableNodeBalance < reservationAmountAtomic)
          blockers.push('HOT_WALLET_RESERVE_INSUFFICIENT');
      }
      if (blockers.length > 0 || !availableAccount || !destination || !route) {
        throw new ConflictException({ message: 'Payout is not eligible', blockers });
      }

      const reservedAccount = await tx.ledgerAccount.upsert({
        where: { code: `${account.asset.symbol}-PAYOUT-RESERVED-${principal.userId}` },
        create: {
          code: `${account.asset.symbol}-PAYOUT-RESERVED-${principal.userId}`,
          name: `${account.asset.symbol} User Payout Reserved Liability`,
          type: 'LIABILITY',
          userId: principal.userId,
          assetId: account.assetId,
          systemAccount: false,
        },
        update: {},
      });
      const initialStatus =
        route.status === 'PILOT' || route.manualApprovalRequired ? 'REVIEW' : 'QUEUED';
      const payout = await tx.payout.create({
        data: {
          idempotencyKey: input.idempotencyKey,
          userId: principal.userId,
          miningAccountId: account.id,
          assetId: account.assetId,
          payoutAddressId: destination.id,
          payoutRouteId: route.id,
          amount: atomicToDecimal(requestedAmountAtomic, account.asset.decimals),
          networkFee: atomicToDecimal(networkFeeAtomic, account.asset.decimals),
          amountAtomic: requestedAmountAtomic,
          networkFeeAtomic,
          executionVersion: PAYOUT_EXECUTION_VERSION,
          requestSource: 'MANUAL',
          status: initialStatus,
          scheduledAt: now,
          requestedAt: now,
        },
      });
      await tx.payoutEligibility.create({
        data: {
          payoutId: payout.id,
          availableBalanceAtomic,
          reservationAmountAtomic,
          minimumPayoutAtomic: route.minimumPayoutAtomic,
          maximumPayoutAtomic: route.maximumPayoutAtomic,
          routeVersion: route.version,
          addressFingerprint: destination.addressHash,
          walletHealthRequired: true,
          manualApprovalRequired: route.manualApprovalRequired || route.status === 'PILOT',
          blockers: [],
          eligible: true,
          evaluatedAt: now,
        },
      });
      const journal = await tx.journalEntry.create({
        data: {
          idempotencyKey: `payout-reservation:${payout.id}:v1`,
          referenceType: 'PayoutReservation',
          referenceId: payout.id,
          description: `Reserve ${account.asset.symbol} liability for controlled payout`,
          correlationId: payout.id,
          causationId: input.idempotencyKey,
          status: 'PENDING',
          effectiveAt: now,
          lines: {
            create: [
              {
                ledgerAccountId: availableAccount.id,
                assetId: account.assetId,
                debit: atomicToDecimal(reservationAmountAtomic, account.asset.decimals),
                credit: '0',
                debitAtomic: reservationAmountAtomic,
                creditAtomic: 0n,
              },
              {
                ledgerAccountId: reservedAccount.id,
                assetId: account.assetId,
                debit: '0',
                credit: atomicToDecimal(reservationAmountAtomic, account.asset.decimals),
                debitAtomic: 0n,
                creditAtomic: reservationAmountAtomic,
              },
            ],
          },
        },
      });
      await tx.journalEntry.update({
        where: { id: journal.id },
        data: { status: 'POSTED', postedAt: now },
      });
      await tx.balanceReservation.create({
        data: {
          idempotencyKey: `balance-reservation:${payout.id}:v1`,
          payoutId: payout.id,
          userId: principal.userId,
          assetId: account.assetId,
          availableLedgerAccountId: availableAccount.id,
          reservedLedgerAccountId: reservedAccount.id,
          journalEntryId: journal.id,
          amountAtomic: reservationAmountAtomic,
          status: 'ACTIVE',
          createdAt: now,
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: principal.userId,
          action: 'PAYOUT_REQUESTED_AND_RESERVED',
          resourceType: 'Payout',
          resourceId: payout.id,
          metadata: {
            miningAccountId: account.id,
            amountAtomic: requestedAmountAtomic.toString(),
            networkFeeAtomic: networkFeeAtomic.toString(),
            reservationJournalEntryId: journal.id,
            payoutRouteId: route.id,
            addressFingerprint: destination.addressHash.slice(0, 16),
          },
        },
      });
      await tx.outboxEvent.create({
        data: {
          eventId: randomUUID(),
          eventName: 'payout.requested.v1',
          eventVersion: 1,
          producer: 'api',
          aggregateType: 'Payout',
          aggregateId: payout.id,
          correlationId: payout.id,
          idempotencyKey: `payout-requested:${payout.id}:v1`,
          payload: {
            payoutId: payout.id,
            miningAccountId: account.id,
            amountAtomic: requestedAmountAtomic.toString(),
            networkFeeAtomic: networkFeeAtomic.toString(),
            status: initialStatus,
          },
          occurredAt: now,
        },
      });
      return payout.id;
    });
    const payout = await prisma.payout.findFirstOrThrow({
      where: { id: payoutId, userId: principal.userId },
      select: payoutViewSelect,
    });
    return payoutView(payout);
  }

  async decide(principal: AuthPrincipal, input: PayoutDecisionInput) {
    if (
      principal.authenticationType !== 'access-token' ||
      !['ADMIN', 'OWNER'].includes(principal.role)
    ) {
      throw new ForbiddenException(
        'Payout decisions require an interactive ADMIN or OWNER session',
      );
    }
    if (!/^[A-Za-z0-9:_-]{16,128}$/.test(input.idempotencyKey)) {
      throw new BadRequestException('A valid Idempotency-Key header is required');
    }
    const reason = input.reason.trim();
    if (reason.length < 10)
      throw new BadRequestException('Decision reason must contain at least 10 characters');
    const payoutId = await serializableTransaction(async (tx) => {
      const existing = await tx.payoutApproval.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });
      if (existing) {
        if (
          existing.payoutId !== input.payoutId ||
          existing.actorUserId !== principal.userId ||
          existing.decision !== input.decision
        ) {
          throw new ConflictException(
            'Idempotency key is already bound to another payout decision',
          );
        }
        return existing.payoutId;
      }
      const payout = await tx.payout.findUnique({
        where: { id: input.payoutId },
        include: { reservation: { include: { journalEntry: { include: { lines: true } } } } },
      });
      if (!payout || payout.executionVersion !== PAYOUT_EXECUTION_VERSION)
        throw new NotFoundException('Controlled payout not found');
      if (payout.userId === principal.userId)
        throw new ForbiddenException('Payout requester cannot decide their own payout');
      if (!['QUEUED', 'REVIEW'].includes(payout.status))
        throw new ConflictException('Payout is not awaiting a decision');
      const now = await this.transactionNow(tx);
      const evidenceDigest = digestEvidence({
        payoutId: payout.id,
        actorUserId: principal.userId,
        decision: input.decision,
        reason,
        amountAtomic: payout.amountAtomic?.toString(),
        reservationId: payout.reservation?.id,
      });
      await tx.payoutApproval.create({
        data: {
          idempotencyKey: input.idempotencyKey,
          payoutId: payout.id,
          actorUserId: principal.userId,
          decision: input.decision,
          reason,
          evidenceDigest,
          createdAt: now,
        },
      });
      if (input.decision === 'APPROVED') {
        await tx.payout.update({
          where: { id: payout.id },
          data: { status: 'APPROVED', approvedAt: now, rowVersion: { increment: 1 } },
        });
      } else {
        await this.releaseReservation(tx, payout, principal.userId, reason, now);
        await tx.payout.update({
          where: { id: payout.id },
          data: {
            status: 'FAILED',
            failureCode: 'APPROVAL_REJECTED',
            failureMessage: reason,
            failedAt: now,
            rowVersion: { increment: 1 },
          },
        });
      }
      await tx.auditLog.create({
        data: {
          actorUserId: principal.userId,
          action: input.decision === 'APPROVED' ? 'PAYOUT_APPROVED' : 'PAYOUT_REJECTED',
          resourceType: 'Payout',
          resourceId: payout.id,
          metadata: { reason, evidenceDigest },
        },
      });
      await tx.outboxEvent.create({
        data: {
          eventId: randomUUID(),
          eventName: input.decision === 'APPROVED' ? 'payout.approved.v1' : 'payout.rejected.v1',
          eventVersion: 1,
          producer: 'api',
          aggregateType: 'Payout',
          aggregateId: payout.id,
          correlationId: payout.id,
          idempotencyKey: `payout-decision:${input.idempotencyKey}:v1`,
          payload: { payoutId: payout.id, decision: input.decision, actorUserId: principal.userId },
          occurredAt: now,
        },
      });
      return payout.id;
    });
    const payout = await prisma.payout.findUniqueOrThrow({
      where: { id: payoutId },
      select: payoutViewSelect,
    });
    return payoutView(payout);
  }

  async cancel(principal: AuthPrincipal, payoutId: string, reasonInput: string) {
    if (principal.authenticationType !== 'access-token') {
      throw new ForbiddenException('Payout cancellation requires an interactive user session');
    }
    const reason = reasonInput.trim();
    if (reason.length < 10)
      throw new BadRequestException('Cancellation reason must contain at least 10 characters');
    await serializableTransaction(async (tx) => {
      const payout = await tx.payout.findFirst({
        where: {
          id: payoutId,
          userId: principal.userId,
          executionVersion: PAYOUT_EXECUTION_VERSION,
        },
        include: { reservation: { include: { journalEntry: { include: { lines: true } } } } },
      });
      if (!payout) throw new NotFoundException('Controlled payout not found');
      if (!['QUEUED', 'REVIEW'].includes(payout.status))
        throw new ConflictException('Only a payout that has not been approved can be cancelled');
      const now = await this.transactionNow(tx);
      await this.releaseReservation(tx, payout, principal.userId, reason, now);
      await tx.payout.update({
        where: { id: payout.id },
        data: {
          status: 'CANCELLED',
          failureCode: 'USER_CANCELLED',
          failureMessage: reason,
          cancelledAt: now,
          rowVersion: { increment: 1 },
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: principal.userId,
          action: 'PAYOUT_CANCELLED',
          resourceType: 'Payout',
          resourceId: payout.id,
          metadata: { reason },
        },
      });
    });
    const payout = await prisma.payout.findFirstOrThrow({
      where: { id: payoutId, userId: principal.userId },
      select: payoutViewSelect,
    });
    return payoutView(payout);
  }

  private async transactionNow(tx: Prisma.TransactionClient): Promise<Date> {
    const [clock] = await tx.$queryRaw<Array<{ now: Date }>>`SELECT CURRENT_TIMESTAMP AS "now"`;
    if (!clock) throw new Error('Database did not return its current time');
    return clock.now;
  }

  private async releaseReservation(
    tx: Prisma.TransactionClient,
    payout: Prisma.PayoutGetPayload<{
      include: { reservation: { include: { journalEntry: { include: { lines: true } } } } };
    }>,
    actorUserId: string,
    reason: string,
    now: Date,
  ) {
    const reservation = payout.reservation;
    if (!reservation || reservation.status !== 'ACTIVE')
      throw new ConflictException('Payout does not have an active balance reservation');
    const reversal = await tx.journalEntry.create({
      data: {
        idempotencyKey: `payout-reservation-reversal:${payout.id}:v1`,
        referenceType: 'PayoutReservationReversal',
        referenceId: payout.id,
        description: `Release payout reservation: ${reason}`,
        correlationId: payout.id,
        causationId: reservation.journalEntryId,
        status: 'PENDING',
        effectiveAt: now,
        lines: {
          create: reservation.journalEntry.lines.map((line) => ({
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
    await tx.journalEntry.update({
      where: { id: reversal.id },
      data: { status: 'POSTED', postedAt: now },
    });
    await tx.balanceReservation.update({
      where: { id: reservation.id },
      data: { status: 'RELEASED', reversalJournalEntryId: reversal.id, releasedAt: now },
    });
    await tx.auditLog.create({
      data: {
        actorUserId,
        action: 'PAYOUT_BALANCE_RESERVATION_RELEASED',
        resourceType: 'BalanceReservation',
        resourceId: reservation.id,
        metadata: { payoutId: payout.id, reversalJournalEntryId: reversal.id, reason },
      },
    });
  }

  async preferences(userId: string) {
    const now = await databaseNow();
    const healthMaximumAgeSeconds = Number.parseInt(
      process.env.PAYOUT_WALLET_HEALTH_MAX_AGE_SECONDS ?? '300',
      10,
    );
    const accounts = await prisma.miningAccount.findMany({
      where: { userId, deletedAt: null },
      select: {
        id: true,
        username: true,
        autoWithdrawalEnabled: true,
        selectedPayoutAddress: {
          select: {
            id: true,
            address: true,
            addressHash: true,
            label: true,
            status: true,
            active: true,
            verified: true,
            payoutRoute: { select: { id: true, status: true, routeKey: true, version: true } },
          },
        },
        asset: {
          select: {
            id: true,
            symbol: true,
            decimals: true,
            minimumPayout: true,
            payoutControls: {
              select: {
                requestsEnabled: true,
                signingEnabled: true,
                broadcastEnabled: true,
                paused: true,
              },
              take: 1,
            },
            wallets: {
              where: { type: 'HOT', enabled: true },
              select: {
                id: true,
                signerKeyReference: true,
                lastReconciledAt: true,
                reconciliations: {
                  select: { status: true, reconciledAt: true },
                  orderBy: { reconciledAt: 'desc' },
                  take: 1,
                },
              },
              take: 1,
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    return accounts.map((account) => {
      const destination = account.selectedPayoutAddress;
      const control = account.asset.payoutControls[0];
      const wallet = account.asset.wallets[0];
      const walletReconciliation = wallet?.reconciliations[0];
      const walletHealthy = Boolean(
        wallet?.signerKeyReference &&
          wallet.lastReconciledAt &&
          walletReconciliation?.status === 'MATCHED' &&
          now.getTime() - walletReconciliation.reconciledAt.getTime() <=
            healthMaximumAgeSeconds * 1_000,
      );
      const blockers = [
        ...(!payoutEnvironmentGate('requests') ? ['PAYOUT_REQUEST_ENVIRONMENT_GATE_DISABLED'] : []),
        ...(!payoutEnvironmentGate('signing') ? ['PAYOUT_SIGNING_ENVIRONMENT_GATE_DISABLED'] : []),
        ...(!payoutEnvironmentGate('broadcast')
          ? ['PAYOUT_BROADCAST_ENVIRONMENT_GATE_DISABLED']
          : []),
        ...(!control ? ['PAYOUT_CONTROL_NOT_CONFIGURED'] : []),
        ...(control?.paused ? ['PAYOUT_CONTROL_PAUSED'] : []),
        ...(control && !control.requestsEnabled ? ['PAYOUT_REQUEST_CONTROL_DISABLED'] : []),
        ...(control && !control.signingEnabled ? ['PAYOUT_SIGNING_CONTROL_DISABLED'] : []),
        ...(control && !control.broadcastEnabled ? ['PAYOUT_BROADCAST_CONTROL_DISABLED'] : []),
        ...(!destination ? ['NO_SELECTED_PAYOUT_DESTINATION'] : []),
        ...(destination &&
        (!destination.active || !destination.verified || destination.status !== 'ACTIVE')
          ? ['SELECTED_PAYOUT_DESTINATION_INACTIVE']
          : []),
        ...(destination && destination.payoutRoute.status !== 'ACTIVE'
          ? ['AUTO_WITHDRAWAL_REQUIRES_ACTIVE_ROUTE']
          : []),
        ...(!walletHealthy ? ['HOT_WALLET_NOT_RECENTLY_RECONCILED'] : []),
      ];
      return {
        miningAccountId: account.id,
        username: account.username,
        asset: account.asset.symbol,
        minimumPayout: account.asset.minimumPayout.toString(),
        selectedDestination: destination
          ? {
              id: destination.id,
              label: destination.label,
              addressDisplay: maskAddress(destination.address),
              addressFingerprint: destination.addressHash.slice(0, 16),
              route: destination.payoutRoute,
            }
          : null,
        autoWithdrawalEnabled: account.autoWithdrawalEnabled,
        effective: account.autoWithdrawalEnabled && blockers.length === 0,
        blockers,
      };
    });
  }

  async preference(userId: string, miningAccountId: string) {
    const preferences = await this.preferences(userId);
    const preference = preferences.find((entry) => entry.miningAccountId === miningAccountId);
    if (!preference) throw new NotFoundException('Mining account not found');
    return preference;
  }

  async updatePreference(principal: AuthPrincipal, miningAccountId: string, enabled: boolean) {
    if (principal.authenticationType !== 'access-token') {
      throw new ForbiddenException('Payout preferences require an interactive user session');
    }
    const userId = principal.userId;
    const account = await prisma.miningAccount.findFirst({
      where: { id: miningAccountId, userId, deletedAt: null },
      select: { id: true },
    });
    if (!account) throw new NotFoundException('Mining account not found');

    await prisma.$transaction(async (tx) => {
      await tx.miningAccount.update({
        where: { id: miningAccountId },
        data: { autoWithdrawalEnabled: enabled },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: userId,
          action: enabled ? 'AUTO_WITHDRAWAL_ENABLED' : 'AUTO_WITHDRAWAL_DISABLED',
          resourceType: 'MiningAccount',
          resourceId: miningAccountId,
          metadata: {
            preferenceOnly: true,
            globalPayoutGateEnabled: process.env.PAYOUTS_ENABLED === 'true',
          },
        },
      });
    });
    return this.preference(userId, miningAccountId);
  }
}
