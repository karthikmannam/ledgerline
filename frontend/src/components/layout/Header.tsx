import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { StatusBadge } from '@/components/common/StatusBadge';
import { LogOut, Activity, Menu, Shield } from 'lucide-react';
import { getHealthReadyApi } from '@/api';

interface HeaderProps {
  onToggleSidebar: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onToggleSidebar }) => {
  const { user, logout } = useAuth();
  const [isBackendReady, setIsBackendReady] = useState<boolean | null>(null);

  useEffect(() => {
    let mounted = true;
    const checkHealth = async () => {
      try {
        const res = await getHealthReadyApi();
        if (mounted) setIsBackendReady(res.status === 'ok');
      } catch {
        if (mounted) setIsBackendReady(false);
      }
    };
    checkHealth();
    const interval = setInterval(checkHealth, 30000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  return (
    <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onToggleSidebar}
          className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700 lg:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-2 text-xs text-slate-500 font-medium hidden sm:flex">
          <span className="flex h-2 w-2 rounded-full relative">
            <span
              className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                isBackendReady === true
                  ? 'bg-emerald-400'
                  : isBackendReady === false
                  ? 'bg-rose-400'
                  : 'bg-amber-400'
              }`}
            />
            <span
              className={`relative inline-flex rounded-full h-2 w-2 ${
                isBackendReady === true
                  ? 'bg-emerald-500'
                  : isBackendReady === false
                  ? 'bg-rose-500'
                  : 'bg-amber-500'
              }`}
            />
          </span>
          <span>{isBackendReady ? 'Ledger Network Online' : 'Connecting to API...'}</span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        {user && (
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <p className="text-xs font-semibold text-slate-900">{user.email}</p>
              <p className="text-[10px] font-mono text-slate-400 truncate max-w-[150px]">
                ID: {user.id.slice(0, 8)}...
              </p>
            </div>
            <StatusBadge status={user.role} type="role" />
          </div>
        )}

        <div className="h-6 w-px bg-slate-200 hidden sm:block" />

        <button
          onClick={() => logout()}
          title="Sign out of your session"
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors"
        >
          <LogOut className="h-3.5 w-3.5 text-slate-500" />
          <span>Logout</span>
        </button>
      </div>
    </header>
  );
};
