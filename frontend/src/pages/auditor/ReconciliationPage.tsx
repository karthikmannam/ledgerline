import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { getReconciliationApi, getAccountsApi } from '@/api';
import { TableSkeleton } from '@/components/common/LoadingSkeleton';
import { MoneyDisplay } from '@/components/common/MoneyDisplay';
import { StatusBadge } from '@/components/common/StatusBadge';
import {
  Scale,
  ShieldCheck,
  AlertTriangle,
  RotateCw,
  CheckCircle2,
  FileCheck2,
  HelpCircle,
} from 'lucide-react';

export const ReconciliationPage: React.FC = () => {
  const { data: recon, isLoading: reconLoading, refetch, isRefetching } = useQuery({
    queryKey: ['reconciliation'],
    queryFn: getReconciliationApi,
  });

  const { data: accountsData, isLoading: accountsLoading } = useQuery({
    queryKey: ['accounts'],
    queryFn: getAccountsApi,
  });

  const accounts = accountsData?.accounts ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-800 tracking-wider">
              Cryptographic Invariant Check
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 mt-1">
            Mathematical Ledger Reconciliation
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            Automated invariant proof. Evaluates global debit-credit conservation and verifies balance projections against the full append-only journal history.
          </p>
        </div>

        <button
          onClick={() => refetch()}
          disabled={isRefetching}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
        >
          <RotateCw className={`h-3.5 w-3.5 text-slate-500 ${isRefetching ? 'animate-spin' : ''}`} />
          <span>{isRefetching ? 'Recomputing...' : 'Re-run Proof'}</span>
        </button>
      </div>

      {reconLoading ? (
        <TableSkeleton rows={4} columns={3} />
      ) : recon ? (
        <div className="space-y-6">
          {/* Main Status Banner */}
          <div
            className={`rounded-2xl border p-6 sm:p-8 shadow-sm ${
              recon.integrityOk
                ? 'border-emerald-200 bg-emerald-50/70 text-emerald-900'
                : 'border-rose-200 bg-rose-50 text-rose-900'
            }`}
          >
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-start gap-4">
                <div
                  className={`flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl ${
                    recon.integrityOk ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                  }`}
                >
                  {recon.integrityOk ? (
                    <ShieldCheck className="h-8 w-8" />
                  ) : (
                    <AlertTriangle className="h-8 w-8" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-bold">
                      {recon.integrityOk
                        ? 'Ledger Proof: 100% Mathematically Sound'
                        : 'CRITICAL: Invariant Violation Detected'}
                    </h2>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed max-w-2xl text-slate-600">
                    {recon.integrityOk
                      ? 'No money has been created or lost. Total system debits equal total system credits. Live customer balance projections correspond exactly to the sum of historical postings.'
                      : 'One or more discrepancies exist between calculated historical journal postings and balance projections.'}
                  </p>
                </div>
              </div>

              <div className="rounded-xl bg-white border border-slate-200 p-4 shadow-sm min-w-[200px]">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Global Conservation Check
                </p>
                <div className="mt-1 flex items-center gap-2">
                  <span
                    className={`inline-block h-3 w-3 rounded-full ${
                      recon.balanced ? 'bg-emerald-500' : 'bg-rose-500'
                    }`}
                  />
                  <span className="text-sm font-bold text-slate-900">
                    {recon.balanced ? 'Debits == Credits' : 'Unbalanced!'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Discrepancies Table (if any exist) */}
          {recon.discrepancies.length > 0 && (
            <div className="rounded-xl border border-rose-200 bg-white p-6 shadow-sm space-y-4">
              <h3 className="text-sm font-bold text-rose-800 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-rose-600" />
                <span>Identified Discrepancies ({recon.discrepancies.length})</span>
              </h3>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-rose-200 text-xs">
                  <thead className="bg-rose-50 font-semibold text-rose-900">
                    <tr>
                      <th className="px-4 py-3 text-left">Account ID</th>
                      <th className="px-4 py-3 text-right">Expected Balance</th>
                      <th className="px-4 py-3 text-right">Projected Balance</th>
                      <th className="px-4 py-3 text-right">Variance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-rose-100">
                    {recon.discrepancies.map((disc, idx) => (
                      <tr key={idx}>
                        <td className="px-4 py-3 font-mono">{disc.account}</td>
                        <td className="px-4 py-3 text-right font-bold text-emerald-700">
                          <MoneyDisplay paise={disc.expected} size="sm" />
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-rose-700">
                          <MoneyDisplay paise={disc.projected} size="sm" />
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-rose-600 font-bold">
                          {BigInt(disc.projected) - BigInt(disc.expected)} paise
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Reconciliation Methodology Details */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <FileCheck2 className="h-4 w-4 text-blue-600" />
              <span>Independent Verification Methodology</span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-slate-600">
              <div className="rounded-lg bg-slate-50 p-4 border border-slate-200">
                <span className="font-bold text-slate-900 block mb-1">1. Global Conservation</span>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Evaluates <code className="bg-slate-200 px-1 py-0.5 rounded text-[10px]">sum(amount_paise)</code> of all debit postings vs credit postings. Every atomic journal posting enforces debit = credit by construction.
                </p>
              </div>

              <div className="rounded-lg bg-slate-50 p-4 border border-slate-200">
                <span className="font-bold text-slate-900 block mb-1">2. Balance Projection Recheck</span>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Independent SQL recalculation: walks every historical posting on each account and sums net changes to verify live cached projection in <code className="bg-slate-200 px-1 py-0.5 rounded text-[10px]">balance_projections</code>.
                </p>
              </div>

              <div className="rounded-lg bg-slate-50 p-4 border border-slate-200">
                <span className="font-bold text-slate-900 block mb-1">3. Append-Only Trigger Audit</span>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  PostgreSQL database triggers <code className="bg-slate-200 px-1 py-0.5 rounded text-[10px]">trg_forbid_journal_update</code> block any direct UPDATE or DELETE on historical records.
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
