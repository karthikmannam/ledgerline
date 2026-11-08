import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAccountsApi, postTransferApi } from '@/api';
import { MoneyAmountInput } from '@/components/common/MoneyAmountInput';
import { MoneyDisplay } from '@/components/common/MoneyDisplay';
import { ConfirmModal } from '@/components/common/ConfirmModal';
import { formatPaise } from '@/lib/money';
import {
  ArrowRightLeft,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';
import type { TransferResult } from '@/types/api';

export const TransferPage: React.FC = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preselectedFrom = searchParams.get('from') || '';

  const { data: accountsData } = useQuery({
    queryKey: ['accounts'],
    queryFn: getAccountsApi,
  });

  const accounts = accountsData?.accounts ?? [];

  // Form states
  const [fromAccountId, setFromAccountId] = useState(preselectedFrom);
  const [toAccountId, setToAccountId] = useState('');
  const [amountPaise, setAmountPaise] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() => crypto.randomUUID());

  // UI flow states
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TransferResult | null>(null);
  const [copiedTx, setCopiedTx] = useState(false);

  // Set default fromAccount if not already selected
  useEffect(() => {
    if (!fromAccountId && accounts.length > 0) {
      setFromAccountId(accounts[0].id);
    }
  }, [accounts, fromAccountId]);

  const fromAccount = accounts.find((a) => a.id === fromAccountId);

  const transferMutation = useMutation({
    mutationFn: () =>
      postTransferApi({
        fromAccountId,
        toAccountId: toAccountId.trim(),
        amount: amountPaise,
        idempotencyKey,
        currency: 'INR',
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      setResult(data);
      setShowConfirmModal(false);
      setError(null);
    },
    onError: (err: unknown) => {
      setShowConfirmModal(false);
      const msg = err instanceof Error ? err.message : 'Transfer execution failed';
      setError(msg);
      // Retaining the idempotencyKey for safe retry of the same payload!
    },
  });

  const handleOpenConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!fromAccountId) {
      setError('Please select a source account');
      return;
    }

    if (!toAccountId.trim()) {
      setError('Please enter a recipient account UUID');
      return;
    }

    if (fromAccountId === toAccountId.trim()) {
      setError('Source and destination accounts must be distinct (self-transfer is forbidden)');
      return;
    }

    if (!amountPaise || BigInt(amountPaise) <= 0n) {
      setError('Please enter a valid transfer amount');
      return;
    }

    if (fromAccount && BigInt(amountPaise) > BigInt(fromAccount.balance)) {
      setError(`Insufficient funds in source account (Balance: ${formatPaise(fromAccount.balance)})`);
      return;
    }

    setShowConfirmModal(true);
  };

  const handleCopyTransaction = () => {
    if (result?.transaction) {
      navigator.clipboard.writeText(result.transaction);
      setCopiedTx(true);
      setTimeout(() => setCopiedTx(false), 2000);
    }
  };

  const handleNewTransfer = () => {
    setResult(null);
    setAmountPaise('');
    setToAccountId('');
    setError(null);
    setIdempotencyKey(crypto.randomUUID()); // Fresh idempotency key for new logical action
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Transfer Money</h1>
        <p className="mt-1 text-xs text-slate-500">
          Double-entry ledger transfer between verified accounts. Guaranteed atomic posting with idempotency protection.
        </p>
      </div>

      {result ? (
        <div className="rounded-2xl border border-emerald-200 bg-white p-8 shadow-sm text-center space-y-6">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <CheckCircle2 className="h-8 w-8" />
          </div>

          <div>
            <span className="rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1 text-xs font-bold uppercase tracking-wider text-emerald-700">
              Transfer Confirmed & Posted
            </span>
            <h2 className="mt-3 text-2xl font-bold text-slate-900">
              <MoneyDisplay paise={amountPaise} size="xl" className="text-emerald-700" />
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Debited from {fromAccount?.name || 'Source Account'}
            </p>
          </div>

          <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 text-left space-y-2.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-500 font-medium">Journal Transaction ID:</span>
              <div className="flex items-center gap-1.5 font-mono text-slate-900 font-bold select-all">
                <span>{result.transaction}</span>
                <button
                  type="button"
                  onClick={handleCopyTransaction}
                  className="p-1 hover:bg-slate-200 rounded text-slate-500"
                  title="Copy ID"
                >
                  {copiedTx ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-slate-200 pt-2">
              <span className="text-slate-500 font-medium">New Source Balance:</span>
              <MoneyDisplay paise={result.fromBalance} size="sm" className="font-bold text-slate-900" />
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-500 font-medium">Idempotency Key:</span>
              <span className="font-mono text-slate-400 text-[10px] truncate max-w-[200px]">{idempotencyKey}</span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
            <button
              type="button"
              onClick={handleNewTransfer}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow hover:bg-blue-700"
            >
              <span>Make Another Transfer</span>
              <ArrowRight className="h-4 w-4" />
            </button>
            <Link
              to="/dashboard"
              className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Return to Dashboard
            </Link>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm">
          {error && (
            <div className="mb-6 flex items-start gap-3 rounded-lg border border-rose-200 bg-rose-50 p-4 text-xs font-medium text-rose-800">
              <AlertCircle className="h-4 w-4 flex-shrink-0 text-rose-600 mt-0.5" />
              <div>
                <p className="font-bold">Transaction Refused</p>
                <p className="mt-0.5 text-rose-700">{error}</p>
              </div>
            </div>
          )}

          <form onSubmit={handleOpenConfirm} className="space-y-6">
            {/* From Account */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
                From Account (Source)
              </label>
              <select
                value={fromAccountId}
                onChange={(e) => setFromAccountId(e.target.value)}
                required
                className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-xs text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {accounts.map((acct) => (
                  <option key={acct.id} value={acct.id}>
                    {acct.name} — Balance: {formatPaise(acct.balance)} ({acct.status})
                  </option>
                ))}
              </select>
              {fromAccount && (
                <p className="mt-1.5 text-[11px] text-slate-500 flex items-center justify-between">
                  <span>Available Funds:</span>
                  <MoneyDisplay paise={fromAccount.balance} size="sm" className="font-semibold text-slate-800" />
                </p>
              )}
            </div>

            {/* To Account */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
                To Account (Destination UUID)
              </label>
              <input
                type="text"
                required
                value={toAccountId}
                onChange={(e) => setToAccountId(e.target.value)}
                placeholder="e.g. 7f555c14-0f45-47ba-a4c7-eedb5193b6f6"
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2.5 font-mono text-xs text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <p className="mt-1 text-[11px] text-slate-400">
                Enter the recipient ledger account UUID.
              </p>

              {/* Quick select from user's other accounts */}
              {accounts.filter((a) => a.id !== fromAccountId).length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] font-semibold text-slate-400">Your other accounts:</span>
                  {accounts
                    .filter((a) => a.id !== fromAccountId)
                    .map((other) => (
                      <button
                        key={other.id}
                        type="button"
                        onClick={() => setToAccountId(other.id)}
                        className="rounded bg-slate-100 hover:bg-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-700"
                      >
                        {other.name}
                      </button>
                    ))}
                </div>
              )}
            </div>

            {/* Amount input */}
            <div>
              <MoneyAmountInput
                value={amountPaise}
                onChange={setAmountPaise}
                label="Transfer Amount"
                placeholder="0.00"
                maxPaise={fromAccount?.balance}
              />
            </div>

            {/* Idempotency Protection Indicator */}
            <div className="rounded-lg bg-slate-50 border border-slate-200 p-3.5 flex items-center gap-2.5 text-xs text-slate-500">
              <ShieldAlert className="h-4 w-4 text-blue-600 flex-shrink-0" />
              <div className="flex-1 truncate">
                <span className="font-semibold text-slate-700">Idempotency Guard Enabled:</span>{' '}
                <span className="font-mono text-[10px] text-slate-400">{idempotencyKey}</span>
              </div>
            </div>

            <button
              type="submit"
              disabled={transferMutation.isPending}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-3 text-xs font-semibold text-white shadow-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 disabled:opacity-50"
            >
              <ArrowRightLeft className="h-4 w-4" />
              <span>Review Transfer</span>
            </button>
          </form>
        </div>
      )}

      {/* Security Confirmation Modal */}
      <ConfirmModal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        onConfirm={() => transferMutation.mutate()}
        title="Confirm Irreversible Transfer"
        description="This action will post an immutable double-entry journal entry debiting your account. Funds will be immediately credited to the target."
        confirmLabel="Authorize Transfer"
        isLoading={transferMutation.isPending}
      >
        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-2 text-xs">
          <div className="flex justify-between">
            <span className="text-slate-500">Transfer Amount:</span>
            <MoneyDisplay paise={amountPaise} size="md" className="font-bold text-slate-900" />
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">From Account:</span>
            <span className="font-medium text-slate-900">{fromAccount?.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">To Account ID:</span>
            <span className="font-mono text-slate-600 truncate max-w-[180px]">{toAccountId}</span>
          </div>
        </div>
      </ConfirmModal>
    </div>
  );
};
