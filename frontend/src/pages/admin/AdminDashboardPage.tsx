import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { getAccountsApi, getDepositRequestsApi, getReconciliationApi, getAuditEventsApi } from '@/api';
import { MoneyDisplay } from '@/components/common/MoneyDisplay';
import { CardSkeleton } from '@/components/common/LoadingSkeleton';
import { Link } from 'react-router-dom';
import {
  ShieldCheck,
  ClipboardList,
  Wallet,
  SlidersHorizontal,
  RotateCcw,
  History,
  Scale,
  Users,
  AlertTriangle,
  ArrowRight,
} from 'lucide-react';

export const AdminDashboardPage: React.FC = () => {
  const { data: accountsData, isLoading: accountsLoading } = useQuery({
    queryKey: ['accounts'],
    queryFn: getAccountsApi,
  });

  const { data: depositsData, isLoading: depositsLoading } = useQuery({
    queryKey: ['deposits'],
    queryFn: () => getDepositRequestsApi(100),
  });

  const { data: reconData } = useQuery({
    queryKey: ['reconciliation'],
    queryFn: getReconciliationApi,
  });

  const { data: auditData } = useQuery({
    queryKey: ['audit-events-count'],
    queryFn: () => getAuditEventsApi(10),
  });

  const accounts = accountsData?.accounts ?? [];
  const deposits = depositsData?.deposits ?? [];
  const pendingDeposits = deposits.filter((d) => d.status === 'pending');

  const totalDepositedPaise = accounts.reduce((acc, acct) => {
    try {
      return acc + BigInt(acct.balance || '0');
    } catch {
      return acc;
    }
  }, 0n);

  return (
    <div className="space-y-8">
      {/* Top Banner */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded bg-indigo-100 px-2 py-0.5 text-[10px] font-bold uppercase text-indigo-700 tracking-wider">
              Control Panel
            </span>
            <span className="text-xs text-slate-400">• Institutional Oversight</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 mt-1">Administrator Portal</h1>
          <p className="mt-1 text-xs text-slate-500">
            Platform-wide account management, maker-checker financial reviews, adjustments, and system integrity monitoring.
          </p>
        </div>

        {reconData && (
          <div
            className={`flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-semibold ${
              reconData.integrityOk
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-rose-200 bg-rose-50 text-rose-800'
            }`}
          >
            {reconData.integrityOk ? (
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-rose-600" />
            )}
            <span>
              {reconData.integrityOk ? 'Ledger Invariant: 100% Balanced' : 'Ledger Invariant Discrepancy!'}
            </span>
          </div>
        )}
      </div>

      {/* Metrics Row */}
      {accountsLoading || depositsLoading ? (
        <CardSkeleton count={4} />
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Pending Deposits
              </span>
              <div className="rounded-lg bg-amber-50 p-2 text-amber-600">
                <ClipboardList className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-slate-900">{pendingDeposits.length}</span>
              <span className="text-xs text-slate-400">requests</span>
            </div>
            <Link
              to="/admin/deposits"
              className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline"
            >
              <span>Review queue</span>
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Total Customer Accounts
              </span>
              <div className="rounded-lg bg-blue-50 p-2 text-blue-600">
                <Wallet className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-slate-900">{accounts.length}</span>
              <span className="text-xs text-slate-400">active & suspended</span>
            </div>
            <Link
              to="/admin/accounts"
              className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline"
            >
              <span>Manage accounts</span>
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Total Customer Deposits
              </span>
              <div className="rounded-lg bg-emerald-50 p-2 text-emerald-600">
                <Scale className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3">
              <MoneyDisplay paise={totalDepositedPaise.toString()} size="lg" className="text-slate-900" />
            </div>
            <p className="mt-2 text-[11px] text-slate-400">Aggregated ledger liabilities</p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Audit Trail Events
              </span>
              <div className="rounded-lg bg-purple-50 p-2 text-purple-600">
                <History className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-slate-900">
                {auditData?.events.length ?? 0}+
              </span>
              <span className="text-xs text-slate-400">recent entries</span>
            </div>
            <Link
              to="/admin/audit"
              className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline"
            >
              <span>Inspect audit trail</span>
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </div>
      )}

      {/* Admin Action Hub */}
      <div className="space-y-4">
        <h2 className="text-base font-bold text-slate-900">Administrative Capabilities</h2>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <Link
            to="/admin/deposits"
            className="group rounded-xl border border-slate-200 bg-white p-6 shadow-sm hover:border-blue-300 hover:shadow-md transition-all"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 text-amber-600 group-hover:bg-amber-600 group-hover:text-white transition-colors">
              <ClipboardList className="h-5 w-5" />
            </div>
            <h3 className="mt-4 text-sm font-bold text-slate-900 group-hover:text-blue-600">
              Deposit Verification Queue
            </h3>
            <p className="mt-1 text-xs text-slate-500 leading-relaxed">
              Enforce maker-checker policy: Review external references and execute atomic journal posting from System Clearing to Customer accounts.
            </p>
            <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-blue-600">
              {pendingDeposits.length} pending review &rarr;
            </span>
          </Link>

          <Link
            to="/admin/accounts"
            className="group rounded-xl border border-slate-200 bg-white p-6 shadow-sm hover:border-blue-300 hover:shadow-md transition-all"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors">
              <Wallet className="h-5 w-5" />
            </div>
            <h3 className="mt-4 text-sm font-bold text-slate-900 group-hover:text-blue-600">
              Account Status & Permissions
            </h3>
            <p className="mt-1 text-xs text-slate-500 leading-relaxed">
              Suspend or activate accounts. Grant granular view, withdraw, or transfer permissions to specific users.
            </p>
            <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-blue-600">
              Manage accounts &rarr;
            </span>
          </Link>

          <Link
            to="/admin/adjustments"
            className="group rounded-xl border border-slate-200 bg-white p-6 shadow-sm hover:border-blue-300 hover:shadow-md transition-all"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
              <SlidersHorizontal className="h-5 w-5" />
            </div>
            <h3 className="mt-4 text-sm font-bold text-slate-900 group-hover:text-blue-600">
              Capital Adjustments
            </h3>
            <p className="mt-1 text-xs text-slate-500 leading-relaxed">
              Execute dual-admin credit or debit adjustments against System Capital. Initiated by one administrator, approved by another.
            </p>
            <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-blue-600">
              Create / approve adjustment &rarr;
            </span>
          </Link>

          <Link
            to="/admin/reversals"
            className="group rounded-xl border border-slate-200 bg-white p-6 shadow-sm hover:border-blue-300 hover:shadow-md transition-all"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-rose-50 text-rose-600 group-hover:bg-rose-600 group-hover:text-white transition-colors">
              <RotateCcw className="h-5 w-5" />
            </div>
            <h3 className="mt-4 text-sm font-bold text-slate-900 group-hover:text-blue-600">
              Transaction Reversals
            </h3>
            <p className="mt-1 text-xs text-slate-500 leading-relaxed">
              Post compensating journal entries for verified transactions. Guaranteed single-reversal constraint enforced by database index.
            </p>
            <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-blue-600">
              Transaction reversal &rarr;
            </span>
          </Link>

          <Link
            to="/admin/audit"
            className="group rounded-xl border border-slate-200 bg-white p-6 shadow-sm hover:border-blue-300 hover:shadow-md transition-all"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-50 text-purple-600 group-hover:bg-purple-600 group-hover:text-white transition-colors">
              <History className="h-5 w-5" />
            </div>
            <h3 className="mt-4 text-sm font-bold text-slate-900 group-hover:text-blue-600">
              Audit & Refused Attempts
            </h3>
            <p className="mt-1 text-xs text-slate-500 leading-relaxed">
              Inspect immutable audit records and access refusal logs (unauthorized attempts, insufficient balance attempts, maker-checker violations).
            </p>
            <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-blue-600">
              View audit log &rarr;
            </span>
          </Link>

          <Link
            to="/admin/users"
            className="group rounded-xl border border-slate-200 bg-white p-6 shadow-sm hover:border-blue-300 hover:shadow-md transition-all"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-600 group-hover:bg-slate-700 group-hover:text-white transition-colors">
              <Users className="h-5 w-5" />
            </div>
            <h3 className="mt-4 text-sm font-bold text-slate-900 group-hover:text-blue-600">
              User Management
            </h3>
            <p className="mt-1 text-xs text-slate-500 leading-relaxed">
              Review platform participants and understand current backend authentication boundary requirements.
            </p>
            <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-blue-600">
              View user details &rarr;
            </span>
          </Link>
        </div>
      </div>
    </div>
  );
};
