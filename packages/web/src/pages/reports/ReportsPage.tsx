import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../hooks/useAuth';
import { reportingApi } from '../../api/client';
import { Card, Table, Button, PageHeader, Pagination, statusBadge, Modal, Alert, Select } from '../../components/ui';
import { format } from 'date-fns';

const REPORT_TYPES = [
  { value: 'MONTHLY', label: 'Monthly' },
  { value: 'QUARTERLY', label: 'Quarterly' },
  { value: 'ANNUAL', label: 'Annual' },
  { value: 'SAFEGUARDING_RETURN', label: 'Safeguarding Return' },
  { value: 'AUDIT_EVIDENCE', label: 'Audit Evidence' },
];

export default function ReportsPage() {
  const { user } = useAuth();
  const firmId = user!.firmId;
  const queryClient = useQueryClient();
  const isCompliance = ['COMPLIANCE_OFFICER', 'ADMIN'].includes(user!.role);

  const [page, setPage] = useState(1);
  const [activeTab, setActiveTab] = useState<'assurance' | 'safeguarding'>('assurance');
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [showSafeguardingModal, setShowSafeguardingModal] = useState(false);
  const [genForm, setGenForm] = useState({ report_type: 'MONTHLY', period_start: '', period_end: '' });
  const [sgForm, setSgForm] = useState({ period_start: '', period_end: '' });
  const [sgResult, setSgResult] = useState<object | null>(null);
  const [genError, setGenError] = useState('');

  const { data: reportsResp, isLoading } = useQuery({
    queryKey: ['reports', firmId, page],
    queryFn: () => reportingApi.getReports(firmId, { page: String(page) }),
  });

  const genMutation = useMutation({
    mutationFn: () => reportingApi.generateAssuranceReport(firmId, {
      report_type: genForm.report_type,
      period_start: genForm.period_start,
      period_end: genForm.period_end,
    }),
    onSuccess: () => {
      setShowGenerateModal(false);
      queryClient.invalidateQueries({ queryKey: ['reports', firmId] });
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      setGenError(msg || 'Report generation failed.');
    },
  });

  const sgMutation = useMutation({
    mutationFn: () => reportingApi.getSafeguardingReturn(firmId, sgForm.period_start, sgForm.period_end),
    onSuccess: (data) => {
      setSgResult(data);
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      setGenError(msg || 'Failed to generate safeguarding return.');
    },
  });

  const finaliseMutation = useMutation({
    mutationFn: (reportId: string) => reportingApi.finaliseReport(firmId, reportId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['reports', firmId] }),
  });

  const reports = reportsResp?.data || [];
  const pagination = reportsResp?.pagination;

  return (
    <div>
      <PageHeader
        title="Reports"
        actions={isCompliance ? (
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button variant="secondary" onClick={() => setShowSafeguardingModal(true)}>
              Safeguarding Return
            </Button>
            <Button onClick={() => { setShowGenerateModal(true); setGenError(''); }}>
              Generate Report
            </Button>
          </div>
        ) : undefined}
      />

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0', borderBottom: '2px solid var(--color-gray-200)', marginBottom: '20px' }}>
        {[
          { id: 'assurance', label: 'Assurance Reports' },
          { id: 'safeguarding', label: 'FCA Returns' },
        ].map(tab => (
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

      {activeTab === 'assurance' && (
        <Card>
          <Table
            loading={isLoading}
            data={reports}
            columns={[
              { key: 'reportType', header: 'Type', render: r => r.reportType.replace(/_/g, ' ') },
              {
                key: 'periodStart', header: 'Period',
                render: r => `${format(new Date(r.periodStart), 'dd MMM yyyy')} – ${format(new Date(r.periodEnd), 'dd MMM yyyy')}`,
              },
              { key: 'version', header: 'Ver', width: '60px' },
              { key: 'status', header: 'Status', render: r => statusBadge(r.status), width: '100px' },
              {
                key: 'generator', header: 'Generated By',
                render: r => r.generator?.name || '—', width: '140px',
              },
              { key: 'createdAt', header: 'Created', render: r => format(new Date(r.createdAt), 'dd MMM yyyy'), width: '110px' },
              {
                key: 'actions', header: '',
                render: r => (
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {r.status === 'DRAFT' && isCompliance && (
                      <Button size="sm" variant="secondary" onClick={() => finaliseMutation.mutate(r.id)}>
                        Finalise
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => window.open(reportingApi.downloadReport(firmId, r.id), '_blank')}>
                      Download
                    </Button>
                  </div>
                ),
              },
            ]}
            emptyMessage="No reports generated yet."
          />
          {pagination && (
            <Pagination page={page} totalPages={pagination.totalPages} total={pagination.total} onPageChange={setPage} />
          )}
        </Card>
      )}

      {activeTab === 'safeguarding' && (
        <Card title="Safeguarding Return Data">
          {sgResult ? (
            <div>
              <pre style={{ background: 'var(--color-gray-50)', padding: '16px', borderRadius: '6px', fontSize: '12px', overflow: 'auto', maxHeight: '500px' }}>
                {JSON.stringify(sgResult, null, 2)}
              </pre>
              <Button variant="secondary" size="sm" style={{ marginTop: '12px' }} onClick={() => setSgResult(null)}>
                Clear
              </Button>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '40px' }}>
              <p style={{ color: 'var(--color-gray-400)', marginBottom: '16px' }}>
                Generate a safeguarding return to view compliance data for a specific period.
              </p>
              <Button onClick={() => setShowSafeguardingModal(true)}>Generate Safeguarding Return</Button>
            </div>
          )}
        </Card>
      )}

      {/* Generate Report Modal */}
      <Modal open={showGenerateModal} onClose={() => setShowGenerateModal(false)} title="Generate Assurance Report">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <Select
            label="Report Type"
            options={REPORT_TYPES}
            value={genForm.report_type}
            onChange={e => setGenForm(p => ({ ...p, report_type: e.target.value }))}
          />
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px' }}>Period Start</label>
            <input type="date" value={genForm.period_start} onChange={e => setGenForm(p => ({ ...p, period_start: e.target.value }))}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--color-gray-300)', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px' }}>Period End</label>
            <input type="date" value={genForm.period_end} onChange={e => setGenForm(p => ({ ...p, period_end: e.target.value }))}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--color-gray-300)', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }} />
          </div>
          {genError && <Alert type="error" message={genError} />}
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setShowGenerateModal(false)}>Cancel</Button>
            <Button
              onClick={() => genMutation.mutate()}
              loading={genMutation.isPending}
              disabled={!genForm.period_start || !genForm.period_end}
            >
              Generate
            </Button>
          </div>
        </div>
      </Modal>

      {/* Safeguarding Return Modal */}
      <Modal open={showSafeguardingModal} onClose={() => setShowSafeguardingModal(false)} title="Safeguarding Return">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px' }}>Period Start</label>
            <input type="date" value={sgForm.period_start} onChange={e => setSgForm(p => ({ ...p, period_start: e.target.value }))}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--color-gray-300)', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px' }}>Period End</label>
            <input type="date" value={sgForm.period_end} onChange={e => setSgForm(p => ({ ...p, period_end: e.target.value }))}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--color-gray-300)', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }} />
          </div>
          {genError && <Alert type="error" message={genError} />}
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setShowSafeguardingModal(false)}>Cancel</Button>
            <Button
              onClick={() => { sgMutation.mutate(); setShowSafeguardingModal(false); }}
              loading={sgMutation.isPending}
              disabled={!sgForm.period_start || !sgForm.period_end}
            >
              Generate Return
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
