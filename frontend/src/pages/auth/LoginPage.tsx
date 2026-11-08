import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { BookOpen, Lock, Mail, ArrowRight, AlertCircle, KeyRound } from 'lucide-react';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please enter both email and password');
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      const user = await login(email, password);
      // Redirect according to authenticated role
      if (user.role === 'admin') {
        navigate('/admin');
      } else if (user.role === 'auditor') {
        navigate('/auditor');
      } else {
        navigate('/dashboard');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Invalid credentials';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Demo credential quick-fill helpers
  const fillDemo = (demoEmail: string, demoPass: string) => {
    setEmail(demoEmail);
    setPassword(demoPass);
    setError(null);
  };

  return (
    <div className="flex min-h-screen bg-slate-900 text-slate-100">
      {/* Left panel - Brand & Info */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 border-r border-slate-800">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white font-bold shadow-lg shadow-blue-500/30">
              <BookOpen className="h-6 w-6" />
            </div>
            <div>
              <span className="text-xl font-bold tracking-tight text-white">LedgerLine</span>
              <p className="text-xs uppercase font-semibold tracking-wider text-blue-400">
                Verifiable Financial Ledger
              </p>
            </div>
          </div>

          <div className="mt-16 space-y-6">
            <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
              Money movement with a ledger you can prove.
            </h1>
            <p className="text-sm text-slate-400 leading-relaxed max-w-lg">
              Built on immutable double-entry accounting principles. Every paise moved is preserved by atomic
              cryptographic invariants, deterministic concurrency locks, and complete audit traceability.
            </p>

            <div className="grid grid-cols-2 gap-4 pt-6">
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                <p className="text-xs font-semibold uppercase text-blue-400">Strict Invariants</p>
                <p className="mt-1 text-xs text-slate-400">
                  Zero floating point math. Pure integer paise with balance conservation checks.
                </p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                <p className="text-xs font-semibold uppercase text-emerald-400">Append-Only</p>
                <p className="mt-1 text-xs text-slate-400">
                  Journals are immutable. Corrections are made solely via compensating reversals.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="text-xs text-slate-500">
          Secure Core: Node.js 22, Express 5, PostgreSQL 18, Argon2id, HttpOnly Cookies
        </div>
      </div>

      {/* Right panel - Form */}
      <div className="flex flex-1 items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md space-y-8 bg-slate-900/40 p-8 rounded-2xl border border-slate-800 backdrop-blur-sm shadow-2xl">
          <div className="text-center sm:text-left">
            <div className="lg:hidden flex items-center justify-center gap-2 mb-6">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white font-bold">
                <BookOpen className="h-5 w-5" />
              </div>
              <span className="text-lg font-bold text-white">LedgerLine</span>
            </div>

            <h2 className="text-2xl font-bold tracking-tight text-white">Sign In</h2>
            <p className="mt-1 text-xs text-slate-400">
              Access your financial accounts, administrative controls, or audit tools.
            </p>
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3.5 text-xs font-medium text-rose-300">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
                Email Address
              </label>
              <div className="relative mt-1 rounded-md shadow-sm">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500">
                  <Mail className="h-4 w-4" />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@ledgerline.dev"
                  className="block w-full rounded-lg border border-slate-700 bg-slate-800/80 py-2.5 pl-10 pr-4 text-xs text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
                  Password
                </label>
              </div>
              <div className="relative mt-1 rounded-md shadow-sm">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500">
                  <Lock className="h-4 w-4" />
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="block w-full rounded-lg border border-slate-700 bg-slate-800/80 py-2.5 pl-10 pr-4 text-xs text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white shadow-md shadow-blue-600/30 hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-900 disabled:opacity-50"
            >
              {isSubmitting ? 'Authenticating...' : 'Sign In'}
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>

          {/* Quick Demo Credentials for Review/Demo */}
          <div className="pt-4 border-t border-slate-800">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2.5">
              <KeyRound className="h-3.5 w-3.5 text-blue-400" />
              Quick-Fill Test Credentials
            </p>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => fillDemo('holder1@ledgerline.dev', 'HolderPass123!')}
                className="rounded-lg border border-slate-800 bg-slate-800/40 p-2 text-left hover:border-slate-700 hover:bg-slate-800 transition-colors"
              >
                <p className="text-[10px] font-bold text-blue-400 uppercase">Holder 1</p>
                <p className="text-[10px] text-slate-400 truncate">holder1@ledgerline.dev</p>
              </button>
              <button
                type="button"
                onClick={() => fillDemo('admin@ledgerline.dev', 'AdminPass123!')}
                className="rounded-lg border border-slate-800 bg-slate-800/40 p-2 text-left hover:border-slate-700 hover:bg-slate-800 transition-colors"
              >
                <p className="text-[10px] font-bold text-indigo-400 uppercase">Admin</p>
                <p className="text-[10px] text-slate-400 truncate">admin@ledgerline.dev</p>
              </button>
              <button
                type="button"
                onClick={() => fillDemo('auditor@ledgerline.dev', 'AuditorPass123!')}
                className="rounded-lg border border-slate-800 bg-slate-800/40 p-2 text-left hover:border-slate-700 hover:bg-slate-800 transition-colors"
              >
                <p className="text-[10px] font-bold text-purple-400 uppercase">Auditor</p>
                <p className="text-[10px] text-slate-400 truncate">auditor@ledgerline.dev</p>
              </button>
            </div>
          </div>

          <p className="text-center text-xs text-slate-400">
            Need an account?{' '}
            <Link to="/register" className="font-semibold text-blue-400 hover:text-blue-300">
              Register as Account Holder
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};
