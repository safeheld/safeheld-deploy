import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../hooks/useAuth';
import { adminApi, apiClient } from '../../api/client';
import { Card, Button, Input, Alert, PageHeader, Grid } from '../../components/ui';

export default function AccountSettingsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === 'ADMIN';
  const canSeeApiKeys = user?.role === 'ADMIN' || user?.role === 'BANK_VIEWER';

  // Firm details state
  const [firmName, setFirmName] = useState('');
  const [fcaFrn, setFcaFrn] = useState('');
  const [regime, setRegime] = useState('');
  const [firmSuccess, setFirmSuccess] = useState('');
  const [firmError, setFirmError] = useState('');

  // API key state
  const [maskedKey, setMaskedKey] = useState('');
  const [keySuccess, setKeySuccess] = useState('');
  const [keyError, setKeyError] = useState('');

  const { data: firmData, isLoading: firmLoading } = useQuery({
    queryKey: ['firm', user?.firmId],
    queryFn: () => adminApi.getFirm(user!.firmId),
    enabled: !!user?.firmId && isAdmin,
  });

  useEffect(() => {
    if (firmData) {
      setFirmName((firmData as any).name || '');
      setFcaFrn((firmData as any).fcaFrn || '');
      setRegime((firmData as any).regime || '');
    }
  }, [firmData]);

  const updateFirmMutation = useMutation({
    mutationFn: (data: object) => adminApi.updateFirm(user!.firmId, data),
    onSuccess: () => {
      setFirmSuccess('Firm details updated.');
      setFirmError('');
      queryClient.invalidateQueries({ queryKey: ['firm', user?.firmId] });
    },
    onError: (err: any) => {
      setFirmError(err?.response?.data?.error?.message || 'Failed to update firm details.');
      setFirmSuccess('');
    },
  });

  const handleFirmSave = () => {
    setFirmSuccess('');
    setFirmError('');
    updateFirmMutation.mutate({ name: firmName, fcaFrn });
  };

  const regenerateKeyMutation = useMutation({
    mutationFn: () => apiClient.post('/auth/api-keys/regenerate').then(r => r.data.data),
    onSuccess: (data: any) => {
      setMaskedKey(data.maskedKey || data.key || '');
      setKeySuccess('API key regenerated. Copy it now — it will not be shown again.');
      setKeyError('');
    },
    onError: (err: any) => {
      setKeyError(err?.response?.data?.error?.message || 'Failed to regenerate API key.');
      setKeySuccess('');
    },
  });

  return (
    <div>
      <PageHeader title="Account Settings" />

      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '700px' }}>
        {/* Firm Details */}
        <Card title="Firm Details">
          {!isAdmin && (
            <p style={{ fontSize: '13px', color: 'var(--color-gray-500)', margin: '0 0 16px' }}>
              Only administrators can edit firm details.
            </p>
          )}
          {firmSuccess && <Alert type="success" message={firmSuccess} />}
          {firmError && <Alert type="error" message={firmError} />}

          {firmLoading ? (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--color-gray-400)' }}>Loading...</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: firmSuccess || firmError ? '16px' : '0' }}>
              <Input
                label="Firm Name"
                value={firmName}
                onChange={e => setFirmName(e.target.value)}
                disabled={!isAdmin}
                style={!isAdmin ? { background: 'var(--color-gray-50)', cursor: 'not-allowed' } : {}}
              />
              <Grid cols={2} gap={16}>
                <Input
                  label="FCA FRN"
                  value={fcaFrn}
                  onChange={e => setFcaFrn(e.target.value)}
                  disabled={!isAdmin}
                  style={!isAdmin ? { background: 'var(--color-gray-50)', cursor: 'not-allowed' } : {}}
                  placeholder="e.g. 123456"
                />
                <Input
                  label="Regime"
                  value={regime?.replace(/_/g, ' ')}
                  disabled
                  style={{ background: 'var(--color-gray-50)', cursor: 'not-allowed' }}
                />
              </Grid>

              {isAdmin && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
                  <Button onClick={handleFirmSave} loading={updateFirmMutation.isPending}>
                    Save Changes
                  </Button>
                </div>
              )}
            </div>
          )}
        </Card>

        {/* API Keys */}
        {canSeeApiKeys && (
          <Card title="API Keys">
            <p style={{ fontSize: '13px', color: 'var(--color-gray-500)', margin: '0 0 16px' }}>
              Use API keys for programmatic access to the Safeheld API.
            </p>

            {keySuccess && <Alert type="success" message={keySuccess} />}
            {keyError && <Alert type="error" message={keyError} />}

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: keySuccess || keyError ? '16px' : '0' }}>
              <Input
                value={maskedKey || 'sk-****************************'}
                disabled
                style={{ background: 'var(--color-gray-50)', cursor: 'not-allowed', fontFamily: 'monospace', flex: 1 }}
              />
              <Button
                variant="secondary"
                onClick={() => regenerateKeyMutation.mutate()}
                loading={regenerateKeyMutation.isPending}
              >
                Regenerate
              </Button>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
