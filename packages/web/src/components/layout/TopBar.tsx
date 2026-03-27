import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../hooks/useAuth';
import { notificationsApi } from '../../api/client';

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
  '/profile': 'My Profile',
  '/settings/account': 'Account Settings',
  '/settings/notifications': 'Notification Preferences',
};

const dropdownItemStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  textAlign: 'left',
  padding: '10px 16px',
  background: 'none',
  border: 'none',
  fontSize: '13px',
  cursor: 'pointer',
  color: 'var(--color-gray-700)',
};

export default function TopBar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  const title = Object.entries(pageTitles).find(([path]) =>
    location.pathname.startsWith(path)
  )?.[1] || 'Safeheld';

  const initials = user?.name
    ? user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : '?';

  // Unread notification count
  const { data: unreadData } = useQuery({
    queryKey: ['notifications-unread-count'],
    queryFn: notificationsApi.getUnreadCount,
    refetchInterval: 30000,
  });

  const unreadCount = (unreadData as any)?.count ?? 0;

  // Recent notifications
  const { data: notificationsData } = useQuery({
    queryKey: ['notifications-recent'],
    queryFn: () => notificationsApi.getNotifications({ page: '1', pageSize: '5' }),
    enabled: notifOpen,
  });

  const notifications = (notificationsData as any)?.data ?? [];

  const markAllReadMutation = useMutation({
    mutationFn: notificationsApi.markAllRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] });
      queryClient.invalidateQueries({ queryKey: ['notifications-recent'] });
    },
  });

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    setProfileOpen(false);
    await logout();
    navigate('/login');
  };

  const handleNavTo = (path: string) => {
    setProfileOpen(false);
    navigate(path);
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

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {/* Notification bell */}
        <div ref={notifRef} style={{ position: 'relative' }}>
          <button
            onClick={() => { setNotifOpen(!notifOpen); setProfileOpen(false); }}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '6px 8px',
              borderRadius: 'var(--radius-md)',
              position: 'relative',
              fontSize: '18px',
              color: 'var(--color-gray-500)',
              lineHeight: 1,
            }}
          >
            <span role="img" aria-label="notifications" style={{ fontSize: '18px' }}>&#x1F514;</span>
            {unreadCount > 0 && (
              <span style={{
                position: 'absolute',
                top: '2px',
                right: '2px',
                background: 'var(--color-danger, #dc2626)',
                color: 'white',
                fontSize: '10px',
                fontWeight: 700,
                borderRadius: '10px',
                minWidth: '16px',
                height: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0 4px',
                lineHeight: 1,
              }}>
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>

          {notifOpen && (
            <div style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              marginTop: '6px',
              background: 'white',
              borderRadius: 'var(--radius-md)',
              boxShadow: '0 4px 24px rgba(0,0,0,0.12), 0 1px 4px rgba(0,0,0,0.08)',
              border: '1px solid var(--color-gray-200)',
              width: '320px',
              zIndex: 1000,
              overflow: 'hidden',
            }}>
              <div style={{
                padding: '12px 16px',
                borderBottom: '1px solid var(--color-gray-100)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}>
                <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--color-gray-800)' }}>
                  Notifications
                </span>
                {unreadCount > 0 && (
                  <button
                    onClick={() => markAllReadMutation.mutate()}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '12px',
                      color: 'var(--color-accent)',
                      fontWeight: 500,
                      padding: 0,
                      fontFamily: 'inherit',
                    }}
                  >
                    Mark all read
                  </button>
                )}
              </div>

              <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                {notifications.length === 0 ? (
                  <div style={{
                    padding: '32px 16px',
                    textAlign: 'center',
                    color: 'var(--color-gray-400)',
                    fontSize: '13px',
                  }}>
                    No notifications
                  </div>
                ) : (
                  notifications.map((notif: any) => (
                    <div
                      key={notif.id}
                      style={{
                        padding: '12px 16px',
                        borderBottom: '1px solid var(--color-gray-50)',
                        background: notif.readAt ? 'white' : 'var(--color-gray-50)',
                      }}
                    >
                      <div style={{
                        fontSize: '13px',
                        color: 'var(--color-gray-700)',
                        fontWeight: notif.readAt ? 400 : 500,
                      }}>
                        {notif.title || notif.message}
                      </div>
                      {notif.body && (
                        <div style={{ fontSize: '12px', color: 'var(--color-gray-500)', marginTop: '2px' }}>
                          {notif.body}
                        </div>
                      )}
                      <div style={{ fontSize: '11px', color: 'var(--color-gray-400)', marginTop: '4px' }}>
                        {notif.createdAt ? new Date(notif.createdAt).toLocaleString() : ''}
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div style={{
                padding: '8px 16px',
                borderTop: '1px solid var(--color-gray-100)',
                textAlign: 'center',
              }}>
                <button
                  onClick={() => { setNotifOpen(false); navigate('/settings/notifications'); }}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '12px',
                    color: 'var(--color-accent)',
                    fontWeight: 500,
                    padding: 0,
                    fontFamily: 'inherit',
                  }}
                >
                  Notification Preferences
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Profile dropdown */}
        <div ref={profileRef} style={{ position: 'relative' }}>
          <button
            onClick={() => { setProfileOpen(!profileOpen); setNotifOpen(false); }}
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

          {profileOpen && (
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
              {/* My Profile */}
              <button
                onClick={() => handleNavTo('/profile')}
                style={dropdownItemStyle}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-gray-50)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'none')}
              >
                My Profile
              </button>
              {/* Account Settings */}
              <button
                onClick={() => handleNavTo('/settings/account')}
                style={dropdownItemStyle}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-gray-50)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'none')}
              >
                Account Settings
              </button>
              {/* Notification Preferences */}
              <button
                onClick={() => handleNavTo('/settings/notifications')}
                style={dropdownItemStyle}
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
                  ...dropdownItemStyle,
                  color: '#dc2626',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-gray-50)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'none')}
              >
                Log Out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
