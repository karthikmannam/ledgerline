import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { getReconciliationApi, getAuditEventsApi, getAttemptsApi, getAccountsApi } from '@/api';
import { CardSkeleton } from '@/components/common/LoadingSkeleton';
import { Link } from 'react-router-dom';
import {
  Scale,
  History,
  AlertOctagon,
  Search,
  ShieldCheck,
  AlertTriangle,
  ArrowRight,
  Eye,
  CheckCircle2,
} from 'lucide-react';

export const AuditorDashboardPage: React.FC = () => {
  const { data: reconData, isLoading: reconLoading } = useQuery({
    queryKey: ['reconciliation'],
    queryFn: getReconciliationApi,
  });

  const { data: eventsData, isLoading: eventsLoading } = useQuery({
    queryKey: ['audit-events', 10],
    queryFn: () => getAuditEventsApi(10),
  });

  const { data: attemptsData, isLoading: attemptsLoading } = useQuery({
    queryKey: ['audit-attempts'],
    queryFn: getAttemptsApi,
  });

  const { data: accountsData } = useQuery({
    queryKey: ['accounts'],
    queryFn: getAccountsApi,
  });

  const accounts = accountsData?.accounts ?? [];
  const events = eventsData?.events ?? [];
  const attempts = attemptsData?.attempts ?? [];

  return (
    <div className="space-y-8">
      {/* Top Banner */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded bg-purple-100 px-2 py-0.5 text-[10px] font-bold uppercase text-purple-700 tracking-wider">
              Read-Only Audit Portal
            </span>
            <span className="text-xs text-slate-400">• Independent Verification</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 mt-1">
            Financial Audit & Ledger Integrity
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            Read-only examination of cryptographic journal postings, balance projection reconciliation, and security refusal logs.
          </p>
        </div>

        <div className="flex items-center gap-1.5 rounded-lg border border-purple-200 bg-purple-50 px-3 py-1.5 text-xs font-semibold text-purple-800">
          <Eye className="h-4 w-4 text-purple-600" />
          <span>Strictly Read-Only Access</span>
        </div>
      </div>

      {/* Reconciliation Invariant Card */}
      {reconLoading ? (
        <CardSkeleton count={1} />
      ) : reconData ? (
        <div
          className={`rounded-xl border p-6 shadow-sm ${
            reconData.integrityOk
              ? 'border-emerald-200 bg-emerald-50/70 text-emerald-900'
              : 'border-rose-200 bg-rose-50 text-rose-900'
          }`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div
                className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl font-bold ${
                  reconData.integrityOk ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                }`}
              >
                {reconData.integrityOk ? (
                  <ShieldCheck className="h-6 w-6" />
                ) : (
                  <AlertTriangle className="h-6 w-6" />
                )}
              </div>
              <div>
                <h3 className="text-base font-bold">
                  {reconData.integrityOk
                    ? 'Global Ledger Conservation Invariant: VERIFIED'
                    : 'Global Ledger Invariant: DISCREPANCY DETECTED'}
                </h3>
                <p className="mt-1 text-xs leading-relaxed max-w-2xl opacity-90">
                  {reconData.integrityOk
                    ? 'All historical debit and credit journal postings match live balance projections with zero discrepancy across all customer, clearing, and capital accounts. Conservation of value confirmed.'
                    : `Discrepancies identified in ${reconData.discrepancies.length} accounts. Immediate investigation required.`}
                </p>
              </div>
            </div>

            <Link
              to="/auditor/reconciliation"
              className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold shadow-sm flex-shrink-0 ${
                reconData.integrityOk
                  ? 'bg-emerald-700 text-white hover:bg-emerald-800'
                  : 'bg-rose-700 text-white hover:bg-rose-800'
              }`}
            >
              <span>View Mathematical Proof</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      ) : null}

      {/* Metrics Row */}
      {eventsLoading || attemptsLoading ? (
        <CardSkeleton count={3} />
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Audit Trail Entries
              </span>
              <div className="rounded-lg bg-blue-50 p-2 text-blue-600">
                <History className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-slate-900">{events.length}</span>
              <span className="text-xs text-slate-400">recent events</span>
            </div>
            <Link
              to="/auditor/events"
              className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline"
            >
              <span>Inspect audit trail</span>
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Refused Security Attempts
              </span>
              <div className="rounded-lg bg-rose-50 p-2 text-rose-600">
                <AlertOctagon className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-slate-900">{attempts.length}</span>
              <span className="text-xs text-slate-400">blocked requests</span>
            </div>
            <Link
              to="/auditor/attempts"
              className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline"
            >
              <span>Inspect refusal logs</span>
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Customer Ledger Accounts
              </span>
              <div className="rounded-lg bg-purple-50 p-2 text-purple-600">
                <Scale className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-slate-900">{accounts.length}</span>
              <span className="text-xs text-slate-400">auditable accounts</span>
            </div>
            <Link
              to="/auditor/reconciliation"
              className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline"
            >
              <span>Reconciliation report</span>
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </div>
      )}

      {/* Auditor Navigation Cards */}
      <div className="space-y-4">
        <h2 className="text-base font-bold text-slate-900">Auditor Tools</h2>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <Link
            to="/auditor/reconciliation"
            className="group rounded-xl border border-slate-200 bg-white p-6 shadow-sm hover:border-purple-300 hover:shadow-md transition-all"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
              <Scale className="h-5 w-5" />
            </div>
            <h3 className="mt-4 text-sm font-bold text-slate-900 group-hover:text-purple-600">
              Mathematical Ledger Reconciliation
            </h3>
            <p className="mt-1 text-xs text-slate-500 leading-relaxed">
              Verify that the sum of debit postings equals credit postings globally, and check projected balances against historical journal postings without modifying records.
            </p>
            <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-purple-600">
              Open reconciliation proof &rarr;
            </span>
          </Link>

          <Link
            to="/auditor/events"
            className="group rounded-xl border border-slate-200 bg-white p-6 shadow-sm hover:border-purple-300 hover:shadow-md transition-all"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors">
              <History className="h-5 w-5" />
            </div>
            <h3 className="mt-4 text-sm font-bold text-slate-900 group-hover:text-purple-600">
              Audit Event Stream
            </h3>
            <p className="mt-1 text-xs text-slate-500 leading-relaxed">
              Full chronological inspection of all system actions: user registrations, sessions, account creations, transfers, adjustments, and reversals.
            </p>
            <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-purple-600">
              View event stream &rarr;
            </span>
          </Link>

          <Link
            to="/auditor/attempts"
            className="group rounded-xl border border-slate-200 bg-white p-6 shadow-sm hover:border-purple-300 hover:shadow-md transition-all"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-rose-50 text-rose-600 group-hover:bg-rose-600 group-hover:text-white transition-colors">
              <AlertOctagon className="h-5 w-5" />
            </div>
            <h3 className="mt-4 text-sm font-bold text-slate-900 group-hover:text-purple-600">
              Security Refusal Log
            </h3>
            <p className="mt-1 text-xs text-slate-500 leading-relaxed">
              Inspect unauthorized attempts, insufficient balance attempts, maker-checker violations, and invalid permissions blocked by authorization services.
            </p>
            <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-purple-600">
              Inspect refusals &rarr;
            </span>
          </Link>

          <Link
            to="/auditor/transactions"
            className="group rounded-xl border border-slate-200 bg-white p-6 shadow-sm hover:border-purple-300 hover:shadow-md transition-all"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-50 text-purple-600 group-hover:bg-purple-600 group-hover:text-white transition-colors">
              <Search className="h-5 w-5" />
            </div>
            <h3 className="mt-4 text-sm font-bold text-slate-900 group-hover:text-purple-600">
              Transaction Posting Inspector
            </h3>
            <p className="mt-1 text-xs text-slate-500 leading-relaxed">
              Query any journal transaction UUID and inspect both exact debit and credit postings, counterparties, and reversal lineage.
            </p>
            <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-purple-600">
              Inspect transaction postings &rarr;
            </span>
          </Link>
        </div>
      </div>
    </div>
  );
};
