/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { apiRequest } from './api-client.js';

test('coalesces concurrent refresh rotation and retries every protected request', async () => {
  const originalFetch = globalThis.fetch;
  const attempts = new Map<string, number>();
  let refreshCount = 0;

  globalThis.fetch = (async (input) => {
    const url = String(input);
    const path = new URL(url).pathname.replace('/api/v1', '');
    if (path === '/auth/refresh') {
      refreshCount += 1;
      await Promise.resolve();
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    }

    const attempt = (attempts.get(path) ?? 0) + 1;
    attempts.set(path, attempt);
    if (attempt === 1) {
      return new Response('{"message":"expired"}', {
        status: 401,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ path, attempt }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    const [first, second] = await Promise.all([
      apiRequest<{ path: string; attempt: number }>('/wallet/first'),
      apiRequest<{ path: string; attempt: number }>('/wallet/second'),
    ]);
    assert.equal(refreshCount, 1);
    assert.deepEqual(first, { path: '/wallet/first', attempt: 2 });
    assert.deepEqual(second, { path: '/wallet/second', attempt: 2 });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
