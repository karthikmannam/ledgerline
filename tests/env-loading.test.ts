import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const envModuleUrl = new URL('../src/config/env.ts', import.meta.url).href;

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'ledgerline-env-'));
}

function cleanEnv(overrides: Record<string, string | undefined>): Record<string, string> {
  const base: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined) base[k] = v;
  }
  delete base.PORT;
  delete base.LOG_LEVEL;
  delete base.NODE_ENV;
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) {
      delete base[k];
    } else {
      base[k] = v;
    }
  }
  return base;
}

function runNode(args: string[], env: Record<string, string>): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, args, {
    cwd: repoRoot,
    env
  });
  return {
    status: result.status,
    stdout: String(result.stdout ?? ''),
    stderr: String(result.stderr ?? '')
  };
}

describe('Environment file loading', () => {
  it('loads configured values from .env', () => {
    const dir = makeTempDir();
    try {
      const envFile = join(dir, '.env');
      writeFileSync(envFile, 'PORT=3457\nLOG_LEVEL=debug\nNODE_ENV=test\n', 'utf8');
      const result = runNode(
        [`--env-file-if-exists=${envFile}`, '-e', 'console.log(process.env.PORT, process.env.LOG_LEVEL, process.env.NODE_ENV)'],
        cleanEnv({})
      );
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('3457');
      expect(result.stdout).toContain('debug');
      expect(result.stdout).toContain('test');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('gives precedence to existing process environment over .env', () => {
    const dir = makeTempDir();
    try {
      const envFile = join(dir, '.env');
      writeFileSync(envFile, 'PORT=3457\nLOG_LEVEL=debug\n', 'utf8');
      const result = runNode(
        [`--env-file-if-exists=${envFile}`, '-e', 'console.log(process.env.PORT, process.env.LOG_LEVEL)'],
        cleanEnv({ PORT: '9999', LOG_LEVEL: 'warn' })
      );
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('9999');
      expect(result.stdout).not.toContain('3457');
      expect(result.stdout).toContain('warn');
      expect(result.stdout).not.toContain('debug');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('configures dev and production startup scripts to load .env', () => {
    const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts.dev).toContain('--env-file-if-exists=.env');
    expect(pkg.scripts.start).toContain('--env-file-if-exists=.env');
  });

  it('loads env file through dev-style (tsx) and production-style startup flags', () => {
    const dir = makeTempDir();
    try {
      const envFile = join(dir, '.env');
      writeFileSync(envFile, 'PORT=3461\nLOG_LEVEL=debug\nNODE_ENV=test\n', 'utf8');
      const devLike = runNode(
        [
          `--env-file-if-exists=${envFile}`,
          '--import',
          'tsx/esm',
          '--input-type=module',
          '-e',
          `const mod = await import(${JSON.stringify(envModuleUrl)}); console.log(mod.env.PORT, mod.env.LOG_LEVEL, mod.env.NODE_ENV);`
        ],
        cleanEnv({})
      );
      expect(devLike.status).toBe(0);
      expect(devLike.stdout).toContain('3461');
      expect(devLike.stdout).toContain('debug');
      expect(devLike.stdout).toContain('test');

      const prodLike = runNode(
        [`--env-file-if-exists=${envFile}`, '--import', 'tsx/esm', '--input-type=module', '-e', `const mod = await import(${JSON.stringify(envModuleUrl)}); console.log(mod.env.PORT);`],
        cleanEnv({})
      );
      expect(prodLike.status).toBe(0);
      expect(prodLike.stdout).toContain('3461');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('continues when optional .env is missing', () => {
    const dir = makeTempDir();
    try {
      const missing = join(dir, 'missing.env');
      const result = runNode(
        [`--env-file-if-exists=${missing}`, '-e', 'console.log("startup-ok")'],
        cleanEnv({})
      );
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('startup-ok');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects invalid configuration', () => {
    const dir = makeTempDir();
    try {
      const envFile = join(dir, '.env');
      writeFileSync(envFile, 'LOG_LEVEL=not-a-level\nPORT=3000\nNODE_ENV=test\n', 'utf8');
      const result = runNode(
        [
          `--env-file-if-exists=${envFile}`,
          '--import',
          'tsx/esm',
          '--input-type=module',
          '-e',
          `await import(${JSON.stringify(envModuleUrl)});`
        ],
        cleanEnv({})
      );
      expect(result.status).not.toBe(0);
      const combined = `${result.stdout} ${result.stderr}`;
      expect(combined).toContain('Invalid environment configuration');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
