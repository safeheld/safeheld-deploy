import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../hooks/useAuth';
import { acknowledgementLettersApi } from '../../api/client';
import { Card, Table, Button, PageHeader, StatCard, Grid, Modal, Alert, statusBadge } from '../../components/ui';
import { format } from 'date-fns';

export default function AcknowledgementLettersPage() {
  const { user } = useAuth();
  const firmId = user!.firmId;
  const queryClient = useQueryClient();
  const isComplianceOrAdmin = ['COMPLIANCE_OFFICER', 'ADMIN'].includes(user!.role);

  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadAccountId, setUploadAccountId] = useState('');
  const [effectiveDate, setEffectiveDate] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  const { data: trackingData, isLoading: trackingLoading } = useQuery({
    queryKey: ['ack-letters-tracking', firmId],
    queryFn: () => acknowledgementLettersApi.getTracking(firmId),
  });

  const { data: alertsData } = useQuery({
    queryKey: ['ack-letters-alerts', firmId],
    queryFn: () => acknowledgementLettersApi.getAlerts(firmId),
  });

  const uploadMutation = useMutation({
    mutationFn: () => {
      const formData = new FormData();
      formData.append('file', uploadFile!);
      formData.append('safeguardingAccountId', uploadAccountId);
      formData.append('effectiveDate', effectiveDate);
      if (expiryDate) formData.append('expiryDate', expiryDate);
      return acknowledgementLettersApi.uploadSigned(firmId, formData);
    },
    onSuccess: () => {
      setShowUploadModal(false);
      setUploadAccountId('');
      setEffectiveDate('');
      setExpiryDate('');
      setUploadFile(null);
      queryClient.invalidateQueries({ queryKey: ['ack-letters-tracking', firmId] });
      queryClient.invalidateQueries({ queryKey: ['ack-letters-alerts', firmId] });
    },
  });

  const handleGenerateTemplate = async (accountId: string) => {
    try {
      const response = await acknowledgementLettersApi.generateTemplate(firmId, { safeguardingAccountId: accountId });
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `acknowledgement-letter-template-${accountId.slice(0, 8)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { /* */ }
  };

  const tracking = trackingData?.data || trackingData || {};
  const accounts = tracking.accounts || tracking.letters || [];
  const stats = tracking.stats || tracking.summary || {};
  const alerts = alertsData || [];

  return (
    <div>
      <PageHeader
        title="Acknowledgement Letters"
        actions={isComplianceOrAdmin ? (
          <Button variant="secondary" onClick={() => {
            if (accounts.length > 0) {
              handleGenerateTemplate(accounts[0].safeguardingAccountId || accounts[0].id);
            }
          }}>
            Generate Template
          </Button>
        ) : undefined}
      />

      {/* Alerts */}
      {Array.isArray(alerts) && alerts.length > 0 && (
        <div style={{ marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {alerts.map((alert: any, i: number) => (
            <Alert
              key={i}
              type={alert.severity === 'CRITICAL' ? 'error' : 'warning'}
              message={alert.message || `${alert.type}: ${alert.accountName || alert.bankName || 'Account'} - ${alert.details || ''}`}
            />
          ))}
        </div>
      )}

      {/* Stat cards */}
      <div style={{ marginBottom: '20px' }}>
        <Grid cols={4}>
          <StatCard label="Total Accounts" value={stats.totalAccounts ?? accounts.length ?? '—'} />
          <StatCard label="Letters Received" value={stats.received ?? stats.lettersReceived ?? '—'} color="var(--color-success)" />
          <StatCard label="Letters Pending" value={stats.pending ?? stats.lettersPending ?? '—'} color="var(--color-warning)" />
          <StatCard label="Letters Missing" value={stats.missing ?? stats.lettersMissing ?? '—'} color="var(--color-danger)" />
        </Grid>
      </div>

      {/* Main table */}
      <Card title="Letter Tracking">
        <Table
          loading={trackingLoading}
          data={accounts}
          columns={[
            {
              key: 'account', header: 'Account',
              render: (r: any) => `${r.bankName || r.safeguardingAccount?.bankName || '—'} (${r.accountNumberMasked || r.safeguardingAccount?.accountNumberMasked || '****'})`,
            },
            {
              key: 'status', header: 'Status',
              render: (r: any) => statusBadge(r.letterStatus || r.status || 'NOT_SENT'),
              width: '130px',
            },
            {
              key: 'effectiveDate', header: 'Effective Date',
              render: (r: any) => r.effectiveDate ? format(new Date(r.effectiveDate), 'dd MMM yyyy') : '—',
            },
            {
              key: 'expiryDate', header: 'Expiry Date',
              render: (r: any) => r.expiryDate ? format(new Date(r.expiryDate), 'dd MMM yyyy') : '—',
            },
            {
              key: 'actions', header: '',
              render: (r: any) => isComplianceOrAdmin ? (
                <div style={{ display: 'flex', gap: '6px' }}>
                  <Button size="sm" variant="ghost" onClick={(e) => {
                    e.stopPropagation();
                    handleGenerateTemplate(r.safeguardingAccountId || r.id);
                  }}>
                    Template
                  </Button>
                  <Button size="sm" variant="secondary" onClick={(e) => {
                    e.stopPropagation();
                    setUploadAccountId(r.safeguardingAccountId || r.id);
                    setShowUploadModal(true);
                  }}>
                    Upload
                  </Button>
                </div>
              ) : null,
            },
          ]}
          emptyMessage="No safeguarding accounts found."
        />
      </Card>

      {/* Upload Signed Letter Modal */}
      <Modal open={showUploadModal} onClose={() => setShowUploadModal(false)} title="Upload Signed Letter">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px' }}>Signed Letter File</label>
            <input
              type="file"
              accept=".pdf,.doc,.docx"
              onChange={e => setUploadFile(e.target.files?.[0] || null)}
              style={{ fontSize: '13px' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px' }}>Effective Date</label>
            <input
              type="date"
              value={effectiveDate}
              onChange={e => setEffectiveDate(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--color-gray-300)', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px' }}>Expiry Date (optional)</label>
            <input
              type="date"
              value={expiryDate}
              onChange={e => setExpiryDate(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--color-gray-300)', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }}
            />
          </div>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setShowUploadModal(false)}>Cancel</Button>
            <Button
              onClick={() => uploadMutation.mutate()}
              loading={uploadMutation.isPending}
              disabled={!uploadFile || !effectiveDate}
            >
              Upload
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
