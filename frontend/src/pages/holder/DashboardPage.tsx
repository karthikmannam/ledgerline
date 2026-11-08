import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { getAccountsApi, getDepositRequestsApi } from '@/api';
import { MoneyDisplay } from '@/components/common/MoneyDisplay';
import { StatusBadge } from '@/components/common/StatusBadge';
import { EmptyState } from '@/components/common/EmptyState';
import { CardSkeleton } from '@/components/common/LoadingSkeleton';
import { Link } from 'react-router-dom';
import {
  Wallet,
  ArrowRightLeft,
  ArrowDownToLine,
  ArrowUpFromLine,
  FileText,
  PlusCircle,
  ExternalLink,
  ShieldCheck,
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

export const HolderDashboardPage: React.FC = () => {
  const { data: accountsData, isLoading: accountsLoading } = useQuery({
    queryKey: ['accounts'],
    queryFn: getAccountsApi,
  });

  const { data: depositsData } = useQuery({
    queryKey: ['deposits'],
    queryFn: () => getDepositRequestsApi(20),
  });

  const accounts = accountsData?.accounts ?? [];
  const deposits = depositsData?.deposits ?? [];

  // Calculate total balance safely using BigInt paise addition
  const totalBalancePaise = accounts.reduce((acc, acct) => {
    try {
      return acc + BigInt(acct.balance || '0');
    } catch {
      return acc;
    }
  }, 0n);

  const pendingDepositsCount = deposits.filter((d) => d.status === 'pending').length;

  // Chart data: prepare data from real accounts
  const chartData = accounts
    .filter((a) => {
      try {
        return BigInt(a.balance) > 0n;
      } catch {
        return false;
      }
    })
    .map((a) => ({
      name: a.name,
      // Recharts needs a numeric value for pie slice proportions; we use paise / 100 as display value
      value: Number(BigInt(a.balance) / 100n),
      balancePaise: a.balance,
    }));

  const COLORS = ['#2563eb', '#0284c7', '#0d9488', '#6366f1', '#8b5cf6'];

  return (
    <div className="space-y-8">
      {/* Top Banner / Welcome */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Account Overview</h1>
          <p className="mt-1 text-xs text-slate-500">
            Real-time balance projections derived from verified append-only double-entry ledger postings.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            to="/transfers"
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700"
          >
            <ArrowRightLeft className="h-3.5 w-3.5" />
            <span>Transfer Money</span>
          </Link>
          <Link
            to="/deposits"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <ArrowDownToLine className="h-3.5 w-3.5 text-slate-500" />
            <span>Request Deposit</span>
          </Link>
          <Link
            to="/withdrawals"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <ArrowUpFromLine className="h-3.5 w-3.5 text-slate-500" />
            <span>Withdraw</span>
          </Link>
        </div>
      </div>

      {/* Metrics Row */}
      {accountsLoading ? (
        <CardSkeleton count={3} />
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Total Available Balance
              </span>
              <div className="rounded-lg bg-blue-50 p-2 text-blue-600">
                <Wallet className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-3">
              <MoneyDisplay paise={totalBalancePaise.toString()} size="xl" className="text-slate-900" />
              <p className="mt-1 text-[11px] text-slate-400">Summed across all customer accounts</p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Active Accounts
              </span>
              <div className="rounded-lg bg-emerald-50 p-2 text-emerald-600">
                <ShieldCheck className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl font-bold tracking-tight text-slate-900">
                {accounts.length}
              </span>
              <span className="text-xs text-slate-500">ledger accounts</span>
            </div>
            <Link
              to="/accounts"
              className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700"
            >
              <span>Manage accounts</span>
              <ExternalLink className="h-3 w-3" />
            </Link>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Pending Deposits
              </span>
              <div className="rounded-lg bg-amber-50 p-2 text-amber-600">
                <ArrowDownToLine className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl font-bold tracking-tight text-slate-900">
                {pendingDepositsCount}
              </span>
              <span className="text-xs text-slate-500">awaiting admin check</span>
            </div>
            <Link
              to="/deposits"
              className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700"
            >
              <span>View requests</span>
              <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        </div>
      )}

      {/* Main Grid: Accounts List & Balance Distribution */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        {/* Accounts List (2 Cols) */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900">Your Accounts</h2>
            <Link
              to="/accounts"
              className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline"
            >
              <PlusCircle className="h-3.5 w-3.5" />
              <span>Open New Account</span>
            </Link>
          </div>

          {accounts.length === 0 ? (
            <EmptyState
              title="No Accounts Found"
              description="You have not created any customer accounts yet. Open an account to start moving money."
              action={{
                label: 'Create First Account',
                onClick: () => {
                  window.location.href = '/accounts';
                },
              }}
            />
          ) : (
            <div className="space-y-3">
              {accounts.map((account) => (
                <div
                  key={account.id}
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:border-blue-200 transition-colors"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2.5">
                      <h3 className="text-sm font-bold text-slate-900">{account.name}</h3>
                      <StatusBadge status={account.status} type="account" />
                    </div>
                    <p className="font-mono text-xs text-slate-400">ID: {account.id}</p>
                  </div>

                  <div className="mt-4 sm:mt-0 flex items-center justify-between sm:justify-end gap-6">
                    <div className="sm:text-right">
                      <p className="text-[10px] uppercase font-bold text-slate-400">Balance</p>
                      <MoneyDisplay paise={account.balance} size="lg" className="text-slate-900" />
                    </div>

                    <Link
                      to={`/accounts/${account.id}`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                    >
                      <FileText className="h-3.5 w-3.5 text-slate-500" />
                      <span>Statement</span>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Balance Distribution Chart */}
        <div className="space-y-4">
          <h2 className="text-base font-bold text-slate-900">Asset Distribution</h2>
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            {chartData.length > 0 ? (
              <div>
                <div className="h-48 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={chartData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={75}
                        paddingAngle={3}
                      >
                        {chartData.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(val: any) => [val != null ? `₹${Number(val).toLocaleString('en-IN')}` : '₹0', 'Balance']}
                        contentStyle={{
                          backgroundColor: '#0f172a',
                          borderRadius: '0.5rem',
                          color: '#fff',
                          fontSize: '11px',
                          border: 'none',
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-4 space-y-2">
                  {chartData.map((item, idx) => (
                    <div key={`${item.name}-${idx}`} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: COLORS[idx % COLORS.length] }}
                        />
                        <span className="font-medium text-slate-700 truncate max-w-[120px]">
                          {item.name}
                        </span>
                      </div>
                      <MoneyDisplay paise={item.balancePaise} size="sm" />
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500 text-center py-10">
                No funded accounts to visualize.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
