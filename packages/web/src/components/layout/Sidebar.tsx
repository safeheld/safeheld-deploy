import React from 'react';
import { NavLink } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../hooks/useAuth';
import { adminApi } from '../../api/client';

interface NavItem {
  path: string;
  label: string;
  icon: string;
  roles?: string[];
  regimes?: string[];
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

// Regime-based visibility for regulatory module sidebar items
// Payments/EMI firms see PS25/CASS, Crypto see MiCA/Crypto, etc.
const PAYMENTS_REGIMES = ['PS25_PI', 'PS25_EMI', 'PS25_SMALL_EMI', 'PSD2_PI', 'PSD2_EMI'];
const INVESTMENT_REGIMES = ['CASS5', 'CASS6', 'CASS7', 'CASS10', 'CASS15'];
const CRYPTO_REGIMES = ['MICA_CUSTODY', 'MICA_CASP', 'MICA_EMT'];
const ALL_REGIMES_THAT_SEE_CASS = [...PAYMENTS_REGIMES, ...INVESTMENT_REGIMES, 'CASS15'];
const ALL_REGIMES_THAT_SEE_CRYPTO = [...CRYPTO_REGIMES, 'GENIUS_ACT'];

const navGroups: NavGroup[] = [
  {
    label: 'Core',
    items: [
      { path: '/dashboard', label: 'Dashboard', icon: '▦' },
      { path: '/upload', label: 'Data Upload', icon: '↑', roles: ['COMPLIANCE_OFFICER', 'FINANCE_OPS', 'ADMIN'] },
      { path: '/reconciliation', label: 'Reconciliation', icon: '⇄' },
      { path: '/breach', label: 'Breaches', icon: '⚠' },
    ],
  },
  {
    label: 'Reports & Evidence',
    items: [
      { path: '/reports', label: 'Reports', icon: '≡' },
      { path: '/resolution-pack', label: 'Resolution Pack', icon: '▤', roles: ['COMPLIANCE_OFFICER', 'ADMIN'] },
      { path: '/audit-support', label: 'Audit Support', icon: '⊡', roles: ['COMPLIANCE_OFFICER', 'ADMIN', 'AUDITOR'] },
      { path: '/audit', label: 'Audit Log', icon: '◎', roles: ['COMPLIANCE_OFFICER', 'ADMIN', 'AUDITOR'] },
    ],
  },
  {
    label: 'Regulatory Returns',
    items: [
      { path: '/fca-returns', label: 'FCA Returns', icon: '▧', roles: ['COMPLIANCE_OFFICER', 'ADMIN'] },
      { path: '/safeguarding-timing', label: 'Safeguarding Timing', icon: '◔', roles: ['COMPLIANCE_OFFICER', 'FINANCE_OPS', 'ADMIN'] },
    ],
  },
  {
    label: 'Compliance',
    items: [
      { path: '/governance', label: 'Governance', icon: '⊙' },
      { path: '/acknowledgement-letters', label: 'Ack. Letters', icon: '✉', roles: ['COMPLIANCE_OFFICER', 'ADMIN'] },
      { path: '/policy-library', label: 'Policy Library', icon: '▨', roles: ['COMPLIANCE_OFFICER', 'ADMIN', 'AUDITOR'] },
    ],
  },
  {
    label: 'Risk Management',
    items: [
      { path: '/third-party-dd', label: 'Third-Party DD', icon: '◈', roles: ['COMPLIANCE_OFFICER', 'ADMIN'] },
      { path: '/insurance-management', label: 'Insurance', icon: '◑', roles: ['COMPLIANCE_OFFICER', 'ADMIN'] },
    ],
  },
  {
    label: 'Regulatory Modules',
    items: [
      { path: '/cass', label: 'CASS', icon: '§', roles: ['COMPLIANCE_OFFICER', 'FINANCE_OPS', 'AUDITOR', 'ADMIN'], regimes: ALL_REGIMES_THAT_SEE_CASS },
      { path: '/crypto', label: 'Crypto', icon: '₿', roles: ['COMPLIANCE_OFFICER', 'FINANCE_OPS', 'AUDITOR', 'ADMIN'], regimes: ALL_REGIMES_THAT_SEE_CRYPTO },
      { path: '/stablecoin', label: 'Stablecoin', icon: '$', roles: ['COMPLIANCE_OFFICER', 'FINANCE_OPS', 'AUDITOR', 'ADMIN'], regimes: [...ALL_REGIMES_THAT_SEE_CRYPTO] },
    ],
  },
  {
    label: 'Bank',
    items: [
      { path: '/bank-dashboard', label: 'Bank Dashboard', icon: '⊞', roles: ['BANK_VIEWER', 'ADMIN'] },
    ],
  },
  {
    label: 'Administration',
    items: [
      { path: '/admin', label: 'Admin', icon: '⚙', roles: ['ADMIN'] },
      { path: '/admin/reg-monitor', label: 'Reg Monitor', icon: '⊕', roles: ['ADMIN'] },
      { path: '/admin/deep-ingestion', label: 'Deep Ingestion', icon: '⊘', roles: ['ADMIN'] },
      { path: '/admin/billing', label: 'Billing', icon: '£', roles: ['ADMIN'] },
    ],
  },
];

const linkStyle = (isActive: boolean): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  padding: '8px 16px',
  borderRadius: '6px',
  color: isActive ? 'white' : 'rgba(255,255,255,0.7)',
  background: isActive ? 'rgba(255,255,255,0.15)' : 'transparent',
  fontWeight: isActive ? 600 : 400,
  textDecoration: 'none',
  transition: 'all 0.15s',
  fontSize: '13px',
});

