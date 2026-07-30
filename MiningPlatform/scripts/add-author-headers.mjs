/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const requestedRoots = process.argv.slice(2).map((entry) => resolve(projectRoot, entry));
const scanRoots = requestedRoots.length
  ? requestedRoots
  : ['apps', 'packages', 'scripts', 'infrastructure'].map((entry) => resolve(projectRoot, entry));

const ignoredDirectories = new Set(['node_modules', 'dist', '.next', '.turbo', 'coverage', '.git']);
const blockHeader = `/**\n * MiningPlatform\n * Author: Abia Nugrahanto\n * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.\n */\n\n`;
const cssHeader = `/*\n * MiningPlatform\n * Author: Abia Nugrahanto\n * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.\n */\n\n`;
const htmlHeader = `<!--\n  MiningPlatform\n  Author: Abia Nugrahanto\n  Copyright (c) 2026 Abia Nugrahanto. All rights reserved.\n-->\n`;
const lineHeaders = {
  hash: '# MiningPlatform\n# Author: Abia Nugrahanto\n# Copyright (c) 2026 Abia Nugrahanto. All rights reserved.\n\n',
  slash: '// MiningPlatform\n// Author: Abia Nugrahanto\n// Copyright (c) 2026 Abia Nugrahanto. All rights reserved.\n\n',
  sql: '-- MiningPlatform\n-- Author: Abia Nugrahanto\n-- Copyright (c) 2026 Abia Nugrahanto. All rights reserved.\n\n',
};

function headerFor(filePath) {
  const extension = extname(filePath).toLowerCase();
  const fileName = basename(filePath);
  if (['.ts', '.tsx', '.js', '.mjs', '.cjs'].includes(extension)) return blockHeader;
  if (['.css', '.scss', '.sass', '.less'].includes(extension)) return cssHeader;
  if (['.html', '.htm'].includes(extension)) return htmlHeader;
  if (extension === '.sql') return lineHeaders.sql;
  if (extension === '.prisma') return lineHeaders.slash;
  if (['.sh', '.bash', '.zsh', '.yaml', '.yml', '.conf'].includes(extension)) return lineHeaders.hash;
  if (fileName === 'Dockerfile' || fileName.endsWith('.Dockerfile') || fileName === '.env.example') return lineHeaders.hash;
  return undefined;
}

async function walk(path) {
  const info = await stat(path);
  if (info.isFile()) return [path];
  const entries = await readdir(path, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const child = join(path, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(child)));
    else files.push(child);
  }
  return files;
}

let changed = 0;
for (const root of scanRoots) {
  const files = await walk(root);
  for (const filePath of files) {
    const header = headerFor(filePath);
    if (!header) continue;
    const source = await readFile(filePath, 'utf8');
    if (source.slice(0, 700).includes('Author: Abia Nugrahanto')) continue;
    if (source.startsWith('#!')) {
      const newline = source.indexOf('\n');
      const shebang = newline >= 0 ? source.slice(0, newline + 1) : `${source}\n`;
      const rest = newline >= 0 ? source.slice(newline + 1) : '';
      await writeFile(filePath, `${shebang}${header}${rest}`);
    } else {
      await writeFile(filePath, `${header}${source}`);
    }
    changed += 1;
  }
}

console.log(`Author headers added to ${changed} files.`);
