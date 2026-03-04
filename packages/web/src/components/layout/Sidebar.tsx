import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

// ─── SVG Icons (18x18, strokeWidth=1.5) ──────────────────────────────────────

const icons: Record<string, React.ReactNode> = {
  dashboard: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  ),
  upload: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  ),
  reconciliation: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
  ),
  breach: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 9v4" /><path d="M12 17h.01" />
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    </svg>
  ),
  reports: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" />
    </svg>
  ),
  governance: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  ),
  audit: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
    </svg>
  ),
  bank: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="22" x2="21" y2="22" /><line x1="6" y1="18" x2="6" y2="11" /><line x1="10" y1="18" x2="10" y2="11" />
      <line x1="14" y1="18" x2="14" y2="11" /><line x1="18" y1="18" x2="18" y2="11" />
      <polygon points="12 2 20 7 4 7" />
    </svg>
  ),
  admin: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
};

interface NavItem {
  path: string;
  label: string;
  icon: string;
  roles?: string[];
}

const navItems: NavItem[] = [
  { path: '/dashboard', label: 'Dashboard', icon: 'dashboard', roles: ['COMPLIANCE_OFFICER', 'FINANCE_OPS', 'AUDITOR', 'ADMIN'] },
  { path: '/upload', label: 'Data Upload', icon: 'upload', roles: ['COMPLIANCE_OFFICER', 'FINANCE_OPS', 'ADMIN'] },
  { path: '/reconciliation', label: 'Reconciliation', icon: 'reconciliation', roles: ['COMPLIANCE_OFFICER', 'FINANCE_OPS', 'AUDITOR', 'ADMIN'] },
  { path: '/breach', label: 'Breaches', icon: 'breach', roles: ['COMPLIANCE_OFFICER', 'FINANCE_OPS', 'AUDITOR', 'ADMIN'] },
  { path: '/reports', label: 'Reports', icon: 'reports', roles: ['COMPLIANCE_OFFICER', 'FINANCE_OPS', 'AUDITOR', 'ADMIN'] },
  { path: '/governance', label: 'Governance', icon: 'governance', roles: ['COMPLIANCE_OFFICER', 'FINANCE_OPS', 'AUDITOR', 'ADMIN'] },
  { path: '/audit', label: 'Audit Log', icon: 'audit', roles: ['COMPLIANCE_OFFICER', 'ADMIN', 'AUDITOR'] },
  { path: '/bank-dashboard', label: 'Bank Dashboard', icon: 'bank', roles: ['BANK_VIEWER'] },
  { path: '/admin', label: 'Admin', icon: 'admin', roles: ['ADMIN'] },
];

const linkBase: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  padding: '9px 16px',
  borderRadius: 'var(--radius-md)',
  textDecoration: 'none',
  transition: 'all var(--transition-fast)',
  fontSize: '13px',
  fontWeight: 500,
  letterSpacing: '-0.01em',
  marginBottom: '2px',
};

export default function Sidebar() {
  const { user } = useAuth();

  const visibleItems = navItems.filter(item =>
    !item.roles || item.roles.includes(user?.role || '')
  );

  return (
    <nav style={{
      width: 'var(--sidebar-width)',
      minWidth: 'var(--sidebar-width)',
      background: 'var(--sidebar-bg)',
      display: 'flex',
      flexDirection: 'column',
      borderRight: '1px solid rgba(255,255,255,0.06)',
    }}>
      {/* Logo */}
      <div style={{
        padding: '24px 20px 20px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '10px',
        }}>
          <div style={{
            width: '32px', height: '32px',
            background: 'var(--color-accent)',
            borderRadius: 'var(--radius-md)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 800, color: 'white', fontSize: '14px',
            boxShadow: '0 1px 3px rgb(99 102 241 / 0.3)',
          }}>
            S
          </div>
          <div>
            <div style={{
              color: 'white', fontWeight: 700, fontSize: '16px',
              letterSpacing: '-0.03em',
              lineHeight: 1.2,
            }}>
              Safeheld
            </div>
            <div style={{
              color: 'rgba(148, 163, 184, 0.8)',
              fontSize: '11px',
              letterSpacing: '0.02em',
            }}>
              Compliance Platform
            </div>
          </div>
        </div>
      </div>

      {/* Nav Section Label */}
      <div style={{
        padding: '20px 20px 8px',
        fontSize: '10px',
        fontWeight: 600,
        color: 'rgba(148, 163, 184, 0.5)',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
      }}>
        Navigation
      </div>

      {/* Nav Items */}
      <div style={{ flex: 1, padding: '0 12px', overflowY: 'auto' }}>
        {visibleItems.map(item => (
          <NavLink
            key={item.path}
            to={item.path}
            style={({ isActive }) => ({
              ...linkBase,
              color: isActive ? 'white' : 'rgba(203, 213, 225, 0.7)',
              background: isActive
                ? 'rgba(99, 102, 241, 0.2)'
                : 'transparent',
              boxShadow: isActive ? 'inset 3px 0 0 var(--color-accent)' : 'none',
            })}
            onMouseEnter={(e) => {
              const isActive = window.location.pathname.startsWith(item.path);
              if (!isActive) {
                (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)';
                (e.currentTarget as HTMLElement).style.color = 'rgba(226, 232, 240, 0.9)';
              }
            }}
            onMouseLeave={(e) => {
              const isActive = window.location.pathname.startsWith(item.path);
              if (!isActive) {
                (e.currentTarget as HTMLElement).style.background = 'transparent';
                (e.currentTarget as HTMLElement).style.color = 'rgba(203, 213, 225, 0.7)';
              }
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
              {icons[item.icon]}
            </span>
            {item.label}
          </NavLink>
        ))}
      </div>

      {/* User info */}
      <div style={{
        padding: '16px 20px',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
      }}>
        <div style={{
          width: '32px', height: '32px',
          borderRadius: '50%',
          background: 'rgba(99, 102, 241, 0.2)',
          color: 'var(--color-accent-muted)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '13px', fontWeight: 600,
          flexShrink: 0,
        }}>
          {user?.name?.charAt(0)?.toUpperCase() || 'U'}
        </div>
        <div style={{ overflow: 'hidden', flex: 1 }}>
          <div style={{
            color: 'rgba(226, 232, 240, 0.9)',
            fontWeight: 500, fontSize: '13px',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {user?.name}
          </div>
          <div style={{
            color: 'rgba(148, 163, 184, 0.6)',
            fontSize: '11px', marginTop: '1px',
          }}>
            {user?.role?.replace(/_/g, ' ')}
          </div>
        </div>
      </div>
    </nav>
  );
}
