import { apiClient } from './client';
import type {
  CurrentUser,
  LoginResult,
  Account,
  StatementResponse,
  DepositRequestItem,
  TransferPayload,
  TransferResult,
  WithdrawalPayload,
  WithdrawalResult,
  CreateDepositPayload,
  CreateAdjustmentPayload,
  PostedBalanceResponse,
  TransactionDetail,
  AuditEventItem,
  AttemptItem,
  ReconciliationResponse,
  AccountStatus,
  AccountPermission,
} from '@/types/api';

// ==========================================
// 1. Authentication APIs
// ==========================================

export async function loginApi(email: string, password: string): Promise<LoginResult> {
  return apiClient<LoginResult>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function registerApi(email: string, password: string): Promise<{ id: string }> {
  return apiClient<{ id: string }>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function getMeApi(): Promise<CurrentUser> {
  return apiClient<CurrentUser>('/auth/me', {
    method: 'GET',
  });
}

export async function logoutApi(): Promise<{ ok: boolean }> {
  return apiClient<{ ok: boolean }>('/auth/logout', {
    method: 'POST',
  });
}

// ==========================================
// 2. Accounts APIs
// ==========================================

export async function getAccountsApi(): Promise<{ accounts: Account[] }> {
  return apiClient<{ accounts: Account[] }>('/accounts', {
    method: 'GET',
  });
}

export async function getAccountByIdApi(id: string): Promise<Account> {
  return apiClient<Account>(`/accounts/${id}`, {
    method: 'GET',
  });
}

export async function createAccountApi(name: string): Promise<{ id: string }> {
  return apiClient<{ id: string }>('/accounts', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export async function updateAccountStatusApi(id: string, status: AccountStatus): Promise<{ id: string; status: AccountStatus }> {
  return apiClient<{ id: string; status: AccountStatus }>(`/accounts/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export async function suspendAccountApi(id: string): Promise<{ ok: boolean }> {
  return apiClient<{ ok: boolean }>(`/accounts/${id}/suspend`, {
    method: 'POST',
  });
}

export async function grantAccountPermissionApi(id: string, userId: string, permission: AccountPermission): Promise<{ ok: boolean }> {
  return apiClient<{ ok: boolean }>(`/accounts/${id}/permission`, {
    method: 'POST',
    body: JSON.stringify({ user_id: userId, permission }),
  });
}

export async function getAccountStatementApi(
  id: string,
  options?: { limit?: number; before?: string | null; hw?: string | null }
): Promise<StatementResponse> {
  return apiClient<StatementResponse>(`/accounts/${id}/statement`, {
    method: 'GET',
    params: {
      limit: options?.limit ?? 50,
      before: options?.before ?? undefined,
      hw: options?.hw ?? undefined,
    },
  });
}

// ==========================================
// 3. Deposit Requests APIs
// ==========================================

export async function getDepositRequestsApi(limit = 100): Promise<{ deposits: DepositRequestItem[] }> {
  return apiClient<{ deposits: DepositRequestItem[] }>('/deposit-requests', {
    method: 'GET',
    params: { limit },
  });
}

export async function createDepositRequestApi(payload: CreateDepositPayload): Promise<{ id: string }> {
  return apiClient<{ id: string }>('/deposit-requests', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function verifyAndPostDepositApi(depositId: string): Promise<PostedBalanceResponse> {
  return apiClient<PostedBalanceResponse>(`/deposit-requests/${depositId}/verify-and-post`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

// ==========================================
// 4. Money Movement APIs
// ==========================================

export async function postWithdrawalApi(payload: WithdrawalPayload): Promise<WithdrawalResult> {
  return apiClient<WithdrawalResult>('/withdrawals', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function postTransferApi(payload: TransferPayload): Promise<TransferResult> {
  return apiClient<TransferResult>('/transfers', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// ==========================================
// 5. Transactions APIs
// ==========================================

export async function getTransactionByIdApi(id: string): Promise<TransactionDetail> {
  return apiClient<TransactionDetail>(`/transactions/${id}`, {
    method: 'GET',
  });
}

export async function reverseTransactionApi(id: string, reason?: string): Promise<{ reversal: string }> {
  return apiClient<{ reversal: string }>(`/transactions/${id}/reverse`, {
    method: 'POST',
    body: JSON.stringify({ reason: reason || 'Administrative reversal' }),
  });
}

// ==========================================
// 6. Adjustments APIs (Admin)
// ==========================================

export async function createAdjustmentApi(payload: CreateAdjustmentPayload): Promise<{ id: string }> {
  return apiClient<{ id: string }>('/adjustments', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function approveAdjustmentApi(id: string): Promise<PostedBalanceResponse> {
  return apiClient<PostedBalanceResponse>(`/adjustments/${id}/approve`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

// ==========================================
// 7. Audit APIs (Admin / Auditor)
// ==========================================

export async function getAuditEventsApi(limit = 100): Promise<{ events: AuditEventItem[] }> {
  return apiClient<{ events: AuditEventItem[] }>('/audit/events', {
    method: 'GET',
    params: { limit },
  });
}

export async function getAttemptsApi(): Promise<{ attempts: AttemptItem[] }> {
  return apiClient<{ attempts: AttemptItem[] }>('/audit/attempts', {
    method: 'GET',
  });
}

export async function getReconciliationApi(): Promise<ReconciliationResponse> {
  return apiClient<ReconciliationResponse>('/audit/reconciliation', {
    method: 'GET',
  });
}

// ==========================================
// 8. Health Check APIs
// ==========================================

export async function getHealthReadyApi(): Promise<{ status: string; service: string }> {
  return apiClient<{ status: string; service: string }>('/health/ready', {
    method: 'GET',
  });
}
