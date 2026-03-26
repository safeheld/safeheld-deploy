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
import RegMonitorPage from './pages/admin/RegMonitorPage';
import DeepIngestionPage from './pages/admin/DeepIngestionPage';
import BillingPage from './pages/admin/BillingPage';
import AuditPage from './pages/audit/AuditPage';
import BankDashboardPage from './pages/bank-dashboard/BankDashboardPage';
import CassPage from './pages/cass/CassPage';
import CryptoPage from './pages/crypto/CryptoPage';
import StablecoinPage from './pages/stablecoin/StablecoinPage';
import ResolutionPackPage from './pages/resolution-pack/ResolutionPackPage';
import FcaReturnsPage from './pages/fca-returns/FcaReturnsPage';
import AuditSupportPage from './pages/audit-support/AuditSupportPage';
import AcknowledgementLettersPage from './pages/acknowledgement-letters/AcknowledgementLettersPage';
import ThirdPartyDdPage from './pages/third-party-dd/ThirdPartyDdPage';
import InsuranceManagementPage from './pages/insurance-management/InsuranceManagementPage';
import PolicyLibraryPage from './pages/policy-library/PolicyLibraryPage';
import SafeguardingTimingPage from './pages/safeguarding-timing/SafeguardingTimingPage';

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
  if (user?.role !== 'BANK_VIEWER' && user?.role !== 'ADMIN') return <Navigate to="/" replace />;
  return <>{children}</>;
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
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="upload" element={<UploadPage />} />
        <Route path="reconciliation" element={<ReconciliationPage />} />
        <Route path="breach" element={<BreachPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="governance" element={<GovernancePage />} />
        <Route path="cass" element={<CassPage />} />
        <Route path="crypto" element={<CryptoPage />} />
        <Route path="stablecoin" element={<StablecoinPage />} />
        <Route path="resolution-pack" element={<ResolutionPackPage />} />
        <Route path="fca-returns" element={<FcaReturnsPage />} />
        <Route path="audit-support" element={<AuditSupportPage />} />
        <Route path="acknowledgement-letters" element={<AcknowledgementLettersPage />} />
        <Route path="third-party-dd" element={<ThirdPartyDdPage />} />
        <Route path="insurance-management" element={<InsuranceManagementPage />} />
        <Route path="policy-library" element={<PolicyLibraryPage />} />
        <Route path="safeguarding-timing" element={<SafeguardingTimingPage />} />
        <Route path="audit" element={<AuditPage />} />
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
        <Route
          path="admin/reg-monitor"
          element={
            <AdminRoute>
              <RegMonitorPage />
            </AdminRoute>
          }
        />
        <Route
          path="admin/deep-ingestion"
          element={
            <AdminRoute>
              <DeepIngestionPage />
            </AdminRoute>
          }
        />
        <Route
          path="admin/billing"
          element={
            <AdminRoute>
              <BillingPage />
            </AdminRoute>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