export default function Sidebar() {
  const { user } = useAuth();
  const role = user?.role || '';
  const firmId = user?.firmId;

  // Fetch firm data to get regime for filtering regulatory modules
  const { data: firmData } = useQuery({
    queryKey: ['firm-sidebar', firmId],
    queryFn: () => adminApi.getFirm(firmId!),
    enabled: !!firmId && role === 'ADMIN',
    staleTime: 5 * 60 * 1000,
  });

  // For non-admin users, regime is not directly available — show all non-regime-filtered items
  // Admin users get regime-filtered views
  const firmRegime = (firmData as any)?.regime as string | undefined;

  return (
    <nav style={{
      width: '230px',
      minWidth: '230px',
      background: 'var(--color-primary)',
      display: 'flex',
      flexDirection: 'column',
      padding: '0',
      boxShadow: '2px 0 8px rgba(0,0,0,0.15)',
    }}>
      <div style={{
        padding: '20px 16px',
        borderBottom: '1px solid rgba(255,255,255,0.1)',
        marginBottom: '4px',
      }}>
        <div style={{ color: 'white', fontWeight: 700, fontSize: '18px', letterSpacing: '-0.5px' }}>
          Safeheld
        </div>
        <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '11px', marginTop: '2px' }}>
          Safeguarding Compliance
        </div>
      </div>

      <div style={{ flex: 1, padding: '2px 8px', overflowY: 'auto' }}>
        {navGroups.map(group => {
          const visibleItems = group.items.filter(item => {
            // Role-based filter
            if (item.roles && !item.roles.includes(role)) return false;
            // Regime-based filter — only apply if we know the regime AND the item has regime restriction
            // Admin always sees everything
            if (item.regimes && role !== 'ADMIN' && firmRegime) {
              if (!item.regimes.includes(firmRegime)) return false;
            }
            return true;
          });
          if (visibleItems.length === 0) return null;

          return (
            <div key={group.label} style={{ marginBottom: '6px' }}>
              <div style={{
                padding: '8px 16px 4px',
                fontSize: '10px',
                fontWeight: 600,
                color: 'rgba(255,255,255,0.35)',
                textTransform: 'uppercase',
                letterSpacing: '0.8px',
              }}>
                {group.label}
              </div>
              {visibleItems.map(item => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  style={({ isActive }) => linkStyle(isActive)}
                >
                  <span style={{ fontSize: '14px', width: '18px', textAlign: 'center' }}>{item.icon}</span>
                  {item.label}
                </NavLink>
              ))}
            </div>
          );
        })}
      </div>

      <div style={{
        padding: '12px 16px',
        borderTop: '1px solid rgba(255,255,255,0.1)',
        color: 'rgba(255,255,255,0.6)',
        fontSize: '12px',
      }}>
        <div style={{ color: 'rgba(255,255,255,0.9)', fontWeight: 500 }}>{user?.name}</div>
        <div style={{ marginTop: '2px' }}>{user?.role?.replace(/_/g, ' ')}</div>
      </div>
    </nav>
  );
}
