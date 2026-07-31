/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { readFile, rm } from 'node:fs/promises';
import { isAbsolute, normalize, resolve, sep } from 'node:path';

const root = process.cwd();
const manifestPath = resolve(root, 'DELETE_FILES.txt');
const lines = (await readFile(manifestPath, 'utf8')).split(/\r?\n/);
const entries = [];

for (let index = 0; index < lines.length; index += 1) {
  const line = lines[index].trim();
  if (!line || line.startsWith('#')) continue;
  if (line !== 'DELETE') throw new Error(`Expected DELETE at line ${index + 1}, received: ${line}`);
  const path = lines[++index]?.trim();
  if (!path) throw new Error(`Missing delete path after line ${index}`);
  if (lines[++index]?.trim() !== 'Reason:') throw new Error(`Missing Reason: for ${path}`);
  const reason = lines[++index]?.trim();
  if (!reason) throw new Error(`Missing reason for ${path}`);
  if (lines[++index]?.trim() !== 'Required:') throw new Error(`Missing Required: for ${path}`);
  const requiredRaw = lines[++index]?.trim().toLowerCase();
  if (!['yes', 'no'].includes(requiredRaw)) throw new Error(`Required must be Yes or No for ${path}`);
  entries.push({ path, reason, required: requiredRaw === 'yes' });
}

for (const entry of entries) {
  const normalized = normalize(entry.path);
  if (isAbsolute(normalized) || normalized.split(sep).includes('..')) {
    throw new Error(`Unsafe delete path rejected: ${entry.path}`);
  }
  const absolute = resolve(root, normalized);
  if (!absolute.startsWith(`${root}${sep}`)) throw new Error(`Delete path escapes project root: ${entry.path}`);
  await rm(absolute, { force: true });
  process.stdout.write(`Removed obsolete file: ${entry.path}\nReason: ${entry.reason}\n`);
}
