import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAccountsApi, getDepositRequestsApi, createDepositRequestApi } from '@/api';
import { MoneyAmountInput } from '@/components/common/MoneyAmountInput';
import { MoneyDisplay } from '@/components/common/MoneyDisplay';
import { StatusBadge } from '@/components/common/StatusBadge';
import { EmptyState } from '@/components/common/EmptyState';
import { TableSkeleton } from '@/components/common/LoadingSkeleton';
import { formatDate } from '@/lib/utils';
import { formatPaise } from '@/lib/money';
import {
  ArrowDownToLine,
  CheckCircle2,
  AlertCircle,
  FileText,
  Clock,
  ShieldCheck,
} from 'lucide-react';

export const DepositRequestPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const preselectedAccount = searchParams.get('account') || '';

  const { data: accountsData } = useQuery({
    queryKey: ['accounts'],
    queryFn: getAccountsApi,
  });

  const { data: depositsData, isLoading: depositsLoading } = useQuery({
    queryKey: ['deposits'],
    queryFn: () => getDepositRequestsApi(50),
  });

  const accounts = accountsData?.accounts ?? [];
  const deposits = depositsData?.deposits ?? [];

  const [accountId, setAccountId] = useState(preselectedAccount);
  const [amountPaise, setAmountPaise] = useState('');
  const [externalReference, setExternalReference] = useState('');
  const [evidenceNote, setEvidenceNote] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [successId, setSuccessId] = useState<string | null>(null);

  React.useEffect(() => {
    if (!accountId && accounts.length > 0) {
      setAccountId(accounts[0].id);
    }
  }, [accounts, accountId]);

  const depositMutation = useMutation({
    mutationFn: () =>
      createDepositRequestApi({
        accountId,
        amount: amountPaise,
        externalReference: externalReference.trim(),
        evidence: evidenceNote.trim() ? { note: evidenceNote.trim() } : undefined,
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['deposits'] });
      setSuccessId(data.id);
      setAmountPaise('');
      setExternalReference('');
      setEvidenceNote('');
      setError(null);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Deposit request failed';
      setError(msg);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessId(null);

    if (!accountId) {
      setError('Please select an account');
      return;
    }

    if (!amountPaise || BigInt(amountPaise) <= 0n) {
      setError('Please enter a valid deposit amount');
      return;
    }

    if (!externalReference.trim()) {
      setError('Please provide an external reference (UTR / Wire Slip #)');
      return;
    }

    depositMutation.mutate();
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Deposit Requests</h1>
        <p className="mt-1 text-xs text-slate-500">
          Initiate deposit requests into your customer accounts. Requires institutional maker-checker administrative verification before posting to the ledger.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        {/* Left: Request Form */}
        <div className="lg:col-span-1">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-5">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-100 text-blue-600 font-bold">
                <ArrowDownToLine className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-900">Initiate Deposit</h2>
                <p className="text-[11px] text-slate-500">Submit deposit proof for verification</p>
              </div>
            </div>

            {successId && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3.5 text-xs text-emerald-800 space-y-1">
                <p className="flex items-center gap-1.5 font-bold">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  Deposit Request Created
                </p>
                <p className="text-[11px]">
                  ID: <span className="font-mono">{successId}</span>. Status is pending administrator verification.
                </p>
              </div>
            )}

            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
                <AlertCircle className="h-4 w-4 flex-shrink-0 text-rose-600 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
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
                      {acct.name} — Current: {formatPaise(acct.balance)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <MoneyAmountInput
                  value={amountPaise}
                  onChange={setAmountPaise}
                  label="Deposit Amount"
                  placeholder="0.00"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
                  External Reference (Unique UTR / Ref)
                </label>
                <input
                  type="text"
                  required
                  value={externalReference}
                  onChange={(e) => setExternalReference(e.target.value)}
                  placeholder="e.g. UTR-20261108-99214"
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-xs font-mono text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <p className="mt-1 text-[11px] text-slate-400">
                  Must be globally unique. Enforced by database constraint.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
                  Optional Evidence Note
                </label>
                <input
                  type="text"
                  value={evidenceNote}
                  onChange={(e) => setEvidenceNote(e.target.value)}
                  placeholder="e.g. Wire transfer from HDFC bank"
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="rounded-lg bg-blue-50/60 p-3 text-[11px] text-blue-800 border border-blue-100 flex items-start gap-2">
                <ShieldCheck className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5" />
                <p>
                  Maker-checker policy: A distinct administrator must independently review and verify this request before funds are credited.
                </p>
              </div>

              <button
                type="submit"
                disabled={depositMutation.isPending}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-2.5 text-xs font-semibold text-white shadow hover:bg-blue-700 disabled:opacity-50"
              >
                <ArrowDownToLine className="h-4 w-4" />
                <span>{depositMutation.isPending ? 'Submitting...' : 'Submit Deposit Request'}</span>
              </button>
            </form>
          </div>
        </div>

        {/* Right: History Table */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <FileText className="h-4 w-4 text-blue-600" />
              <span>Deposit Request History</span>
            </h2>
            <span className="text-xs text-slate-400">{deposits.length} recorded requests</span>
          </div>

          {depositsLoading ? (
            <TableSkeleton rows={4} columns={5} />
          ) : deposits.length === 0 ? (
            <EmptyState
              icon={Clock}
              title="No Deposit Requests"
              description="You have not submitted any deposit requests yet."
            />
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                  <thead className="bg-slate-50 font-semibold uppercase tracking-wider text-slate-500">
                    <tr>
                      <th scope="col" className="px-5 py-3.5">
                        Date
                      </th>
                      <th scope="col" className="px-5 py-3.5">
                        External Reference
                      </th>
                      <th scope="col" className="px-5 py-3.5">
                        Status
                      </th>
                      <th scope="col" className="px-5 py-3.5 text-right">
                        Amount
                      </th>
                      <th scope="col" className="px-5 py-3.5">
                        Target Account
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {deposits.map((dep) => {
                      const matchedAcct = accounts.find((a) => a.id === dep.accountId);
                      return (
                        <tr key={dep.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="px-5 py-3.5 whitespace-nowrap text-slate-600">
                            {formatDate(dep.createdAt)}
                          </td>
                          <td className="px-5 py-3.5 font-mono text-slate-900 font-semibold">
                            {dep.externalReference}
                          </td>
                          <td className="px-5 py-3.5 whitespace-nowrap">
                            <StatusBadge status={dep.status} type="deposit" />
                          </td>
                          <td className="px-5 py-3.5 text-right whitespace-nowrap font-bold text-slate-900">
                            <MoneyDisplay paise={dep.amount} size="sm" />
                          </td>
                          <td className="px-5 py-3.5 text-slate-600">
                            <span className="font-medium text-slate-900">
                              {matchedAcct?.name || 'Customer Account'}
                            </span>
                            <div className="font-mono text-[10px] text-slate-400 select-all truncate max-w-[140px]">
                              {dep.accountId}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
