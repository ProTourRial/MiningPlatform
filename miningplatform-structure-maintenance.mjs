#!/usr/bin/env node
/**
 * MiningPlatform structure maintenance
 * Safe-by-default cleanup and low-risk project organization.
 *
 * Commands:
 *   plan       Scan and write a structure report. Never changes source.
 *   cleanup    Remove generated/dependency/build artifacts.
 *   organize   Perform low-risk source organization.
 *   all        Run cleanup, then organize.
 *
 * Mutating commands are dry-run unless --apply is supplied.
 */

import {
  access,
  appendFile,
  copyFile,
  cp,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path';

const COMMANDS = new Set(['plan', 'cleanup', 'organize', 'all']);
const GENERATED_DIRECTORY_NAMES = new Set([
  'node_modules',
  '.turbo',
  '.next',
  'dist',
  'coverage',
  '.cache',
]);
const GENERATED_FILE_SUFFIXES = ['.tsbuildinfo'];
const TEXT_EXTENSIONS = new Set([
  '.md', '.txt', '.json', '.yaml', '.yml', '.mjs', '.js', '.cjs', '.ts', '.tsx',
  '.sh', '.ps1', '.prisma', '.sql', '.toml', '.env', '.example', '.gitignore',
]);
const WALK_SKIP_DIRECTORIES = new Set([
  '.git', 'node_modules', '.turbo', '.next', 'dist', 'coverage', '.cache', '.artifacts',
]);

function usage(message) {
  if (message) process.stderr.write(`Error: ${message}\n\n`);
  process.stderr.write(`Usage:\n  node miningplatform-structure-maintenance.mjs <plan|cleanup|organize|all> [options]\n\nOptions:\n  --root <path>          Repository root or MiningPlatform monorepo root. Default: current directory\n  --apply                Apply changes. Without this flag, cleanup/organize/all are dry-run\n  --allow-dirty          Permit tracked Git changes. Not recommended\n  --validate             Run pnpm install, lint, typecheck, test, and build after apply\n  --no-backup            Do not create .artifacts/structure-backup snapshot\n  --help                 Show this help\n\nExamples:\n  node miningplatform-structure-maintenance.mjs plan --root .\n  node miningplatform-structure-maintenance.mjs cleanup --root . --apply\n  node miningplatform-structure-maintenance.mjs organize --root . --apply\n  node miningplatform-structure-maintenance.mjs all --root . --apply --validate\n`);
  process.exit(message ? 1 : 0);
}

function parseArguments(argv) {
  const [command = 'plan', ...rest] = argv;
  if (command === '--help' || command === '-h') usage();
  if (!COMMANDS.has(command)) usage(`Unknown command: ${command}`);
  const options = {
    command,
    root: process.cwd(),
    apply: false,
    allowDirty: false,
    validate: false,
    backup: true,
  };
  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index];
    if (argument === '--root') {
      const value = rest[++index];
      if (!value) usage('--root requires a path');
      options.root = resolve(value);
    } else if (argument === '--apply') options.apply = true;
    else if (argument === '--allow-dirty') options.allowDirty = true;
    else if (argument === '--validate') options.validate = true;
    else if (argument === '--no-backup') options.backup = false;
    else if (argument === '--help' || argument === '-h') usage();
    else usage(`Unknown option: ${argument}`);
  }
  return options;
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function detectRoots(inputRoot) {
  const root = resolve(inputRoot);
  const directPackage = join(root, 'package.json');
  const nestedPackage = join(root, 'MiningPlatform', 'package.json');

  if (await exists(directPackage)) {
    const packageJson = await readJson(directPackage);
    if (packageJson.name !== 'mining-platform') {
      throw new Error(`${directPackage} is not the MiningPlatform root package`);
    }
    const parent = dirname(root);
    const repositoryRoot = (await exists(join(parent, '.git'))) || (await exists(join(parent, '.github')))
      ? parent
      : root;
    return { repositoryRoot, projectRoot: root, packageJson };
  }

  if (await exists(nestedPackage)) {
    const packageJson = await readJson(nestedPackage);
    if (packageJson.name !== 'mining-platform') {
      throw new Error(`${nestedPackage} is not the MiningPlatform root package`);
    }
    return { repositoryRoot: root, projectRoot: join(root, 'MiningPlatform'), packageJson };
  }

  throw new Error(`MiningPlatform package.json was not found under ${root}`);
}

