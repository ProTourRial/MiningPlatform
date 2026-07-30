/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import net, { type Socket } from 'node:net';
import { createDevelopmentJob, type BitcoinMiningJob } from '@mining/mining-core';
import {
  errorResponse,
  parseMiningAuthorize,
  parseMiningSubmit,
  parseStratumLine,
  serializeStratumNotification,
  serializeStratumResponse,
  successResponse,
} from '@mining/stratum-protocol';

export interface UpstreamSimulatorOptions {
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  difficulty?: string;
  extranonce1?: string;
  extranonce2Size?: number;
  rejectShares?: boolean;
}

export class UpstreamStratumSimulator {
  private readonly server: net.Server;
  private readonly sockets = new Set<Socket>();
  private currentJob: BitcoinMiningJob;
  private listeningPort = 0;
  readonly submissions: ReturnType<typeof parseMiningSubmit>[] = [];

  constructor(private readonly options: UpstreamSimulatorOptions = {}) {
    this.currentJob = createDevelopmentJob(new Date(), options.difficulty ?? '0.000001', options.extranonce1 ?? 'e9695791');
    this.currentJob = { ...this.currentJob, id: 'sim-job-1', cleanJobs: true };
    this.server = net.createServer((socket) => this.accept(socket));
  }

  get port(): number {
    return this.listeningPort;
  }

  get job(): BitcoinMiningJob {
    return this.currentJob;
  }

  async listen(): Promise<number> {
    await new Promise<void>((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(this.options.port ?? 0, this.options.host ?? '127.0.0.1', () => {
        this.server.off('error', reject);
        const address = this.server.address();
        if (!address || typeof address === 'string') return reject(new Error('Simulator did not expose a TCP port'));
        this.listeningPort = address.port;
        resolve();
      });
    });
    return this.listeningPort;
  }

  rotateJob(cleanJobs = true): BitcoinMiningJob {
    const now = new Date();
    const next = createDevelopmentJob(now, this.options.difficulty ?? '0.000001', this.options.extranonce1 ?? 'e9695791');
    this.currentJob = { ...next, id: `sim-job-${Date.now()}`, cleanJobs };
    for (const socket of this.sockets) this.notifyJob(socket, this.currentJob);
    return this.currentJob;
  }

  disconnectClients(): void {
    for (const socket of this.sockets) socket.destroy();
  }

  async close(): Promise<void> {
    this.disconnectClients();
    await new Promise<void>((resolve, reject) => this.server.close((error) => (error ? reject(error) : resolve())));
  }

  private accept(socket: Socket): void {
    this.sockets.add(socket);
    socket.setEncoding('utf8');
    let buffer = '';
    let authorized = false;
    socket.on('data', (chunk: string) => {
      buffer += chunk;
      let newline = buffer.indexOf('\n');
      while (newline >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (line) {
          const request = parseStratumLine(line);
          switch (request.method) {
            case 'mining.subscribe':
              socket.write(serializeStratumResponse(successResponse(request.id, [
                [
                  ['mining.set_difficulty', 'sim-session'],
                  ['mining.notify', 'sim-session'],
                ],
                this.options.extranonce1 ?? 'e9695791',
                this.options.extranonce2Size ?? 4,
              ])));
              break;
            case 'mining.authorize': {
              const credentials = parseMiningAuthorize(request.params);
              authorized = credentials.workerName === (this.options.username ?? 'upstream.account') &&
                credentials.password === (this.options.password ?? 'x');
              socket.write(serializeStratumResponse(successResponse(request.id, authorized)));
              if (authorized) {
                socket.write(serializeStratumNotification('mining.set_difficulty', [this.options.difficulty ?? '0.000001']));
                socket.write(serializeStratumNotification('mining.set_extranonce', [
                  this.options.extranonce1 ?? 'e9695791',
                  this.options.extranonce2Size ?? 4,
                ]));
                this.notifyJob(socket, this.currentJob);
              }
              break;
            }
            case 'mining.submit': {
              if (!authorized) {
                socket.write(serializeStratumResponse(errorResponse(request.id, 24, 'Unauthorized worker')));
                break;
              }
              const submission = parseMiningSubmit(request.params);
              this.submissions.push(submission);
              if (this.options.rejectShares || submission.jobId !== this.currentJob.id) {
                socket.write(serializeStratumResponse(errorResponse(request.id, 21, 'Stale or rejected share')));
              } else {
                socket.write(serializeStratumResponse(successResponse(request.id, true)));
              }
              break;
            }
            default:
              socket.write(serializeStratumResponse(errorResponse(request.id, 20, 'Unsupported method')));
          }
        }
        newline = buffer.indexOf('\n');
      }
    });
    socket.on('close', () => this.sockets.delete(socket));
  }

  private notifyJob(socket: Socket, job: BitcoinMiningJob): void {
    socket.write(serializeStratumNotification('mining.notify', [
      job.id,
      job.previousBlockHash,
      job.coinbase1,
      job.coinbase2,
      [...job.merkleBranches],
      job.version,
      job.networkBits,
      job.networkTime,
      job.cleanJobs,
    ]));
  }
}
