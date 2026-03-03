import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

const pageTitles: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/upload': 'Data Upload',
  '/reconciliation': 'Reconciliation',
  '/breach': 'Breach Management',
  '/reports': 'Reports',
  '/governance': 'Governance',
  '/audit': 'Audit Log',
  '/bank-dashboard': 'Bank Dashboard',
  '/admin': 'Administration',
};

export default function TopBar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const title = Object.entries(pageTitles).find(([path]) =>
    location.pathname.startsWith(path)
  )?.[1] || 'Safeheld';

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <header style={{
      height: '60px',
      background: 'white',
      borderBottom: '1px solid var(--color-navy-200)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 32px',
      flexShrink: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <h1 style={{
          fontSize: '15px', fontWeight: 600,
          color: 'var(--color-navy-900)',
          letterSpacing: '-0.01em',
        }}>
          {title}
        </h1>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
        <div style={{
          fontSize: '13px', color: 'var(--color-navy-500)',
          display: 'flex', alignItems: 'center', gap: '8px',
        }}>
          <span style={{
            width: '6px', height: '6px',
            borderRadius: '50%',
            background: 'var(--color-success)',
            display: 'inline-block',
          }} />
          {user?.email}
        </div>
        <button
          onClick={handleLogout}
          style={{
            padding: '7px 16px',
            background: 'transparent',
            border: '1px solid var(--color-navy-200)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--color-navy-600)',
            fontSize: '13px',
            fontWeight: 500,
            cursor: 'pointer',
            transition: 'all var(--transition-fast)',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.background = 'var(--color-navy-50)';
            (e.currentTarget as HTMLElement).style.borderColor = 'var(--color-navy-300)';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.background = 'transparent';
            (e.currentTarget as HTMLElement).style.borderColor = 'var(--color-navy-200)';
          }}
        >
          Sign out
        </button>
      </div>
    </header>
  );
}
