import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import helmet from 'helmet';
import { randomUUID } from 'node:crypto';
import { pinoHttp } from 'pino-http';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { safeRouteTemplate } from './lib/safe-route.js';
import healthRoutes from './routes/health.routes.js';
import authRoutes from './routes/auth.routes.js';
import accountsRoutes from './routes/accounts.routes.js';
import depositsRoutes from './routes/deposits.routes.js';
import moneyRoutes from './routes/money.routes.js';
import transactionsRoutes from './routes/transactions.routes.js';
import adjustmentsRoutes from './routes/adjustments.routes.js';
import auditRoutes from './routes/audit.routes.js';
import { openapiRouter } from './openapi.js';
import { notFoundHandler } from './middleware/not-found.js';
import { errorHandler } from './middleware/error-handler.js';

const REQUEST_ID_HEADER = 'x-request-id';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function generateRequestId(req: unknown): string {
  const headers = (req as { headers?: Record<string, unknown> }).headers;
  const candidate = headers?.[REQUEST_ID_HEADER];
  if (typeof candidate === 'string' && UUID_RE.test(candidate)) {
    return candidate;
  }
  return randomUUID();
}

export function createApp(opts?: { logger?: unknown }): Express {
  const appLogger = (opts?.logger ?? logger) as typeof logger;
  const app = express();
  app.disable('x-powered-by');

  app.use(helmet());

  app.use((req: Request, res: Response, next: NextFunction): void => {
    const origin = req.headers.origin;
    const allowed = env.FRONTEND_ORIGINS;
    if (origin && allowed.length > 0 && allowed.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, X-CSRF-Token, x-csrf-token, x-request-id');
      res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS');
    }
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  app.use(
    pinoHttp({
      logger: appLogger,
      genReqId: generateRequestId,
      quietReqLogger: false,
      customProps(req: Request) {
        const route = safeRouteTemplate(req);
        return route ? { route } : {};
      },
      serializers: {
        req(rawReq: Request) {
          return {
            id: (rawReq as unknown as { id?: string }).id,
            method: rawReq.method,
            headers: {
              host: rawReq.headers?.host,
              'content-type': rawReq.headers?.['content-type'],
              'x-request-id': rawReq.headers?.[REQUEST_ID_HEADER]
            },
            remoteAddress: rawReq.socket?.remoteAddress ?? rawReq.socket?.remoteAddress
          };
        },
        res(rawRes: Response) {
          return {
            statusCode: rawRes.statusCode
          };
        }
      }
    })
  );

  app.use((req: Request, res: Response, next: NextFunction): void => {
    const id = (req as unknown as { id?: string }).id;
    if (id) {
      res.setHeader('X-Request-ID', id);
    }
    next();
  });

  app.use(express.json({ limit: '16kb' }));

  app.use('/', healthRoutes);
  app.use('/', openapiRouter);
  app.use('/auth', authRoutes);
  app.use('/accounts', accountsRoutes);
  app.use('/deposit-requests', depositsRoutes);
  app.use('/', moneyRoutes);
  app.use('/transactions', transactionsRoutes);
  app.use('/adjustments', adjustmentsRoutes);
  app.use('/audit', auditRoutes);

  app.use(notFoundHandler);

  app.use(errorHandler);

  return app;
}

export const app: Express = createApp();

export default app;
