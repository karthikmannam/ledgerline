import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getAccountByIdApi, getAccountStatementApi } from '@/api';
import { MoneyDisplay } from '@/components/common/MoneyDisplay';
import { StatusBadge } from '@/components/common/StatusBadge';
import { TableSkeleton } from '@/components/common/LoadingSkeleton';
import { EmptyState } from '@/components/common/EmptyState';
import { formatDate } from '@/lib/utils';
import {
  Wallet,
  ArrowLeft,
  ArrowRightLeft,
  ArrowDownToLine,
  ArrowUpFromLine,
  ChevronLeft,
  ChevronRight,
  RotateCw,
  FileSpreadsheet,
  AlertCircle,
} from 'lucide-react';

export const AccountDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();

  // Pagination state: cursor stack to support Next and Prev with highWater snapshot
  const [cursor, setCursor] = useState<{ before: string | null; hw: string | null }>({
    before: null,
    hw: null,
  });
  const [cursorHistory, setCursorHistory] = useState<string[]>([]);

  const { data: account, isLoading: accountLoading, error: accountError } = useQuery({
    queryKey: ['account', id],
    queryFn: () => getAccountByIdApi(id!),
    enabled: !!id,
  });

  const {
    data: statementData,
    isLoading: statementLoading,
    refetch: refetchStatement,
  } = useQuery({
    queryKey: ['statement', id, cursor],
    queryFn: () =>
      getAccountStatementApi(id!, {
        limit: 25,
        before: cursor.before,
        hw: cursor.hw,
      }),
    enabled: !!id,
  });

  if (accountLoading) {
    return <TableSkeleton rows={4} columns={4} />;
  }

  if (accountError || !account) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-center space-y-3">
        <AlertCircle className="mx-auto h-8 w-8 text-rose-600" />
        <h2 className="text-base font-bold text-rose-900">Account Not Found or Inaccessible</h2>
        <p className="text-xs text-rose-700">
          The requested ledger account does not exist or your active credentials lack view permissions.
        </p>
        <Link
          to="/accounts"
          className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Accounts</span>
        </Link>
      </div>
    );
  }

  const entries = statementData?.entries ?? [];
  const nextBefore = statementData?.nextBefore ?? null;
  const highWater = statementData?.highWater ?? null;

  const handleNextPage = () => {
    if (nextBefore) {
      setCursorHistory((prev) => [...prev, cursor.before || 'FIRST']);
      setCursor({
        before: nextBefore,
        hw: cursor.hw || highWater,
      });
    }
  };

  const handlePrevPage = () => {
    if (cursorHistory.length > 0) {
      const prevStack = [...cursorHistory];
      const last = prevStack.pop();
      setCursorHistory(prevStack);
      setCursor({
        before: last === 'FIRST' ? null : last || null,
        hw: cursor.hw,
      });
    }
  };

  const handleRefresh = () => {
    setCursor({ before: null, hw: null });
    setCursorHistory([]);
    refetchStatement();
  };

  return (
    <div className="space-y-6">
      {/* Breadcrumb & Navigation */}
      <div>
        <Link
          to="/accounts"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to All Accounts</span>
        </Link>
      </div>

      {/* Account Info Header Card */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-600 font-bold">
                <Wallet className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight text-slate-900">{account.name}</h1>
                <p className="font-mono text-xs text-slate-400 select-all">UUID: {account.id}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 pt-2">
              <StatusBadge status={account.status} type="account" />
              <span className="text-xs text-slate-400">• Currency: {account.currency}</span>
            </div>
          </div>

          <div className="sm:text-right border-t sm:border-t-0 pt-4 sm:pt-0 border-slate-100">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Current Available Balance
            </p>
            <MoneyDisplay paise={account.balance} size="xl" className="text-slate-900 mt-1" />
            <div className="mt-3 flex flex-wrap items-center sm:justify-end gap-2">
              <Link
                to={`/transfers?from=${account.id}`}
                className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700"
              >
                <ArrowRightLeft className="h-3.5 w-3.5" />
                <span>Transfer</span>
              </Link>
              <Link
                to={`/withdrawals?account=${account.id}`}
                className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <ArrowUpFromLine className="h-3.5 w-3.5 text-slate-500" />
                <span>Withdraw</span>
              </Link>
              <Link
                to={`/deposits?account=${account.id}`}
                className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <ArrowDownToLine className="h-3.5 w-3.5 text-slate-500" />
                <span>Deposit Request</span>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Account Statement Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4 text-blue-600" />
              <span>Ledger Activity Statement</span>
            </h2>
            <p className="text-xs text-slate-500">
              Deterministic sequence of debit and credit entries with running balance verification.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              title="Refresh ledger snapshot"
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              <RotateCw className="h-3.5 w-3.5 text-slate-400" />
              <span>Refresh Snapshot</span>
            </button>
          </div>
        </div>

        {statementLoading ? (
          <TableSkeleton rows={5} columns={6} />
        ) : entries.length === 0 ? (
          <EmptyState
            title="No Activity Recorded"
            description="There are no transaction postings for this account yet. Deposit or transfer funds to view activity."
          />
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                <thead className="bg-slate-50 font-semibold uppercase tracking-wider text-slate-500">
                  <tr>
                    <th scope="col" className="px-5 py-3.5">
                      Seq #
                    </th>
                    <th scope="col" className="px-5 py-3.5">
                      Timestamp
                    </th>
                    <th scope="col" className="px-5 py-3.5">
                      Transaction Type
                    </th>
                    <th scope="col" className="px-5 py-3.5 text-center">
                      Side
                    </th>
                    <th scope="col" className="px-5 py-3.5 text-right">
                      Amount
                    </th>
                    <th scope="col" className="px-5 py-3.5 text-right">
                      Running Balance
                    </th>
                    <th scope="col" className="px-5 py-3.5">
                      Journal Transaction Ref
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {entries.map((entry) => (
                    <tr key={entry.seq} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-5 py-3.5 font-mono text-slate-500 font-semibold">
                        #{entry.seq}
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap text-slate-600">
                        {formatDate(entry.at)}
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap font-medium text-slate-900 capitalize">
                        {entry.type ? entry.type.replace(/_/g, ' ') : 'Posting'}
                      </td>
                      <td className="px-5 py-3.5 text-center whitespace-nowrap">
                        <StatusBadge status={entry.side} type="side" />
                      </td>
                      <td className="px-5 py-3.5 text-right whitespace-nowrap font-semibold">
                        <MoneyDisplay
                          paise={entry.amount}
                          side={entry.side}
                          showSign
                          size="sm"
                        />
                      </td>
                      <td className="px-5 py-3.5 text-right whitespace-nowrap font-bold text-slate-900">
                        <MoneyDisplay paise={entry.runningBalance} size="sm" />
                      </td>
                      <td className="px-5 py-3.5 font-mono text-[11px] text-slate-400 select-all truncate max-w-[160px]">
                        {entry.transaction || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-5 py-3 text-xs">
              <span className="text-slate-500">
                Snapshot High-Water Mark: <span className="font-mono font-semibold">#{highWater}</span>
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePrevPage}
                  disabled={cursorHistory.length === 0}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  <span>Previous</span>
                </button>
                <button
                  type="button"
                  onClick={handleNextPage}
                  disabled={!nextBefore}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <span>Next</span>
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
