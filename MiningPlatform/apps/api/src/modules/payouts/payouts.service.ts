/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

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

      await tx.payoutAddress.updateMany({
        where: {
          userId: principal.userId,
          payoutRouteId: current.payoutRouteId,
          status: 'ACTIVE',
          active: true,
          id: { not: current.id },
        },
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

  async preferences(userId: string) {
    const accounts = await prisma.miningAccount.findMany({
      where: { userId, deletedAt: null },
      select: {
        id: true,
        username: true,
        autoWithdrawalEnabled: true,
        asset: { select: { id: true, symbol: true, minimumPayout: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    const addresses = await prisma.payoutAddress.findMany({
      where: {
        userId,
        active: true,
        verified: true,
        status: 'ACTIVE',
        assetId: { in: accounts.map((account) => account.asset.id) },
      },
      select: { assetId: true, payoutRoute: { select: { status: true } } },
    });
    const activeAddressByAsset = new Map(addresses.map((address) => [address.assetId, address]));
    const globalPayoutsEnabled = process.env.PAYOUTS_ENABLED === 'true';
    return accounts.map((account) => {
      const address = activeAddressByAsset.get(account.asset.id);
      const blockers = [
        'AUTO_PAYOUT_EXECUTOR_NOT_IMPLEMENTED',
        ...(!globalPayoutsEnabled ? ['GLOBAL_PAYOUT_GATE_DISABLED'] : []),
        ...(!address ? ['NO_ACTIVE_VERIFIED_PAYOUT_ADDRESS'] : []),
        ...(address && address.payoutRoute.status !== 'ACTIVE' ? ['PAYOUT_ROUTE_NOT_ACTIVE'] : []),
      ];
      return {
        miningAccountId: account.id,
        username: account.username,
        asset: account.asset.symbol,
        minimumPayout: account.asset.minimumPayout.toString(),
        autoWithdrawalEnabled: account.autoWithdrawalEnabled,
        effective: account.autoWithdrawalEnabled && blockers.length === 0,
        blockers,
      };
    });
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
    const preferences = await this.preferences(userId);
    return preferences.find((preference) => preference.miningAccountId === miningAccountId)!;
  }
}
