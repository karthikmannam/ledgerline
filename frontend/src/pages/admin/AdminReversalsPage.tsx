import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { getTransactionByIdApi, reverseTransactionApi } from '@/api';
import { MoneyDisplay } from '@/components/common/MoneyDisplay';
import { StatusBadge } from '@/components/common/StatusBadge';
import { ConfirmModal } from '@/components/common/ConfirmModal';
import {
  RotateCcw,
  Search,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  ShieldCheck,
  ArrowRight,
} from 'lucide-react';
import type { TransactionDetail } from '@/types/api';

export const AdminReversalsPage: React.FC = () => {
  const [transactionId, setTransactionId] = useState('');
  const [reason, setReason] = useState('');
  const [txData, setTxData] = useState<TransactionDetail | null>(null);
  const [inspectLoading, setInspectLoading] = useState(false);
  const [inspectError, setInspectError] = useState<string | null>(null);

  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [reversalResult, setReversalResult] = useState<string | null>(null);
  const [reversalError, setReversalError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleInspect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transactionId.trim()) return;

    setInspectLoading(true);
    setInspectError(null);
    setTxData(null);
    setReversalResult(null);
    setReversalError(null);

    try {
      const data = await getTransactionByIdApi(transactionId.trim());
      setTxData(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Transaction not found';
      setInspectError(msg);
    } finally {
      setInspectLoading(false);
    }
  };

  const reverseMutation = useMutation({
    mutationFn: () => reverseTransactionApi(txData!.id, reason.trim()),
    onSuccess: (data) => {
      setReversalResult(data.reversal);
      setShowConfirmModal(false);
      setReversalError(null);
    },
    onError: (err: unknown) => {
      setShowConfirmModal(false);
      const msg = err instanceof Error ? err.message : 'Reversal rejected by ledger invariant checks';
      setReversalError(msg);
    },
  });

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Transaction Reversal Console</h1>
        <p className="mt-1 text-xs text-slate-500">
          Execute compensating reversals for erroneous or disputed transactions. Existing journal postings are never modified; an exact inverse journal entry is appended.
        </p>
      </div>

      {/* Step 1: Look up transaction */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
          <Search className="h-4 w-4 text-blue-600" />
          <span>Step 1: Inspect Target Transaction</span>
        </div>

        <form onSubmit={handleInspect} className="flex gap-2">
          <input
            type="text"
            required
            value={transactionId}
            onChange={(e) => setTransactionId(e.target.value)}
            placeholder="Enter Journal Transaction UUID (e.g. from statement or transfer receipt)"
            className="flex-1 rounded-md border border-slate-300 px-3 py-2 font-mono text-xs text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button
            type="submit"
            disabled={inspectLoading}
            className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow hover:bg-blue-700 disabled:opacity-50"
          >
            {inspectLoading ? 'Inspecting...' : 'Inspect'}
          </button>
        </form>

        {inspectError && (
          <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span>{inspectError}</span>
          </div>
        )}
      </div>

      {/* Step 2: Display Inspection Result & Reversal Controls */}
      {txData && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Transaction Type:
                </span>
                <span className="font-bold text-slate-900 capitalize">{txData.type}</span>
              </div>
              <p className="font-mono text-xs text-slate-400 mt-0.5 select-all">UUID: {txData.id}</p>
            </div>
            <StatusBadge status={txData.status} />
          </div>

          {/* Postings Breakdown */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
              Original Balanced Double-Entry Postings
            </h4>
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
              {txData.postings.map((p, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 bg-white text-xs">
                  <div className="flex items-center gap-3">
                    <StatusBadge status={p.side} type="side" />
                    <div>
                      <p className="font-mono text-slate-700 font-semibold">{p.account}</p>
                    </div>
                  </div>
                  <MoneyDisplay paise={p.amount} side={p.side} size="md" />
                </div>
              ))}
            </div>
          </div>

          {txData.type === 'reversal' ? (
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 text-xs text-amber-800 flex items-start gap-2.5">
              <AlertCircle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Cannot Reverse a Reversal</p>
                <p className="mt-0.5 text-amber-700">
                  This transaction is already a compensating reversal of transaction{' '}
                  <span className="font-mono">{txData.reversalOf}</span>. The database schema strictly prohibits cascading reversals.
                </p>
              </div>
            </div>
          ) : reversalResult ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-center space-y-3">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <h3 className="text-base font-bold text-emerald-900">Compensating Reversal Created!</h3>
              <p className="text-xs text-emerald-800">
                The original entries remain intact in the append-only journal. An inverse journal transaction was successfully posted.
              </p>
              <div className="flex items-center justify-center gap-2 bg-white/80 p-2.5 rounded-lg border border-emerald-200 font-mono text-xs font-bold text-slate-900 select-all">
                <span>Reversal TX: {reversalResult}</span>
                <button
                  type="button"
                  onClick={() => handleCopy(reversalResult)}
                  className="p-1 text-slate-500 hover:text-slate-900"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4 pt-2 border-t border-slate-100">
              {reversalError && (
                <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
                  <AlertCircle className="h-4 w-4 flex-shrink-0 text-rose-600 mt-0.5" />
                  <div>
                    <p className="font-bold">Reversal Failed</p>
                    <p className="mt-0.5">{reversalError}</p>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
                  Reversal Audit Reason (Optional)
                </label>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Account holder dispute resolved; incorrect transfer amount"
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <button
                type="button"
                onClick={() => setShowConfirmModal(true)}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-rose-600 py-2.5 text-xs font-semibold text-white shadow hover:bg-rose-700"
              >
                <RotateCcw className="h-4 w-4" />
                <span>Execute Compensating Reversal</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Confirmation Modal */}
      {txData && (
        <ConfirmModal
          isOpen={showConfirmModal}
          onClose={() => setShowConfirmModal(false)}
          onConfirm={() => reverseMutation.mutate()}
          title="Confirm Transaction Reversal"
          description={`Are you sure you want to reverse transaction "${txData.id}"? An inverse compensating posting will be posted against the touched accounts.`}
          confirmLabel="Execute Reversal"
          variant="danger"
          isLoading={reverseMutation.isPending}
        >
          <div className="mt-2 text-xs text-slate-600 space-y-1">
            <p>
              Reversal constraint: Only one reversal can ever be posted for this transaction.
            </p>
          </div>
        </ConfirmModal>
      )}
    </div>
  );
};
