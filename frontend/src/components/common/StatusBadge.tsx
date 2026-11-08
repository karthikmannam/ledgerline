import React from 'react';
import { cn } from '@/lib/utils';
import { CheckCircle2, Clock, XCircle, ShieldAlert, User, ShieldCheck } from 'lucide-react';

interface StatusBadgeProps {
  status: string;
  type?: 'account' | 'deposit' | 'adjustment' | 'side' | 'role';
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, type, className }) => {
  const normalized = status.toLowerCase();

  let styles = 'bg-slate-100 text-slate-700 border-slate-200';
  let icon: React.ReactNode = null;
  let label = status;

  if (normalized === 'active' || normalized === 'verified' || normalized === 'approved') {
    styles = 'bg-emerald-50 text-emerald-700 border-emerald-200';
    icon = <CheckCircle2 className="h-3 w-3" />;
    label = normalized === 'active' ? 'Active' : normalized === 'verified' ? 'Verified' : 'Approved';
  } else if (normalized === 'pending') {
    styles = 'bg-amber-50 text-amber-700 border-amber-200';
    icon = <Clock className="h-3 w-3" />;
    label = 'Pending Review';
  } else if (normalized === 'suspended' || normalized === 'rejected') {
    styles = 'bg-rose-50 text-rose-700 border-rose-200';
    icon = <XCircle className="h-3 w-3" />;
    label = normalized === 'suspended' ? 'Suspended' : 'Rejected';
  } else if (normalized === 'credit') {
    styles = 'bg-emerald-50 text-emerald-700 border-emerald-200';
    label = 'CREDIT';
  } else if (normalized === 'debit') {
    styles = 'bg-rose-50 text-rose-700 border-rose-200';
    label = 'DEBIT';
  } else if (normalized === 'admin') {
    styles = 'bg-indigo-50 text-indigo-700 border-indigo-200';
    icon = <ShieldCheck className="h-3 w-3" />;
    label = 'Administrator';
  } else if (normalized === 'auditor') {
    styles = 'bg-purple-50 text-purple-700 border-purple-200';
    icon = <ShieldAlert className="h-3 w-3" />;
    label = 'Auditor';
  } else if (normalized === 'holder') {
    styles = 'bg-blue-50 text-blue-700 border-blue-200';
    icon = <User className="h-3 w-3" />;
    label = 'Account Holder';
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider',
        styles,
        className
      )}
    >
      {icon}
      {label}
    </span>
  );
};
