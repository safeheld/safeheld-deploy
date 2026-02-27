import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

interface NavItem {
  path: string;
  label: string;
  icon: string;
  roles?: string[];
}

const navItems: NavItem[] = [
  { path: '/dashboard', label: 'Dashboard', icon: '▦' },
  { path: '/upload', label: 'Data Upload', icon: '↑', roles: ['COMPLIANCE_OFFICER', 'FINANCE_OPS', 'ADMIN'] },
  { path: '/reconciliation', label: 'Reconciliation', icon: '⇄' },
  { path: '/breach', label: 'Breaches', icon: '⚠' },
  { path: '/reports', label: 'Reports', icon: '≡' },
  { path: '/governance', label: 'Governance', icon: '⊙' },
  { path: '/audit', label: 'Audit Log', icon: '◎', roles: ['COMPLIANCE_OFFICER', 'ADMIN', 'AUDITOR'] },
  { path: '/bank-dashboard', label: 'Bank Dashboard', icon: '⊞', roles: ['BANK_VIEWER', 'ADMIN'] },
  { path: '/admin', label: 'Admin', icon: '⚙', roles: ['ADMIN'] },
];

const linkStyle = (isActive: boolean): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  padding: '10px 16px',
  borderRadius: '6px',
  color: isActive ? 'white' : 'rgba(255,255,255,0.7)',
  background: isActive ? 'rgba(255,255,255,0.15)' : 'transparent',
  fontWeight: isActive ? 600 : 400,
  textDecoration: 'none',
  transition: 'all 0.15s',
  fontSize: '14px',
});

export default function Sidebar() {
  const { user } = useAuth();

  const visibleItems = navItems.filter(item =>
    !item.roles || item.roles.includes(user?.role || '')
  );

  return (
    <nav style={{
      width: '220px',
      minWidth: '220px',
      background: 'var(--color-primary)',
      display: 'flex',
      flexDirection: 'column',
      padding: '0',
      boxShadow: '2px 0 8px rgba(0,0,0,0.15)',
    }}>
      {/* Logo */}
      <div style={{
        padding: '20px 16px',
        borderBottom: '1px solid rgba(255,255,255,0.1)',
        marginBottom: '8px',
      }}>
        <div style={{ color: 'white', fontWeight: 700, fontSize: '18px', letterSpacing: '-0.5px' }}>
          Safeheld
        </div>
        <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '11px', marginTop: '2px' }}>
          Safeguarding Compliance
        </div>
      </div>

      {/* Nav Items */}
      <div style={{ flex: 1, padding: '4px 8px', overflowY: 'auto' }}>
        {visibleItems.map(item => (
          <NavLink
            key={item.path}
            to={item.path}
            style={({ isActive }) => linkStyle(isActive)}
            onMouseEnter={(e) => {
              if (!(e.currentTarget as HTMLElement).className.includes('active')) {
                (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.08)';
                (e.currentTarget as HTMLElement).style.color = 'white';
              }
            }}
            onMouseLeave={(e) => {
              const isActive = window.location.pathname.startsWith(item.path);
              if (!isActive) {
                (e.currentTarget as HTMLElement).style.background = 'transparent';
                (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.7)';
              }
            }}
          >
            <span style={{ fontSize: '16px', width: '20px', textAlign: 'center' }}>{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </div>

      {/* User info */}
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
