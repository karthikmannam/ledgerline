export type UserRole = 'admin' | 'holder' | 'auditor';

export type AccountStatus = 'active' | 'suspended';
export type AccountPermission = 'view' | 'withdraw' | 'transfer_out';
export type DepositStatus = 'pending' | 'verified' | 'rejected';
export type AdjustmentStatus = 'pending' | 'approved' | 'rejected';
export type JournalType = 'deposit' | 'withdrawal' | 'transfer' | 'credit_adjustment' | 'debit_adjustment' | 'reversal';
export type PostingSide = 'debit' | 'credit';

export interface ApiErrorDetail {
  code: string;
  message: string;
}

export interface ApiErrorResponse {
  error: ApiErrorDetail;
}

export interface CurrentUser {
  id: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  sessionId: string;
}

export interface LoginResult {
  id: string;
  role: UserRole;
}

export interface Account {
  id: string;
  name: string;
  status: AccountStatus;
  currency: string;
  balance: string; // Paise string e.g. "2500000"
}

export interface StatementEntry {
  seq: string;
  transaction: string | null;
  type: JournalType | string | null;
  amount: string; // Paise string
  side: PostingSide;
  runningBalance: string; // Paise string
  actor: string | null;
  at: string; // ISO date
}

export interface StatementResponse {
  account: string;
  highWater: string;
  nextBefore: string | null;
  entries: StatementEntry[];
}

export interface DepositRequestItem {
  id: string;
  accountId: string;
  amount: string; // Paise string
  externalReference: string;
  status: DepositStatus;
  makerId: string | null;
  checkerId: string | null;
  createdAt: string;
}

export interface TransactionPosting {
  account: string;
  side: PostingSide;
  amount: string;
}

export interface TransactionDetail {
  id: string;
  type: JournalType;
  status: string;
  reversalOf: string | null;
  postings: TransactionPosting[];
}

export interface AuditEventItem {
  id: string | number;
  actor_id: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface AttemptItem {
  id: string;
  actor_id: string | null;
  endpoint: string;
  code: string;
  details: Record<string, unknown>;
  created_at: string;
}

export interface ReconciliationDiscrepancy {
  account: string;
  expected: string;
  projected: string;
}

export interface ReconciliationResponse {
  balanced: boolean;
  discrepancies: ReconciliationDiscrepancy[];
  integrityOk: boolean;
}

export interface TransferPayload {
  idempotencyKey: string;
  fromAccountId: string;
  toAccountId: string;
  amount: string;
  currency?: string;
}

export interface TransferResult {
  transaction: string;
  fromBalance: string;
  toBalance: string;
  currency: string;
}

export interface WithdrawalPayload {
  idempotencyKey: string;
  accountId: string;
  amount: string;
  currency?: string;
}

export interface WithdrawalResult {
  transaction: string;
  balance: string;
  currency: string;
}

export interface CreateDepositPayload {
  accountId: string;
  amount: string;
  externalReference: string;
  evidence?: Record<string, unknown>;
}

export interface CreateAdjustmentPayload {
  accountId: string;
  direction: 'credit' | 'debit';
  amount: string;
  reason: string;
  reference: string;
}

export interface PostedBalanceResponse {
  transaction: string;
  balance: string;
}
