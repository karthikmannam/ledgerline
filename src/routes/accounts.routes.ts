import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { withTransaction, query } from '../db/pool.js';
import { requireAuth, requireCsrf, requireRole } from '../middleware/auth.js';
import { audit } from '../lib/audit.js';
import { toMoneyString } from '../lib/money.js';
import { canViewAccount } from '../services/authz.js';

const router = Router();
router.use(requireAuth);

router.post('/', requireCsrf, async (req: Request, res: Response): Promise<void> => {
  if (req.actor?.role === 'auditor') {
    res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Auditor is read-only' } });
    return;
  }
  const schema = z.object({ name: z.string().min(1).max(120) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid account input' } });
    return;
  }
  const actor = req.actor!;
  const id = await withTransaction(async (client) => {
    const r = await client.query('SELECT open_customer_account($1,$2) AS id', [actor.id, parsed.data.name.trim()]);
    const newId = String(r.rows[0].id);
    await client.query(
      `INSERT INTO account_permissions(ledger_account_id,user_id,permission) VALUES($1,$2,'view'),($1,$2,'withdraw'),($1,$2,'transfer_out') ON CONFLICT DO NOTHING`,
      [newId, actor.id]
    );
    await audit(client, actor.id, 'account.create', 'ledger_account', newId);
    return newId;
  });
  res.status(201).json({ id });
});

router.get('/', async (req: Request, res: Response): Promise<void> => {
  const actor = req.actor!;
  if (actor.role === 'admin' || actor.role === 'auditor') {
    const all = await query(
      `SELECT a.id, a.name, a.status, a.currency, a.owner_user_id, bp.balance_paise
       FROM ledger_accounts a LEFT JOIN balance_projections bp ON bp.ledger_account_id=a.id
       WHERE a.kind='customer' ORDER BY a.created_at`
    );
    res.json({ accounts: all.rows.map((r) => ({ id: String(r.id), name: r.name, status: r.status, balance: toMoneyString(r.balance_paise ?? 0), currency: r.currency })) });
    return;
  }
  const held = await query(
    `SELECT a.id, a.name, a.status, a.currency, bp.balance_paise, a.created_at
     FROM ledger_accounts a LEFT JOIN balance_projections bp ON bp.ledger_account_id=a.id
     WHERE a.kind='customer' AND (a.owner_user_id=$1 OR EXISTS(SELECT 1 FROM account_permissions p WHERE p.ledger_account_id=a.id AND p.user_id=$1 AND p.permission='view'))
     ORDER BY a.created_at`,
    [actor.id]
  );
  res.json({ accounts: held.rows.map((r) => ({ id: String(r.id), name: r.name, status: r.status, balance: toMoneyString(r.balance_paise ?? 0), currency: r.currency })) });
});

router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  const actor = req.actor!;
  const id = String(req.params.id);
  const accountRes = await query(
    `SELECT a.id, a.name, a.status, a.currency, a.owner_user_id, bp.balance_paise
     FROM ledger_accounts a LEFT JOIN balance_projections bp ON bp.ledger_account_id=a.id WHERE a.id=$1 AND a.kind='customer'`,
    [id]
  );
  const row = accountRes.rows[0];
  if (!row) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Account not found' } });
    return;
  }
  const allowed = await withTransaction(async (client) => canViewAccount(client as never, { id: actor.id, role: actor.role } as never, id));
  if (!allowed) {
    res.status(403).json({ error: { code: 'FORBIDDEN', message: 'No access to account' } });
    return;
  }
  res.json({ id: String(row.id), name: row.name, status: row.status, currency: row.currency, balance: toMoneyString(row.balance_paise ?? 0) });
});

router.patch('/:id/status', requireCsrf, requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
  const schema = z.object({ status: z.enum(['active', 'suspended']) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid account status input' } });
    return;
  }
  const id = String(req.params.id);
  const updated = await withTransaction(async (client) => {
    await client.query('SELECT id FROM ledger_accounts WHERE id=$1 FOR UPDATE', [id]);
    const r = await client.query(
      `UPDATE ledger_accounts SET status=$1 WHERE id=$2 AND kind='customer' RETURNING id, status`,
      [parsed.data.status, id]
    );
    if (!r.rows[0]) return null;
    await audit(client, req.actor!.id, 'account.status.update', 'ledger_account', id, { status: parsed.data.status });
    return r.rows[0];
  });
  if (!updated) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Account not found' } });
    return;
  }
  res.json({ id, status: updated.status });
});

