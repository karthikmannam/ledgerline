import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getAuditEventsApi } from '@/api';
import { TableSkeleton } from '@/components/common/LoadingSkeleton';
import { EmptyState } from '@/components/common/EmptyState';
import { formatDate } from '@/lib/utils';
import { History, Search, Filter } from 'lucide-react';

export const AuditEventsPage: React.FC = () => {
  const [search, setSearch] = useState('');
  const [filterAction, setFilterAction] = useState('all');

  const { data, isLoading } = useQuery({
    queryKey: ['audit-events', 200],
    queryFn: () => getAuditEventsApi(200),
  });

  const events = data?.events ?? [];

  const uniqueActions = Array.from(new Set(events.map((e) => e.action)));

  const filteredEvents = events.filter((ev) => {
    const matchesAction = filterAction === 'all' || ev.action === filterAction;
    const matchesSearch =
      ev.action.toLowerCase().includes(search.toLowerCase()) ||
      ev.target_type.toLowerCase().includes(search.toLowerCase()) ||
      (ev.target_id && ev.target_id.toLowerCase().includes(search.toLowerCase())) ||
      (ev.actor_id && ev.actor_id.toLowerCase().includes(search.toLowerCase()));
    return matchesAction && matchesSearch;
  });

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-200 pb-5">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">System Audit Trail</h1>
        <p className="mt-1 text-xs text-slate-500">
          Chronological record of all state transitions: user registrations, sessions, account creations, transfers, adjustments, and reversals.
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
            placeholder="Search action, actor, target..."
            className="block w-full rounded-md border border-slate-300 py-2 pl-9 pr-3 text-xs placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="h-4 w-4 text-slate-400" />
          <select
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value)}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="all">All Actions</option>
            {uniqueActions.map((act) => (
              <option key={act} value={act}>
                {act}
              </option>
            ))}
          </select>
        </div>
      </div>

      {isLoading ? (
        <TableSkeleton rows={6} columns={5} />
      ) : filteredEvents.length === 0 ? (
        <EmptyState
          icon={History}
          title="No Audit Records"
          description="No audit events matched your search criteria."
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
              <thead className="bg-slate-50 font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <th scope="col" className="px-5 py-3.5">
                    Seq # / Date
                  </th>
                  <th scope="col" className="px-5 py-3.5">
                    Action
                  </th>
                  <th scope="col" className="px-5 py-3.5">
                    Target Resource
                  </th>
                  <th scope="col" className="px-5 py-3.5">
                    Actor UUID
                  </th>
                  <th scope="col" className="px-5 py-3.5">
                    Metadata Payload
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {filteredEvents.map((ev) => (
                  <tr key={ev.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      <span className="font-mono text-slate-400 font-semibold">#{ev.id}</span>
                      <div className="text-slate-600 mt-0.5">{formatDate(ev.created_at)}</div>
                    </td>
                    <td className="px-5 py-3.5 font-bold text-slate-900 whitespace-nowrap">
                      <span className="rounded bg-blue-50 text-blue-700 px-2.5 py-1 font-mono text-[11px] border border-blue-200">
                        {ev.action}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-slate-700">
                      <span className="font-semibold text-slate-900 uppercase text-[10px]">
                        {ev.target_type}
                      </span>
                      <div className="font-mono text-[11px] text-slate-400 select-all truncate max-w-[150px]">
                        {ev.target_id || '—'}
                      </div>
                    </td>
                    <td className="px-5 py-3.5 font-mono text-[11px] text-slate-500 select-all">
                      {ev.actor_id ? `${ev.actor_id.slice(0, 8)}...` : 'System'}
                    </td>
                    <td className="px-5 py-3.5 font-mono text-[10px] text-slate-500 max-w-[220px] truncate">
                      {JSON.stringify(ev.metadata)}
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
