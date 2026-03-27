import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notificationsApi } from '../../api/client';
import { Card, Button, Alert, PageHeader, Select } from '../../components/ui';

interface NotificationCategory {
  key: string;
  label: string;
  description: string;
}

const CATEGORIES: NotificationCategory[] = [
  { key: 'breach_alerts', label: 'Breach Alerts', description: 'Notifications when new breaches are detected or status changes' },
  { key: 'reconciliation', label: 'Reconciliation Results', description: 'Daily reconciliation completion and shortfall alerts' },
  { key: 'governance', label: 'Governance Updates', description: 'Policy reviews due, letter expirations, due diligence reminders' },
  { key: 'reports', label: 'Report Generation', description: 'When reports are generated, finalised, or shared' },
  { key: 'upload', label: 'Data Upload', description: 'Upload processing results and validation errors' },
  { key: 'system', label: 'System Notifications', description: 'Maintenance, updates, and security alerts' },
];

function ToggleSwitch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: '0',
        fontFamily: 'inherit',
      }}
      type="button"
    >
      <div style={{
        width: '36px',
        height: '20px',
        borderRadius: '10px',
        background: checked ? 'var(--color-accent)' : 'var(--color-gray-300)',
        position: 'relative',
        transition: 'background 0.2s',
      }}>
        <div style={{
          width: '16px',
          height: '16px',
          borderRadius: '50%',
          background: 'white',
          position: 'absolute',
          top: '2px',
          left: checked ? '18px' : '2px',
          transition: 'left 0.2s',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
        }} />
      </div>
      <span style={{ fontSize: '13px', color: 'var(--color-gray-600)' }}>{label}</span>
    </button>
  );
}

export default function NotificationPreferencesPage() {
  const queryClient = useQueryClient();

  const [prefs, setPrefs] = useState<Record<string, { email: boolean; inApp: boolean }>>({});
  const [frequency, setFrequency] = useState('realtime');
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  const { data: prefsData, isLoading } = useQuery({
    queryKey: ['notification-preferences'],
    queryFn: notificationsApi.getPreferences,
  });

  useEffect(() => {
    if (prefsData) {
      const categories = prefsData.categories || {};
      const initial: Record<string, { email: boolean; inApp: boolean }> = {};
      CATEGORIES.forEach(cat => {
        initial[cat.key] = {
          email: categories[cat.key]?.email ?? true,
          inApp: categories[cat.key]?.inApp ?? true,
        };
      });
      setPrefs(initial);
      setFrequency(prefsData.frequency || 'realtime');
    } else if (!isLoading) {
      // Default: all enabled
      const initial: Record<string, { email: boolean; inApp: boolean }> = {};
      CATEGORIES.forEach(cat => {
        initial[cat.key] = { email: true, inApp: true };
      });
      setPrefs(initial);
    }
  }, [prefsData, isLoading]);

  const updateMutation = useMutation({
    mutationFn: (data: Record<string, any>) => notificationsApi.updatePreferences(data),
    onSuccess: () => {
      setSuccess('Notification preferences saved.');
      setError('');
      queryClient.invalidateQueries({ queryKey: ['notification-preferences'] });
    },
    onError: (err: any) => {
      setError(err?.response?.data?.error?.message || 'Failed to save preferences.');
      setSuccess('');
    },
  });

  const handleSave = () => {
    setSuccess('');
    setError('');
    updateMutation.mutate({ categories: prefs, frequency });
  };

  const togglePref = (key: string, channel: 'email' | 'inApp') => {
    setPrefs(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        [channel]: !prev[key]?.[channel],
      },
    }));
  };

  if (isLoading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-gray-400)' }}>
        Loading...
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Notification Preferences" />

      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '700px' }}>
        {success && <Alert type="success" message={success} />}
        {error && <Alert type="error" message={error} />}

        {/* Frequency */}
        <Card title="Delivery Frequency">
          <Select
            label="How often should we send notification digests?"
            value={frequency}
            onChange={e => setFrequency(e.target.value)}
            options={[
              { value: 'realtime', label: 'Real-time (immediate)' },
              { value: 'daily', label: 'Daily digest' },
              { value: 'weekly', label: 'Weekly digest' },
            ]}
          />
        </Card>

        {/* Category toggles */}
        <Card title="Notification Categories">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
            {/* Header row */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 80px 80px',
              gap: '8px',
              padding: '0 0 12px',
              borderBottom: '1px solid var(--color-gray-200)',
              marginBottom: '4px',
            }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-gray-500)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Category
              </span>
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-gray-500)', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'center' }}>
                Email
              </span>
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-gray-500)', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'center' }}>
                In-App
              </span>
            </div>

            {CATEGORIES.map(cat => (
              <div key={cat.key} style={{
                display: 'grid',
                gridTemplateColumns: '1fr 80px 80px',
                gap: '8px',
                alignItems: 'center',
                padding: '14px 0',
                borderBottom: '1px solid var(--color-gray-100)',
              }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--color-gray-800)' }}>{cat.label}</div>
                  <div style={{ fontSize: '12px', color: 'var(--color-gray-500)', marginTop: '2px' }}>{cat.description}</div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <ToggleSwitch
                    checked={prefs[cat.key]?.email ?? true}
                    onChange={() => togglePref(cat.key, 'email')}
                    label=""
                  />
                </div>
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <ToggleSwitch
                    checked={prefs[cat.key]?.inApp ?? true}
                    onChange={() => togglePref(cat.key, 'inApp')}
                    label=""
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button onClick={handleSave} loading={updateMutation.isPending}>
            Save Preferences
          </Button>
        </div>
      </div>
    </div>
  );
}
