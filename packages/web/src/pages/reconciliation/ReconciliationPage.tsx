import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../hooks/useAuth';
import { reconciliationApi } from '../../api/client';
import { Card, Table, Button, PageHeader, Pagination, statusBadge, Modal, Alert, Tabs } from '../../components/ui';
import { format } from 'date-fns';

export default function ReconciliationPage() {
  const { user } = useAuth();
  const firmId = user!.firmId;
  const queryClient = useQueryClient();
  const isComplianceOrAdmin = ['COMPLIANCE_OFFICER', 'ADMIN'].includes(user!.role);

  const [activeTab, setActiveTab] = useState<'history' | 'breaks'>('history');
  const [historyPage, setHistoryPage] = useState(1);
  const [breaksPage, setBreaksPage] = useState(1);
  const [reconDate, setReconDate] = useState(new Date().toISOString().split('T')[0]);
  const [runError, setRunError] = useState('');
  const [showResolveModal, setShowResolveModal] = useState(false);
  const [selectedBreak, setSelectedBreak] = useState<{ id: string; variance: number; ageBusinessDays: number } | null>(null);
  const [resolution, setResolution] = useState({ classification: 'TIMING', explanation: '' });

  const { data: historyResp, isLoading: historyLoading } = useQuery({
    queryKey: ['recon-history', firmId, historyPage],
    queryFn: () => reconciliationApi.getHistory(firmId, { page: String(historyPage) }),
    enabled: activeTab === 'history',
  });

  const { data: breaksResp, isLoading: breaksLoading } = useQuery({
    queryKey: ['recon-breaks', firmId, breaksPage],
    queryFn: () => reconciliationApi.getBreaks(firmId, { page: String(breaksPage), resolved: 'false' }),
    enabled: activeTab === 'breaks',
  });

  const runMutation = useMutation({
    mutationFn: () => reconciliationApi.run(firmId, reconDate),
    onSuccess: () => {
      setRunError('');
      queryClient.invalidateQueries({ queryKey: ['recon-history', firmId] });
      queryClient.invalidateQueries({ queryKey: ['recon-dashboard', firmId] });
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      setRunError(msg || 'Reconciliation run failed.');
    },
  });

  const resolveMutation = useMutation({
    mutationFn: () => reconciliationApi.resolveBreak(firmId, selectedBreak!.id, {
      classification: resolution.classification,
      explanation: resolution.explanation,
    }),
    onSuccess: () => {
      setShowResolveModal(false);
      queryClient.invalidateQueries({ queryKey: ['recon-breaks', firmId] });
    },
  });

  return (
    <div>
      <PageHeader
        title="Reconciliation"
        actions={isComplianceOrAdmin ? (
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <input
              type="date"
              value={reconDate}
              onChange={e => setReconDate(e.target.value)}
              style={{
                padding: '8px 12px', border: '1px solid var(--color-navy-300)',
                borderRadius: 'var(--radius-md)', fontSize: '13px',
                color: 'var(--color-navy-700)',
              }}
            />
            <Button onClick={() => runMutation.mutate()} loading={runMutation.isPending}>
              Run Reconciliation
            </Button>
          </div>
        ) : undefined}
      />

      {runError && <div style={{ marginBottom: '20px' }}><Alert type="error" message={runError} /></div>}
      {runMutation.isSuccess && (
        <div style={{ marginBottom: '20px' }}>
          <Alert type="success" message={`Reconciliation run completed for ${reconDate}.`} />
        </div>
      )}

      <Tabs
        tabs={[
          { id: 'history', label: 'Run History' },
          { id: 'breaks', label: 'Open Breaks' },
        ]}
        activeTab={activeTab}
        onChange={id => setActiveTab(id as typeof activeTab)}
      />

      {activeTab === 'history' && (
        <Card title="Reconciliation Run History">
          <Table
            loading={historyLoading}
            data={historyResp?.data || []}
            columns={[
              { key: 'reconciliationDate', header: 'Date', render: r => format(new Date(r.reconciliationDate), 'dd MMM yyyy') },
              { key: 'reconciliationType', header: 'Type', width: '100px' },
              { key: 'currency', header: 'CCY', width: '60px' },
              { key: 'status', header: 'Status', render: r => statusBadge(r.status), width: '110px' },
              {
                key: 'totalRequirement', header: 'Requirement',
                render: r => <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>{Number(r.totalRequirement).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>,
              },
              {
                key: 'totalResource', header: 'Resource',
                render: r => <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>{Number(r.totalResource).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>,
              },
              {
                key: 'variance', header: 'Variance',
                render: r => (
                  <span style={{
                    color: Number(r.variance) < 0 ? 'var(--color-danger)' : Number(r.variance) > 0 ? 'var(--color-success)' : 'var(--color-navy-600)',
                    fontFamily: 'var(--font-mono)', fontSize: '12px', fontWeight: 600,
                  }}>
                    {Number(r.variance).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                ),
              },
              { key: 'trigger', header: 'Trigger', width: '100px' },
            ]}
            emptyMessage="No reconciliation runs yet. Use the 'Run Reconciliation' button to start."
          />
          {historyResp?.pagination && (
            <Pagination
              page={historyPage}
              totalPages={historyResp.pagination.totalPages}
              total={historyResp.pagination.total}
              onPageChange={setHistoryPage}
            />
          )}
        </Card>
      )}

      {activeTab === 'breaks' && (
        <Card title="Open Reconciliation Breaks">
          <Table
            loading={breaksLoading}
            data={breaksResp?.data || []}
            columns={[
              { key: 'safeguardingAccount', header: 'Account', render: r => r.safeguardingAccount ? `${r.safeguardingAccount.bankName} (${r.safeguardingAccount.accountNumberMasked})` : '\u2014' },
              { key: 'currency', header: 'CCY', render: r => r.reconciliationRun?.currency || '\u2014', width: '60px' },
              {
                key: 'variance', header: 'Variance',
                render: r => (
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: '12px', color: r.variance < 0 ? 'var(--color-danger)' : 'var(--color-warning)' }}>
                    {Number(r.variance).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                ),
              },
              { key: 'classification', header: 'Classification', render: r => statusBadge(r.classification) },
              { key: 'ageBusinessDays', header: 'Age (days)', width: '100px' },
              { key: 'firstDetectedDate', header: 'Detected', render: r => r.firstDetectedDate ? format(new Date(r.firstDetectedDate), 'dd MMM yyyy') : '\u2014' },
              {
                key: 'actions', header: '',
                render: r => isComplianceOrAdmin ? (
                  <Button
                    size="sm" variant="secondary"
                    onClick={e => {
                      e.stopPropagation();
                      setSelectedBreak({ id: r.id, variance: r.variance, ageBusinessDays: r.ageBusinessDays });
                      setShowResolveModal(true);
                    }}
                  >
                    Resolve
                  </Button>
                ) : null,
              },
            ]}
            emptyMessage="No open breaks. All reconciliation breaks have been resolved."
          />
          {breaksResp?.pagination && (
            <Pagination
              page={breaksPage}
              totalPages={breaksResp.pagination.totalPages}
              total={breaksResp.pagination.total}
              onPageChange={setBreaksPage}
            />
          )}
        </Card>
      )}

      <Modal
        open={showResolveModal}
        onClose={() => setShowResolveModal(false)}
        title="Resolve Reconciliation Break"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {selectedBreak && (
            <Alert
              type={selectedBreak.variance < 0 ? 'error' : 'warning'}
              message={`Variance: ${Number(selectedBreak.variance).toLocaleString(undefined, { minimumFractionDigits: 2 })} | Age: ${selectedBreak.ageBusinessDays} business days`}
            />
          )}
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--color-navy-700)', marginBottom: '6px' }}>Classification</label>
            <select
              value={resolution.classification}
              onChange={e => setResolution(p => ({ ...p, classification: e.target.value }))}
              style={{
                width: '100%', padding: '9px 12px', border: '1px solid var(--color-navy-300)',
                borderRadius: 'var(--radius-md)', fontSize: '13px', color: 'var(--color-navy-700)',
                background: 'white',
              }}
            >
              <option value="TIMING">Timing Difference</option>
              <option value="ERROR">Error</option>
              <option value="UNRESOLVED">Unresolved</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--color-navy-700)', marginBottom: '6px' }}>Explanation</label>
            <textarea
              value={resolution.explanation}
              onChange={e => setResolution(p => ({ ...p, explanation: e.target.value }))}
              rows={4}
              placeholder="Provide a detailed explanation for this break..."
              style={{
                width: '100%', padding: '9px 12px', border: '1px solid var(--color-navy-300)',
                borderRadius: 'var(--radius-md)', fontSize: '13px', resize: 'vertical',
                boxSizing: 'border-box', color: 'var(--color-navy-700)', fontFamily: 'inherit',
              }}
            />
          </div>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setShowResolveModal(false)}>Cancel</Button>
            <Button
              onClick={() => resolveMutation.mutate()}
              loading={resolveMutation.isPending}
              disabled={!resolution.explanation.trim()}
            >
              Submit Resolution
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
