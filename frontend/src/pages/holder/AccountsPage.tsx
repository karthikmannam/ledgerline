import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAccountsApi, createAccountApi } from '@/api';
import { MoneyDisplay } from '@/components/common/MoneyDisplay';
import { StatusBadge } from '@/components/common/StatusBadge';
import { EmptyState } from '@/components/common/EmptyState';
import { TableSkeleton } from '@/components/common/LoadingSkeleton';
import { Link } from 'react-router-dom';
import {
  Wallet,
  Plus,
  Search,
  FileText,
  ArrowRightLeft,
  ArrowDownToLine,
  X,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';

export const AccountsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [accountName, setAccountName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['accounts'],
    queryFn: getAccountsApi,
  });

  const createMutation = useMutation({
    mutationFn: (name: string) => createAccountApi(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      setIsModalOpen(false);
      setAccountName('');
      setError(null);
    },
    onError: (err: Error) => {
      setError(err.message || 'Failed to create account');
    },
  });

  const accounts = data?.accounts ?? [];
  const filteredAccounts = accounts.filter(
    (a) =>
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      a.id.toLowerCase().includes(search.toLowerCase())
  );

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountName.trim()) {
      setError('Please provide an account name');
      return;
    }
    setError(null);
    createMutation.mutate(accountName.trim());
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Customer Accounts</h1>
          <p className="mt-1 text-xs text-slate-500">
            Accounts under your custody with verified ledger ownership and transfer permissions.
          </p>
        </div>

        <button
          onClick={() => {
            setIsModalOpen(true);
            setError(null);
          }}
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          <span>Open Account</span>
        </button>
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
            placeholder="Search by account name or ID..."
            className="block w-full rounded-md border border-slate-300 py-2 pl-9 pr-3 text-xs placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Accounts Table / Grid */}
      {isLoading ? (
        <TableSkeleton rows={4} columns={5} />
      ) : filteredAccounts.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title={search ? 'No Matching Accounts' : 'No Accounts Available'}
          description={
            search
              ? 'Try modifying your search term or clear the filter.'
              : 'You have no customer ledger accounts opened yet. Click below to create one.'
          }
          action={
            !search
              ? {
                  label: 'Open New Account',
                  onClick: () => setIsModalOpen(true),
                }
              : undefined
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
              <thead className="bg-slate-50 font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <th scope="col" className="px-6 py-3.5">
                    Account Name / Details
                  </th>
                  <th scope="col" className="px-6 py-3.5">
                    Status
                  </th>
                  <th scope="col" className="px-6 py-3.5">
                    Currency
                  </th>
                  <th scope="col" className="px-6 py-3.5 text-right">
                    Available Balance
                  </th>
                  <th scope="col" className="px-6 py-3.5 text-right">
                    Quick Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {filteredAccounts.map((account) => (
                  <tr key={account.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-bold text-slate-900">{account.name}</div>
                      <div className="font-mono text-[11px] text-slate-400 mt-0.5 select-all">
                        {account.id}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <StatusBadge status={account.status} type="account" />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap font-medium text-slate-600">
                      {account.currency}
                    </td>
                    <td className="px-6 py-4 text-right whitespace-nowrap">
                      <MoneyDisplay paise={account.balance} size="md" className="text-slate-900" />
                    </td>
                    <td className="px-6 py-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          to={`/accounts/${account.id}`}
                          title="View Ledger Statement"
                          className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 hover:text-blue-600"
                        >
                          <FileText className="h-3.5 w-3.5" />
                          <span>Statement</span>
                        </Link>
                        <Link
                          to={`/transfers?from=${account.id}`}
                          title="Transfer funds out"
                          className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 hover:text-blue-600"
                        >
                          <ArrowRightLeft className="h-3.5 w-3.5" />
                          <span>Transfer</span>
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal: Open New Account */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in">
          <div className="relative w-full max-w-md rounded-xl bg-white p-6 shadow-2xl border border-slate-200">
            <button
              onClick={() => setIsModalOpen(false)}
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-600"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-600 font-bold">
                <Wallet className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Open Customer Account</h3>
                <p className="text-xs text-slate-500">
                  Creates an active customer account with initial balance ₹0.00
                </p>
              </div>
            </div>

            {error && (
              <div className="mt-4 flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleCreate} className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
                  Account Name / Label
                </label>
                <input
                  type="text"
                  required
                  maxLength={120}
                  value={accountName}
                  onChange={(e) => setAccountName(e.target.value)}
                  placeholder="e.g. Primary Checking, Treasury Reserve"
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  Must be between 1 and 120 characters. Currency will be INR.
                </p>
              </div>

              <div className="flex justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow hover:bg-blue-700 disabled:opacity-50"
                >
                  {createMutation.isPending ? 'Opening...' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
