import net from 'node:net';
import { createLogger } from '@mining/logger';
import { hashSensitiveValue } from '@mining/security';
import { parseStratumLine, serializeStratumResponse } from '@mining/stratum-protocol';

const logger = createLogger('stratum-server');
const host = process.env.STRATUM_HOST ?? '0.0.0.0';
const port = Number(process.env.STRATUM_PORT ?? 3333);

const server = net.createServer((socket) => {
  const remote = `${socket.remoteAddress ?? 'unknown'}:${socket.remotePort ?? 0}`;
  logger.info({ remoteHash: hashSensitiveValue(remote) }, 'miner connected');
  socket.setEncoding('utf8');
  socket.setTimeout(120_000);

  let buffer = '';
  let authorized = false;

  socket.on('data', (chunk: string) => {
    buffer += chunk;
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      try {
        const request = parseStratumLine(line);

        if (request.method === 'mining.subscribe') {
          socket.write(serializeStratumResponse({
            id: request.id,
            result: [[['mining.set_difficulty', 'setup'], ['mining.notify', 'setup']], '00000000', 4],
            error: null,
          }));
          continue;
        }

        if (request.method === 'mining.authorize') {
          authorized = false;
          socket.write(serializeStratumResponse({
            id: request.id,
            result: false,
            error: [20, 'Gateway authentication is not implemented', null],
          }));
          continue;
        }

        if (request.method === 'mining.submit') {
          socket.write(serializeStratumResponse({
            id: request.id,
            result: false,
            error: [21, authorized ? 'Share validation is not implemented' : 'Worker is not authorized', null],
          }));
          continue;
        }

        socket.write(serializeStratumResponse({
          id: request.id,
          result: null,
          error: [20, 'Unsupported method', null],
        }));
      } catch (error) {
        logger.warn({ error }, 'invalid stratum message');
        socket.write(serializeStratumResponse({ id: null, result: null, error: [20, 'Invalid request', null] }));
      }
    }
  });

  socket.on('timeout', () => socket.destroy());
  socket.on('error', (error) => logger.warn({ error }, 'socket error'));
  socket.on('close', () => logger.info({ remoteHash: hashSensitiveValue(remote) }, 'miner disconnected'));
});

server.listen(port, host, () => {
  logger.info({ host, port }, 'stratum scaffold listening; production mining is disabled');
});
