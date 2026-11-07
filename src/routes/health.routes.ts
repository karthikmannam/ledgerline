import { Router, type Request, type Response } from 'express';

const router = Router();

router.get('/health', (_req: Request, res: Response): void => {
  res.status(200).json({
    status: 'ok',
    service: 'ledgerline-api'
  });
});

export default router;
