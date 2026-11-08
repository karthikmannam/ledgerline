import React, { useState } from 'react';
import { getTransactionByIdApi } from '@/api';
import { MoneyDisplay } from '@/components/common/MoneyDisplay';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Search, AlertCircle, FileText, CheckCircle2, Eye } from 'lucide-react';
import type { TransactionDetail } from '@/types/api';

export const TransactionInspectorPage: React.FC = () => {
  const [transactionId, setTransactionId] = useState('');
  const [txData, setTxData] = useState<TransactionDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transactionId.trim()) return;

    setIsLoading(true);
    setError(null);
    setTxData(null);

    try {
      const data = await getTransactionByIdApi(transactionId.trim());
      setTxData(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Transaction not found';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="border-b border-slate-200 pb-5">
        <div className="flex items-center gap-2">
          <span className="rounded bg-purple-100 px-2 py-0.5 text-[10px] font-bold uppercase text-purple-700 tracking-wider">
            Auditor Deep Dive
          </span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 mt-1">
          Transaction Posting Inspector
        </h1>
        <p className="mt-1 text-xs text-slate-500">
          Inspect the immutable balanced double-entry postings for any journal transaction UUID.
        </p>
      </div>

      {/* Search Input */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            type="text"
            required
            value={transactionId}
            onChange={(e) => setTransactionId(e.target.value)}
            placeholder="Enter transaction UUID (e.g. from audit events or statements)..."
            className="flex-1 rounded-md border border-slate-300 px-3 py-2 font-mono text-xs text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button
            type="submit"
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 rounded-md bg-purple-600 px-4 py-2 text-xs font-semibold text-white shadow hover:bg-purple-700 disabled:opacity-50"
          >
            <Search className="h-4 w-4" />
            <span>{isLoading ? 'Inspecting...' : 'Lookup'}</span>
          </button>
        </form>

        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* Transaction Details */}
      {txData && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Journal Type:
                </span>
                <span className="font-bold text-slate-900 capitalize text-sm">{txData.type}</span>
              </div>
              <p className="font-mono text-xs text-slate-400 mt-0.5 select-all">UUID: {txData.id}</p>
            </div>
            <StatusBadge status={txData.status} />
          </div>

          {txData.reversalOf && (
            <div className="rounded-lg bg-blue-50 border border-blue-200 p-3.5 text-xs text-blue-900">
              <span className="font-bold">Compensating Reversal:</span> This journal entry is an exact compensating reversal of transaction{' '}
              <span className="font-mono font-bold">{txData.reversalOf}</span>.
            </div>
          )}

          {/* Postings */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-3">
              Matched Double-Entry Postings (Invariant Proof)
            </h3>
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
              {txData.postings.map((p, idx) => (
                <div key={idx} className="flex items-center justify-between p-4 bg-white text-xs">
                  <div className="flex items-center gap-3">
                    <StatusBadge status={p.side} type="side" />
                    <div>
                      <p className="text-[10px] uppercase font-bold text-slate-400">Ledger Account ID</p>
                      <p className="font-mono text-slate-800 font-semibold">{p.account}</p>
                    </div>
                  </div>
                  <MoneyDisplay paise={p.amount} side={p.side} size="md" />
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg bg-slate-50 border border-slate-200 p-3.5 flex items-center gap-2 text-xs text-slate-500">
            <Eye className="h-4 w-4 text-purple-600 flex-shrink-0" />
            <span>Auditor mode: Historical postings are verified read-only and immutable.</span>
          </div>
        </div>
      )}
    </div>
  );
};
