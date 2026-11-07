import type { NextFunction, Request, Response } from 'express';
import { logger } from '../lib/logger.js';
import { safeRouteTemplate } from '../lib/safe-route.js';

type ExpressError = Error & { type?: string; status?: number; statusCode?: number };

function categorizeError(err: ExpressError): { code: string; status: number } {
  if (err.type === 'entity.too.large') {
    return { code: 'PAYLOAD_TOO_LARGE', status: 413 };
  }
  if (err.type === 'entity.parse.failed') {
    return { code: 'BAD_REQUEST', status: 400 };
  }
  const statusCandidate = err.status ?? err.statusCode;
  if (typeof statusCandidate === 'number' && statusCandidate >= 400 && statusCandidate < 500) {
    return { code: 'CLIENT_ERROR', status: statusCandidate };
  }
  return { code: 'INTERNAL_ERROR', status: 500 };
}

export function errorHandler(err: ExpressError, req: Request, res: Response, next: NextFunction): void {
  if (res.headersSent) {
    next(err);
    return;
  }

  const requestId = (req as unknown as { id?: string }).id;
  const category = categorizeError(err);

  const route = safeRouteTemplate(req);
  logger.error(
    {
      requestId,
      method: req.method,
      ...(route ? { route } : {}),
      errCode: category.code,
      status: category.status
    },
    'unhandled error'
  );

  if (category.code === 'PAYLOAD_TOO_LARGE') {
    res.status(413).json({
      error: {
        code: 'PAYLOAD_TOO_LARGE',
        message: 'Request payload too large'
      }
    });
    return;
  }

  if (category.code === 'BAD_REQUEST') {
    res.status(400).json({
      error: {
        code: 'BAD_REQUEST',
        message: 'Bad request'
      }
    });
    return;
  }

  if (category.code === 'CLIENT_ERROR') {
    res.status(category.status).json({
      error: {
        code: 'CLIENT_ERROR',
        message: 'Client error'
      }
    });
    return;
  }

  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Internal server error'
    }
  });
}
