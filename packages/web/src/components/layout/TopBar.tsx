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
      height: '56px',
      background: 'white',
      borderBottom: '1px solid var(--color-gray-200)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 24px',
      flexShrink: 0,
      boxShadow: 'var(--shadow-sm)',
    }}>
      <h1 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--color-gray-800)' }}>
        {title}
      </h1>

      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div style={{ fontSize: '13px', color: 'var(--color-gray-500)' }}>
          {user?.email}
        </div>
        <button
          onClick={handleLogout}
          style={{
            padding: '6px 14px',
            background: 'transparent',
            border: '1px solid var(--color-gray-300)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--color-gray-600)',
            fontSize: '13px',
            cursor: 'pointer',
          }}
        >
          Sign out
        </button>
      </div>
    </header>
  );
}
