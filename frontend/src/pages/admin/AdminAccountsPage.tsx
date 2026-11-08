import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getAccountsApi,
  updateAccountStatusApi,
  suspendAccountApi,
  grantAccountPermissionApi,
} from '@/api';
import { MoneyDisplay } from '@/components/common/MoneyDisplay';
import { StatusBadge } from '@/components/common/StatusBadge';
import { TableSkeleton } from '@/components/common/LoadingSkeleton';
import { EmptyState } from '@/components/common/EmptyState';
import { ConfirmModal } from '@/components/common/ConfirmModal';
import { Link } from 'react-router-dom';
import {
  Wallet,
  Search,
  FileText,
  Shield,
  Key,
  X,
  AlertCircle,
  CheckCircle2,
  Lock,
  Unlock,
} from 'lucide-react';
import type { Account, AccountPermission } from '@/types/api';

export const AdminAccountsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');

  // Modals state
  const [suspendModalAccount, setSuspendModalAccount] = useState<Account | null>(null);
  const [permissionModalAccount, setPermissionModalAccount] = useState<Account | null>(null);

  // Permission form state
  const [permUserId, setPermUserId] = useState('');
  const [permType, setPermType] = useState<AccountPermission>('view');
  const [permSuccess, setPermSuccess] = useState(false);
  const [permError, setPermError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['accounts'],
    queryFn: getAccountsApi,
  });

  const accounts = data?.accounts ?? [];
  const filteredAccounts = accounts.filter(
    (a) =>
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      a.id.toLowerCase().includes(search.toLowerCase())
  );

  // Status update mutation (activate or suspend)
  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'active' | 'suspended' }) =>
      updateAccountStatusApi(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      setSuspendModalAccount(null);
    },
  });

  // Suspend mutation
  const suspendMutation = useMutation({
    mutationFn: (id: string) => suspendAccountApi(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      setSuspendModalAccount(null);
    },
  });

  // Permission mutation
  const permissionMutation = useMutation({
    mutationFn: () =>
      grantAccountPermissionApi(permissionModalAccount!.id, permUserId.trim(), permType),
    onSuccess: () => {
      setPermSuccess(true);
      setPermError(null);
      setTimeout(() => {
        setPermissionModalAccount(null);
        setPermSuccess(false);
        setPermUserId('');
      }, 1500);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Failed to grant permission';
      setPermError(msg);
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Institutional Account Management</h1>
          <p className="mt-1 text-xs text-slate-500">
            Administrative governance over all customer accounts. Control operational status and grant per-account RBAC permissions.
          </p>
        </div>
      </div>

      {/* Filter / Search Bar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm rounded-md shadow-sm">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
            <Search className="h-4 w-4" />
          </div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search accounts across system..."
            className="block w-full rounded-md border border-slate-300 py-2 pl-9 pr-3 text-xs placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      {isLoading ? (
        <TableSkeleton rows={5} columns={5} />
      ) : filteredAccounts.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="No Accounts Found"
          description="No customer accounts match your search query."
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
              <thead className="bg-slate-50 font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <th scope="col" className="px-5 py-3.5">
                    Account Name / UUID
                  </th>
                  <th scope="col" className="px-5 py-3.5">
                    Status
                  </th>
                  <th scope="col" className="px-5 py-3.5 text-right">
                    Current Balance
                  </th>
                  <th scope="col" className="px-5 py-3.5 text-right">
                    Administrative Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {filteredAccounts.map((account) => {
                  const isActive = account.status === 'active';
                  return (
                    <tr key={account.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-5 py-4">
                        <div className="font-bold text-slate-900">{account.name}</div>
                        <div className="font-mono text-[11px] text-slate-400 mt-0.5 select-all">
                          {account.id}
                        </div>
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap">
                        <StatusBadge status={account.status} type="account" />
                      </td>
                      <td className="px-5 py-4 text-right whitespace-nowrap">
                        <MoneyDisplay paise={account.balance} size="md" className="text-slate-900" />
                      </td>
                      <td className="px-5 py-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2">
                          {/* Toggle status */}
                          {isActive ? (
                            <button
                              type="button"
                              onClick={() => setSuspendModalAccount(account)}
                              className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-100"
                            >
                              <Lock className="h-3 w-3" />
                              <span>Suspend</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() =>
                                statusMutation.mutate({ id: account.id, status: 'active' })
                              }
                              disabled={statusMutation.isPending}
                              className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100"
                            >
                              <Unlock className="h-3 w-3" />
                              <span>Activate</span>
                            </button>
                          )}

                          {/* Grant Permission */}
                          <button
                            type="button"
                            onClick={() => {
                              setPermissionModalAccount(account);
                              setPermError(null);
                              setPermSuccess(false);
                              setPermUserId('');
                            }}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            <Key className="h-3 w-3 text-slate-500" />
                            <span>Permissions</span>
                          </button>

                          {/* Statement */}
                          <Link
                            to={`/accounts/${account.id}`}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            <FileText className="h-3 w-3 text-slate-500" />
                            <span>Statement</span>
                          </Link>
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

      {/* Confirmation Modal: Suspend Account */}
      {suspendModalAccount && (
        <ConfirmModal
          isOpen={true}
          onClose={() => setSuspendModalAccount(null)}
          onConfirm={() => suspendMutation.mutate(suspendModalAccount.id)}
          title="Suspend Customer Account"
          description={`Are you sure you want to suspend account "${suspendModalAccount.name}"? Suspended accounts cannot execute withdrawals or transfers until re-activated.`}
          confirmLabel="Confirm Suspension"
          variant="danger"
          isLoading={suspendMutation.isPending}
        >
          <div className="mt-2 font-mono text-[11px] text-slate-500">
            Account ID: {suspendModalAccount.id}
          </div>
        </ConfirmModal>
      )}

      {/* Modal: Grant Account Permission */}
      {permissionModalAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in">
          <div className="relative w-full max-w-md rounded-xl bg-white p-6 shadow-2xl border border-slate-200">
            <button
              onClick={() => setPermissionModalAccount(null)}
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-600"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-600 font-bold">
                <Key className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Grant Account Permission</h3>
                <p className="text-xs text-slate-500">
                  Target: <strong className="text-slate-800">{permissionModalAccount.name}</strong>
                </p>
              </div>
            </div>

            {permSuccess && (
              <div className="mt-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800 font-medium">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span>Permission successfully granted!</span>
              </div>
            )}

            {permError && (
              <div className="mt-4 flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 font-medium">
                <AlertCircle className="h-4 w-4 text-rose-600" />
                <span>{permError}</span>
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                permissionMutation.mutate();
              }}
              className="mt-5 space-y-4"
            >
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
                  User UUID
                </label>
                <input
                  type="text"
                  required
                  value={permUserId}
                  onChange={(e) => setPermUserId(e.target.value)}
                  placeholder="e.g. 1a0cac06-16a5-456c-b73f-8389c3590703"
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-xs text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <p className="mt-1 text-[11px] text-slate-400">
                  Enter the registered user UUID who should receive permission on this account.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
                  Permission Scope
                </label>
                <select
                  value={permType}
                  onChange={(e) => setPermType(e.target.value as AccountPermission)}
                  className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="view">view — Read balance and transaction statements</option>
                  <option value="withdraw">withdraw — Authorize withdrawals to clearing</option>
                  <option value="transfer_out">transfer_out — Authorize transfers to other accounts</option>
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setPermissionModalAccount(null)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={permissionMutation.isPending}
                  className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow hover:bg-blue-700 disabled:opacity-50"
                >
                  {permissionMutation.isPending ? 'Granting...' : 'Grant Permission'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
