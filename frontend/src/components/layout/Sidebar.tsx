import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Wallet,
  ArrowRightLeft,
  ArrowDownToLine,
  ArrowUpFromLine,
  ShieldCheck,
  ClipboardList,
  Scale,
  RotateCcw,
  SlidersHorizontal,
  History,
  AlertOctagon,
  Users,
  Search,
  BookOpen,
  X,
} from 'lucide-react';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
  const { user } = useAuth();
  const role = user?.role;

  const holderLinks = [
    { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/accounts', label: 'My Accounts', icon: Wallet },
    { to: '/transfers', label: 'Money Transfers', icon: ArrowRightLeft },
    { to: '/withdrawals', label: 'Withdraw Funds', icon: ArrowUpFromLine },
    { to: '/deposits', label: 'Deposit Requests', icon: ArrowDownToLine },
  ];

  const adminLinks = [
    { to: '/admin', label: 'Admin Overview', icon: LayoutDashboard },
    { to: '/admin/accounts', label: 'Accounts Management', icon: Wallet },
    { to: '/admin/deposits', label: 'Deposit Verification', icon: ClipboardList },
    { to: '/admin/adjustments', label: 'Ledger Adjustments', icon: SlidersHorizontal },
    { to: '/admin/reversals', label: 'Transaction Reversals', icon: RotateCcw },
    { to: '/admin/audit', label: 'System Audit Trail', icon: History },
    { to: '/admin/users', label: 'User Management', icon: Users },
  ];

  const auditorLinks = [
    { to: '/auditor', label: 'Auditor Overview', icon: LayoutDashboard },
    { to: '/auditor/events', label: 'Audit Events Trail', icon: History },
    { to: '/auditor/attempts', label: 'Refused Attempts', icon: AlertOctagon },
    { to: '/auditor/reconciliation', label: 'Ledger Reconciliation', icon: Scale },
    { to: '/auditor/transactions', label: 'Transaction Inspector', icon: Search },
  ];

  const links = role === 'admin'
    ? adminLinks
    : role === 'auditor'
    ? auditorLinks
    : holderLinks;

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm lg:hidden"
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-slate-200 bg-slate-900 text-white transition-transform duration-300 ease-in-out lg:static lg:translate-x-0',
          isOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Brand Header */}
        <div className="flex h-16 items-center justify-between border-b border-slate-800 px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white font-bold shadow-md shadow-blue-500/20">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <span className="text-base font-bold tracking-tight text-white">LedgerLine</span>
              <p className="text-[10px] uppercase font-semibold tracking-wider text-blue-400">
                Verifiable Ledger
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Role Portal Indicator */}
        <div className="mx-4 my-3 rounded-lg bg-slate-800/80 px-3.5 py-2.5 border border-slate-700/60">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Portal View</p>
          <p className="text-xs font-semibold text-white mt-0.5">
            {role === 'admin'
              ? 'Institutional Administrator'
              : role === 'auditor'
              ? 'Independent Auditor'
              : 'Account Holder Portal'}
          </p>
        </div>

        {/* Navigation list */}
        <nav className="flex-1 space-y-1 px-3 py-2 overflow-y-auto">
          {links.map((link) => {
            const Icon = link.icon;
            return (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.to === '/dashboard' || link.to === '/admin' || link.to === '/auditor'}
                onClick={() => onClose()}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-lg px-3.5 py-2.5 text-xs font-semibold transition-colors',
                    isActive
                      ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/30'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  )
                }
              >
                <Icon className="h-4 w-4 flex-shrink-0" />
                <span>{link.label}</span>
              </NavLink>
            );
          })}
        </nav>

        {/* Financial Guarantee Badge */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/40">
          <div className="flex items-center gap-2 text-slate-400">
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
            <span className="text-[11px] font-medium text-slate-300">
              Double-Entry Invariant Guard
            </span>
          </div>
          <p className="mt-1 text-[10px] text-slate-500 leading-normal">
            Append-only journal. All transactions verified by cryptographic SHA-256 session seals.
          </p>
        </div>
      </aside>
    </>
  );
};
