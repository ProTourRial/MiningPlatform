/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { randomUUID } from 'node:crypto';
import { request as httpsRequest } from 'node:https';
import {
  canonicalJson,
  createSignerSignature,
  sha256Hex,
  type SignerRequestV1,
  type SignerResponseV1,
} from '@mining/signer-protocol';

const MAXIMUM_SIGNER_RESPONSE_BYTES = 700_000;

export type IsolatedSignerClientOptions = {
  url: string;
  sharedSecret: string;
  timeoutMilliseconds?: number;
  allowInsecureHttp?: boolean;
  fetchImplementation?: typeof fetch;
  mutualTls?: {
    certificate: Buffer | string;
    privateKey: Buffer | string;
    certificateAuthority: Buffer | string;
    serverName?: string;
  };
};

function isLoopback(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

export class IsolatedSignerClient {
  private readonly endpoint: URL;
  private readonly timeoutMilliseconds: number;
  private readonly fetchImplementation: typeof fetch;

  constructor(private readonly options: IsolatedSignerClientOptions) {
    this.endpoint = new URL('/v1/sign', options.url);
    if (!['http:', 'https:'].includes(this.endpoint.protocol)) {
      throw new Error('Isolated signer URL must use HTTP or HTTPS');
    }
    if (
      this.endpoint.protocol === 'http:' &&
      !isLoopback(this.endpoint.hostname) &&
      options.allowInsecureHttp !== true
    ) {
      throw new Error(
        'Plain HTTP signer transport is allowed only on loopback unless explicitly enabled',
      );
    }
    if (Buffer.byteLength(options.sharedSecret) < 32) {
      throw new Error('Signer shared secret must be at least 32 bytes');
    }
    this.timeoutMilliseconds = options.timeoutMilliseconds ?? 15_000;
    this.fetchImplementation = options.fetchImplementation ?? fetch;
  }

  private async post(
    body: string,
    headers: Record<string, string>,
  ): Promise<{
    ok: boolean;
    status: number;
    declaredLength: number;
    body: string;
  }> {
    if (this.options.mutualTls) {
      if (this.endpoint.protocol !== 'https:') {
        throw new Error('Mutual TLS signer transport requires HTTPS');
      }
      return new Promise((resolve, reject) => {
        const request = httpsRequest(
          this.endpoint,
          {
            method: 'POST',
            headers,
            cert: this.options.mutualTls?.certificate,
            key: this.options.mutualTls?.privateKey,
            ca: this.options.mutualTls?.certificateAuthority,
            servername: this.options.mutualTls?.serverName ?? this.endpoint.hostname,
            rejectUnauthorized: true,
            minVersion: 'TLSv1.3',
            timeout: this.timeoutMilliseconds,
          },
          (response) => {
            const chunks: Buffer[] = [];
            let length = 0;
            response.on('data', (chunk: Buffer) => {
              length += chunk.length;
              if (length > MAXIMUM_SIGNER_RESPONSE_BYTES) {
                response.destroy(new Error('Signer response is too large'));
                return;
              }
              chunks.push(chunk);
            });
            response.on('end', () => {
              resolve({
                ok: (response.statusCode ?? 500) >= 200 && (response.statusCode ?? 500) < 300,
                status: response.statusCode ?? 500,
                declaredLength: Number(response.headers['content-length'] ?? 0),
                body: Buffer.concat(chunks).toString('utf8'),
              });
            });
          },
        );
        request.on('timeout', () =>
          request.destroy(new Error('Isolated signer request timed out')),
        );
        request.on('error', reject);
        request.end(body);
      });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMilliseconds);
    try {
      const response = await this.fetchImplementation(this.endpoint, {
        method: 'POST',
        headers,
        body,
        signal: controller.signal,
      });
      return {
        ok: response.ok,
        status: response.status,
        declaredLength: Number(response.headers.get('content-length') ?? 0),
        body: await response.text(),
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Isolated signer request timed out');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async sign(request: SignerRequestV1): Promise<SignerResponseV1> {
    const body = canonicalJson(request);
    const timestamp = String(Date.now());
    const nonce = `wallet-${randomUUID()}`;
    const bodyDigest = sha256Hex(body);
    const signature = createSignerSignature({
      secret: this.options.sharedSecret,
      timestamp,
      nonce,
      bodyDigest,
    });
    const response = await this.post(body, {
      'content-type': 'application/json',
      'x-mining-timestamp': timestamp,
      'x-mining-nonce': nonce,
      'x-mining-signature': signature,
    });
    if (response.declaredLength > MAXIMUM_SIGNER_RESPONSE_BYTES) {
      throw new Error('Signer response is too large');
    }
    if (Buffer.byteLength(response.body) > MAXIMUM_SIGNER_RESPONSE_BYTES) {
      throw new Error('Signer response is too large');
    }
    if (!response.ok)
      throw new Error(`Isolated signer rejected request with HTTP ${response.status}`);
    const result = JSON.parse(response.body) as SignerResponseV1;
    if (
      result.requestId !== request.manifest.requestId ||
      result.manifestDigest !== request.manifestDigest ||
      !result.signedPsbt ||
      result.signedPsbtDigest !== sha256Hex(result.signedPsbt)
    ) {
      throw new Error('Isolated signer response does not match the request');
    }
    return result;
  }
}
