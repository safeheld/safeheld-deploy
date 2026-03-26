import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../hooks/useAuth';
import { auditSupportApi } from '../../api/client';
import { Card, Table, Button, PageHeader, StatCard, Grid, Modal, Alert, statusBadge } from '../../components/ui';
import { format } from 'date-fns';

export default function AuditSupportPage() {
  const { user } = useAuth();
  const firmId = user!.firmId;
  const queryClient = useQueryClient();
  const isComplianceOrAdmin = ['COMPLIANCE_OFFICER', 'ADMIN'].includes(user!.role);
  const isAuditor = user!.role === 'AUDITOR';

  const [activeTab, setActiveTab] = useState<'period' | 'evidence' | 'auditor'>('period');
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [signOffName, setSignOffName] = useState('');

  const { data: periodInfo, isLoading: periodLoading } = useQuery({
    queryKey: ['audit-period-info', firmId],
    queryFn: () => auditSupportApi.getPeriodInfo(firmId),
    enabled: activeTab === 'period',
  });

  const { data: thresholdData } = useQuery({
    queryKey: ['audit-threshold', firmId],
    queryFn: () => auditSupportApi.checkThreshold(firmId),
    enabled: activeTab === 'period' && isComplianceOrAdmin,
  });

  const { data: evidencePacks, isLoading: evidenceLoading } = useQuery({
    queryKey: ['audit-evidence-packs', firmId],
    queryFn: () => auditSupportApi.listEvidencePacks(firmId),
    enabled: activeTab === 'evidence',
  });

  const { data: auditorView, isLoading: auditorLoading } = useQuery({
    queryKey: ['audit-auditor-view', firmId],
    queryFn: () => auditSupportApi.getAuditorView(firmId),
    enabled: activeTab === 'auditor',
  });

  const generatePackMutation = useMutation({
    mutationFn: () => auditSupportApi.generateEvidencePack(firmId, { periodStart, periodEnd }),
    onSuccess: () => {
      setShowGenerateModal(false);
      queryClient.invalidateQueries({ queryKey: ['audit-evidence-packs', firmId] });
    },
  });

  const signOffMutation = useMutation({
    mutationFn: () => auditSupportApi.signOffExemption(firmId, { signedOffBy: signOffName }),
    onSuccess: () => {
      setSignOffName('');
      queryClient.invalidateQueries({ queryKey: ['audit-threshold', firmId] });
      queryClient.invalidateQueries({ queryKey: ['audit-period-info', firmId] });
    },
  });

  const handleDownloadPack = async (packId: string) => {
    try {
      const response = await auditSupportApi.downloadPack(firmId, packId);
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-evidence-pack-${packId.slice(0, 8)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { /* */ }
  };

  const tabs = [
    { id: 'period', label: 'Audit Period' },
    { id: 'evidence', label: 'Evidence Packs' },
    { id: 'auditor', label: 'Auditor Portal' },
  ];

  const packs = evidencePacks?.data || evidencePacks || [];

  // Compute days
  const daysUntilPeriodEnd = periodInfo?.daysUntilPeriodEnd ?? '—';
  const daysUntilDeadline = periodInfo?.daysUntilDeadline ?? '—';
  const auditStatus = thresholdData?.auditStatus || periodInfo?.auditStatus || 'UNKNOWN';

  return (
    <div>
      <PageHeader title="Audit Support" />

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0', borderBottom: '2px solid var(--color-gray-200)', marginBottom: '20px' }}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as typeof activeTab)}
            style={{
              padding: '10px 20px', background: 'none', border: 'none',
              borderBottom: activeTab === tab.id ? '2px solid var(--color-primary)' : '2px solid transparent',
              marginBottom: '-2px', cursor: 'pointer', fontSize: '14px', fontWeight: 500,
              color: activeTab === tab.id ? 'var(--color-primary)' : 'var(--color-gray-500)',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'period' && (
        <div>
          <div style={{ marginBottom: '20px' }}>
            <Grid cols={3}>
              <StatCard label="Days Until Period End" value={daysUntilPeriodEnd} />
              <StatCard label="Days Until Deadline" value={daysUntilDeadline} />
              <StatCard
                label="Audit Status"
                value={auditStatus}
                color={auditStatus === 'REQUIRED' ? 'var(--color-danger)' : 'var(--color-success)'}
              />
            </Grid>
          </div>

          <Card title="Period Information">
            {periodLoading ? (
              <div style={{ padding: '20px', color: 'var(--color-gray-400)', textAlign: 'center' }}>Loading...</div>
            ) : periodInfo ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '13px' }}>
                <div><span style={{ color: 'var(--color-gray-500)', fontWeight: 500 }}>Period Start:</span> {periodInfo.periodStart ? format(new Date(periodInfo.periodStart), 'dd MMM yyyy') : '—'}</div>
                <div><span style={{ color: 'var(--color-gray-500)', fontWeight: 500 }}>Period End:</span> {periodInfo.periodEnd ? format(new Date(periodInfo.periodEnd), 'dd MMM yyyy') : '—'}</div>
                <div><span style={{ color: 'var(--color-gray-500)', fontWeight: 500 }}>Submission Deadline:</span> {periodInfo.submissionDeadline ? format(new Date(periodInfo.submissionDeadline), 'dd MMM yyyy') : '—'}</div>
                <div><span style={{ color: 'var(--color-gray-500)', fontWeight: 500 }}>Auditor Firm:</span> {periodInfo.auditorFirm || '—'}</div>
              </div>
            ) : (
              <div style={{ color: 'var(--color-gray-400)' }}>No period information available.</div>
            )}
          </Card>

          {/* Threshold check with sign-off */}
          {isComplianceOrAdmin && thresholdData && (
            <Card title="Threshold Check" style={{ marginTop: '16px' }}>
              <div style={{ fontSize: '13px', marginBottom: '12px' }}>
                <Alert
                  type={thresholdData.auditRequired ? 'warning' : 'success'}
                  message={thresholdData.auditRequired
                    ? `Audit is required. Average relevant funds: ${thresholdData.averageRelevantFunds?.toLocaleString() ?? 'N/A'}`
                    : `Below threshold - audit may be exempt. Average relevant funds: ${thresholdData.averageRelevantFunds?.toLocaleString() ?? 'N/A'}`}
                />
              </div>
              {!thresholdData.auditRequired && (
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <input
                    type="text"
                    placeholder="Signed off by (name)"
                    value={signOffName}
                    onChange={e => setSignOffName(e.target.value)}
                    style={{ padding: '8px 10px', border: '1px solid var(--color-gray-300)', borderRadius: '6px', fontSize: '13px', flex: 1 }}
                  />
                  <Button
                    onClick={() => signOffMutation.mutate()}
                    loading={signOffMutation.isPending}
                    disabled={!signOffName.trim()}
                    size="sm"
                  >
                    Sign Off Exemption
                  </Button>
                </div>
              )}
            </Card>
          )}
        </div>
      )}

      {activeTab === 'evidence' && (
        <Card
          title="Evidence Packs"
          actions={isComplianceOrAdmin ? (
            <Button onClick={() => setShowGenerateModal(true)}>Generate Pack</Button>
          ) : undefined}
        >
          <Table
            loading={evidenceLoading}
            data={packs}
            columns={[
              { key: 'periodStart', header: 'Period', render: (r: any) => `${r.periodStart ? format(new Date(r.periodStart), 'dd MMM yyyy') : '—'} - ${r.periodEnd ? format(new Date(r.periodEnd), 'dd MMM yyyy') : '—'}` },
              { key: 'generatedAt', header: 'Generated', render: (r: any) => r.generatedAt ? format(new Date(r.generatedAt), 'dd MMM yyyy HH:mm') : r.createdAt ? format(new Date(r.createdAt), 'dd MMM yyyy HH:mm') : '—' },
              { key: 'reconDays', header: 'Recon Days', render: (r: any) => r.reconDays ?? r.reconciliationDaysCount ?? '—', width: '100px' },
              { key: 'breaches', header: 'Breaches', render: (r: any) => r.breachesCount ?? r.breaches ?? '—', width: '100px' },
              { key: 'shortfalls', header: 'Shortfalls', render: (r: any) => r.shortfallsCount ?? r.shortfalls ?? '—', width: '100px' },
              {
                key: 'actions', header: '', render: (r: any) => (
                  <Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); handleDownloadPack(r.id); }}>
                    Download
                  </Button>
                ),
              },
            ]}
            emptyMessage="No evidence packs generated yet."
          />
        </Card>
      )}

      {activeTab === 'auditor' && (
        <Card title={isAuditor ? 'Auditor Data View' : 'Auditor Portal Management'}>
          {auditorLoading ? (
            <div style={{ padding: '20px', color: 'var(--color-gray-400)', textAlign: 'center' }}>Loading...</div>
          ) : isAuditor ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {auditorView?.reconciliations && (
                <div>
                  <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px', color: 'var(--color-gray-800)' }}>Reconciliation Results</h4>
                  <div style={{ fontSize: '13px', color: 'var(--color-gray-600)' }}>
                    {auditorView.reconciliations.length} reconciliation records available
                  </div>
                </div>
              )}
              {auditorView?.breaches && (
                <div>
                  <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px', color: 'var(--color-gray-800)' }}>Breaches</h4>
                  <div style={{ fontSize: '13px', color: 'var(--color-gray-600)' }}>
                    {auditorView.breaches.length} breach records available
                  </div>
                </div>
              )}
              {auditorView?.resolutionPack && (
                <div>
                  <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px', color: 'var(--color-gray-800)' }}>Resolution Pack</h4>
                  <div style={{ fontSize: '13px', color: 'var(--color-gray-600)' }}>
                    Completeness: {auditorView.resolutionPack.completenessPercent ?? 'N/A'}%
                  </div>
                </div>
              )}
              {!auditorView && (
                <div style={{ color: 'var(--color-gray-400)' }}>No auditor data available for this firm.</div>
              )}
            </div>
          ) : (
            <div>
              {auditorView?.auditors ? (
                <Table
                  data={auditorView.auditors || []}
                  columns={[
                    { key: 'name', header: 'Auditor Name', render: (r: any) => r.name || r.user?.name || '—' },
                    { key: 'email', header: 'Email', render: (r: any) => r.email || r.user?.email || '—' },
                    { key: 'assignedPeriod', header: 'Assigned Period', render: (r: any) => r.assignedPeriod || '—' },
                  ]}
                  emptyMessage="No auditor users assigned."
                />
              ) : (
                <div style={{ color: 'var(--color-gray-500)', fontSize: '13px' }}>
                  Auditor portal data is scoped per user. Admin users can view auditor assignments here.
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      {/* Generate Evidence Pack Modal */}
      <Modal open={showGenerateModal} onClose={() => setShowGenerateModal(false)} title="Generate Evidence Pack">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px' }}>Period Start</label>
            <input
              type="date"
              value={periodStart}
              onChange={e => setPeriodStart(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--color-gray-300)', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px' }}>Period End</label>
            <input
              type="date"
              value={periodEnd}
              onChange={e => setPeriodEnd(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--color-gray-300)', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }}
            />
          </div>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setShowGenerateModal(false)}>Cancel</Button>
            <Button
              onClick={() => generatePackMutation.mutate()}
              loading={generatePackMutation.isPending}
              disabled={!periodStart || !periodEnd}
            >
              Generate
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
