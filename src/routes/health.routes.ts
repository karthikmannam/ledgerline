import { Router, type Request, type Response } from 'express';
import { pingDatabase } from '../db/pool.js';

const router = Router();

router.get('/health', (_req: Request, res: Response): void => {
  res.status(200).json({
    status: 'ok',
    service: 'ledgerline-api'
  });
});

router.get('/health/ready', async (_req: Request, res: Response): Promise<void> => {
  const ready = await pingDatabase();
  if (ready) {
    res.status(200).json({ status: 'ok', service: 'ledgerline-api' });
    return;
  }
  res.status(503).json({ error: { code: 'DB_NOT_READY', message: 'Database not ready' } });
});

router.get('/health/live', (_req: Request, res: Response): void => {
  res.status(200).json({ status: 'ok', service: 'ledgerline-api' });
});

export default router;
