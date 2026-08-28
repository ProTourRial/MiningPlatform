/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import type { RandomXHasher } from './types.js';

const MAX_HASH_RESPONSE_BYTES = 128;

export type RandomXServiceClientOptions = {
  url: string;
  timeoutMilliseconds?: number;
  allowInsecureHttp?: boolean;
  fetchImplementation?: typeof fetch;
};

export class RandomXServiceError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
    this.name = 'RandomXServiceError';
  }
}

function isLoopback(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

export class RandomXServiceClient implements RandomXHasher {
  private readonly baseUrl: URL;
  private readonly timeoutMilliseconds: number;
  private readonly fetchImplementation: typeof fetch;

  constructor(options: RandomXServiceClientOptions) {
    const baseUrl = new URL(options.url);
    if (baseUrl.protocol !== 'https:' && baseUrl.protocol !== 'http:') {
      throw new Error('RandomX service URL must use HTTP or HTTPS');
    }
    if (
      baseUrl.protocol === 'http:' &&
      !isLoopback(baseUrl.hostname) &&
      options.allowInsecureHttp !== true
    ) {
      throw new Error('Remote RandomX service requires HTTPS');
    }
    if (baseUrl.username || baseUrl.password || baseUrl.search || baseUrl.hash) {
      throw new Error('RandomX service URL must not contain credentials, query, or fragment');
    }

    this.baseUrl = new URL(baseUrl.toString().replace(/\/$/, '') + '/');
    this.timeoutMilliseconds = options.timeoutMilliseconds ?? 5_000;
    if (!Number.isSafeInteger(this.timeoutMilliseconds) || this.timeoutMilliseconds <= 0) {
      throw new Error('RandomX service timeout must be a positive integer');
    }
    this.fetchImplementation = options.fetchImplementation ?? fetch;
  }

  async hash(blobHex: string, seedHash: string): Promise<string> {
    if (!/^[0-9a-f]+$/i.test(blobHex) || blobHex.length % 2 !== 0 || blobHex.length > 40_000) {
      throw new Error('RandomX hashing input must be even-length hex within the service limit');
    }
    if (!/^[0-9a-f]{64}$/i.test(seedHash)) {
      throw new Error('RandomX seed hash must be exactly 32 bytes');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMilliseconds);
    try {
      const response = await this.fetchImplementation(new URL('hash', this.baseUrl), {
        method: 'POST',
        headers: {
          'content-type': 'application/x.randomx+hex',
          'randomx-seed': seedHash.toLowerCase(),
        },
        body: blobHex.toLowerCase(),
        signal: controller.signal,
      });
      const declaredLength = Number(response.headers.get('content-length') ?? '0');
      if (declaredLength > MAX_HASH_RESPONSE_BYTES) {
        throw new RandomXServiceError(
          'RandomX service response exceeds the limit',
          response.status,
        );
      }
      const body = await response.text();
      if (body.length > MAX_HASH_RESPONSE_BYTES) {
        throw new RandomXServiceError(
          'RandomX service response exceeds the limit',
          response.status,
        );
      }
      if (!response.ok) {
        throw new RandomXServiceError(
          response.status === 422
            ? 'RandomX service rejected the active seed'
            : `RandomX service returned HTTP ${response.status}`,
          response.status,
        );
      }
      if (!/^[0-9a-f]{64}$/i.test(body)) {
        throw new RandomXServiceError('RandomX service returned an invalid hash', response.status);
      }
      return body.toLowerCase();
    } catch (error) {
      if (error instanceof RandomXServiceError) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new RandomXServiceError('RandomX service request timed out', null);
      }
      throw new RandomXServiceError('RandomX service request failed', null);
    } finally {
      clearTimeout(timeout);
    }
  }
}
