import pino from 'pino';
import { env } from '../config/env.js';

export const logger = pino({
  level: env.LOG_LEVEL,
  base: { service: 'ledgerline-api' },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      'req.headers.cookie',
      'req.headers.authorization',
      'req.headers["set-cookie"]',
      'res.headers["set-cookie"]',
      'res.headers.cookie',
      'req.url',
      'req.originalUrl',
      'req.query',
      'req.query.*',
      'req.params',
      'req.params.*',
      'req.body',
      'req.body.*',
      'err.message',
      'err.stack',
      'err.*'
    ],
    remove: true
  }
});
