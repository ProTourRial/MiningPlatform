import { Injectable, NotFoundException } from '@nestjs/common';
import { prisma } from '@mining/database';

@Injectable()
export class MonitoringService {
  async getWorkerSnapshot(workerId: string) {
    const worker = await prisma.worker.findFirst({
      where: { id: workerId, deletedAt: null },
      select: {
        id: true,
        name: true,
        status: true,
        lastConnectedAt: true,
        lastShareAt: true,
        hashrateSnapshots: {
          where: { windowSeconds: 300 },
          orderBy: { recordedAt: 'desc' },
          take: 1,
        },
      },
    });
    if (!worker) throw new NotFoundException('Worker not found');
    const snapshot = worker.hashrateSnapshots[0];
    return {
      id: worker.id,
      name: worker.name,
      status: worker.status,
      lastConnectedAt: worker.lastConnectedAt,
      lastShareAt: worker.lastShareAt,
      hashrate5m: snapshot?.hashrate.toString() ?? '0',
      acceptedShares5m: snapshot?.acceptedShares ?? 0,
      rejectedShares5m: snapshot?.rejectedShares ?? 0,
      recordedAt: snapshot?.recordedAt ?? null,
    };
  }
}