router.post('/:id/suspend', requireCsrf, requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params.id);
  const updated = await withTransaction(async (client) => {
    await client.query('SELECT id FROM ledger_accounts WHERE id=$1 FOR UPDATE', [id]);
    const r = await client.query(`UPDATE ledger_accounts SET status='suspended' WHERE id=$1 AND kind='customer' RETURNING id`, [id]);
    if (!r.rows[0]) return false;
    await audit(client, req.actor!.id, 'account.suspend', 'ledger_account', id);
    return true;
  });
  if (!updated) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Account not found' } });
    return;
  }
  res.json({ ok: true });
});

router.post('/:id/permission', requireCsrf, requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
  const schema = z.object({
    user_id: z.string().uuid(),
    permission: z.enum(['view', 'withdraw', 'transfer_out'])
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid permission input' } });
    return;
  }
  const id = String(req.params.id);
  await withTransaction(async (client) => {
    await client.query('SELECT id FROM ledger_accounts WHERE id=$1 FOR UPDATE', [id]);
    await client.query(
      `INSERT INTO account_permissions(ledger_account_id,user_id,permission) VALUES($1,$2,$3) ON CONFLICT DO NOTHING`,
      [id, parsed.data.user_id, parsed.data.permission]
    );
    await audit(client, req.actor!.id, 'account.permission', 'ledger_account', id, { permission: parsed.data.permission, userId: parsed.data.user_id });
  });
  res.json({ ok: true });
});

router.get('/:id/statement', async (req: Request, res: Response): Promise<void> => {
  const actor = req.actor!;
  const id = String(req.params.id);
  const limitRaw = req.query.limit;
  const beforeRaw = req.query.before;
  const hwRaw = req.query.hw;
  const limit = typeof limitRaw === 'string' ? Math.min(Math.max(parseInt(limitRaw, 10) || 50, 1), 200) : 50;
  const before = typeof beforeRaw === 'string' && /^\d+$/.test(beforeRaw) ? beforeRaw : null;
  const hwParam = typeof hwRaw === 'string' && /^\d+$/.test(hwRaw) ? hwRaw : null;

  const allowed = await withTransaction(async (client) => canViewAccount(client as never, { id: actor.id, role: actor.role } as never, id));
  if (!allowed) {
    res.status(403).json({ error: { code: 'FORBIDDEN', message: 'No access to account' } });
    return;
  }
  let highWaterValue: string;
  if (hwParam) {
    highWaterValue = hwParam;
  } else {
    const hw = await query('SELECT max(id) AS max_id FROM account_activity WHERE ledger_account_id=$1', [id]);
    highWaterValue = hw.rows[0]?.max_id != null ? String(hw.rows[0].max_id) : '0';
  }

  const activity = await query(
    `SELECT a.id AS seq, a.transaction_id, a.amount_paise, a.side, a.running_balance_paise, a.actor_id, a.created_at, j.type, j.external_reference
     FROM account_activity a LEFT JOIN journal_transactions j ON j.id=a.transaction_id
     WHERE a.ledger_account_id=$1 AND ($2::bigint IS NULL OR a.id < $2::bigint) AND a.id <= $3::bigint
     ORDER BY a.id DESC LIMIT $4`,
    [id, before, highWaterValue, limit + 1]
  );
  const rows = activity.rows;
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  const nextBefore = hasMore && page.length ? String(page[page.length - 1]!.id) : null;

  res.json({
    account: id,
    highWater: highWaterValue,
    nextBefore,
    entries: page.map((r) => ({
      seq: String(r.seq),
      transaction: r.transaction_id ? String(r.transaction_id) : null,
      type: r.type ? String(r.type) : null,
      amount: toMoneyString(String(r.amount_paise)),
      side: String(r.side),
      runningBalance: toMoneyString(String(r.running_balance_paise)),
      actor: r.actor_id ? String(r.actor_id) : null,
      at: r.created_at
    }))
  });
});

export default router;
