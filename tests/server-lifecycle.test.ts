import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import http from 'node:http';
import { createApp } from '../src/app.js';
import { handleServerError, shutdownServer } from '../src/server.js';
import { logger } from '../src/lib/logger.js';

describe('Server lifecycle', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  });

  afterEach(() => {
    exitSpy.mockRestore();
    process.exitCode = undefined;
  });

  it('handles startup EADDRINUSE without emitting a stack trace', async () => {
    const app = createApp();
    const first = app.listen(0);
    await new Promise<void>((resolve) => first.on('listening', () => resolve()));
    const address = first.address();
    const port = typeof address === 'object' && address ? address.port : 0;

    const errorLogSpy = vi.spyOn(logger, 'error').mockImplementation(() => logger as unknown as typeof logger);
    const second = http.createServer();
    const startupErr = await new Promise<NodeJS.ErrnoException>((resolve) => {
      second.on('error', (err: NodeJS.ErrnoException) => resolve(err));
      second.listen(port);
    });
    expect(startupErr.code).toBe('EADDRINUSE');

    handleServerError(startupErr);
    expect(process.exitCode).toBe(1);
    expect(errorLogSpy).toHaveBeenCalled();
    const logged = JSON.stringify(errorLogSpy.mock.calls);
    expect(logged).not.toContain('Error:');
    expect(logged).not.toContain('at Object');
    expect(logged).toContain('EADDRINUSE');

    errorLogSpy.mockRestore();
    await new Promise<void>((resolve) => first.close(() => resolve()));
    second.close();
  });

  it('makes shutdown idempotent without terminating the test runner', async () => {
    const app = createApp();
    const server = app.listen(0);
    await new Promise<void>((resolve) => server.on('listening', () => resolve()));

    const first = shutdownServer(server, 'SIGTERM', 1000);
    const second = shutdownServer(server, 'SIGTERM', 1000);
    expect(first).toBe(true);
    expect(second).toBe(false);

    await new Promise<void>((resolve) => {
      if (!server.listening) {
        resolve();
        return;
      }
      server.on('close', () => resolve());
      setTimeout(resolve, 200);
    });
  });

  it('force-closes connections after shutdown timeout and reports failure exit', async () => {
    const closeAllConnections = vi.fn();
    let closeCallback: unknown = null;
    const fakeServer = {
      close: (cb: () => void) => {
        closeCallback = cb;
      },
      closeAllConnections,
      listening: true
    } as unknown as http.Server;

    const started = shutdownServer(fakeServer, 'SIGTERM', 20);
    expect(started).toBe(true);
    expect(closeCallback).not.toBeNull();

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(closeAllConnections).toHaveBeenCalled();

    await new Promise((resolve) => setTimeout(resolve, 20));
    if (typeof closeCallback === 'function') {
      (closeCallback as () => void)();
    }
    await new Promise<void>((resolve) => {
      const check = setInterval(() => {
        if (exitSpy.mock.calls.length > 0) {
          clearInterval(check);
          resolve();
        }
      }, 10);
      setTimeout(() => {
        clearInterval(check);
        resolve();
      }, 500);
    });

    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('does not invoke forced process termination on successful graceful shutdown', async () => {
    const app = createApp();
    const server = app.listen(0);
    await new Promise<void>((resolve) => server.on('listening', () => resolve()));

    const started = shutdownServer(server, 'SIGTERM', 1000);
    expect(started).toBe(true);

    await new Promise<void>((resolve) => {
      if (!server.listening) {
        resolve();
        return;
      }
      server.on('close', () => resolve());
      setTimeout(resolve, 2000);
    });

    expect(exitSpy).not.toHaveBeenCalled();
    expect(process.exitCode).not.toBe(1);
  });

  it('does not accept new connections after shutdown begins', async () => {
    const app = createApp();
    const server = app.listen(0);
    await new Promise<void>((resolve) => server.on('listening', () => resolve()));
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;

    const started = shutdownServer(server, 'SIGTERM', 1000);
    expect(started).toBe(true);

    const err = await new Promise<NodeJS.ErrnoException | null>((resolve) => {
      const req = http.get({ host: '127.0.0.1', port, path: '/health' }, (res) => {
        res.resume();
        resolve(null);
      });
      req.on('error', (e) => resolve(e as NodeJS.ErrnoException));
      req.setTimeout(1500, () => {
        req.destroy(new Error('timeout'));
      });
    });
    expect(err).not.toBeNull();
    expect((err as NodeJS.ErrnoException).code).toBe('ECONNREFUSED');

    await new Promise<void>((resolve) => {
      if (!server.listening) {
        resolve();
        return;
      }
      server.on('close', () => resolve());
      setTimeout(resolve, 2000);
    });
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('closes a real active HTTP connection after the configured timeout and exits non-zero', async () => {
    const hanging = http.createServer(() => {
      // Intentionally never respond so the client socket stays active.
    });
    await new Promise<void>((resolve) => hanging.listen(0, () => resolve()));
    const address = hanging.address();
    const port = typeof address === 'object' && address ? address.port : 0;

    const clientClosed = new Promise<void>((resolve) => {
      const req = http.get({ host: '127.0.0.1', port, path: '/hang' }, () => {
        // No response expected.
      });
      req.on('error', () => resolve());
      req.on('close', () => resolve());
      req.on('abort', () => resolve());
      const fallback = setTimeout(() => resolve(), 3000);
      fallback.unref();
    });

    // Give the client time to establish the socket before shutting down.
    await new Promise((resolve) => setTimeout(resolve, 50));

    const started = shutdownServer(hanging, 'SIGTERM', 50);
    expect(started).toBe(true);

    const clientResult = await Promise.race([
      clientClosed.then(() => 'closed' as const),
      new Promise((resolve) => setTimeout(() => resolve('timeout' as const), 3000))
    ]);
    expect(clientResult).toBe('closed');

    await new Promise<void>((resolve) => {
      if (!hanging.listening) {
        resolve();
        return;
      }
      hanging.on('close', () => resolve());
      setTimeout(resolve, 3000);
    });

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(process.exitCode).toBe(1);
  });

  it('remains idempotent when shutdown is requested multiple times during a real shutdown', async () => {
    const hanging = http.createServer(() => {});
    await new Promise<void>((resolve) => hanging.listen(0, () => resolve()));
    const first = shutdownServer(hanging, 'SIGTERM', 1000);
    const second = shutdownServer(hanging, 'SIGTERM', 1000);
    const third = shutdownServer(hanging, 'SIGINT', 1000);
    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(third).toBe(false);
    await new Promise<void>((resolve) => {
      if (!hanging.listening) {
        resolve();
        return;
      }
      hanging.on('close', () => resolve());
      setTimeout(resolve, 2000);
    });
    hanging.closeAllConnections?.();
    expect(exitSpy).not.toHaveBeenCalled();
  });
});
