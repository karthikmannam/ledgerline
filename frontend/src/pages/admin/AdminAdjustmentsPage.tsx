import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAccountsApi, createAdjustmentApi, approveAdjustmentApi } from '@/api';
import { MoneyAmountInput } from '@/components/common/MoneyAmountInput';
import { MoneyDisplay } from '@/components/common/MoneyDisplay';
import { UnsupportedNotice } from '@/components/common/UnsupportedNotice';
import { ConfirmModal } from '@/components/common/ConfirmModal';
import { formatPaise } from '@/lib/money';
import {
  SlidersHorizontal,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  ShieldCheck,
  Scale,
} from 'lucide-react';
import type { PostedBalanceResponse } from '@/types/api';

export const AdminAdjustmentsPage: React.FC = () => {
  const queryClient = useQueryClient();

  const { data: accountsData } = useQuery({
    queryKey: ['accounts'],
    queryFn: getAccountsApi,
  });

  const accounts = accountsData?.accounts ?? [];

  // Form 1: Create Adjustment
  const [accountId, setAccountId] = useState('');
  const [direction, setDirection] = useState<'credit' | 'debit'>('credit');
  const [amountPaise, setAmountPaise] = useState('');
  const [reason, setReason] = useState('');
  const [reference, setReference] = useState('');

  const [createError, setCreateError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);

  // Form 2: Approve Adjustment
  const [approveId, setApproveId] = useState('');
  const [approveError, setApproveError] = useState<string | null>(null);
  const [approvedResult, setApprovedResult] = useState<PostedBalanceResponse | null>(null);
  const [showConfirmApprove, setShowConfirmApprove] = useState(false);

  React.useEffect(() => {
    if (!accountId && accounts.length > 0) {
      setAccountId(accounts[0].id);
    }
  }, [accounts, accountId]);

  const createMutation = useMutation({
    mutationFn: () =>
      createAdjustmentApi({
        accountId,
        direction,
        amount: amountPaise,
        reason: reason.trim(),
        reference: reference.trim(),
      }),
    onSuccess: (data) => {
      setCreatedId(data.id);
      setApproveId(data.id); // Convenience pre-fill for demoing dual-admin approval!
      setAmountPaise('');
      setReason('');
      setReference('');
      setCreateError(null);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Adjustment creation failed';
      setCreateError(msg);
    },
  });

  const approveMutation = useMutation({
    mutationFn: (adjId: string) => approveAdjustmentApi(adjId.trim()),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      setApprovedResult(data);
      setShowConfirmApprove(false);
      setApproveError(null);
    },
    onError: (err: unknown) => {
      setShowConfirmApprove(false);
      const msg = err instanceof Error ? err.message : 'Adjustment approval failed';
      setApproveError(msg);
    },
  });

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    setCreatedId(null);

    if (!accountId) {
      setCreateError('Please select a target account');
      return;
    }

    if (!amountPaise || BigInt(amountPaise) <= 0n) {
      setCreateError('Please enter a valid adjustment amount');
      return;
    }

    if (!reason.trim()) {
      setCreateError('Please state the institutional justification/reason');
      return;
    }

    if (!reference.trim()) {
      setCreateError('Please specify a unique reference string');
      return;
    }

    createMutation.mutate();
  };

  const handleApproveSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setApproveError(null);
    setApprovedResult(null);

    if (!approveId.trim()) {
      setApproveError('Please provide an Adjustment Request UUID');
      return;
    }

    setShowConfirmApprove(true);
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Financial Ledger Adjustments</h1>
        <p className="mt-1 text-xs text-slate-500">
          Execute institutional capital adjustments against System Capital. Dual-admin maker-checker policy: the approving administrator must differ from the initiating administrator.
        </p>
      </div>

      {/* Backend Limitation Notice for Adjustment Listing */}
      <UnsupportedNotice
        featureTitle="Adjustment Requests Listing"
        backendReason="The backend provides endpoints to create (POST /adjustments) and approve (POST /adjustments/:id/approve) adjustments, but does NOT expose an endpoint to query or list adjustment requests (e.g. GET /adjustments). You can create an adjustment request below and copy its UUID into the approval console."
        missingEndpoint="GET /adjustments"
      />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* Panel 1: Create Adjustment Request (Maker) */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-100 text-blue-600 font-bold">
              <SlidersHorizontal className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">Step 1: Initiate Adjustment (Maker)</h2>
              <p className="text-[11px] text-slate-500">Submit an adjustment request for review</p>
            </div>
          </div>

          {createdId && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-800 space-y-2">
              <p className="flex items-center gap-1.5 font-bold">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                Adjustment Request Created!
              </p>
              <div className="flex items-center justify-between bg-white/80 p-2 rounded border border-emerald-200">
                <span className="font-mono text-[11px] text-slate-700 select-all font-semibold">
                  {createdId}
                </span>
                <span className="text-[10px] text-emerald-700 font-bold">Pending Review</span>
              </div>
              <p className="text-[11px] text-emerald-700">
                A second administrator can now approve this request below using this UUID.
              </p>
            </div>
          )}

          {createError && (
            <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
              <AlertCircle className="h-4 w-4 flex-shrink-0 text-rose-600 mt-0.5" />
              <span>{createError}</span>
            </div>
          )}

          <form onSubmit={handleCreateSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
                Target Account
              </label>
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                required
                className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {accounts.map((acct) => (
                  <option key={acct.id} value={acct.id}>
                    {acct.name} — Balance: {formatPaise(acct.balance)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
                Adjustment Direction
              </label>
              <div className="mt-1 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setDirection('credit')}
                  className={`py-2 px-3 text-xs font-semibold rounded-md border text-center transition-colors ${
                    direction === 'credit'
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  CREDIT Customer Account
                  <span className="block text-[10px] font-normal text-slate-500">
                    (Debits System Capital)
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setDirection('debit')}
                  className={`py-2 px-3 text-xs font-semibold rounded-md border text-center transition-colors ${
                    direction === 'debit'
                      ? 'border-rose-500 bg-rose-50 text-rose-800'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  DEBIT Customer Account
                  <span className="block text-[10px] font-normal text-slate-500">
                    (Credits System Capital)
                  </span>
                </button>
              </div>
            </div>

            <div>
              <MoneyAmountInput
                value={amountPaise}
                onChange={setAmountPaise}
                label="Adjustment Amount"
                placeholder="0.00"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
                Unique Reference
              </label>
              <input
                type="text"
                required
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="e.g. ADJ-CAPITAL-2026-001"
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-xs font-mono text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
                Audit Reason / Justification
              </label>
              <textarea
                required
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Correction of clearing settlement discrepancy"
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <button
              type="submit"
              disabled={createMutation.isPending}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-2.5 text-xs font-semibold text-white shadow hover:bg-blue-700 disabled:opacity-50"
            >
              <SlidersHorizontal className="h-4 w-4" />
              <span>{createMutation.isPending ? 'Submitting...' : 'Request Adjustment'}</span>
            </button>
          </form>
        </div>

        {/* Panel 2: Approve Adjustment Request (Checker) */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600 font-bold">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">Step 2: Approve Adjustment (Checker)</h2>
              <p className="text-[11px] text-slate-500">Maker-checker approval by a distinct administrator</p>
            </div>
          </div>

          {approvedResult && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-800 space-y-2">
              <p className="flex items-center gap-1.5 font-bold">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                Adjustment Approved & Posted!
              </p>
              <p className="text-[11px]">
                Posted Journal Transaction ID:{' '}
                <span className="font-mono font-bold select-all">{approvedResult.transaction}</span>
              </p>
              <div className="flex justify-between items-center bg-white/70 p-2 rounded">
                <span>Updated Account Balance:</span>
                <MoneyDisplay paise={approvedResult.balance} size="sm" className="font-bold" />
              </div>
            </div>
          )}

          {approveError && (
            <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
              <AlertCircle className="h-4 w-4 flex-shrink-0 text-rose-600 mt-0.5" />
              <div>
                <p className="font-bold">Approval Rejected</p>
                <p className="mt-0.5">{approveError}</p>
                {approveError.includes('MAKER_EQUALS_CHECKER') && (
                  <p className="mt-1 text-[11px] text-rose-600 font-normal">
                    Rule Violation: The administrator who initiated this adjustment cannot approve it. Log in as a different administrator to approve.
                  </p>
                )}
              </div>
            </div>
          )}

          <form onSubmit={handleApproveSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
                Adjustment Request UUID
              </label>
              <input
                type="text"
                required
                value={approveId}
                onChange={(e) => setApproveId(e.target.value)}
                placeholder="e.g. 550e8400-e29b-41d4-a716-446655440000"
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-xs font-mono text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <p className="mt-1 text-[11px] text-slate-400">
                Paste the adjustment UUID returned from Step 1.
              </p>
            </div>

            <div className="rounded-lg bg-slate-50 border border-slate-200 p-4 space-y-2 text-xs text-slate-600">
              <div className="flex items-center gap-1.5 font-semibold text-slate-800">
                <Scale className="h-4 w-4 text-indigo-600" />
                <span>Double-Entry Capital Rules</span>
              </div>
              <ul className="list-disc list-inside space-y-1 text-[11px] text-slate-500 leading-relaxed">
                <li>Approval triggers `post_journal_atomic` with System Capital counterparty.</li>
                <li>Credit adjustment: DR System Capital, CR Customer Account.</li>
                <li>Debit adjustment: DR Customer Account, CR System Capital.</li>
                <li>Guaranteed balance sufficiency checks prevent account overdrafts.</li>
              </ul>
            </div>

            <button
              type="submit"
              disabled={approveMutation.isPending}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 py-2.5 text-xs font-semibold text-white shadow hover:bg-emerald-700 disabled:opacity-50"
            >
              <CheckCircle2 className="h-4 w-4" />
              <span>{approveMutation.isPending ? 'Processing Approval...' : 'Approve & Post to Ledger'}</span>
            </button>
          </form>
        </div>
      </div>

      {/* Confirmation Modal */}
      <ConfirmModal
        isOpen={showConfirmApprove}
        onClose={() => setShowConfirmApprove(false)}
        onConfirm={() => approveMutation.mutate(approveId)}
        title="Authorize Capital Adjustment"
        description="This will execute an irreversible double-entry journal transaction moving funds between System Capital and the customer account."
        confirmLabel="Authorize Adjustment"
        variant="warning"
        isLoading={approveMutation.isPending}
      >
        <div className="mt-2 font-mono text-[11px] text-slate-600">
          Adjustment UUID: {approveId}
        </div>
      </ConfirmModal>
    </div>
  );
};
