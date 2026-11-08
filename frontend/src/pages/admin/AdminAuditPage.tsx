import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getAuditEventsApi, getAttemptsApi } from '@/api';
import { TableSkeleton } from '@/components/common/LoadingSkeleton';
import { EmptyState } from '@/components/common/EmptyState';
import { formatDate } from '@/lib/utils';
import { History, AlertOctagon, ShieldCheck, Search, Filter } from 'lucide-react';

export const AdminAuditPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'events' | 'attempts'>('events');
  const [search, setSearch] = useState('');

  const { data: eventsData, isLoading: eventsLoading } = useQuery({
    queryKey: ['audit-events', 100],
    queryFn: () => getAuditEventsApi(100),
  });

  const { data: attemptsData, isLoading: attemptsLoading } = useQuery({
    queryKey: ['audit-attempts'],
    queryFn: getAttemptsApi,
  });

  const events = eventsData?.events ?? [];
  const attempts = attemptsData?.attempts ?? [];

  const filteredEvents = events.filter(
    (ev) =>
      ev.action.toLowerCase().includes(search.toLowerCase()) ||
      ev.target_type.toLowerCase().includes(search.toLowerCase()) ||
      (ev.target_id && ev.target_id.toLowerCase().includes(search.toLowerCase())) ||
      (ev.actor_id && ev.actor_id.toLowerCase().includes(search.toLowerCase()))
  );

  const filteredAttempts = attempts.filter(
    (att) =>
      att.endpoint.toLowerCase().includes(search.toLowerCase()) ||
      att.code.toLowerCase().includes(search.toLowerCase()) ||
      (att.actor_id && att.actor_id.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Institutional Audit & Refusals</h1>
          <p className="mt-1 text-xs text-slate-500">
            Immutable audit event trail and refused security attempts logged by the database and authorization services.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200">
        <button
          onClick={() => setActiveTab('events')}
          className={`flex items-center gap-2 border-b-2 py-3 px-4 text-xs font-bold transition-colors ${
            activeTab === 'events'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <History className="h-4 w-4" />
          <span>Audit Events ({events.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('attempts')}
          className={`flex items-center gap-2 border-b-2 py-3 px-4 text-xs font-bold transition-colors ${
            activeTab === 'attempts'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <AlertOctagon className="h-4 w-4 text-rose-500" />
          <span>Refused Security Attempts ({attempts.length})</span>
        </button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm rounded-md shadow-sm">
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
          <Search className="h-4 w-4" />
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={`Search ${activeTab === 'events' ? 'events' : 'refusals'}...`}
          className="block w-full rounded-md border border-slate-300 py-2 pl-9 pr-3 text-xs placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {/* Content */}
      {activeTab === 'events' ? (
        eventsLoading ? (
          <TableSkeleton rows={6} columns={5} />
        ) : filteredEvents.length === 0 ? (
          <EmptyState
            icon={History}
            title="No Audit Events Recorded"
            description="No system audit records matched your search."
          />
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                <thead className="bg-slate-50 font-semibold uppercase tracking-wider text-slate-500">
                  <tr>
                    <th scope="col" className="px-5 py-3.5">
                      Event ID / Time
                    </th>
                    <th scope="col" className="px-5 py-3.5">
                      Action Type
                    </th>
                    <th scope="col" className="px-5 py-3.5">
                      Target Entity
                    </th>
                    <th scope="col" className="px-5 py-3.5">
                      Actor UUID
                    </th>
                    <th scope="col" className="px-5 py-3.5">
                      Metadata
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
                        <span className="rounded bg-blue-50 text-blue-700 px-2 py-0.5 font-mono text-[11px] border border-blue-200">
                          {ev.action}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-slate-700">
                        <span className="font-semibold text-slate-900 uppercase text-[10px]">
                          {ev.target_type}
                        </span>
                        <div className="font-mono text-[11px] text-slate-400 select-all truncate max-w-[140px]">
                          {ev.target_id || '—'}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 font-mono text-[11px] text-slate-500 select-all">
                        {ev.actor_id ? `${ev.actor_id.slice(0, 8)}...` : 'System'}
                      </td>
                      <td className="px-5 py-3.5 font-mono text-[10px] text-slate-500 max-w-[200px] truncate">
                        {JSON.stringify(ev.metadata)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      ) : attemptsLoading ? (
        <TableSkeleton rows={5} columns={4} />
      ) : filteredAttempts.length === 0 ? (
        <EmptyState
          icon={AlertOctagon}
          title="No Security Refusals"
          description="There are currently zero failed or refused security access attempts recorded."
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
              <thead className="bg-slate-50 font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <th scope="col" className="px-5 py-3.5">
                    Timestamp
                  </th>
                  <th scope="col" className="px-5 py-3.5">
                    Endpoint
                  </th>
                  <th scope="col" className="px-5 py-3.5">
                    Refusal Code
                  </th>
                  <th scope="col" className="px-5 py-3.5">
                    Actor UUID
                  </th>
                  <th scope="col" className="px-5 py-3.5">
                    Details
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
                      <span className="rounded bg-rose-50 text-rose-700 px-2 py-0.5 font-mono text-[11px] font-bold border border-rose-200">
                        {att.code}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 font-mono text-[11px] text-slate-500 select-all">
                      {att.actor_id ? `${att.actor_id.slice(0, 8)}...` : 'Anonymous'}
                    </td>
                    <td className="px-5 py-3.5 font-mono text-[10px] text-slate-500 max-w-[200px] truncate">
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
