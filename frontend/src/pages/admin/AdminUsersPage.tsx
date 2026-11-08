import React from 'react';
import { UnsupportedNotice } from '@/components/common/UnsupportedNotice';
import { Users, Shield, KeyRound, CheckCircle2 } from 'lucide-react';

export const AdminUsersPage: React.FC = () => {
  const seededAccounts = [
    {
      role: 'admin',
      email: 'admin@ledgerline.dev',
      notes: 'Initial institutional administrator. Full access to accounts, verification queue, reversals, and audit logs.',
      provisioning: 'Offline script (dev-seed.mjs)',
    },
    {
      role: 'auditor',
      email: 'auditor@ledgerline.dev',
      notes: 'Independent read-only auditor. Access to audit event stream, refused attempts, and mathematical ledger reconciliation.',
      provisioning: 'Offline script (dev-seed.mjs)',
    },
    {
      role: 'holder',
      email: 'holder1@ledgerline.dev',
      notes: 'Primary customer account holder. Holds funded checking account on ledger.',
      provisioning: 'POST /auth/register or dev-seed.mjs',
    },
    {
      role: 'holder',
      email: 'holder2@ledgerline.dev',
      notes: 'Secondary customer account holder. Holds funded secondary account on ledger.',
      provisioning: 'POST /auth/register or dev-seed.mjs',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-200 pb-5">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">User Management Console</h1>
        <p className="mt-1 text-xs text-slate-500">
          Platform role definitions, participant oversight, and user credential lifecycle.
        </p>
      </div>

      {/* Backend Limitation Notice */}
      <UnsupportedNotice
        featureTitle="User Directory & Administration API"
        backendReason="The backend does not expose an endpoint to list all registered users (e.g. GET /users) or modify user accounts (e.g. PATCH /users/:id). In LedgerLine's security model, public registration strictly creates 'holder' accounts via register_user(), while 'admin' and 'auditor' roles must be assigned directly via SQL or offline provisioning."
        missingEndpoint="GET /users, PATCH /users/:id"
      />

      {/* Seeded / Configured Participant Reference */}
      <div className="space-y-4">
        <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <Users className="h-4 w-4 text-blue-600" />
          <span>Provisioned Platform Participants (Development Environment)</span>
        </h2>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {seededAccounts.map((account) => (
            <div
              key={account.email}
              className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-900 text-sm">{account.email}</span>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                    account.role === 'admin'
                      ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                      : account.role === 'auditor'
                      ? 'bg-purple-50 text-purple-700 border border-purple-200'
                      : 'bg-blue-50 text-blue-700 border border-blue-200'
                  }`}
                >
                  {account.role}
                </span>
              </div>

              <p className="text-xs text-slate-600 leading-relaxed">{account.notes}</p>

              <div className="border-t border-slate-100 pt-2 text-[11px] text-slate-400">
                Provisioning path: <span className="font-mono text-slate-600">{account.provisioning}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