function normalizeRelative(path) {
  return path.split(sep).join('/');
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function commandExists(command) {
  const result = spawnSync(command, ['--version'], { stdio: 'ignore', shell: false });
  return result.status === 0;
}

function runCommand(command, args, cwd, options = {}) {
  const executable = process.platform === 'win32' && command === 'pnpm' ? 'pnpm.cmd' : command;
  const result = spawnSync(executable, args, {
    cwd,
    stdio: options.capture ? 'pipe' : 'inherit',
    encoding: 'utf8',
    shell: false,
  });
  if (result.status !== 0 && !options.allowFailure) {
    const output = [result.stdout, result.stderr].filter(Boolean).join('\n');
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}${output ? `\n${output}` : ''}`);
  }
  return result;
}

function ensureGitSafety(repositoryRoot, allowDirty) {
  const gitProbe = spawnSync('git', ['-C', repositoryRoot, 'rev-parse', '--is-inside-work-tree'], { stdio: 'ignore' });
  if (!commandExists('git') || gitProbe.status !== 0) {
    return;
  }
  const tracked = spawnSync('git', ['-C', repositoryRoot, 'status', '--porcelain', '--untracked-files=no'], {
    encoding: 'utf8',
  });
  if (tracked.status !== 0) return;
  if (tracked.stdout.trim() && !allowDirty) {
    throw new Error('Tracked Git changes are present. Commit/stash them, or use --allow-dirty after reviewing the risk.');
  }
}

async function sha256(path) {
  const hash = createHash('sha256');
  hash.update(await readFile(path));
  return hash.digest('hex');
}

async function walkPruned(root, visitor) {
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const absolute = join(directory, entry.name);
      const action = await visitor(absolute, entry);
      if (entry.isDirectory() && action !== 'prune') await visit(absolute);
    }
  }
  await visit(root);
}

async function collectGenerated(projectRoot) {
  const directories = [];
  const files = [];
  await walkPruned(projectRoot, async (absolute, entry) => {
    if (entry.isDirectory()) {
      if (GENERATED_DIRECTORY_NAMES.has(entry.name)) {
        directories.push(absolute);
        return 'prune';
      }
      if (absolute === join(projectRoot, 'packages', 'database', 'src', 'generated')) {
        directories.push(absolute);
        return 'prune';
      }
      if (entry.name === '.git') return 'prune';
      return undefined;
    }
    if (entry.isFile()) {
      if (GENERATED_FILE_SUFFIXES.some((suffix) => entry.name.endsWith(suffix))) files.push(absolute);
      // PROJECT_TREE.txt is intentionally preserved as a pre-alpha.3 structural snapshot.
    }
    return undefined;
  });
  return { directories, files: [...new Set(files)] };
}

async function collectDuplicateDtos(projectRoot) {
  const modulesRoot = join(projectRoot, 'apps', 'api', 'src', 'modules');
  const pairs = [];
  if (!(await exists(modulesRoot))) return pairs;
  const modules = await readdir(modulesRoot, { withFileTypes: true });
  for (const moduleEntry of modules) {
    if (!moduleEntry.isDirectory()) continue;
    const moduleName = moduleEntry.name;
    const rootDto = join(modulesRoot, moduleName, `${moduleName}.dto.ts`);
    const nestedDto = join(modulesRoot, moduleName, 'dto', `${moduleName}.dto.ts`);
    if ((await exists(rootDto)) && (await exists(nestedDto))) {
      pairs.push({ moduleName, rootDto, nestedDto, identical: (await sha256(rootDto)) === (await sha256(nestedDto)) });
    }
  }
  return pairs;
}

async function collectPlan(roots) {
  const { repositoryRoot, projectRoot, packageJson } = roots;
  const generated = await collectGenerated(projectRoot);
  const nestedWorkflow = join(projectRoot, '.github', 'workflows', 'ci.yml');
  const rootWorkflow = join(repositoryRoot, '.github', 'workflows', 'ci.yml');
  let nestedWorkflowStatus = 'not-present';
  if (await exists(nestedWorkflow)) {
    if (!(await exists(rootWorkflow))) nestedWorkflowStatus = 'root-missing';
    else nestedWorkflowStatus = (await sha256(nestedWorkflow)) === (await sha256(rootWorkflow)) ? 'identical' : 'different';
  }

  const duplicateDtos = await collectDuplicateDtos(projectRoot);
  const adrA = join(projectRoot, 'docs', 'adr', '0009-control-plane-identity-and-session.md');
  const adrB = join(projectRoot, 'docs', 'adr', '0009-identity-access-session-rbac.md');
  const duplicateAdr = (await exists(adrA)) && (await exists(adrB))
    ? { first: adrA, second: adrB, identical: (await sha256(adrA)) === (await sha256(adrB)) }
    : null;

  const candidates = {
    upstreamSimulator: await exists(join(projectRoot, 'apps', 'upstream-simulator')),
    monitoringAgent: await exists(join(projectRoot, 'apps', 'monitoring-agent')),
    walletWorker: await exists(join(projectRoot, 'apps', 'wallet-worker')),
    blockchainAdapters: await exists(join(projectRoot, 'packages', 'blockchain-adapters')),
    validationPackage: await exists(join(projectRoot, 'packages', 'validation')),
    stateMachinePackage: await exists(join(projectRoot, 'packages', 'state-machine')),
  };

  return {
    generatedAt: new Date().toISOString(),
    repositoryRoot,
    projectRoot,
    version: packageJson.version,
    generated: {
      directoryCount: generated.directories.length,
      fileCount: generated.files.length,
      directories: generated.directories.map((path) => normalizeRelative(relative(projectRoot, path))),
      files: generated.files.map((path) => normalizeRelative(relative(projectRoot, path))),
    },
    nestedWorkflow: {
      status: nestedWorkflowStatus,
      rootPath: normalizeRelative(relative(repositoryRoot, rootWorkflow)),
      nestedPath: normalizeRelative(relative(repositoryRoot, nestedWorkflow)),
    },
    duplicateDtos: duplicateDtos.map((pair) => ({
      module: pair.moduleName,
      identical: pair.identical,
      root: normalizeRelative(relative(projectRoot, pair.rootDto)),
      nested: normalizeRelative(relative(projectRoot, pair.nestedDto)),
    })),
    duplicateAdr: duplicateAdr ? {
      identical: duplicateAdr.identical,
      first: normalizeRelative(relative(projectRoot, duplicateAdr.first)),
      second: normalizeRelative(relative(projectRoot, duplicateAdr.second)),
    } : null,
    candidates,
    automaticScope: [
      'Remove generated/dependency/build artifacts',
      'Update .gitignore and .dockerignore',
      'Resolve an identical nested CI workflow, or report a conflict',
      'Move apps/upstream-simulator to tools/upstream-simulator',
      'Organize scripts into ci/db/dev/ops/release subdirectories',
      'Move root patch documentation into docs/releases/<version>/',
      'Consolidate duplicate DTOs only when contents are byte-identical',
    ],
    manualScope: [
      'Merge or renumber non-identical duplicate ADRs',
      'Merge non-identical duplicate DTOs',
      'Move wallet-worker or monitoring-agent into prototypes',
      'Remove validation/state-machine packages after import and runtime verification',
      'Change Docker Compose production services',
      'Regenerate and verify the release manifest after all source changes',
    ],
  };
}

async function writePlan(plan, projectRoot) {
  const artifactRoot = join(projectRoot, '.artifacts');
  await mkdir(artifactRoot, { recursive: true });
  const jsonPath = join(artifactRoot, 'structure-maintenance-plan.json');
  const textPath = join(artifactRoot, 'structure-maintenance-plan.txt');
  const lines = [
    'MiningPlatform structure maintenance plan',
    `Generated: ${plan.generatedAt}`,
    `Version: ${plan.version}`,
    `Repository root: ${plan.repositoryRoot}`,
    `Project root: ${plan.projectRoot}`,
    '',
    `Generated directories: ${plan.generated.directoryCount}`,
    `Generated files: ${plan.generated.fileCount}`,
    `Nested workflow: ${plan.nestedWorkflow.status}`,
    `Duplicate DTO pairs: ${plan.duplicateDtos.length}`,
    `Duplicate ADR-0009: ${plan.duplicateAdr ? (plan.duplicateAdr.identical ? 'identical' : 'different') : 'not found'}`,
    '',
    'Automatic scope:',
    ...plan.automaticScope.map((item) => `- ${item}`),
    '',
    'Manual scope:',
    ...plan.manualScope.map((item) => `- ${item}`),
    '',
    'Generated paths:',
    ...plan.generated.directories.map((item) => `- [dir] ${item}`),
    ...plan.generated.files.map((item) => `- [file] ${item}`),
    '',
    'Duplicate DTOs:',
    ...(plan.duplicateDtos.length ? plan.duplicateDtos.map((item) => `- ${item.module}: ${item.identical ? 'identical' : 'different'} (${item.root} | ${item.nested})`) : ['- none']),
  ];
  await writeFile(jsonPath, `${JSON.stringify(plan, null, 2)}\n`);
  await writeFile(textPath, `${lines.join('\n')}\n`);
  return { jsonPath, textPath };
}

class ChangeManager {
  constructor({ repositoryRoot, projectRoot, apply, backup }) {
    this.repositoryRoot = repositoryRoot;
    this.projectRoot = projectRoot;
    this.apply = apply;
    this.backupEnabled = backup;
    this.actions = [];
    this.backupRoot = join(projectRoot, '.artifacts', 'structure-backup', timestamp());
  }

  log(type, details) {
    this.actions.push({ type, ...details });
    process.stdout.write(`${this.apply ? '[APPLY]' : '[DRY-RUN]'} ${type}: ${details.path ?? `${details.from} -> ${details.to}`}\n`);
  }

  async backupPath(path) {
    if (!this.apply || !this.backupEnabled || !(await exists(path))) return null;
    const relativePath = relative(this.repositoryRoot, path);
    if (relativePath.startsWith('..')) throw new Error(`Backup path escapes repository: ${path}`);
    const target = join(this.backupRoot, 'files', relativePath);
    await mkdir(dirname(target), { recursive: true });
    const info = await stat(path);
    if (info.isDirectory()) await cp(path, target, { recursive: true, force: true });
    else await copyFile(path, target);
    return target;
  }

  async remove(path, options = {}) {
    if (!(await exists(path))) return;
    this.log('remove', { path: normalizeRelative(relative(this.repositoryRoot, path)) });
    if (!this.apply) return;
    if (options.backup !== false) await this.backupPath(path);
    await rm(path, { recursive: true, force: true });
  }

  async move(from, to) {
    if (!(await exists(from))) return;
    if (await exists(to)) throw new Error(`Cannot move because target already exists: ${to}`);
    this.log('move', {
      from: normalizeRelative(relative(this.repositoryRoot, from)),
      to: normalizeRelative(relative(this.repositoryRoot, to)),
    });
    if (!this.apply) return;
    await this.backupPath(from);
    await mkdir(dirname(to), { recursive: true });
    await rename(from, to);
  }

  async write(path, content, reason = 'modify') {
    const previous = await exists(path) ? await readFile(path, 'utf8') : null;
    if (previous === content) return;
    this.log(reason, { path: normalizeRelative(relative(this.repositoryRoot, path)) });
    if (!this.apply) return;
    if (previous !== null) await this.backupPath(path);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content);
  }

  async finish() {
    if (!this.apply) return null;
    const artifactRoot = join(this.projectRoot, '.artifacts');
    await mkdir(artifactRoot, { recursive: true });
    const manifest = {
      createdAt: new Date().toISOString(),
      repositoryRoot: this.repositoryRoot,
      projectRoot: this.projectRoot,
      backupRoot: this.backupEnabled ? this.backupRoot : null,
      actions: this.actions,
    };
    const manifestPath = join(artifactRoot, 'last-structure-maintenance.json');
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    if (this.backupEnabled) {
      await mkdir(this.backupRoot, { recursive: true });
      await writeFile(join(this.backupRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    }
    return manifestPath;
  }
}

async function appendIgnorePatterns(manager, path, patterns) {
  const current = (await exists(path)) ? await readFile(path, 'utf8') : '';
  const existing = new Set(current.split(/\r?\n/).map((line) => line.trim()));
  const missing = patterns.filter((pattern) => !existing.has(pattern));
  if (!missing.length) return;
  const separator = current && !current.endsWith('\n') ? '\n' : '';
  const block = `${separator}\n# Generated workspace and maintenance artifacts\n${missing.join('\n')}\n`;
  await manager.write(path, `${current}${block}`, 'update-ignore');
}

async function cleanupGenerated(manager, projectRoot) {
  const generated = await collectGenerated(projectRoot);
  // Delete deepest paths first to avoid redundant operations.
  const directories = generated.directories.sort((left, right) => right.length - left.length);
  for (const directory of directories) await manager.remove(directory, { backup: false });
  for (const file of generated.files) await manager.remove(file, { backup: false });

  await appendIgnorePatterns(manager, join(projectRoot, '.gitignore'), [
    '.artifacts/',
    'node_modules/',
    '**/node_modules/',
    '.turbo/',
    '**/.turbo/',
    '.next/',
    '**/.next/',
    'dist/',
    '**/dist/',
    'coverage/',
    '**/coverage/',
    '.cache/',
    '**/.cache/',
    '*.tsbuildinfo',
    '*.log',
    'packages/database/src/generated/',
    // PROJECT_TREE.txt intentionally not ignored during alpha.3 cleanup,
  ]);

  await appendIgnorePatterns(manager, join(projectRoot, '.dockerignore'), [
    '.artifacts/',
    '**/.artifacts/',
    '**/.turbo/',
    '**/.cache/',
    '**/coverage/',
    '**/*.tsbuildinfo',
    // PROJECT_TREE.txt intentionally not ignored during alpha.3 cleanup,
  ]);
}

async function replaceTextInTree(manager, root, replacements, explicitExclusions = new Set()) {
  await walkPruned(root, async (absolute, entry) => {
    if (entry.isDirectory()) {
      if (WALK_SKIP_DIRECTORIES.has(entry.name)) return 'prune';
      return undefined;
    }
    if (!entry.isFile() || explicitExclusions.has(absolute)) return undefined;
    const extension = extname(entry.name).toLowerCase();
    const textLike = TEXT_EXTENSIONS.has(extension)
      || entry.name === 'Dockerfile'
      || entry.name.endsWith('.Dockerfile')
      || entry.name === '.gitignore'
      || entry.name === '.dockerignore'
      || entry.name === 'pnpm-lock.yaml';
    if (!textLike) return undefined;
    let source;
    try {
      source = await readFile(absolute, 'utf8');
    } catch {
      return undefined;
    }
    let updated = source;
    for (const [from, to] of replacements) updated = updated.split(from).join(to);
    if (updated !== source) await manager.write(absolute, updated, 'update-reference');
    return undefined;
  });
}

async function ensureWorkspacePatterns(manager, projectRoot, patterns) {
  const workspacePath = join(projectRoot, 'pnpm-workspace.yaml');
  let source = await readFile(workspacePath, 'utf8');
  for (const pattern of patterns) {
    const line = `  - ${pattern}`;
    if (!source.split(/\r?\n/).some((entry) => entry.trim() === `- ${pattern}`)) {
      const marker = '  - packages/*';
      if (source.includes(marker)) source = source.replace(marker, `${marker}\n${line}`);
      else source += `\n${line}\n`;
    }
  }
  await manager.write(workspacePath, source, 'update-workspace');
}

async function resolveNestedWorkflow(manager, repositoryRoot, projectRoot) {
  const nested = join(projectRoot, '.github', 'workflows', 'ci.yml');
  const root = join(repositoryRoot, '.github', 'workflows', 'ci.yml');
  if (!(await exists(nested))) return;
  if (!(await exists(root))) {
    await manager.move(nested, root);
    await manager.remove(join(projectRoot, '.github'));
    return;
  }
  if ((await sha256(nested)) === (await sha256(root))) {
    await manager.remove(join(projectRoot, '.github'));
    return;
  }
  process.stderr.write('[MANUAL] Nested CI workflow differs from the root workflow. It was not removed. Merge it manually.\n');
}

async function moveUpstreamSimulator(manager, projectRoot) {
  const from = join(projectRoot, 'apps', 'upstream-simulator');
  const to = join(projectRoot, 'tools', 'upstream-simulator');
  if (!(await exists(from))) return;
  await manager.move(from, to);
  await ensureWorkspacePatterns(manager, projectRoot, ['tools/*']);
  await replaceTextInTree(manager, projectRoot, [
    ['apps/upstream-simulator', 'tools/upstream-simulator'],
    ['apps\\upstream-simulator', 'tools\\upstream-simulator'],
  ]);
  const toolsReadme = join(projectRoot, 'tools', 'README.md');
  if (!(await exists(toolsReadme))) {
    await manager.write(toolsReadme, '# Development Tools\n\nTooling yang tidak dijalankan sebagai service produksi ditempatkan di folder ini.\n', 'create-doc');
  }
}

const SCRIPT_MAP = new Map([
  ['add-author-headers.mjs', 'release/add-author-headers.mjs'],
  ['apply-delete-manifest.mjs', 'release/apply-delete-manifest.mjs'],
  ['generate-release-manifest.mjs', 'release/generate-release-manifest.mjs'],
  ['verify-release-manifest.mjs', 'release/verify-release-manifest.mjs'],
  ['check-alpha5-upgrade.mjs', 'ci/check-alpha5-upgrade.mjs'],
  ['check-alpha6-upgrade.mjs', 'ci/check-alpha6-upgrade.mjs'],
  ['check-v030-alpha1.mjs', 'ci/check-v030-alpha1.mjs'],
  ['check-v030-alpha2.mjs', 'ci/check-v030-alpha2.mjs'],
  ['verify-alpha5-migration.mjs', 'ci/verify-alpha5-migration.mjs'],
  ['verify-alpha5-release.mjs', 'ci/verify-alpha5-release.mjs'],
  ['verify-alpha6-migration.mjs', 'ci/verify-alpha6-migration.mjs'],
  ['verify-alpha6-release.mjs', 'ci/verify-alpha6-release.mjs'],
  ['verify-v030-alpha1-migration.mjs', 'ci/verify-v030-alpha1-migration.mjs'],
  ['verify-v030-alpha1-release.mjs', 'ci/verify-v030-alpha1-release.mjs'],
  ['verify-v030-alpha2-migration.mjs', 'ci/verify-v030-alpha2-migration.mjs'],
  ['validate-payment-addresses.mjs', 'ci/validate-payment-addresses.mjs'],
  ['database-snapshot.mjs', 'db/database-snapshot.mjs'],
  ['bootstrap.sh', 'dev/bootstrap.sh'],
  ['check-secrets.sh', 'dev/check-secrets.sh'],
  ['stratum-smoke-client.ts', 'dev/stratum-smoke-client.ts'],
  ['wait-for-http.mjs', 'dev/wait-for-http.mjs'],
  ['user-role-cli.ts', 'ops/user-role-cli.ts'],
  ['worker-credential-cli.ts', 'ops/worker-credential-cli.ts'],
]);

async function organizeScripts(manager, projectRoot) {
  const scriptsRoot = join(projectRoot, 'scripts');
  const replacements = [];
  for (const [fromName, toRelative] of SCRIPT_MAP) {
    const from = join(scriptsRoot, fromName);
    const to = join(scriptsRoot, toRelative);
    if (!(await exists(from))) continue;
    await manager.move(from, to);
    replacements.push([`scripts/${fromName}`, `scripts/${normalizeRelative(toRelative)}`]);
    replacements.push([`scripts\\${fromName}`, `scripts\\${toRelative.split('/').join('\\')}`]);
  }

  const rootPatchScripts = [
    ['apply-patch.sh', 'scripts/release/apply-patch.sh'],
    ['apply-patch.ps1', 'scripts/release/apply-patch.ps1'],
  ];
  for (const [fromRelative, toRelative] of rootPatchScripts) {
    const from = join(projectRoot, fromRelative);
    const to = join(projectRoot, ...toRelative.split('/'));
    if (await exists(from)) await manager.move(from, to);
  }

  replacements.push(
    ['bash apply-patch.sh', 'bash scripts/release/apply-patch.sh'],
    ['.\\apply-patch.ps1', '.\\scripts\\release\\apply-patch.ps1'],
    ['./apply-patch.ps1', './scripts/release/apply-patch.ps1'],
    ['`apply-patch.sh`', '`scripts/release/apply-patch.sh`'],
    ['`apply-patch.ps1`', '`scripts/release/apply-patch.ps1`'],
  );

  await replaceTextInTree(manager, projectRoot, replacements);

  // Scripts moved one directory deeper need an adjusted project-root calculation.
  const authorHeader = join(scriptsRoot, 'release', 'add-author-headers.mjs');
  if (await exists(authorHeader)) {
    const source = await readFile(authorHeader, 'utf8');
    await manager.write(authorHeader, source.replace(
      "const projectRoot = resolve(import.meta.dirname, '..');",
      "const projectRoot = resolve(import.meta.dirname, '..', '..');",
    ), 'fix-relative-root');
  }
  const alpha2Migration = join(scriptsRoot, 'ci', 'verify-v030-alpha2-migration.mjs');
  if (await exists(alpha2Migration)) {
    const source = await readFile(alpha2Migration, 'utf8');
    await manager.write(alpha2Migration, source.replace(
      "const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');",
      "const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');",
    ), 'fix-relative-root');
  }

  const scriptsTsconfig = join(scriptsRoot, 'tsconfig.json');
  if (await exists(scriptsTsconfig)) {
    const source = await readFile(scriptsTsconfig, 'utf8');
    await manager.write(scriptsTsconfig, source.replace('"include": ["./*.ts"]', '"include": ["./**/*.ts"]'), 'update-tsconfig');
  }
}

async function movePatchDocumentation(manager, projectRoot, version) {
  const destination = join(projectRoot, 'docs', 'releases', version);
  for (const fileName of ['APPLY_PATCH.md', 'DIRECT_OVERWRITE.md']) {
    const from = join(projectRoot, fileName);
    const to = join(destination, fileName);
    if (await exists(from)) await manager.move(from, to);
  }
  // DELETE_FILES.txt intentionally remains in the root because historical patch validators consume it.
}

async function consolidateIdenticalDtos(manager, projectRoot) {
  const pairs = await collectDuplicateDtos(projectRoot);
  for (const pair of pairs) {
    if (!pair.identical) {
      process.stderr.write(`[MANUAL] DTO files differ for ${pair.moduleName}; no file was deleted.\n`);
      continue;
    }
    const moduleRoot = dirname(pair.rootDto);
    const oldImport = `./${pair.moduleName}.dto.js`;
    const newImport = `./dto/${pair.moduleName}.dto.js`;
    await replaceTextInTree(manager, moduleRoot, [[oldImport, newImport]], new Set([pair.rootDto, pair.nestedDto]));
    await manager.remove(pair.rootDto);
  }
}

async function markReleaseManifestStale(manager, projectRoot, version) {
  const manifest = join(projectRoot, 'release-manifest.json');
  if (!(await exists(manifest))) return;
  const target = join(projectRoot, '.artifacts', 'previous-release', version, 'release-manifest.json');
  await manager.move(manifest, target);
  process.stdout.write('[INFO] release-manifest.json was archived because source paths changed. Regenerate it after validation.\n');
}

async function organize(manager, roots) {
  const { repositoryRoot, projectRoot, packageJson } = roots;
  await resolveNestedWorkflow(manager, repositoryRoot, projectRoot);
  await moveUpstreamSimulator(manager, projectRoot);
  await organizeScripts(manager, projectRoot);
  await movePatchDocumentation(manager, projectRoot, packageJson.version);
  await consolidateIdenticalDtos(manager, projectRoot);
  await markReleaseManifestStale(manager, projectRoot, packageJson.version);

  const prototypesReadme = join(projectRoot, 'prototypes', 'README.md');
  if (!(await exists(prototypesReadme))) {
    await manager.write(prototypesReadme,
      '# Prototypes\n\nKomponen eksperimental ditempatkan di sini hanya setelah dependensi runtime, Docker, CI, dan deployment telah diperbarui. Pemindahan wallet-worker dan monitoring-agent tidak dilakukan otomatis.\n',
      'create-doc');
  }
}

async function validateProject(projectRoot) {
  if (!commandExists('pnpm')) throw new Error('pnpm was not found. Install the package manager before using --validate.');
  const commands = [
    ['install', '--frozen-lockfile'],
    ['db:generate'],
    ['lint'],
    ['typecheck'],
    ['test'],
    ['build'],
  ];
  for (const args of commands) runCommand('pnpm', args, projectRoot);
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const roots = await detectRoots(options.root);
  const plan = await collectPlan(roots);
  const planFiles = await writePlan(plan, roots.projectRoot);
  process.stdout.write(`Plan written:\n- ${planFiles.textPath}\n- ${planFiles.jsonPath}\n`);

  if (options.command === 'plan') return;
  if (!options.apply) {
    process.stdout.write('\nDry-run only. Re-run with --apply after reviewing the plan.\n');
  } else {
    ensureGitSafety(roots.repositoryRoot, options.allowDirty);
  }

  const manager = new ChangeManager({
    repositoryRoot: roots.repositoryRoot,
    projectRoot: roots.projectRoot,
    apply: options.apply,
    backup: options.backup,
  });

  if (options.command === 'cleanup' || options.command === 'all') {
    await cleanupGenerated(manager, roots.projectRoot);
  }
  if (options.command === 'organize' || options.command === 'all') {
    await organize(manager, roots);
  }

  const manifestPath = await manager.finish();
  if (manifestPath) process.stdout.write(`Change manifest: ${manifestPath}\n`);

  if (options.apply && options.validate) await validateProject(roots.projectRoot);

  process.stdout.write('\nCompleted. Review git diff before committing.\n');
  if (options.apply && !options.validate) {
    process.stdout.write('Recommended next commands:\n');
    process.stdout.write(`  cd "${roots.projectRoot}"\n`);
    process.stdout.write('  pnpm install --frozen-lockfile\n');
    process.stdout.write('  pnpm db:generate\n');
    process.stdout.write('  pnpm lint && pnpm typecheck && pnpm test && pnpm build\n');
    process.stdout.write('  pnpm release:manifest\n');
    process.stdout.write('  pnpm release:manifest:verify\n');
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
