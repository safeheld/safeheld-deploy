import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../hooks/useAuth';
import { safeguardingTimingApi } from '../../api/client';
import { Card, Table, Button, PageHeader, StatCard, Grid, Modal, Alert, Pagination, statusBadge, Badge } from '../../components/ui';
import { format } from 'date-fns';

export default function SafeguardingTimingPage() {
  const { user } = useAuth();
  const firmId = user!.firmId;
  const queryClient = useQueryClient();
  const isComplianceOrAdmin = ['COMPLIANCE_OFFICER', 'ADMIN'].includes(user!.role);
  const canRecord = ['COMPLIANCE_OFFICER', 'FINANCE_OPS', 'ADMIN'].includes(user!.role);

  const [activeTab, setActiveTab] = useState<'dashboard' | 'active' | 'unclaimed'>('dashboard');
  const [activePage, setActivePage] = useState(1);

  // Record received modal
  const [showReceivedModal, setShowReceivedModal] = useState(false);
  const [receivedForm, setReceivedForm] = useState({
    transactionRef: '', amount: '', currency: 'GBP', fundsReceivedAt: new Date().toISOString().slice(0, 16),
    fxType: '',
  });

  // Record exited modal
  const [showExitedModal, setShowExitedModal] = useState(false);
  const [selectedObligationId, setSelectedObligationId] = useState('');
  const [exitedForm, setExitedForm] = useState({
    safeguardingEndedAt: new Date().toISOString().slice(0, 16),
    endReason: 'PAYMENT_EXECUTED' as string,
  });

  // FX tag modal
  const [showFxModal, setShowFxModal] = useState(false);
  const [fxObligationId, setFxObligationId] = useState('');
  const [fxType, setFxType] = useState('FX_ONLY');

  const { data: dashboardData, isLoading: dashboardLoading } = useQuery({
    queryKey: ['safeguarding-timing-dashboard', firmId],
    queryFn: () => safeguardingTimingApi.getDashboard(firmId),
    enabled: activeTab === 'dashboard',
  });

  const { data: activeData, isLoading: activeLoading } = useQuery({
    queryKey: ['safeguarding-timing-active', firmId, activePage],
    queryFn: () => safeguardingTimingApi.getActive(firmId, { page: String(activePage), pageSize: '50' }),
    enabled: activeTab === 'active',
  });

  const { data: unclaimedData, isLoading: unclaimedLoading } = useQuery({
    queryKey: ['safeguarding-timing-unclaimed', firmId],
    queryFn: () => safeguardingTimingApi.getUnclaimed(firmId),
    enabled: activeTab === 'unclaimed',
  });

  const recordReceivedMutation = useMutation({
    mutationFn: () => safeguardingTimingApi.recordReceived(firmId, {
      ...receivedForm,
      amount: Number(receivedForm.amount),
      fxType: receivedForm.fxType || undefined,
    }),
    onSuccess: () => {
      setShowReceivedModal(false);
      setReceivedForm({ transactionRef: '', amount: '', currency: 'GBP', fundsReceivedAt: new Date().toISOString().slice(0, 16), fxType: '' });
      queryClient.invalidateQueries({ queryKey: ['safeguarding-timing-active', firmId] });
      queryClient.invalidateQueries({ queryKey: ['safeguarding-timing-dashboard', firmId] });
    },
  });

  const recordExitedMutation = useMutation({
    mutationFn: () => safeguardingTimingApi.recordExited(firmId, selectedObligationId, exitedForm),
    onSuccess: () => {
      setShowExitedModal(false);
      queryClient.invalidateQueries({ queryKey: ['safeguarding-timing-active', firmId] });
      queryClient.invalidateQueries({ queryKey: ['safeguarding-timing-dashboard', firmId] });
    },
  });

  const tagFxMutation = useMutation({
    mutationFn: () => safeguardingTimingApi.tagFx(firmId, fxObligationId, { fxType }),
    onSuccess: () => {
      setShowFxModal(false);
      queryClient.invalidateQueries({ queryKey: ['safeguarding-timing-active', firmId] });
    },
  });

  const markUnclaimedMutation = useMutation({
    mutationFn: (obligationId: string) => safeguardingTimingApi.markUnclaimed(firmId, obligationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['safeguarding-timing-unclaimed', firmId] });
      queryClient.invalidateQueries({ queryKey: ['safeguarding-timing-active', firmId] });
      queryClient.invalidateQueries({ queryKey: ['safeguarding-timing-dashboard', firmId] });
    },
  });

  const tabs = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'active', label: 'Active Obligations' },
    { id: 'unclaimed', label: 'Unclaimed Funds' },
  ];

  const activeObligations = activeData?.data || [];
  const activePagination = activeData?.pagination;
  const unclaimedFunds = unclaimedData?.data || unclaimedData || [];

  return (
    <div>
      <PageHeader title="Safeguarding Timing" />

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

      {activeTab === 'dashboard' && (
        <div>
          <div style={{ marginBottom: '20px' }}>
            <Grid cols={4}>
              <StatCard label="Active Obligations" value={dashboardData?.activeObligationsCount ?? '—'} />
              <StatCard label="Unclaimed Funds Total" value={dashboardData?.unclaimedFundsTotal != null ? `${Number(dashboardData.unclaimedFundsTotal).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '—'} />
              <StatCard label="Average Delay" value={dashboardData?.averageDelayMinutes != null ? `${Math.round(dashboardData.averageDelayMinutes)} min` : '—'} />
              <StatCard label="Warnings" value={dashboardData?.warningCount ?? '—'} color="var(--color-warning)" />
            </Grid>
          </div>

          {/* Chart placeholder */}
          <Card title="Timing Distribution">
            <div style={{
              height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--color-gray-400)', fontSize: '13px', background: 'var(--color-gray-50)',
              borderRadius: '6px',
            }}>
              Timing distribution chart - data visualisation will be rendered here when chart library is integrated
            </div>
          </Card>
        </div>
      )}

      {activeTab === 'active' && (
        <Card
          title="Active Safeguarding Obligations"
          actions={canRecord ? (
            <div style={{ display: 'flex', gap: '8px' }}>
              <Button onClick={() => setShowReceivedModal(true)}>Record Received</Button>
            </div>
          ) : undefined}
        >
          <Table
            loading={activeLoading}
            data={activeObligations}
            columns={[
              { key: 'clientName', header: 'Client', render: (r: any) => r.clientName || r.clientAccount?.name || '—' },
              { key: 'transactionRef', header: 'Ref', render: (r: any) => r.transactionRef || '—', width: '120px' },
              {
                key: 'amount', header: 'Amount',
                render: (r: any) => (
                  <span style={{ fontFamily: 'monospace' }}>
                    {r.currency || 'GBP'} {Number(r.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                ),
              },
              { key: 'fundsReceivedAt', header: 'Received At', render: (r: any) => r.fundsReceivedAt ? format(new Date(r.fundsReceivedAt), 'dd MMM yyyy HH:mm') : '—' },
              { key: 'safeguardingStartedAt', header: 'Safeguarding Started', render: (r: any) => r.safeguardingStartedAt ? format(new Date(r.safeguardingStartedAt), 'dd MMM yyyy HH:mm') : '—' },
              { key: 'status', header: 'Status', render: (r: any) => statusBadge(r.status || 'ACTIVE'), width: '100px' },
              { key: 'fxType', header: 'FX Type', render: (r: any) => r.fxType ? <Badge label={r.fxType} variant="info" /> : <Badge label="—" variant="neutral" />, width: '120px' },
              {
                key: 'actions', header: '',
                render: (r: any) => canRecord ? (
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <Button size="sm" variant="secondary" onClick={(e) => {
                      e.stopPropagation();
                      setSelectedObligationId(r.id);
                      setShowExitedModal(true);
                    }}>Exit</Button>
                    <Button size="sm" variant="ghost" onClick={(e) => {
                      e.stopPropagation();
                      setFxObligationId(r.id);
                      setFxType(r.fxType || 'FX_ONLY');
                      setShowFxModal(true);
                    }}>FX</Button>
                  </div>
                ) : null,
              },
            ]}
            emptyMessage="No active safeguarding obligations."
          />
          {activePagination && (
            <Pagination
              page={activePage}
              totalPages={activePagination.totalPages}
              total={activePagination.total}
              onPageChange={setActivePage}
            />
          )}
        </Card>
      )}

      {activeTab === 'unclaimed' && (
        <Card title="Unclaimed Funds">
          <Table
            loading={unclaimedLoading}
            data={Array.isArray(unclaimedFunds) ? unclaimedFunds : []}
            columns={[
              { key: 'transactionRef', header: 'Obligation Ref', render: (r: any) => r.transactionRef || r.id?.slice(0, 8) || '—' },
              {
                key: 'amount', header: 'Amount',
                render: (r: any) => (
                  <span style={{ fontFamily: 'monospace' }}>
                    {r.currency || 'GBP'} {Number(r.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                ),
              },
              { key: 'unclaimedSince', header: 'Unclaimed Since', render: (r: any) => r.unclaimedSince || r.markedUnclaimedAt ? format(new Date(r.unclaimedSince || r.markedUnclaimedAt), 'dd MMM yyyy') : '—' },
              {
                key: 'ageYears', header: 'Age (years)',
                render: (r: any) => {
                  const years = r.ageYears ?? r.ageInYears ?? '—';
                  return <span style={{ fontWeight: 600, color: years >= 6 ? 'var(--color-danger)' : years >= 5 ? 'var(--color-warning)' : undefined }}>{typeof years === 'number' ? years.toFixed(1) : years}</span>;
                },
                width: '100px',
              },
              {
                key: 'alertLevel', header: 'Alert',
                render: (r: any) => {
                  const years = r.ageYears ?? r.ageInYears ?? 0;
                  const level = r.alertLevel || (years >= 6 ? 'CRITICAL' : years >= 5 ? 'WARNING' : '—');
                  return level !== '—' ? statusBadge(level) : <span style={{ color: 'var(--color-gray-400)' }}>—</span>;
                },
                width: '100px',
              },
              {
                key: 'actions', header: '',
                render: (r: any) => isComplianceOrAdmin && !r.isUnclaimed ? (
                  <Button size="sm" variant="secondary" onClick={(e) => {
                    e.stopPropagation();
                    markUnclaimedMutation.mutate(r.id);
                  }} loading={markUnclaimedMutation.isPending}>
                    Mark Unclaimed
                  </Button>
                ) : null,
              },
            ]}
            emptyMessage="No unclaimed funds."
          />
        </Card>
      )}

      {/* Record Received Modal */}
      <Modal open={showReceivedModal} onClose={() => setShowReceivedModal(false)} title="Record Funds Received">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px' }}>Transaction Reference</label>
            <input value={receivedForm.transactionRef} onChange={e => setReceivedForm(p => ({ ...p, transactionRef: e.target.value }))}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--color-gray-300)', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px' }}>Amount *</label>
              <input type="number" step="0.01" value={receivedForm.amount} onChange={e => setReceivedForm(p => ({ ...p, amount: e.target.value }))}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--color-gray-300)', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px' }}>Currency *</label>
              <input value={receivedForm.currency} onChange={e => setReceivedForm(p => ({ ...p, currency: e.target.value }))} maxLength={3}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--color-gray-300)', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }} />
            </div>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px' }}>Funds Received At *</label>
            <input type="datetime-local" value={receivedForm.fundsReceivedAt} onChange={e => setReceivedForm(p => ({ ...p, fundsReceivedAt: e.target.value }))}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--color-gray-300)', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px' }}>FX Type (optional)</label>
            <select value={receivedForm.fxType} onChange={e => setReceivedForm(p => ({ ...p, fxType: e.target.value }))}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--color-gray-300)', borderRadius: '6px', fontSize: '13px', background: 'white' }}>
              <option value="">None</option>
              <option value="FX_ONLY">FX Only</option>
              <option value="PAYMENT_LINKED">Payment Linked</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setShowReceivedModal(false)}>Cancel</Button>
            <Button onClick={() => recordReceivedMutation.mutate()} loading={recordReceivedMutation.isPending}
              disabled={!receivedForm.amount || !receivedForm.currency}>
              Record
            </Button>
          </div>
        </div>
      </Modal>

      {/* Record Exited Modal */}
      <Modal open={showExitedModal} onClose={() => setShowExitedModal(false)} title="Record Funds Exit">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px' }}>Safeguarding Ended At *</label>
            <input type="datetime-local" value={exitedForm.safeguardingEndedAt} onChange={e => setExitedForm(p => ({ ...p, safeguardingEndedAt: e.target.value }))}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--color-gray-300)', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px' }}>End Reason *</label>
            <select value={exitedForm.endReason} onChange={e => setExitedForm(p => ({ ...p, endReason: e.target.value }))}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--color-gray-300)', borderRadius: '6px', fontSize: '13px', background: 'white' }}>
              <option value="PAYMENT_EXECUTED">Payment Executed</option>
              <option value="E_MONEY_REDEEMED">E-Money Redeemed</option>
              <option value="FX_SETTLEMENT">FX Settlement</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setShowExitedModal(false)}>Cancel</Button>
            <Button onClick={() => recordExitedMutation.mutate()} loading={recordExitedMutation.isPending}>
              Record Exit
            </Button>
          </div>
        </div>
      </Modal>

      {/* FX Tag Modal */}
      <Modal open={showFxModal} onClose={() => setShowFxModal(false)} title="Tag FX Transaction">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px' }}>FX Type *</label>
            <select value={fxType} onChange={e => setFxType(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--color-gray-300)', borderRadius: '6px', fontSize: '13px', background: 'white' }}>
              <option value="FX_ONLY">FX Only</option>
              <option value="PAYMENT_LINKED">Payment Linked</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setShowFxModal(false)}>Cancel</Button>
            <Button onClick={() => tagFxMutation.mutate()} loading={tagFxMutation.isPending}>
              Tag FX
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
