import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getAttemptsApi } from '@/api';
import { TableSkeleton } from '@/components/common/LoadingSkeleton';
import { EmptyState } from '@/components/common/EmptyState';
import { formatDate } from '@/lib/utils';
import { AlertOctagon, Search, Filter } from 'lucide-react';

export const AttemptsPage: React.FC = () => {
  const [search, setSearch] = useState('');
  const [filterCode, setFilterCode] = useState('all');

  const { data, isLoading } = useQuery({
    queryKey: ['audit-attempts'],
    queryFn: getAttemptsApi,
  });

  const attempts = data?.attempts ?? [];

  const uniqueCodes = Array.from(new Set(attempts.map((a) => a.code)));

  const filteredAttempts = attempts.filter((att) => {
    const matchesCode = filterCode === 'all' || att.code === filterCode;
    const matchesSearch =
      att.endpoint.toLowerCase().includes(search.toLowerCase()) ||
      att.code.toLowerCase().includes(search.toLowerCase()) ||
      (att.actor_id && att.actor_id.toLowerCase().includes(search.toLowerCase()));
    return matchesCode && matchesSearch;
  });

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-200 pb-5">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Refused Security Attempts</h1>
        <p className="mt-1 text-xs text-slate-500">
          Auditable log of authorization and invariant refusals: forbidden account access, overdraft attempts, and maker-checker violations.
        </p>
      </div>

      {/* Filter and Search */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm rounded-md shadow-sm w-full">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
            <Search className="h-4 w-4" />
          </div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search refusal code, endpoint, actor..."
            className="block w-full rounded-md border border-slate-300 py-2 pl-9 pr-3 text-xs placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="h-4 w-4 text-slate-400" />
          <select
            value={filterCode}
            onChange={(e) => setFilterCode(e.target.value)}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="all">All Refusal Codes</option>
            {uniqueCodes.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </div>
      </div>

      {isLoading ? (
        <TableSkeleton rows={5} columns={4} />
      ) : filteredAttempts.length === 0 ? (
        <EmptyState
          icon={AlertOctagon}
          title="No Security Refusals Found"
          description="There are no refused access attempts matching your filter."
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
              <thead className="bg-slate-50 font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <th scope="col" className="px-5 py-3.5">
                    Refusal Timestamp
                  </th>
                  <th scope="col" className="px-5 py-3.5">
                    Target Endpoint
                  </th>
                  <th scope="col" className="px-5 py-3.5">
                    Refusal Code
                  </th>
                  <th scope="col" className="px-5 py-3.5">
                    Actor UUID
                  </th>
                  <th scope="col" className="px-5 py-3.5">
                    Refusal Context / Details
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {filteredAttempts.map((att) => (
                  <tr key={att.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-5 py-3.5 whitespace-nowrap text-slate-600">
                      {formatDate(att.created_at)}
                    </td>
                    <td className="px-5 py-3.5 font-mono font-bold text-slate-800">
                      {att.endpoint}
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      <span className="rounded bg-rose-50 text-rose-700 px-2.5 py-1 font-mono text-[11px] font-bold border border-rose-200">
                        {att.code}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 font-mono text-[11px] text-slate-500 select-all">
                      {att.actor_id ? `${att.actor_id.slice(0, 8)}...` : 'Anonymous'}
                    </td>
                    <td className="px-5 py-3.5 font-mono text-[10px] text-slate-500 max-w-[220px] truncate">
                      {JSON.stringify(att.details)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
