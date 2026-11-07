import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth, requireRole('admin', 'auditor'));

router.get('/events', async (_req: Request, res: Response): Promise<void> => {
  const limitRaw = _req.query.limit;
  const limit = typeof limitRaw === 'string' ? Math.min(Math.max(parseInt(limitRaw, 10) || 100, 1), 500) : 100;
  const rows = await query(
    `SELECT id, actor_id, action, target_type, target_id, metadata, created_at
     FROM audit_events ORDER BY id DESC LIMIT $1`,
    [limit]
  );
  res.json({ events: rows.rows });
});

router.get('/attempts', async (_req: Request, res: Response): Promise<void> => {
  const rows = await query(
    `SELECT id, actor_id, endpoint, code, details, created_at FROM attempts ORDER BY id DESC LIMIT 200`
  );
  res.json({ attempts: rows.rows });
});

router.get('/reconciliation', async (_req: Request, res: Response): Promise<void> => {
  const projections = await query(
    `SELECT bp.ledger_account_id, bp.balance_paise, a.kind
     FROM balance_projections bp JOIN ledger_accounts a ON a.id=bp.ledger_account_id`
  );
  const discrepancies: Array<{ account: string; expected: string; projected: string }> = [];
  for (const row of projections.rows) {
    const accountId = String(row.ledger_account_id);
    const kind = String(row.kind);
    const postings = await query(
      `SELECT side, amount_paise FROM journal_postings WHERE ledger_account_id=$1`,
      [accountId]
    );
    let expected = BigInt(0);
    for (const p of postings.rows) {
      const amt = BigInt(String(p.amount_paise));
      if (kind === 'clearing') {
        expected += String(p.side) === 'debit' ? amt : -amt;
      } else {
        expected += String(p.side) === 'credit' ? amt : -amt;
      }
    }
    const projected = BigInt(String(row.balance_paise));
    if (expected !== projected) {
      discrepancies.push({ account: accountId, expected: expected.toString(), projected: projected.toString() });
    }
  }
  const conservation = await query(
    `SELECT coalesce(sum(amount_paise) FILTER (WHERE side='debit'),0) AS dr, coalesce(sum(amount_paise) FILTER (WHERE side='credit'),0) AS cr FROM journal_postings`
  );
  const balanced = String(conservation.rows[0]?.dr ?? 0) === String(conservation.rows[0]?.cr ?? 0);
  res.json({
    balanced,
    discrepancies,
   integrityOk: balanced && discrepancies.length === 0
  });
});

// keep zod import in routes that need it
void z;

export default router;
