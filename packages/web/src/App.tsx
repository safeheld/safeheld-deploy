import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import Layout from './components/layout/Layout';

// Pages
import LoginPage from './pages/auth/Login';
import MfaPage from './pages/auth/Mfa';
import DashboardPage from './pages/dashboard/Dashboard';
import UploadPage from './pages/upload/Upload';
import ReconciliationPage from './pages/reconciliation/ReconciliationPage';
import BreachPage from './pages/breach/BreachPage';
import ReportsPage from './pages/reports/ReportsPage';
import GovernancePage from './pages/governance/GovernancePage';
import AdminPage from './pages/admin/AdminPage';
import AuditPage from './pages/audit/AuditPage';
import BankDashboardPage from './pages/bank-dashboard/BankDashboardPage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <div className="spinner" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (user?.role !== 'ADMIN') return <Navigate to="/" replace />;
  return <>{children}</>;
}

function BankViewerRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (user?.role !== 'BANK_VIEWER') return <Navigate to="/" replace />;
  return <>{children}</>;
}

function FirmRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (user?.role === 'BANK_VIEWER') return <Navigate to="/bank-dashboard" replace />;
  return <>{children}</>;
}

function DefaultRedirect() {
  const { user } = useAuth();
  if (user?.role === 'BANK_VIEWER') return <Navigate to="/bank-dashboard" replace />;
  return <Navigate to="/dashboard" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/mfa" element={<MfaPage />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DefaultRedirect />} />
        <Route path="dashboard" element={<FirmRoute><DashboardPage /></FirmRoute>} />
        <Route path="upload" element={<FirmRoute><UploadPage /></FirmRoute>} />
        <Route path="reconciliation" element={<FirmRoute><ReconciliationPage /></FirmRoute>} />
        <Route path="breach" element={<FirmRoute><BreachPage /></FirmRoute>} />
        <Route path="reports" element={<FirmRoute><ReportsPage /></FirmRoute>} />
        <Route path="governance" element={<FirmRoute><GovernancePage /></FirmRoute>} />
        <Route path="audit" element={<FirmRoute><AuditPage /></FirmRoute>} />
        <Route
          path="bank-dashboard"
          element={
            <BankViewerRoute>
              <BankDashboardPage />
            </BankViewerRoute>
          }
        />
        <Route
          path="admin"
          element={
            <AdminRoute>
              <AdminPage />
            </AdminRoute>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
