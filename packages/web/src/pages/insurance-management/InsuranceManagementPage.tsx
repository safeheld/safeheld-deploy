import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../hooks/useAuth';
import { insuranceManagementApi } from '../../api/client';
import { Card, Table, Button, PageHeader, Modal, Alert, statusBadge, Badge } from '../../components/ui';
import { format, differenceInDays } from 'date-fns';

const COVERAGE_TYPES = [
  'PROFESSIONAL_INDEMNITY', 'FIDELITY_GUARANTEE', 'COMPREHENSIVE',
  'CRIME', 'CYBER', 'OTHER',
];

export default function InsuranceManagementPage() {
  const { user } = useAuth();
  const firmId = user!.firmId;
  const queryClient = useQueryClient();
  const isComplianceOrAdmin = ['COMPLIANCE_OFFICER', 'ADMIN'].includes(user!.role);

  const [activeTab, setActiveTab] = useState<'policies' | 'expiry' | 'notifications'>('policies');

  // Add policy modal
  const [showPolicyModal, setShowPolicyModal] = useState(false);
  const [policyForm, setPolicyForm] = useState({
    insurerName: '', policyNumber: '', coverageType: 'PROFESSIONAL_INDEMNITY',
    coverageAmount: '', coverageCurrency: 'GBP', effectiveDate: '', expiryDate: '',
    contingencyPlanRequiredBy: '', premium: '', hasRestrictiveConditions: false,
    restrictiveConditionDetails: '',
  });

  // Expiry decision modal
  const [showDecisionModal, setShowDecisionModal] = useState(false);
  const [selectedPolicyId, setSelectedPolicyId] = useState('');
  const [decisionForm, setDecisionForm] = useState({
    decision: 'CONTINUE' as string, fcaNotified: false, fcaNotificationDate: '', contingencyPlan: '',
  });

  const { data: policiesData, isLoading: policiesLoading } = useQuery({
    queryKey: ['insurance-policies', firmId],
    queryFn: () => insuranceManagementApi.getPolicies(firmId),
    enabled: activeTab === 'policies',
  });

  const { data: expiryData, isLoading: expiryLoading } = useQuery({
    queryKey: ['insurance-expiry', firmId],
    queryFn: () => insuranceManagementApi.getExpiry(firmId),
    enabled: activeTab === 'expiry',
  });

  const { data: notificationsData, isLoading: notificationsLoading } = useQuery({
    queryKey: ['insurance-fca-notifications', firmId],
    queryFn: () => insuranceManagementApi.getFcaNotifications(firmId),
    enabled: activeTab === 'notifications',
  });

  const createPolicyMutation = useMutation({
    mutationFn: () => insuranceManagementApi.createPolicy(firmId, {
      ...policyForm,
      coverageAmount: Number(policyForm.coverageAmount),
      premium: policyForm.premium ? Number(policyForm.premium) : undefined,
    }),
    onSuccess: () => {
      setShowPolicyModal(false);
      setPolicyForm({
        insurerName: '', policyNumber: '', coverageType: 'PROFESSIONAL_INDEMNITY',
        coverageAmount: '', coverageCurrency: 'GBP', effectiveDate: '', expiryDate: '',
        contingencyPlanRequiredBy: '', premium: '', hasRestrictiveConditions: false,
        restrictiveConditionDetails: '',
      });
      queryClient.invalidateQueries({ queryKey: ['insurance-policies', firmId] });
      queryClient.invalidateQueries({ queryKey: ['insurance-expiry', firmId] });
    },
  });

  const recordDecisionMutation = useMutation({
    mutationFn: () => insuranceManagementApi.recordDecision(firmId, selectedPolicyId, decisionForm),
    onSuccess: () => {
      setShowDecisionModal(false);
      queryClient.invalidateQueries({ queryKey: ['insurance-expiry', firmId] });
      queryClient.invalidateQueries({ queryKey: ['insurance-fca-notifications', firmId] });
    },
  });

  const tabs = [
    { id: 'policies', label: 'Policies' },
    { id: 'expiry', label: 'Expiry Management' },
    { id: 'notifications', label: 'FCA Notifications' },
  ];

  const policies = policiesData?.data || policiesData || [];
  const expiryItems = expiryData?.policies || expiryData || [];
  const notifications = notificationsData?.data || notificationsData || [];

  return (
    <div>
      <PageHeader title="Insurance Management" />

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

      {activeTab === 'policies' && (
        <Card
          title="Insurance Policies"
          actions={isComplianceOrAdmin ? (
            <Button onClick={() => setShowPolicyModal(true)}>Add Policy</Button>
          ) : undefined}
        >
          <Table
            loading={policiesLoading}
            data={policies}
            columns={[
              { key: 'insurerName', header: 'Insurer' },
              { key: 'policyNumber', header: 'Policy No.', width: '120px' },
              { key: 'coverageType', header: 'Coverage', render: (r: any) => <Badge label={(r.coverageType || '').replace(/_/g, ' ')} variant="info" />, width: '160px' },
              { key: 'coverageAmount', header: 'Amount', render: (r: any) => `${r.coverageCurrency || 'GBP'} ${Number(r.coverageAmount || 0).toLocaleString()}`, width: '140px' },
              { key: 'effectiveDate', header: 'Effective', render: (r: any) => r.effectiveDate ? format(new Date(r.effectiveDate), 'dd MMM yyyy') : '—' },
              { key: 'expiryDate', header: 'Expiry', render: (r: any) => r.expiryDate ? format(new Date(r.expiryDate), 'dd MMM yyyy') : '—' },
              { key: 'status', header: 'Status', render: (r: any) => statusBadge(r.status || (new Date(r.expiryDate) < new Date() ? 'EXPIRED' : 'ACTIVE')), width: '90px' },
              { key: 'hasRestrictiveConditions', header: 'Restrictive', render: (r: any) => r.hasRestrictiveConditions ? <Badge label="Yes" variant="warning" /> : <Badge label="No" variant="neutral" />, width: '90px' },
            ]}
            emptyMessage="No insurance policies registered."
          />
        </Card>
      )}

      {activeTab === 'expiry' && (
        <div>
          {/* Critical risk alerts */}
          {Array.isArray(expiryItems) && expiryItems.some((item: any) => {
            const days = item.daysUntilExpiry ?? (item.expiryDate ? differenceInDays(new Date(item.expiryDate), new Date()) : null);
            return days !== null && days <= 30;
          }) && (
            <div style={{ marginBottom: '16px' }}>
              <Alert type="error" message="One or more insurance policies are expiring within 30 days. Immediate action required." />
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '16px' }}>
            {expiryLoading ? (
              <div style={{ padding: '20px', color: 'var(--color-gray-400)' }}>Loading...</div>
            ) : expiryItems.length === 0 ? (
              <Card><div style={{ color: 'var(--color-gray-400)' }}>No policies to manage.</div></Card>
            ) : expiryItems.map((item: any) => {
              const daysLeft = item.daysUntilExpiry ?? (item.expiryDate ? differenceInDays(new Date(item.expiryDate), new Date()) : null);
              const urgency = daysLeft !== null ? (daysLeft <= 0 ? 'danger' : daysLeft <= 30 ? 'warning' : daysLeft <= 90 ? 'info' : 'success') : 'neutral';
              return (
                <Card key={item.id} title={item.insurerName || 'Policy'}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--color-gray-500)' }}>Days Until Expiry</span>
                      <Badge label={daysLeft !== null ? `${daysLeft} days` : '—'} variant={urgency as any} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--color-gray-500)' }}>Policy No.</span>
                      <span>{item.policyNumber || '—'}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--color-gray-500)' }}>Decision Status</span>
                      <span>{item.decisionStatus || item.expiryDecision || '—'}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--color-gray-500)' }}>FCA Notified</span>
                      <Badge label={item.fcaNotified ? 'Yes' : 'No'} variant={item.fcaNotified ? 'success' : 'neutral'} />
                    </div>
                    {isComplianceOrAdmin && (
                      <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                        <Button size="sm" variant="secondary" onClick={() => {
                          setSelectedPolicyId(item.id);
                          setShowDecisionModal(true);
                        }}>Record Decision</Button>
                      </div>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {activeTab === 'notifications' && (
        <Card title="FCA Notification Timeline">
          <Table
            loading={notificationsLoading}
            data={notifications}
            columns={[
              { key: 'notificationType', header: 'Type', render: (r: any) => <Badge label={(r.notificationType || r.type || '').replace(/_/g, ' ')} variant="info" /> },
              { key: 'policyNumber', header: 'Policy', render: (r: any) => r.policyNumber || r.insurerName || '—' },
              { key: 'notificationDate', header: 'Notification Date', render: (r: any) => r.notificationDate ? format(new Date(r.notificationDate), 'dd MMM yyyy') : '—' },
              { key: 'acknowledged', header: 'Acknowledged', render: (r: any) => <Badge label={r.acknowledged || r.fcaAcknowledged ? 'Yes' : 'No'} variant={r.acknowledged || r.fcaAcknowledged ? 'success' : 'neutral'} />, width: '120px' },
            ]}
            emptyMessage="No FCA notifications recorded."
          />
        </Card>
      )}

      {/* Add Policy Modal */}
      <Modal open={showPolicyModal} onClose={() => setShowPolicyModal(false)} title="Add Insurance Policy" width={560}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px' }}>Insurer Name *</label>
              <input value={policyForm.insurerName} onChange={e => setPolicyForm(p => ({ ...p, insurerName: e.target.value }))}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--color-gray-300)', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px' }}>Policy Number *</label>
              <input value={policyForm.policyNumber} onChange={e => setPolicyForm(p => ({ ...p, policyNumber: e.target.value }))}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--color-gray-300)', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px' }}>Coverage Type *</label>
              <select value={policyForm.coverageType} onChange={e => setPolicyForm(p => ({ ...p, coverageType: e.target.value }))}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--color-gray-300)', borderRadius: '6px', fontSize: '13px', background: 'white' }}>
                {COVERAGE_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px' }}>Amount *</label>
              <input type="number" value={policyForm.coverageAmount} onChange={e => setPolicyForm(p => ({ ...p, coverageAmount: e.target.value }))}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--color-gray-300)', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px' }}>Currency</label>
              <input value={policyForm.coverageCurrency} onChange={e => setPolicyForm(p => ({ ...p, coverageCurrency: e.target.value }))}
                maxLength={3}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--color-gray-300)', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px' }}>Effective Date *</label>
              <input type="date" value={policyForm.effectiveDate} onChange={e => setPolicyForm(p => ({ ...p, effectiveDate: e.target.value }))}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--color-gray-300)', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px' }}>Expiry Date *</label>
              <input type="date" value={policyForm.expiryDate} onChange={e => setPolicyForm(p => ({ ...p, expiryDate: e.target.value }))}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--color-gray-300)', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px' }}>Contingency By *</label>
              <input type="date" value={policyForm.contingencyPlanRequiredBy} onChange={e => setPolicyForm(p => ({ ...p, contingencyPlanRequiredBy: e.target.value }))}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--color-gray-300)', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }} />
            </div>
          </div>
          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 500, cursor: 'pointer' }}>
              <input type="checkbox" checked={policyForm.hasRestrictiveConditions} onChange={e => setPolicyForm(p => ({ ...p, hasRestrictiveConditions: e.target.checked }))} />
              Has Restrictive Conditions
            </label>
          </div>
          {policyForm.hasRestrictiveConditions && (
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px' }}>Restrictive Condition Details</label>
              <textarea value={policyForm.restrictiveConditionDetails} onChange={e => setPolicyForm(p => ({ ...p, restrictiveConditionDetails: e.target.value }))} rows={3}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--color-gray-300)', borderRadius: '6px', fontSize: '13px', resize: 'vertical', boxSizing: 'border-box' }} />
            </div>
          )}
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setShowPolicyModal(false)}>Cancel</Button>
            <Button onClick={() => createPolicyMutation.mutate()} loading={createPolicyMutation.isPending}
              disabled={!policyForm.insurerName || !policyForm.policyNumber || !policyForm.coverageAmount || !policyForm.effectiveDate || !policyForm.expiryDate || !policyForm.contingencyPlanRequiredBy}>
              Add Policy
            </Button>
          </div>
        </div>
      </Modal>

      {/* Expiry Decision Modal */}
      <Modal open={showDecisionModal} onClose={() => setShowDecisionModal(false)} title="Record Expiry Decision">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px' }}>Decision *</label>
            <select value={decisionForm.decision} onChange={e => setDecisionForm(p => ({ ...p, decision: e.target.value }))}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--color-gray-300)', borderRadius: '6px', fontSize: '13px', background: 'white' }}>
              <option value="CONTINUE">Continue Coverage</option>
              <option value="SWITCH_PROVIDER">Switch Provider</option>
              <option value="SWITCH_TO_SEGREGATION">Switch to Segregation</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 500, cursor: 'pointer' }}>
              <input type="checkbox" checked={decisionForm.fcaNotified} onChange={e => setDecisionForm(p => ({ ...p, fcaNotified: e.target.checked }))} />
              FCA Notified
            </label>
          </div>
          {decisionForm.fcaNotified && (
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px' }}>FCA Notification Date</label>
              <input type="date" value={decisionForm.fcaNotificationDate} onChange={e => setDecisionForm(p => ({ ...p, fcaNotificationDate: e.target.value }))}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--color-gray-300)', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }} />
            </div>
          )}
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px' }}>Contingency Plan</label>
            <textarea value={decisionForm.contingencyPlan} onChange={e => setDecisionForm(p => ({ ...p, contingencyPlan: e.target.value }))} rows={4}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--color-gray-300)', borderRadius: '6px', fontSize: '13px', resize: 'vertical', boxSizing: 'border-box' }} />
          </div>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setShowDecisionModal(false)}>Cancel</Button>
            <Button onClick={() => recordDecisionMutation.mutate()} loading={recordDecisionMutation.isPending}>
              Record Decision
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
