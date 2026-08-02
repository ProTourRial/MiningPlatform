/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { getBuildInfo } from '@mining/build-info';
import { Controller, Get, Header } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { prisma } from '@mining/database';

const buildInfo = getBuildInfo('api');

function metricLabels(values: Record<string, string>): string {
  return Object.entries(values)
    .map(([key, value]) => `${key}="${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`)
    .join(',');
}

@ApiExcludeController()
@Controller({ path: 'metrics', version: '1' })
export class MetricsController {
  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  async metrics() {
    const memory = process.memoryUsage();
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1_000);
    const [users, workers, upstreamPools, activeSessions, outboxPending, outboxFailed, refreshReuseLastFiveMinutes] = await Promise.all([
      prisma.user.count({ where: { deletedAt: null } }),
      prisma.worker.groupBy({ by: ['status'], where: { deletedAt: null }, _count: { _all: true } }),
      prisma.upstreamPool.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.authSession.count({ where: { revokedAt: null, expiresAt: { gt: new Date() } } }),
      prisma.outboxEvent.count({ where: { status: { in: ['PENDING', 'PROCESSING'] } } }),
      prisma.outboxEvent.count({ where: { status: { in: ['FAILED', 'DEAD_LETTER'] } } }),
      prisma.auditLog.count({
        where: { action: 'REFRESH_TOKEN_REUSE_DETECTED', occurredAt: { gte: fiveMinutesAgo } },
      }),
    ]);
    return [
      '# HELP mining_api_process_uptime_seconds API process uptime.',
      '# TYPE mining_api_process_uptime_seconds gauge',
      `mining_api_process_uptime_seconds ${process.uptime()}`,
      '# HELP mining_api_process_resident_memory_bytes API resident memory.',
      '# TYPE mining_api_process_resident_memory_bytes gauge',
      `mining_api_process_resident_memory_bytes ${memory.rss}`,
      '# HELP mining_api_build_info Static build information.',
      '# TYPE mining_api_build_info gauge',
      `mining_api_build_info{${metricLabels({ version: buildInfo.version, commit: buildInfo.commit, schema: String(buildInfo.schemaVersion) })}} 1`,
      '# HELP mining_control_plane_users_total Non-deleted website users.',
      '# TYPE mining_control_plane_users_total gauge',
      `mining_control_plane_users_total ${users}`,
      '# HELP mining_control_plane_active_sessions Active refresh sessions.',
      '# TYPE mining_control_plane_active_sessions gauge',
      `mining_control_plane_active_sessions ${activeSessions}`,
      '# HELP mining_workers_total Workers by state.',
      '# TYPE mining_workers_total gauge',
      ...workers.map((entry) => `mining_workers_total{${metricLabels({ status: entry.status })}} ${entry._count._all}`),
      '# HELP mining_upstream_pools_total Upstream pools by state.',
      '# TYPE mining_upstream_pools_total gauge',
      ...upstreamPools.map((entry) => `mining_upstream_pools_total{${metricLabels({ status: entry.status })}} ${entry._count._all}`),
      '# HELP mining_auth_refresh_reuse_last_5m Refresh-token replay detections recorded in the last five minutes.',
      '# TYPE mining_auth_refresh_reuse_last_5m gauge',
      `mining_auth_refresh_reuse_last_5m ${refreshReuseLastFiveMinutes}`,
      '# HELP mining_outbox_pending_total Pending or processing outbox events.',
      '# TYPE mining_outbox_pending_total gauge',
      `mining_outbox_pending_total ${outboxPending}`,
      '# HELP mining_outbox_failed_total Failed or dead-letter outbox events.',
      '# TYPE mining_outbox_failed_total gauge',
      `mining_outbox_failed_total ${outboxFailed}`,
      '',
    ].join('\n');
  }
}
