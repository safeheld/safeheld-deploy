import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

const pageTitles: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/upload': 'Data Upload',
  '/reconciliation': 'Reconciliation',
  '/breach': 'Breach Management',
  '/reports': 'Reports',
  '/governance': 'Governance',
  '/audit-support': 'Audit Support',
  '/audit': 'Audit Log',
  '/admin': 'Administration',
  '/resolution-pack': 'Resolution Pack',
  '/fca-returns': 'FCA Returns',
  '/acknowledgement-letters': 'Acknowledgement Letters',
  '/third-party-dd': 'Third-Party Due Diligence',
  '/insurance-management': 'Insurance Management',
  '/policy-library': 'Policy Library',
  '/safeguarding-timing': 'Safeguarding Timing',
  '/cass': 'CASS Module',
  '/crypto': 'Crypto Module',
  '/stablecoin': 'Stablecoin Module',
  '/bank-dashboard': 'Bank Dashboard',
};

export default function TopBar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const title = Object.entries(pageTitles).find(([path]) =>
    location.pathname.startsWith(path)
  )?.[1] || 'Safeheld';

  const initials = user?.name
    ? user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : '?';

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    setDropdownOpen(false);
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

      <div ref={dropdownRef} style={{ position: 'relative' }}>
        <button
          onClick={() => setDropdownOpen(!dropdownOpen)}
          style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            background: 'none', border: 'none', cursor: 'pointer', padding: '4px',
            borderRadius: 'var(--radius-md)',
          }}
        >
          <div style={{ fontSize: '13px', color: 'var(--color-gray-500)', textAlign: 'right' }}>
            <div style={{ fontWeight: 500, color: 'var(--color-gray-700)' }}>{user?.name}</div>
            <div style={{ fontSize: '11px' }}>{user?.role?.replace(/_/g, ' ')}</div>
          </div>
          <div style={{
            width: '34px', height: '34px', borderRadius: '50%',
            background: 'var(--color-accent)', color: 'white',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 600, fontSize: '13px', letterSpacing: '0.5px',
          }}>
            {initials}
          </div>
        </button>

        {dropdownOpen && (
          <div style={{
            position: 'absolute', top: '100%', right: 0, marginTop: '6px',
            background: 'white', borderRadius: 'var(--radius-md)',
            boxShadow: '0 4px 24px rgba(0,0,0,0.12), 0 1px 4px rgba(0,0,0,0.08)',
            border: '1px solid var(--color-gray-200)',
            minWidth: '200px', zIndex: 1000, overflow: 'hidden',
          }}>
            {/* User info header */}
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-gray-100)' }}>
              <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--color-gray-800)' }}>{user?.name}</div>
              <div style={{ fontSize: '12px', color: 'var(--color-gray-500)', marginTop: '2px' }}>{user?.email}</div>
            </div>
            {/* Account Settings */}
            <button
              onClick={() => { setDropdownOpen(false); navigate('/admin'); }}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '10px 16px', background: 'none', border: 'none',
                fontSize: '13px', cursor: 'pointer', color: 'var(--color-gray-700)',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-gray-50)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}
            >
              Account Settings
            </button>
            {/* Notification Preferences */}
            <button
              onClick={() => { setDropdownOpen(false); navigate('/governance'); }}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '10px 16px', background: 'none', border: 'none',
                fontSize: '13px', cursor: 'pointer', color: 'var(--color-gray-700)',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-gray-50)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}
            >
              Notification Preferences
            </button>
            {/* Divider */}
            <div style={{ height: '1px', background: 'var(--color-gray-100)', margin: '4px 0' }} />
            {/* Log Out */}
            <button
              onClick={handleLogout}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '10px 16px', background: 'none', border: 'none',
                fontSize: '13px', cursor: 'pointer', color: '#dc2626',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-gray-50)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}
            >
              Log Out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
