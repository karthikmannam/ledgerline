import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import type { Server } from 'node:http';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const SHUTDOWN_TIMEOUT_MS = 10_000;

function isEntryPoint(): boolean {
  const argv1 = process.argv[1];
  if (!argv1) {
    return false;
  }
  try {
    return import.meta.url === pathToFileURL(resolve(argv1)).href;
  } catch {
    return false;
  }
}

type ServerError = NodeJS.ErrnoException & { address?: string; port?: number };

export function handleServerError(err: ServerError): void {
  logger.error(
    {
      code: err.code ?? 'UNKNOWN',
      syscall: err.syscall,
      address: err.address,
      port: err.port,
      msg: 'server error'
    },
    'server error'
  );
  process.exitCode = 1;
}

export function shutdownServer(server: Server, signal: string, timeoutMs = SHUTDOWN_TIMEOUT_MS): boolean {
  if ((server as Server & { __shuttingDown?: boolean }).__shuttingDown === true) {
    logger.warn({ signal }, 'shutdown already in progress');
    return false;
  }
  (server as Server & { __shuttingDown?: boolean }).__shuttingDown = true;

  logger.info({ signal }, 'shutting down');

  let forced = false;
  let fallbackTimer: ReturnType<typeof setTimeout> | undefined;
  const forceTimer = setTimeout(() => {
    forced = true;
    logger.error({ signal }, 'shutdown timeout — force-closing connections');
    if (typeof server.closeAllConnections === 'function') {
      server.closeAllConnections();
    }
    fallbackTimer = setTimeout(() => {
      process.exitCode = 1;
      process.exit(1);
    }, 1000);
  }, timeoutMs);
  forceTimer.unref();

  server.close((err) => {
    clearTimeout(forceTimer);
    if (fallbackTimer) {
      clearTimeout(fallbackTimer);
    }
    if (err) {
      logger.error({ signal, code: (err as NodeJS.ErrnoException).code ?? 'UNKNOWN' }, 'shutdown error');
      process.exitCode = 1;
      process.exit(1);
      return;
    }
    if (forced) {
      process.exitCode = 1;
      process.exit(1);
      return;
    }
    process.exitCode = 0;
  });

  return true;
}

if (isEntryPoint()) {
  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, 'ledgerline-api listening');
  });

  server.on('error', (err: ServerError) => {
    handleServerError(err);
  });

  process.on('SIGINT', () => {
    shutdownServer(server, 'SIGINT');
  });
  process.on('SIGTERM', () => {
    shutdownServer(server, 'SIGTERM');
  });
}
