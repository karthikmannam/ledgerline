import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { AppShell } from '@/components/layout/AppShell';

// Auth pages
import { LoginPage } from '@/pages/auth/LoginPage';
import { RegisterPage } from '@/pages/auth/RegisterPage';

// Holder pages
import { HolderDashboardPage } from '@/pages/holder/DashboardPage';
import { AccountsPage } from '@/pages/holder/AccountsPage';
import { AccountDetailPage } from '@/pages/holder/AccountDetailPage';
import { TransferPage } from '@/pages/holder/TransferPage';
import { WithdrawPage } from '@/pages/holder/WithdrawPage';
import { DepositRequestPage } from '@/pages/holder/DepositRequestPage';

// Admin pages
import { AdminDashboardPage } from '@/pages/admin/AdminDashboardPage';
import { AdminAccountsPage } from '@/pages/admin/AdminAccountsPage';
import { AdminDepositsPage } from '@/pages/admin/AdminDepositsPage';
import { AdminAdjustmentsPage } from '@/pages/admin/AdminAdjustmentsPage';
import { AdminReversalsPage } from '@/pages/admin/AdminReversalsPage';
import { AdminAuditPage } from '@/pages/admin/AdminAuditPage';
import { AdminUsersPage } from '@/pages/admin/AdminUsersPage';

// Auditor pages
import { AuditorDashboardPage } from '@/pages/auditor/AuditorDashboardPage';
import { ReconciliationPage } from '@/pages/auditor/ReconciliationPage';
import { AuditEventsPage } from '@/pages/auditor/AuditEventsPage';
import { AttemptsPage } from '@/pages/auditor/AttemptsPage';
import { TransactionInspectorPage } from '@/pages/auditor/TransactionInspectorPage';

const RootRedirect: React.FC = () => {
  const { user, isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  if (user.role === 'admin') return <Navigate to="/admin" replace />;
  if (user.role === 'auditor') return <Navigate to="/auditor" replace />;
  return <Navigate to="/dashboard" replace />;
};

export const AppRouter: React.FC = () => {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      {/* Root redirect */}
      <Route path="/" element={<RootRedirect />} />

      {/* Protected application shell */}
      <Route
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        {/* Account Holder routes */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute allowedRoles={['holder', 'admin']}>
              <HolderDashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/accounts"
          element={
            <ProtectedRoute allowedRoles={['holder', 'admin']}>
              <AccountsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/accounts/:id"
          element={
            <ProtectedRoute allowedRoles={['holder', 'admin', 'auditor']}>
              <AccountDetailPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/transfers"
          element={
            <ProtectedRoute allowedRoles={['holder', 'admin']}>
              <TransferPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/withdrawals"
          element={
            <ProtectedRoute allowedRoles={['holder', 'admin']}>
              <WithdrawPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/deposits"
          element={
            <ProtectedRoute allowedRoles={['holder', 'admin']}>
              <DepositRequestPage />
            </ProtectedRoute>
          }
        />

        {/* Institutional Admin routes */}
        <Route
          path="/admin"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <AdminDashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/accounts"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <AdminAccountsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/deposits"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <AdminDepositsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/adjustments"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <AdminAdjustmentsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/reversals"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <AdminReversalsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/audit"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <AdminAuditPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/users"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <AdminUsersPage />
            </ProtectedRoute>
          }
        />

        {/* Independent Auditor routes */}
        <Route
          path="/auditor"
          element={
            <ProtectedRoute allowedRoles={['auditor', 'admin']}>
              <AuditorDashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/auditor/reconciliation"
          element={
            <ProtectedRoute allowedRoles={['auditor', 'admin']}>
              <ReconciliationPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/auditor/events"
          element={
            <ProtectedRoute allowedRoles={['auditor', 'admin']}>
              <AuditEventsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/auditor/attempts"
          element={
            <ProtectedRoute allowedRoles={['auditor', 'admin']}>
              <AttemptsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/auditor/transactions"
          element={
            <ProtectedRoute allowedRoles={['auditor', 'admin']}>
              <TransactionInspectorPage />
            </ProtectedRoute>
          }
        />
      </Route>

      {/* 404 Catch-all */}
      <Route
        path="*"
        element={
          <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 text-center p-6">
            <h1 className="text-4xl font-extrabold text-slate-900">404</h1>
            <p className="mt-2 text-sm text-slate-500">The requested page or route does not exist.</p>
            <a
              href="/"
              className="mt-6 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow hover:bg-blue-700"
            >
              Return Home
            </a>
          </div>
        }
      />
    </Routes>
  );
};
