import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getDepositRequestsApi, verifyAndPostDepositApi, getAccountsApi } from '@/api';
import { useAuth } from '@/context/AuthContext';
import { MoneyDisplay } from '@/components/common/MoneyDisplay';
import { StatusBadge } from '@/components/common/StatusBadge';
import { TableSkeleton } from '@/components/common/LoadingSkeleton';
import { EmptyState } from '@/components/common/EmptyState';
import { ConfirmModal } from '@/components/common/ConfirmModal';
import { UnsupportedNotice } from '@/components/common/UnsupportedNotice';
import { formatDate } from '@/lib/utils';
import { formatPaise } from '@/lib/money';
import {
  ClipboardList,
  CheckCircle2,
  AlertCircle,
  ShieldAlert,
  Search,
  Filter,
} from 'lucide-react';
import type { DepositRequestItem } from '@/types/api';

export const AdminDepositsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const currentAdminId = user?.id;

  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [selectedForVerify, setSelectedForVerify] = useState<DepositRequestItem | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const { data: depositsData, isLoading } = useQuery({
    queryKey: ['deposits'],
    queryFn: () => getDepositRequestsApi(200),
  });

  const { data: accountsData } = useQuery({
    queryKey: ['accounts'],
    queryFn: getAccountsApi,
  });

  const accounts = accountsData?.accounts ?? [];
  const deposits = depositsData?.deposits ?? [];

  const verifyMutation = useMutation({
    mutationFn: (depositId: string) => verifyAndPostDepositApi(depositId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['deposits'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      setActionSuccess(`Deposit successfully verified! Posted journal transaction: ${data.transaction}`);
      setActionError(null);
      setSelectedForVerify(null);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Deposit verification failed';
      setActionError(msg);
      setSelectedForVerify(null);
    },
  });

  const filteredDeposits = deposits.filter((dep) => {
    const matchesStatus = filterStatus === 'all' || dep.status === filterStatus;
    const matchesSearch =
      dep.externalReference.toLowerCase().includes(search.toLowerCase()) ||
      dep.id.toLowerCase().includes(search.toLowerCase()) ||
      dep.accountId.toLowerCase().includes(search.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Deposit Verification Queue</h1>
          <p className="mt-1 text-xs text-slate-500">
            Institutional maker-checker review for customer deposits. Execution debits System Clearing and credits the customer account atomically.
          </p>
        </div>
      </div>

      {actionSuccess && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-xs font-semibold text-emerald-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0" />
            <span>{actionSuccess}</span>
          </div>
          <button
            onClick={() => setActionSuccess(null)}
            className="text-xs text-emerald-700 hover:text-emerald-900 font-bold"
          >
            Dismiss
          </button>
        </div>
      )}

      {actionError && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-xs font-semibold text-rose-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-rose-600 flex-shrink-0" />
            <span>{actionError}</span>
          </div>
          <button
            onClick={() => setActionError(null)}
            className="text-xs text-rose-700 hover:text-rose-900 font-bold"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center gap-3 justify-between">
        <div className="relative flex-1 max-w-sm rounded-md shadow-sm w-full">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
            <Search className="h-4 w-4" />
          </div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by reference, ID or account..."
            className="block w-full rounded-md border border-slate-300 py-2 pl-9 pr-3 text-xs placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="h-4 w-4 text-slate-400" />
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="all">All Statuses</option>
            <option value="pending">Pending Review Only</option>
            <option value="verified">Verified Only</option>
            <option value="rejected">Rejected Only</option>
          </select>
        </div>
      </div>

      {isLoading ? (
        <TableSkeleton rows={5} columns={6} />
      ) : filteredDeposits.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No Deposit Requests Found"
          description="There are no deposit requests matching the selected filter criteria."
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
              <thead className="bg-slate-50 font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <th scope="col" className="px-5 py-3.5">
                    Date Created
                  </th>
                  <th scope="col" className="px-5 py-3.5">
                    External Reference (UTR)
                  </th>
                  <th scope="col" className="px-5 py-3.5 text-right">
                    Amount
                  </th>
                  <th scope="col" className="px-5 py-3.5">
                    Target Account
                  </th>
                  <th scope="col" className="px-5 py-3.5">
                    Status
                  </th>
                  <th scope="col" className="px-5 py-3.5">
                    Maker / Checker
                  </th>
                  <th scope="col" className="px-5 py-3.5 text-right">
                    Review Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {filteredDeposits.map((dep) => {
                  const targetAcct = accounts.find((a) => a.id === dep.accountId);
                  const isPending = dep.status === 'pending';
                  const isMaker = currentAdminId && dep.makerId === currentAdminId;

                  return (
                    <tr key={dep.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-5 py-4 whitespace-nowrap text-slate-600">
                        {formatDate(dep.createdAt)}
                      </td>
                      <td className="px-5 py-4 font-mono font-bold text-slate-900 select-all">
                        {dep.externalReference}
                        <div className="text-[10px] text-slate-400 font-normal">ID: {dep.id.slice(0, 8)}...</div>
                      </td>
                      <td className="px-5 py-4 text-right whitespace-nowrap font-bold text-slate-900">
                        <MoneyDisplay paise={dep.amount} size="md" />
                      </td>
                      <td className="px-5 py-4 text-slate-700">
                        <div className="font-semibold">{targetAcct?.name || 'Customer Account'}</div>
                        <div className="font-mono text-[10px] text-slate-400 select-all truncate max-w-[150px]">
                          {dep.accountId}
                        </div>
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap">
                        <StatusBadge status={dep.status} type="deposit" />
                      </td>
                      <td className="px-5 py-4 text-[11px] text-slate-500">
                        <div>
                          Maker:{' '}
                          <span className="font-mono text-slate-700">
                            {dep.makerId ? `${dep.makerId.slice(0, 8)}...` : 'System'}
                          </span>
                        </div>
                        {dep.checkerId && (
                          <div>
                            Checker: <span className="font-mono text-slate-700">{dep.checkerId.slice(0, 8)}...</span>
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-4 text-right whitespace-nowrap">
                        {isPending ? (
                          isMaker ? (
                            <span
                              title="Maker-Checker policy: You cannot approve a deposit you created."
                              className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-400 cursor-not-allowed"
                            >
                              <ShieldAlert className="h-3 w-3 text-amber-500" />
                              <span>Maker Cannot Verify</span>
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setActionError(null);
                                setSelectedForVerify(dep);
                              }}
                              className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              <span>Verify & Post</span>
                            </button>
                          )
                        ) : (
                          <span className="text-[11px] text-slate-400 font-medium">Reviewed</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Backend Limitation Notice for Rejection */}
      <UnsupportedNotice
        featureTitle="Deposit Rejection"
        backendReason="The backend database schema defines the deposit_status enum with 'rejected', but currently only exposes the endpoint POST /deposit-requests/:id/verify-and-post. A dedicated rejection route (e.g. POST /deposit-requests/:id/reject) is not implemented in the backend API."
        missingEndpoint="POST /deposit-requests/:id/reject"
      />

      {/* Confirmation Modal */}
      {selectedForVerify && (
        <ConfirmModal
          isOpen={true}
          onClose={() => setSelectedForVerify(null)}
          onConfirm={() => verifyMutation.mutate(selectedForVerify.id)}
          title="Verify & Post Deposit to Ledger"
          description={`Confirm that the external funds for reference "${selectedForVerify.externalReference}" have been reconciled. This will credit the customer account and debit System Clearing.`}
          confirmLabel="Execute Journal Posting"
          isLoading={verifyMutation.isPending}
        >
          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-500">Amount to Credit:</span>
              <MoneyDisplay paise={selectedForVerify.amount} size="md" className="font-bold text-slate-900" />
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">External Ref:</span>
              <span className="font-mono font-bold text-slate-800">{selectedForVerify.externalReference}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Target Account ID:</span>
              <span className="font-mono text-slate-600 truncate max-w-[180px]">{selectedForVerify.accountId}</span>
            </div>
          </div>
        </ConfirmModal>
      )}
    </div>
  );
};
