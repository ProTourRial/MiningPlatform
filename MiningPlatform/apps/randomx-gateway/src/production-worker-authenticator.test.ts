/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  WorkerAuthenticationContext,
  WorkerAuthenticationResult,
  WorkerAuthenticator,
} from '@mining/stratum-server/worker-authentication';
import { RandomXProductionWorkerAuthenticator } from './production-worker-authenticator.js';

const hashKey = 'randomx-worker-agent-hash-key-with-32-bytes';

class FakeWorkerAuthenticator implements WorkerAuthenticator {
  context?: WorkerAuthenticationContext;
  closed = false;

  constructor(private readonly result: WorkerAuthenticationResult) {}

  async authenticate(
    _workerName: string,
    _password: string,
    context: WorkerAuthenticationContext,
  ): Promise<WorkerAuthenticationResult> {
    this.context = context;
    return this.result;
  }

  async close(): Promise<void> {
    this.closed = true;
  }
}

test('maps a production credential principal into the RandomX identity boundary', async () => {
  const shared = new FakeWorkerAuthenticator({
    authenticated: true,
    worker: {
      workerId: 'worker-1',
      workerName: 'account.cpu-1#MP05',
      userId: 'user-1',
      miningAccountId: 'account-1',
    },
  });
  const authenticator = new RandomXProductionWorkerAuthenticator(shared, hashKey);
  const result = await authenticator.authenticate('account.cpu-1#MP05', 'secret', {
    connectionId: 'connection-1',
    remoteIpHash: 'remote-ip-hash',
    agent: 'xmrig/6.test',
  });

  assert.deepEqual(result, {
    authenticated: true,
    worker: {
      workerId: 'worker-1',
      workerName: 'account.cpu-1#MP05',
      miningAccountId: 'account-1',
    },
  });
  assert.equal(shared.context?.sessionId, 'connection-1');
  assert.equal(shared.context?.remoteIpHash, 'remote-ip-hash');
  assert.equal(shared.context?.userAgent, undefined, 'raw miner agent must not cross the adapter');
  assert.match(shared.context?.userAgentHash ?? '', /^[0-9a-f]{64}$/);
  assert.notEqual(shared.context?.userAgentHash, 'xmrig/6.test');

  await authenticator.close();
  assert.equal(shared.closed, true);
});

test('preserves generic authentication failure without exposing credential detail', async () => {
  const shared = new FakeWorkerAuthenticator({
    authenticated: false,
    code: 'INVALID_CREDENTIALS',
  });
  const authenticator = new RandomXProductionWorkerAuthenticator(shared, hashKey);
  assert.deepEqual(
    await authenticator.authenticate('account.cpu-1', 'wrong', {
      connectionId: 'connection-1',
      remoteIpHash: 'remote-ip-hash',
    }),
    { authenticated: false, code: 'INVALID_CREDENTIALS' },
  );
});

test('fails closed if an injected authenticator omits the mining account binding', async () => {
  const shared = new FakeWorkerAuthenticator({
    authenticated: true,
    worker: { workerId: 'worker-1', workerName: 'account.cpu-1' },
  });
  const authenticator = new RandomXProductionWorkerAuthenticator(shared, hashKey);
  assert.deepEqual(
    await authenticator.authenticate('account.cpu-1', 'secret', {
      connectionId: 'connection-1',
      remoteIpHash: 'remote-ip-hash',
    }),
    { authenticated: false, code: 'AUTHENTICATION_CONTEXT_INVALID' },
  );
});

test('rejects an undersized agent hash key before accepting credentials', () => {
  const shared = new FakeWorkerAuthenticator({ authenticated: false, code: 'INVALID_CREDENTIALS' });
  assert.throws(
    () => new RandomXProductionWorkerAuthenticator(shared, 'too-short'),
    /at least 32 bytes/,
  );
});
