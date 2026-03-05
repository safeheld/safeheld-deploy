import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../hooks/useAuth';
import { breachApi } from '../../api/client';
import { Card, Table, Button, PageHeader, Pagination, statusBadge, Modal, Alert } from '../../components/ui';
import { format } from 'date-fns';
import type { Breach } from '../../types';

export default function BreachPage() {
  const { user } = useAuth();
  const firmId = user!.firmId;
  const queryClient = useQueryClient();
  const isCompliance = ['COMPLIANCE_OFFICER', 'ADMIN'].includes(user!.role);

  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedBreach, setSelectedBreach] = useState<any>(null);
  const [showAckModal, setShowAckModal] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [showFcaModal, setShowFcaModal] = useState(false);
  const [remediationAction, setRemediationAction] = useState('');
  const [newStatus, setNewStatus] = useState<'REMEDIATING' | 'RESOLVED' | 'CLOSED'>('REMEDIATING');
  const [evidence, setEvidence] = useState('');
  const [fcaForm, setFcaForm] = useState({ notification_type: 'SAFEGUARDING_BREACH', description: '' });
  const [actionError, setActionError] = useState('');

  const { data: breachesResp, isLoading } = useQuery({
    queryKey: ['breaches', firmId, page, statusFilter],
    queryFn: () => breachApi.getBreaches(firmId, { page: String(page), ...(statusFilter ? { status: statusFilter } : {}) }),
  });

  const ackMutation = useMutation({
    mutationFn: () => breachApi.acknowledge(firmId, selectedBreach!.id, remediationAction),
    onSuccess: () => {
      setShowAckModal(false);
      queryClient.invalidateQueries({ queryKey: ['breaches', firmId] });
      queryClient.invalidateQueries({ queryKey: ['recon-dashboard', firmId] });
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      setActionError(msg || 'Action failed.');
    },
  });

  const statusMutation = useMutation({
    mutationFn: () => breachApi.updateStatus(firmId, selectedBreach!.id, newStatus, evidence),
    onSuccess: () => {
      setShowStatusModal(false);
      queryClient.invalidateQueries({ queryKey: ['breaches', firmId] });
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      setActionError(msg || 'Status update failed.');
    },
  });

  const fcaMutation = useMutation({
    mutationFn: () => breachApi.createFcaNotification(firmId, selectedBreach!.id, fcaForm),
    onSuccess: () => {
      setShowFcaModal(false);
      queryClient.invalidateQueries({ queryKey: ['breaches', firmId] });
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      setActionError(msg || 'FCA notification creation failed.');
    },
  });

  const severityColor = (s: string) =>
    s === 'CRITICAL' ? 'var(--color-danger)' : s === 'HIGH' ? '#ea580c' : s === 'MEDIUM' ? 'var(--color-warning)' : 'var(--color-navy-500)';

  const breaches = breachesResp?.data || [];
  const pagination = breachesResp?.pagination;

  const filterOptions = ['', 'DETECTED', 'ACKNOWLEDGED', 'REMEDIATING', 'RESOLVED', 'CLOSED'];

  return (
    <div>
      <PageHeader title="Breach Management" />

      {/* Filters */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {filterOptions.map(s => (
          <button
            key={s}
            onClick={() => { setStatusFilter(s); setPage(1); }}
            style={{
              padding: '6px 16px', borderRadius: '9999px', fontSize: '12px', fontWeight: 500,
              cursor: 'pointer', border: '1px solid',
              background: statusFilter === s ? 'var(--color-accent)' : 'white',
              color: statusFilter === s ? 'white' : 'var(--color-navy-600)',
              borderColor: statusFilter === s ? 'var(--color-accent)' : 'var(--color-navy-200)',
              transition: 'all var(--transition-fast)',
              boxShadow: statusFilter === s ? '0 1px 3px rgb(61 61 255 / 0.2)' : 'var(--shadow-xs)',
            }}
          >
            {s || 'All'}
          </button>
        ))}
      </div>

      <Card>
        <Table
          loading={isLoading}
          data={breaches}
          columns={[
            {
              key: 'severity', header: 'Severity',
              render: r => <span style={{ fontWeight: 700, fontSize: '12px', color: severityColor(r.severity) }}>{r.severity}</span>,
              width: '90px',
            },
            { key: 'breachType', header: 'Type', render: r => r.breachType.replace(/_/g, ' '), width: '180px' },
            { key: 'status', header: 'Status', render: r => statusBadge(r.status), width: '130px' },
            {
              key: 'isNotifiable', header: 'Notifiable',
              render: r => r.isNotifiable ? <span style={{ color: 'var(--color-danger)', fontWeight: 600, fontSize: '12px' }}>Yes</span> : <span style={{ color: 'var(--color-navy-400)', fontSize: '12px' }}>No</span>,
              width: '90px',
            },
            { key: 'currency', header: 'CCY', render: r => r.currency || '\u2014', width: '60px' },
            {
              key: 'shortfallAmount', header: 'Shortfall',
              render: r => r.shortfallAmount
                ? <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>{Number(r.shortfallAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                : '\u2014',
              width: '120px',
            },
            { key: 'createdAt', header: 'Detected', render: r => format(new Date(r.createdAt), 'dd MMM yyyy'), width: '120px' },
            {
              key: 'actions', header: '',
              render: r => isCompliance ? (
                <div style={{ display: 'flex', gap: '6px' }}>
                  {r.status === 'DETECTED' && (
                    <Button size="sm" onClick={e => { e.stopPropagation(); setSelectedBreach(r); setShowAckModal(true); setActionError(''); }}>
                      Acknowledge
                    </Button>
                  )}
                  {['ACKNOWLEDGED', 'REMEDIATING', 'RESOLVED'].includes(r.status) && (
                    <Button size="sm" variant="secondary" onClick={e => {
                      e.stopPropagation();
                      setSelectedBreach(r);
                      setNewStatus(r.status === 'ACKNOWLEDGED' ? 'REMEDIATING' : r.status === 'REMEDIATING' ? 'RESOLVED' : 'CLOSED');
                      setShowStatusModal(true);
                      setActionError('');
                    }}>
                      Update
                    </Button>
                  )}
                  {r.isNotifiable && ['DETECTED', 'ACKNOWLEDGED', 'REMEDIATING'].includes(r.status) && (
                    <Button size="sm" variant="danger" onClick={e => {
                      e.stopPropagation();
                      setSelectedBreach(r);
                      setShowFcaModal(true);
                      setActionError('');
                    }}>
                      FCA Notify
                    </Button>
                  )}
                </div>
              ) : null,
            },
          ]}
          emptyMessage="No breaches found for the selected filter."
        />
        {pagination && (
          <Pagination page={page} totalPages={pagination.totalPages} total={pagination.total} onPageChange={setPage} />
        )}
      </Card>

      {/* Acknowledge Modal */}
      <Modal open={showAckModal} onClose={() => setShowAckModal(false)} title="Acknowledge Breach">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {selectedBreach && (
            <div style={{
              padding: '14px 16px', background: 'var(--color-navy-50)',
              borderRadius: 'var(--radius-md)', fontSize: '13px',
              border: '1px solid var(--color-navy-200)',
            }}>
              <strong style={{ color: severityColor(selectedBreach.severity) }}>{selectedBreach.severity}</strong>
              <span style={{ color: 'var(--color-navy-400)', margin: '0 8px' }}>{'\u2014'}</span>
              {selectedBreach.breachType.replace(/_/g, ' ')}
              <p style={{ margin: '8px 0 0', color: 'var(--color-navy-600)', lineHeight: 1.5 }}>{selectedBreach.description}</p>
            </div>
          )}
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--color-navy-700)', marginBottom: '6px' }}>Remediation Action Plan *</label>
            <textarea
              value={remediationAction}
              onChange={e => setRemediationAction(e.target.value)}
              rows={4}
              placeholder="Describe the steps being taken to remediate this breach..."
              style={{
                width: '100%', padding: '9px 12px', border: '1px solid var(--color-navy-300)',
                borderRadius: 'var(--radius-md)', fontSize: '13px', resize: 'vertical',
                boxSizing: 'border-box', fontFamily: 'inherit', color: 'var(--color-navy-700)',
              }}
            />
          </div>
          {actionError && <Alert type="error" message={actionError} />}
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setShowAckModal(false)}>Cancel</Button>
            <Button onClick={() => ackMutation.mutate()} loading={ackMutation.isPending} disabled={!remediationAction.trim()}>
              Acknowledge Breach
            </Button>
          </div>
        </div>
      </Modal>

      {/* Status Update Modal */}
      <Modal open={showStatusModal} onClose={() => setShowStatusModal(false)} title="Update Breach Status">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <p style={{ margin: 0, fontSize: '13px', color: 'var(--color-navy-600)' }}>
            Transition breach to: <strong style={{ color: 'var(--color-navy-900)' }}>{newStatus}</strong>
          </p>
          {['RESOLVED', 'CLOSED'].includes(newStatus) && (
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--color-navy-700)', marginBottom: '6px' }}>Closure Evidence</label>
              <textarea
                value={evidence}
                onChange={e => setEvidence(e.target.value)}
                rows={3}
                placeholder="Describe the evidence that the breach has been resolved..."
                style={{
                  width: '100%', padding: '9px 12px', border: '1px solid var(--color-navy-300)',
                  borderRadius: 'var(--radius-md)', fontSize: '13px', resize: 'vertical',
                  boxSizing: 'border-box', fontFamily: 'inherit', color: 'var(--color-navy-700)',
                }}
              />
            </div>
          )}
          {actionError && <Alert type="error" message={actionError} />}
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setShowStatusModal(false)}>Cancel</Button>
            <Button onClick={() => statusMutation.mutate()} loading={statusMutation.isPending}>
              Update Status
            </Button>
          </div>
        </div>
      </Modal>

      {/* FCA Notification Modal */}
      <Modal open={showFcaModal} onClose={() => setShowFcaModal(false)} title="Create FCA Notification">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <Alert type="warning" message="This will create a draft FCA notification for regulatory submission." />
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--color-navy-700)', marginBottom: '6px' }}>Notification Type</label>
            <select
              value={fcaForm.notification_type}
              onChange={e => setFcaForm(p => ({ ...p, notification_type: e.target.value }))}
              style={{
                width: '100%', padding: '9px 12px', border: '1px solid var(--color-navy-300)',
                borderRadius: 'var(--radius-md)', fontSize: '13px', color: 'var(--color-navy-700)',
                background: 'white',
              }}
            >
              <option value="SAFEGUARDING_BREACH">Safeguarding Breach</option>
              <option value="RESOLUTION_PACK_FAILURE">Resolution Pack Failure</option>
              <option value="RECORDS_FAILURE">Records Failure</option>
              <option value="RECONCILIATION_FAILURE">Reconciliation Failure</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--color-navy-700)', marginBottom: '6px' }}>Description</label>
            <textarea
              value={fcaForm.description}
              onChange={e => setFcaForm(p => ({ ...p, description: e.target.value }))}
              rows={5}
              placeholder="Provide a detailed description for the FCA notification..."
              style={{
                width: '100%', padding: '9px 12px', border: '1px solid var(--color-navy-300)',
                borderRadius: 'var(--radius-md)', fontSize: '13px', resize: 'vertical',
                boxSizing: 'border-box', fontFamily: 'inherit', color: 'var(--color-navy-700)',
              }}
            />
          </div>
          {actionError && <Alert type="error" message={actionError} />}
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setShowFcaModal(false)}>Cancel</Button>
            <Button variant="danger" onClick={() => fcaMutation.mutate()} loading={fcaMutation.isPending} disabled={!fcaForm.description.trim()}>
              Create Notification (Draft)
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
