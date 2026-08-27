/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { readFileSync } from 'node:fs';
import {
  createServer as createHttpServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { BitcoinJsonRpcClient } from '@mining/blockchain-adapters';
import { getBuildInfo } from '@mining/build-info';
import { createLogger } from '@mining/logger';
import { sha256Hex, verifySignerSignature, type SignerRequestV1 } from '@mining/signer-protocol';
import { TransactionSignerService } from './signer-service.js';

const logger = createLogger('transaction-signer');
const enabled = process.env.SIGNER_ENABLED === 'true';
const port = Number(process.env.SIGNER_PORT ?? 4100);
const host = process.env.SIGNER_HOST ?? '0.0.0.0';
const maximumBodyBytes = 700_000;
const timestampToleranceMilliseconds = 60_000;
const usedNonces = new Map<string, number>();
let signingInProgress = false;

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required when the isolated signer is enabled`);
  return value;
}

function parseKeyAllowlist(value: string): Map<string, string> {
  const parsed = JSON.parse(value) as unknown;
  if (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new Error('SIGNER_KEY_ALLOWLIST_JSON must be an object');
  }
  const entries = Object.entries(parsed as Record<string, unknown>);
  if (entries.length === 0) throw new Error('SIGNER_KEY_ALLOWLIST_JSON cannot be empty');
  const allowlist = new Map<string, string>();
  for (const [reference, walletName] of entries) {
    if (
      !/^[A-Za-z0-9:_-]{8,160}$/.test(reference) ||
      typeof walletName !== 'string' ||
      !walletName
    ) {
      throw new Error('SIGNER_KEY_ALLOWLIST_JSON contains an invalid mapping');
    }
    allowlist.set(reference, walletName);
  }
  return allowlist;
}

const sharedSecret = enabled ? required('SIGNER_SHARED_SECRET') : '';
const keyAllowlist = enabled ? parseKeyAllowlist(required('SIGNER_KEY_ALLOWLIST_JSON')) : new Map();
const rpcBase = enabled
  ? {
      url: required('BITCOIN_SIGNER_RPC_URL'),
      username: required('BITCOIN_SIGNER_RPC_USER'),
      password: required('BITCOIN_SIGNER_RPC_PASSWORD'),
      timeoutMilliseconds: Number(process.env.BITCOIN_SIGNER_RPC_TIMEOUT_MS ?? 10_000),
      allowInsecureHttp: process.env.BITCOIN_SIGNER_RPC_ALLOW_INSECURE_HTTP === 'true',
    }
  : null;
const signer = new TransactionSignerService(keyAllowlist, (walletName) => {
  if (!rpcBase) throw new Error('Signer RPC is disabled');
  return new BitcoinJsonRpcClient({ ...rpcBase, walletName });
});

function respond(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  response.end(JSON.stringify(body));
}

async function readBody(request: IncomingMessage): Promise<string> {
  const declaredLength = Number(request.headers['content-length'] ?? 0);
  if (declaredLength > maximumBodyBytes) throw new Error('Signer request body is too large');
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += buffer.length;
    if (length > maximumBodyBytes) throw new Error('Signer request body is too large');
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function authenticate(request: IncomingMessage, body: string): void {
  const timestamp = String(request.headers['x-mining-timestamp'] ?? '');
  const nonce = String(request.headers['x-mining-nonce'] ?? '');
  const signature = String(request.headers['x-mining-signature'] ?? '');
  const timestampNumber = Number(timestamp);
  if (
    !Number.isFinite(timestampNumber) ||
    Math.abs(Date.now() - timestampNumber) > timestampToleranceMilliseconds
  ) {
    throw new Error('Signer request timestamp is outside the accepted window');
  }
  for (const [usedNonce, expiresAt] of usedNonces) {
    if (expiresAt <= Date.now()) usedNonces.delete(usedNonce);
  }
  if (usedNonces.has(nonce)) throw new Error('Signer request nonce was already used');
  if (
    !verifySignerSignature({
      secret: sharedSecret,
      timestamp,
      nonce,
      bodyDigest: sha256Hex(body),
      signature,
    })
  ) {
    throw new Error('Signer request authentication failed');
  }
  usedNonces.set(nonce, Date.now() + timestampToleranceMilliseconds);
}

async function handler(request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (request.method === 'GET' && request.url === '/health/live') {
    respond(response, 200, { status: 'live', service: 'transaction-signer' });
    return;
  }
  if (request.method === 'GET' && request.url === '/health/ready') {
    respond(response, enabled ? 200 : 503, { status: enabled ? 'ready' : 'disabled' });
    return;
  }
  if (request.method !== 'POST' || request.url !== '/v1/sign') {
    respond(response, 404, { error: 'NOT_FOUND' });
    return;
  }
  if (!enabled) {
    respond(response, 503, { error: 'SIGNER_DISABLED' });
    return;
  }
  if (signingInProgress) {
    respond(response, 429, { error: 'SIGNER_BUSY' });
    return;
  }
  try {
    const body = await readBody(request);
    authenticate(request, body);
    const payload = JSON.parse(body) as SignerRequestV1;
    signingInProgress = true;
    const result = await signer.sign(payload);
    respond(response, 200, result);
    logger.info(
      { requestId: result.requestId, manifestDigest: result.manifestDigest },
      'isolated signing request completed',
    );
  } catch (error) {
    logger.warn({ error }, 'isolated signing request rejected');
    respond(response, 400, { error: 'SIGNING_REQUEST_REJECTED' });
  } finally {
    signingInProgress = false;
  }
}

const requireMutualTls =
  enabled &&
  (process.env.SIGNER_REQUIRE_MTLS ?? String(process.env.NODE_ENV === 'production')) === 'true';
if (
  enabled &&
  process.env.NODE_ENV === 'production' &&
  !requireMutualTls &&
  process.env.SIGNER_ALLOW_WITHOUT_MTLS !== 'true'
) {
  throw new Error('Production signer requires mutual TLS unless explicitly acknowledged');
}
const server = requireMutualTls
  ? createHttpsServer(
      {
        cert: readFileSync(required('SIGNER_TLS_CERT_FILE')),
        key: readFileSync(required('SIGNER_TLS_KEY_FILE')),
        ca: readFileSync(required('SIGNER_TLS_CA_FILE')),
        requestCert: true,
        rejectUnauthorized: true,
        minVersion: 'TLSv1.3',
      },
      (request, response) => void handler(request, response),
    )
  : createHttpServer((request, response) => void handler(request, response));

server.headersTimeout = 10_000;
server.requestTimeout = 15_000;
server.keepAliveTimeout = 5_000;
server.listen(port, host, () => {
  logger.info(
    { build: getBuildInfo('transaction-signer'), enabled, host, port, mutualTls: requireMutualTls },
    'transaction signer listening',
  );
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
