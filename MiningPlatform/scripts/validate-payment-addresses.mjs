/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function decodeBase58(value) {
  let number = 0n;
  for (const character of value) {
    const index = alphabet.indexOf(character);
    if (index < 0) throw new Error(`Invalid base58 character in ${value}`);
    number = number * 58n + BigInt(index);
  }
  const bytes = [];
  while (number > 0n) {
    bytes.push(Number(number & 255n));
    number >>= 8n;
  }
  bytes.reverse();
  let leadingZeroes = 0;
  while (leadingZeroes < value.length && value[leadingZeroes] === '1') leadingZeroes += 1;
  return Buffer.concat([Buffer.alloc(leadingZeroes), Buffer.from(bytes)]);
}

function doubleSha256(value) {
  return createHash('sha256').update(createHash('sha256').update(value).digest()).digest();
}

function validateBase58Check(address, expectedVersion) {
  const decoded = decodeBase58(address);
  if (decoded.length !== 25) throw new Error(`${address} must decode to 25 bytes`);
  const payload = decoded.subarray(0, -4);
  const checksum = decoded.subarray(-4);
  if (!doubleSha256(payload).subarray(0, 4).equals(checksum)) throw new Error(`${address} has an invalid checksum`);
  if (payload[0] !== expectedVersion) throw new Error(`${address} has unexpected network version ${payload[0]}`);
}

const source = readFileSync(resolve('packages/shared/src/payment-addresses.ts'), 'utf8');
const addresses = [...source.matchAll(/address:\s*'([^']+)'/g)].map((match) => match[1]);
if (addresses.length !== 8) throw new Error(`Expected 8 configured address entries, found ${addresses.length}`);

const evm = '0xfc9284292aae1a49db0e8ff9f9075710559dc9cc';
if (!/^0x[0-9a-fA-F]{40}$/.test(evm) || addresses.filter((value) => value === evm).length !== 5) {
  throw new Error('EVM receiving-address configuration is invalid');
}

const solana = '7vjhb5NYBBXzd8eocm5Jg3KoqwTXrPs34ipFsyA8urX2';
if (decodeBase58(solana).length !== 32 || !addresses.includes(solana)) throw new Error('Solana receiving address is invalid');

const tron = 'THSeYj8TMxF14aQm5JFrvF3eP4q6f98rZg';
validateBase58Check(tron, 0x41);
if (!addresses.includes(tron)) throw new Error('Tron receiving address is missing');

const bitcoin = '1P6FZk2jiRuFkP8m4RuAVi9QVYWvhDCtrA';
validateBase58Check(bitcoin, 0x00);
if (!addresses.includes(bitcoin)) throw new Error('Bitcoin receiving address is missing');

process.stdout.write('Payment receiving-address validation passed.\n');
