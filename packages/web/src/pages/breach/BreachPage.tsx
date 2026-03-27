import React, { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../hooks/useAuth';
import { breachApi } from '../../api/client';
import { Card, Table, Button, PageHeader, Pagination, statusBadge, Modal, Alert, LoadingSkeleton, EmptyState, ErrorState } from '../../components/ui';
import { format } from 'date-fns';
import type { Breach } from '../../types';

export default function BreachPage() {
  const { user } = useAuth();
  const firmId = user!.firmId;
  const queryClient = useQueryClient();
  const isCompliance = ['COMPLIANCE_OFFICER', 'ADMIN'].includes(user!.role);

  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedBreach, setSelectedBreach] = useState<Breach | null>(null);
  const [showAckModal, setShowAckModal] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [showFcaModal, setShowFcaModal] = useState(false);
  const [showManualModal, setShowManualModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [remediationAction, setRemediationAction] = useState('');
  const [newStatus, setNewStatus] = useState<'REMEDIATING' | 'RESOLVED' | 'CLOSED'>('REMEDIATING');
  const [evidence, setEvidence] = useState('');
  const [fcaForm, setFcaForm] = useState({ notification_type: 'SAFEGUARDING_BREACH', description: '' });
  const [actionError, setActionError] = useState('');
  const [templateResult, setTemplateResult] = useState<object | null>(null);

  // Manual breach form
  const [manualForm, setManualForm] = useState({
    breachType: 'SHORTFALL',
    severity: 'MEDIUM',
    description: '',
    dateOccurred: '',
    dateIdentified: '',
    category: 'RECONCILIATION',
    personResponsible: '',
    isMaterial: false,
  });

  // File upload
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: breachesResp, isLoading, error: breachesError, refetch: breachesRefetch } = useQuery({
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

  const manualMutation = useMutation({
    mutationFn: () => breachApi.createManual(firmId, {
      ...manualForm,
      dateOccurred: manualForm.dateOccurred || undefined,
      dateIdentified: manualForm.dateIdentified || undefined,
      personResponsible: manualForm.personResponsible || undefined,
    }),
    onSuccess: () => {
      setShowManualModal(false);
      queryClient.invalidateQueries({ queryKey: ['breaches', firmId] });
      setManualForm({ breachType: 'SHORTFALL', severity: 'MEDIUM', description: '', dateOccurred: '', dateIdentified: '', category: 'RECONCILIATION', personResponsible: '', isMaterial: false });
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      setActionError(msg || 'Failed to create manual breach.');
    },
  });

  const uploadMutation = useMutation({
    mutationFn: (formData: FormData) => breachApi.uploadDocument(firmId, selectedBreach!.id, formData),
    onSuccess: () => {
      setShowUploadModal(false);
      queryClient.invalidateQueries({ queryKey: ['breaches', firmId] });
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      setActionError(msg || 'Document upload failed.');
    },
  });

  const templateMutation = useMutation({
    mutationFn: () => breachApi.getFcaTemplate(firmId, selectedBreach!.id, {}),
    onSuccess: (data) => {
      setTemplateResult(data);
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      setActionError(msg || 'Failed to generate FCA template.');
    },
  });

  const handleFileUpload = () => {
    const file = fileInputRef.current?.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('document', file);
    uploadMutation.mutate(formData);
  };

  const severityColor = (s: string) => s === 'CRITICAL' ? '#dc2626' : s === 'HIGH' ? '#ea580c' : s === 'MEDIUM' ? '#d97706' : '#6b7280';

  const breaches = breachesResp?.data || [];
  const pagination = breachesResp?.pagination;

  return (
    <div>
      <PageHeader
        title="Breach Management"
        actions={isCompliance ? (
          <Button onClick={() => { setShowManualModal(true); setActionError(''); }}>
            Create Manual Breach
          </Button>
        ) : undefined}
      />

      {/* Filters */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
        {['', 'DETECTED', 'ACKNOWLEDGED', 'REMEDIATING', 'RESOLVED', 'CLOSED'].map(s => (
          <button
            key={s}
            onClick={() => { setStatusFilter(s); setPage(1); }}
            style={{
              padding: '6px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: 500,
              cursor: 'pointer', border: '1px solid',
              background: statusFilter === s ? 'var(--color-primary)' : 'white',
              color: statusFilter === s ? 'white' : 'var(--color-gray-600)',
              borderColor: statusFilter === s ? 'var(--color-primary)' : 'var(--color-gray-300)',
            }}
          >
            {s || 'All'}
          </button>
        ))}
      </div>

      {breachesError && <ErrorState message="Failed to load breaches." onRetry={() => breachesRefetch()} />}
      {isLoading && <LoadingSkeleton type="table" />}
      {!breachesError && !isLoading && <Card>
        <Table
          loading={false}
          data={breaches}
          columns={[
            {
              key: 'severity', header: 'Severity',
              render: r => <span style={{ fontWeight: 700, color: severityColor(r.severity) }}>{r.severity}</span>,
              width: '90px',
            },
            { key: 'breachType', header: 'Type', render: r => r.breachType.replace(/_/g, ' '), width: '180px' },
            { key: 'status', header: 'Status', render: r => statusBadge(r.status), width: '120px' },
            {
              key: 'isNotifiable', header: 'Notifiable',
              render: r => r.isNotifiable ? <span style={{ color: 'var(--color-danger)', fontWeight: 600 }}>Yes</span> : 'No',
              width: '90px',
            },
            { key: 'currency', header: 'CCY', render: r => r.currency || '—', width: '60px' },
            {
              key: 'shortfallAmount', header: 'Shortfall',
              render: r => r.shortfallAmount ? Number(r.shortfallAmount).toLocaleString(undefined, { minimumFractionDigits: 2 }) : '—',
              width: '120px',
            },
            { key: 'createdAt', header: 'Detected', render: r => format(new Date(r.createdAt), 'dd MMM yyyy'), width: '120px' },
            {
              key: 'actions', header: '',
              render: r => isCompliance ? (
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
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
                  <Button size="sm" variant="secondary" onClick={e => {
                    e.stopPropagation();
                    setSelectedBreach(r);
                    setShowUploadModal(true);
                    setActionError('');
                  }}>
                    Upload Doc
                  </Button>
                  {r.isNotifiable && (
                    <Button size="sm" variant="secondary" onClick={e => {
                      e.stopPropagation();
                      setSelectedBreach(r);
                      setTemplateResult(null);
                      setShowTemplateModal(true);
                      setActionError('');
                    }}>
                      FCA Template
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
      </Card>}

      {/* Acknowledge Modal */}
      <Modal open={showAckModal} onClose={() => setShowAckModal(false)} title="Acknowledge Breach">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {selectedBreach && (
            <div style={{ padding: '12px', background: 'var(--color-gray-50)', borderRadius: '6px', fontSize: '13px' }}>
              <strong>{selectedBreach.severity}</strong> — {selectedBreach.breachType.replace(/_/g, ' ')}
              <p style={{ margin: '6px 0 0', color: 'var(--color-gray-600)' }}>{selectedBreach.description}</p>
            </div>
          )}
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px' }}>Remediation Action Plan *</label>
            <textarea
              value={remediationAction}
              onChange={e => setRemediationAction(e.target.value)}
              rows={4}
              placeholder="Describe the steps being taken to remediate this breach..."
              style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--color-gray-300)', borderRadius: '6px', fontSize: '13px', resize: 'vertical', boxSizing: 'border-box' }}
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <p style={{ margin: 0, fontSize: '13px', color: 'var(--color-gray-600)' }}>
            Transition breach to: <strong>{newStatus}</strong>
          </p>
          {['RESOLVED', 'CLOSED'].includes(newStatus) && (
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px' }}>Closure Evidence</label>
              <textarea
                value={evidence}
                onChange={e => setEvidence(e.target.value)}
                rows={3}
                placeholder="Describe the evidence that the breach has been resolved..."
                style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--color-gray-300)', borderRadius: '6px', fontSize: '13px', resize: 'vertical', boxSizing: 'border-box' }}
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <Alert type="warning" message="This will create a draft FCA notification for regulatory submission." />
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px' }}>Notification Type</label>
            <select
              value={fcaForm.notification_type}
              onChange={e => setFcaForm(p => ({ ...p, notification_type: e.target.value }))}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--color-gray-300)', borderRadius: '6px', fontSize: '13px' }}
            >
              <option value="SAFEGUARDING_BREACH">Safeguarding Breach</option>
              <option value="RESOLUTION_PACK_FAILURE">Resolution Pack Failure</option>
              <option value="RECORDS_FAILURE">Records Failure</option>
              <option value="RECONCILIATION_FAILURE">Reconciliation Failure</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px' }}>Description</label>
            <textarea
              value={fcaForm.description}
              onChange={e => setFcaForm(p => ({ ...p, description: e.target.value }))}
              rows={5}
              placeholder="Provide a detailed description for the FCA notification..."
              style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--color-gray-300)', borderRadius: '6px', fontSize: '13px', resize: 'vertical', boxSizing: 'border-box' }}
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

      {/* Create Manual Breach Modal */}
      <Modal open={showManualModal} onClose={() => setShowManualModal(false)} title="Create Manual Breach">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px' }}>Breach Type *</label>
              <select
                value={manualForm.breachType}
                onChange={e => setManualForm(p => ({ ...p, breachType: e.target.value }))}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--color-gray-300)', borderRadius: '6px', fontSize: '13px' }}
              >
                <option value="SHORTFALL">Shortfall</option>
                <option value="EXCESS">Excess</option>
                <option value="TIMING_BREACH">Timing Breach</option>
                <option value="RECORD_KEEPING">Record Keeping</option>
                <option value="GOVERNANCE">Governance</option>
                <option value="POLICY_BREACH">Policy Breach</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px' }}>Severity *</label>
              <select
                value={manualForm.severity}
                onChange={e => setManualForm(p => ({ ...p, severity: e.target.value }))}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--color-gray-300)', borderRadius: '6px', fontSize: '13px' }}
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="CRITICAL">Critical</option>
              </select>
            </div>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px' }}>Description *</label>
            <textarea
              value={manualForm.description}
              onChange={e => setManualForm(p => ({ ...p, description: e.target.value }))}
              rows={4}
              placeholder="Describe the breach in detail..."
              style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--color-gray-300)', borderRadius: '6px', fontSize: '13px', resize: 'vertical', boxSizing: 'border-box' }}
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px' }}>Date Occurred</label>
              <input
                type="date"
                value={manualForm.dateOccurred}
                onChange={e => setManualForm(p => ({ ...p, dateOccurred: e.target.value }))}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--color-gray-300)', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px' }}>Date Identified</label>
              <input
                type="date"
                value={manualForm.dateIdentified}
                onChange={e => setManualForm(p => ({ ...p, dateIdentified: e.target.value }))}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--color-gray-300)', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }}
              />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px' }}>Category</label>
              <select
                value={manualForm.category}
                onChange={e => setManualForm(p => ({ ...p, category: e.target.value }))}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--color-gray-300)', borderRadius: '6px', fontSize: '13px' }}
              >
                <option value="RECONCILIATION">Reconciliation</option>
                <option value="SAFEGUARDING">Safeguarding</option>
                <option value="GOVERNANCE">Governance</option>
                <option value="REPORTING">Reporting</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px' }}>Person Responsible</label>
              <input
                value={manualForm.personResponsible}
                onChange={e => setManualForm(p => ({ ...p, personResponsible: e.target.value }))}
                placeholder="Name of person responsible"
                style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--color-gray-300)', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }}
              />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              type="checkbox"
              checked={manualForm.isMaterial}
              onChange={e => setManualForm(p => ({ ...p, isMaterial: e.target.checked }))}
              id="isMaterial"
            />
            <label htmlFor="isMaterial" style={{ fontSize: '13px', fontWeight: 500 }}>Material breach (notifiable to FCA)</label>
          </div>
          {actionError && <Alert type="error" message={actionError} />}
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setShowManualModal(false)}>Cancel</Button>
            <Button onClick={() => manualMutation.mutate()} loading={manualMutation.isPending} disabled={!manualForm.description.trim()}>
              Create Breach
            </Button>
          </div>
        </div>
      </Modal>

      {/* Upload Document Modal */}
      <Modal open={showUploadModal} onClose={() => setShowUploadModal(false)} title="Upload Breach Document">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {selectedBreach && (
            <div style={{ padding: '12px', background: 'var(--color-gray-50)', borderRadius: '6px', fontSize: '13px' }}>
              <strong>{selectedBreach.severity}</strong> — {selectedBreach.breachType.replace(/_/g, ' ')}
            </div>
          )}
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px' }}>Select Document</label>
            <input
              ref={fileInputRef}
              type="file"
              style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--color-gray-300)', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }}
            />
          </div>
          {actionError && <Alert type="error" message={actionError} />}
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setShowUploadModal(false)}>Cancel</Button>
            <Button onClick={handleFileUpload} loading={uploadMutation.isPending}>
              Upload Document
            </Button>
          </div>
        </div>
      </Modal>

      {/* FCA Template Modal */}
      <Modal open={showTemplateModal} onClose={() => setShowTemplateModal(false)} title="FCA Notification Template">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {selectedBreach && (
            <div style={{ padding: '12px', background: 'var(--color-gray-50)', borderRadius: '6px', fontSize: '13px' }}>
              <strong>{selectedBreach.severity}</strong> — {selectedBreach.breachType.replace(/_/g, ' ')}
            </div>
          )}
          {!templateResult ? (
            <>
              <p style={{ margin: 0, fontSize: '13px', color: 'var(--color-gray-600)' }}>
                Generate an FCA notification template pre-populated with breach details.
              </p>
              {actionError && <Alert type="error" message={actionError} />}
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <Button variant="secondary" onClick={() => setShowTemplateModal(false)}>Cancel</Button>
                <Button onClick={() => templateMutation.mutate()} loading={templateMutation.isPending}>
                  Generate Template
                </Button>
              </div>
            </>
          ) : (
            <>
              <pre style={{ background: 'var(--color-gray-50)', padding: '16px', borderRadius: '6px', fontSize: '12px', overflow: 'auto', maxHeight: '400px', whiteSpace: 'pre-wrap' }}>
                {JSON.stringify(templateResult, null, 2)}
              </pre>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <Button variant="secondary" onClick={() => setShowTemplateModal(false)}>Close</Button>
                <Button onClick={() => {
                  const blob = new Blob([JSON.stringify(templateResult, null, 2)], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `fca-template-${selectedBreach?.id || 'breach'}.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}>
                  Download Template
                </Button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}
