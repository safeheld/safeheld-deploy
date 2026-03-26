import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../hooks/useAuth';
import { thirdPartyDdApi } from '../../api/client';
import { Card, Table, Button, PageHeader, Modal, Alert, statusBadge, Badge } from '../../components/ui';
import { format } from 'date-fns';

const PARTY_TYPES = ['BANK', 'CUSTODIAN', 'PAYMENT_PROCESSOR', 'EXCHANGE', 'OTHER'];
const DD_OUTCOMES = ['APPROVED', 'CONDITIONALLY_APPROVED', 'REJECTED'];

export default function ThirdPartyDdPage() {
  const { user } = useAuth();
  const firmId = user!.firmId;
  const queryClient = useQueryClient();
  const isComplianceOrAdmin = ['COMPLIANCE_OFFICER', 'ADMIN'].includes(user!.role);

  const [activeTab, setActiveTab] = useState<'register' | 'dd' | 'diversification'>('register');

  // Add/edit party modal
  const [showPartyModal, setShowPartyModal] = useState(false);
  const [partyForm, setPartyForm] = useState({
    name: '', partyType: 'BANK', jurisdiction: '', dateAppointed: '', servicesProvided: '',
    contactName: '', contactEmail: '',
  });

  // DD assessment modal
  const [showDdModal, setShowDdModal] = useState(false);
  const [selectedPartyId, setSelectedPartyId] = useState('');
  const [ddForm, setDdForm] = useState({
    safeguardingAccountId: '', bankName: '', initialDdDate: '', lastReviewDate: '',
    nextReviewDue: '', creditworthinessAssessment: '', financialStabilityAssessment: '',
    regulatoryStatusAssessment: '', ddOutcome: 'APPROVED',
  });

  // Diversification modal
  const [showDivModal, setShowDivModal] = useState(false);
  const [divForm, setDivForm] = useState({ isDiversified: false, rationale: '', assessedBy: '' });

  const { data: registerData, isLoading: registerLoading } = useQuery({
    queryKey: ['third-party-register', firmId],
    queryFn: () => thirdPartyDdApi.getRegister(firmId),
    enabled: activeTab === 'register' || activeTab === 'dd',
  });

  const { data: diversificationData, isLoading: divLoading } = useQuery({
    queryKey: ['third-party-diversification', firmId],
    queryFn: () => thirdPartyDdApi.getDiversification(firmId),
    enabled: activeTab === 'diversification',
  });

  const { data: alertsData } = useQuery({
    queryKey: ['third-party-alerts', firmId],
    queryFn: () => thirdPartyDdApi.getAlerts(firmId),
  });

  const createPartyMutation = useMutation({
    mutationFn: () => thirdPartyDdApi.createParty(firmId, partyForm),
    onSuccess: () => {
      setShowPartyModal(false);
      setPartyForm({ name: '', partyType: 'BANK', jurisdiction: '', dateAppointed: '', servicesProvided: '', contactName: '', contactEmail: '' });
      queryClient.invalidateQueries({ queryKey: ['third-party-register', firmId] });
    },
  });

  const createDdMutation = useMutation({
    mutationFn: () => thirdPartyDdApi.createAssessment(firmId, selectedPartyId, ddForm),
    onSuccess: () => {
      setShowDdModal(false);
      queryClient.invalidateQueries({ queryKey: ['third-party-register', firmId] });
      queryClient.invalidateQueries({ queryKey: ['third-party-alerts', firmId] });
    },
  });

  const createDivMutation = useMutation({
    mutationFn: () => thirdPartyDdApi.createDiversification(firmId, divForm),
    onSuccess: () => {
      setShowDivModal(false);
      setDivForm({ isDiversified: false, rationale: '', assessedBy: '' });
      queryClient.invalidateQueries({ queryKey: ['third-party-diversification', firmId] });
    },
  });

  const tabs = [
    { id: 'register', label: 'Third-Party Register' },
    { id: 'dd', label: 'Due Diligence' },
    { id: 'diversification', label: 'Diversification' },
  ];

  const parties = registerData?.data || registerData || [];
  const alerts = alertsData || [];
  const divData = diversificationData;

  return (
    <div>
      <PageHeader title="Third-Party Due Diligence" />

      {/* Overdue alerts */}
      {activeTab === 'dd' && Array.isArray(alerts) && alerts.length > 0 && (
        <div style={{ marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {alerts.map((alert: any, i: number) => (
            <Alert key={i} type="warning" message={alert.message || `Review overdue for ${alert.partyName || 'a third party'}`} />
          ))}
        </div>
      )}

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

      {activeTab === 'register' && (
        <Card
          title="Third-Party Register"
          actions={isComplianceOrAdmin ? (
            <Button onClick={() => setShowPartyModal(true)}>Add Third Party</Button>
          ) : undefined}
        >
          <Table
            loading={registerLoading}
            data={parties}
            columns={[
              { key: 'name', header: 'Name' },
              { key: 'partyType', header: 'Type', render: (r: any) => <Badge label={r.partyType} variant="info" />, width: '140px' },
              { key: 'jurisdiction', header: 'Jurisdiction', render: (r: any) => r.jurisdiction || '—' },
              { key: 'dateAppointed', header: 'Appointed', render: (r: any) => r.dateAppointed ? format(new Date(r.dateAppointed), 'dd MMM yyyy') : '—' },
              { key: 'servicesProvided', header: 'Services', render: (r: any) => r.servicesProvided ? (r.servicesProvided.length > 40 ? r.servicesProvided.slice(0, 40) + '...' : r.servicesProvided) : '—' },
              { key: 'isActive', header: 'Status', render: (r: any) => statusBadge(r.isActive !== false ? 'ACTIVE' : 'DISABLED'), width: '90px' },
            ]}
            emptyMessage="No third parties registered."
          />
        </Card>
      )}

      {activeTab === 'dd' && (
        <Card
          title="Due Diligence Assessments"
          actions={isComplianceOrAdmin ? (
            <Button onClick={() => {
              if (parties.length > 0) {
                setSelectedPartyId(parties[0].id);
                setShowDdModal(true);
              }
            }} disabled={parties.length === 0}>
              Create Assessment
            </Button>
          ) : undefined}
        >
          <Table
            loading={registerLoading}
            data={parties.flatMap((p: any) => (p.dueDiligenceAssessments || []).map((dd: any) => ({ ...dd, partyName: p.name })))}
            columns={[
              { key: 'partyName', header: 'Party', render: (r: any) => r.partyName || '—' },
              { key: 'bankName', header: 'Bank', render: (r: any) => r.bankName || '—' },
              { key: 'lastReviewDate', header: 'Last Review', render: (r: any) => r.lastReviewDate ? format(new Date(r.lastReviewDate), 'dd MMM yyyy') : '—' },
              { key: 'nextReviewDue', header: 'Next Review Due', render: (r: any) => r.nextReviewDue ? format(new Date(r.nextReviewDue), 'dd MMM yyyy') : '—' },
              {
                key: 'ddOutcome', header: 'Outcome',
                render: (r: any) => {
                  const variant = r.ddOutcome === 'APPROVED' ? 'success' : r.ddOutcome === 'REJECTED' ? 'danger' : 'warning';
                  return <Badge label={(r.ddOutcome || '').replace(/_/g, ' ')} variant={variant} />;
                },
                width: '160px',
              },
            ]}
            emptyMessage="No due diligence assessments yet."
          />
        </Card>
      )}

      {activeTab === 'diversification' && (
        <div>
          <Card
            title="Current Diversification Assessment"
            actions={isComplianceOrAdmin ? (
              <Button onClick={() => setShowDivModal(true)}>New Assessment</Button>
            ) : undefined}
          >
            {divLoading ? (
              <div style={{ padding: '20px', color: 'var(--color-gray-400)', textAlign: 'center' }}>Loading...</div>
            ) : divData ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '13px' }}>
                <div style={{ display: 'flex', gap: '20px' }}>
                  <div>
                    <span style={{ color: 'var(--color-gray-500)', fontWeight: 500 }}>Diversified: </span>
                    <Badge label={divData.isDiversified ? 'Yes' : 'No'} variant={divData.isDiversified ? 'success' : 'warning'} />
                  </div>
                  <div>
                    <span style={{ color: 'var(--color-gray-500)', fontWeight: 500 }}>Single Bank Flag: </span>
                    <Badge label={divData.singleBankFlag ? 'Yes' : 'No'} variant={divData.singleBankFlag ? 'danger' : 'success'} />
                  </div>
                </div>
                <div>
                  <span style={{ color: 'var(--color-gray-500)', fontWeight: 500 }}>Rationale: </span>
                  <span style={{ color: 'var(--color-gray-700)' }}>{divData.rationale || '—'}</span>
                </div>
                <div>
                  <span style={{ color: 'var(--color-gray-500)', fontWeight: 500 }}>Assessed By: </span>
                  <span style={{ color: 'var(--color-gray-700)' }}>{divData.assessedBy || '—'}</span>
                </div>
                <div>
                  <span style={{ color: 'var(--color-gray-500)', fontWeight: 500 }}>Date: </span>
                  <span style={{ color: 'var(--color-gray-700)' }}>{divData.createdAt ? format(new Date(divData.createdAt), 'dd MMM yyyy') : '—'}</span>
                </div>
              </div>
            ) : (
              <div style={{ color: 'var(--color-gray-400)' }}>No diversification assessment on record.</div>
            )}
          </Card>

          {divData?.history && divData.history.length > 0 && (
            <Card title="Assessment History" style={{ marginTop: '16px' }}>
              <Table
                data={divData.history}
                columns={[
                  { key: 'isDiversified', header: 'Diversified', render: (r: any) => <Badge label={r.isDiversified ? 'Yes' : 'No'} variant={r.isDiversified ? 'success' : 'warning'} />, width: '100px' },
                  { key: 'assessedBy', header: 'Assessed By', render: (r: any) => r.assessedBy || '—' },
                  { key: 'createdAt', header: 'Date', render: (r: any) => r.createdAt ? format(new Date(r.createdAt), 'dd MMM yyyy') : '—' },
                ]}
                emptyMessage="No history."
              />
            </Card>
          )}
        </div>
      )}

      {/* Add Third Party Modal */}
      <Modal open={showPartyModal} onClose={() => setShowPartyModal(false)} title="Add Third Party" width={560}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px' }}>Name *</label>
            <input value={partyForm.name} onChange={e => setPartyForm(p => ({ ...p, name: e.target.value }))}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--color-gray-300)', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px' }}>Type *</label>
            <select value={partyForm.partyType} onChange={e => setPartyForm(p => ({ ...p, partyType: e.target.value }))}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--color-gray-300)', borderRadius: '6px', fontSize: '13px', background: 'white' }}>
              {PARTY_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px' }}>Jurisdiction</label>
              <input value={partyForm.jurisdiction} onChange={e => setPartyForm(p => ({ ...p, jurisdiction: e.target.value }))}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--color-gray-300)', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px' }}>Date Appointed *</label>
              <input type="date" value={partyForm.dateAppointed} onChange={e => setPartyForm(p => ({ ...p, dateAppointed: e.target.value }))}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--color-gray-300)', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }} />
            </div>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px' }}>Services Provided</label>
            <textarea value={partyForm.servicesProvided} onChange={e => setPartyForm(p => ({ ...p, servicesProvided: e.target.value }))} rows={3}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--color-gray-300)', borderRadius: '6px', fontSize: '13px', resize: 'vertical', boxSizing: 'border-box' }} />
          </div>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setShowPartyModal(false)}>Cancel</Button>
            <Button onClick={() => createPartyMutation.mutate()} loading={createPartyMutation.isPending}
              disabled={!partyForm.name || !partyForm.dateAppointed}>
              Add Third Party
            </Button>
          </div>
        </div>
      </Modal>

      {/* DD Assessment Modal */}
      <Modal open={showDdModal} onClose={() => setShowDdModal(false)} title="Create Due Diligence Assessment" width={560}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px' }}>Third Party</label>
            <select value={selectedPartyId} onChange={e => setSelectedPartyId(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--color-gray-300)', borderRadius: '6px', fontSize: '13px', background: 'white' }}>
              {parties.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px' }}>Bank Name *</label>
              <input value={ddForm.bankName} onChange={e => setDdForm(p => ({ ...p, bankName: e.target.value }))}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--color-gray-300)', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px' }}>Outcome *</label>
              <select value={ddForm.ddOutcome} onChange={e => setDdForm(p => ({ ...p, ddOutcome: e.target.value }))}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--color-gray-300)', borderRadius: '6px', fontSize: '13px', background: 'white' }}>
                {DD_OUTCOMES.map(o => <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px' }}>Initial DD Date *</label>
              <input type="date" value={ddForm.initialDdDate} onChange={e => setDdForm(p => ({ ...p, initialDdDate: e.target.value }))}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--color-gray-300)', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px' }}>Last Review *</label>
              <input type="date" value={ddForm.lastReviewDate} onChange={e => setDdForm(p => ({ ...p, lastReviewDate: e.target.value }))}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--color-gray-300)', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px' }}>Next Review Due *</label>
              <input type="date" value={ddForm.nextReviewDue} onChange={e => setDdForm(p => ({ ...p, nextReviewDue: e.target.value }))}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--color-gray-300)', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }} />
            </div>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px' }}>Creditworthiness Assessment</label>
            <textarea value={ddForm.creditworthinessAssessment} onChange={e => setDdForm(p => ({ ...p, creditworthinessAssessment: e.target.value }))} rows={2}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--color-gray-300)', borderRadius: '6px', fontSize: '13px', resize: 'vertical', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px' }}>Financial Stability Assessment</label>
            <textarea value={ddForm.financialStabilityAssessment} onChange={e => setDdForm(p => ({ ...p, financialStabilityAssessment: e.target.value }))} rows={2}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--color-gray-300)', borderRadius: '6px', fontSize: '13px', resize: 'vertical', boxSizing: 'border-box' }} />
          </div>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setShowDdModal(false)}>Cancel</Button>
            <Button onClick={() => createDdMutation.mutate()} loading={createDdMutation.isPending}
              disabled={!ddForm.bankName || !ddForm.initialDdDate || !ddForm.lastReviewDate || !ddForm.nextReviewDue}>
              Create Assessment
            </Button>
          </div>
        </div>
      </Modal>

      {/* Diversification Assessment Modal */}
      <Modal open={showDivModal} onClose={() => setShowDivModal(false)} title="New Diversification Assessment">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 500, cursor: 'pointer' }}>
              <input type="checkbox" checked={divForm.isDiversified} onChange={e => setDivForm(p => ({ ...p, isDiversified: e.target.checked }))} />
              Funds are adequately diversified
            </label>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px' }}>Rationale *</label>
            <textarea value={divForm.rationale} onChange={e => setDivForm(p => ({ ...p, rationale: e.target.value }))} rows={4}
              placeholder="Provide rationale for the diversification assessment..."
              style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--color-gray-300)', borderRadius: '6px', fontSize: '13px', resize: 'vertical', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px' }}>Assessed By *</label>
            <input value={divForm.assessedBy} onChange={e => setDivForm(p => ({ ...p, assessedBy: e.target.value }))}
              placeholder="Name of assessor"
              style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--color-gray-300)', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }} />
          </div>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setShowDivModal(false)}>Cancel</Button>
            <Button onClick={() => createDivMutation.mutate()} loading={createDivMutation.isPending}
              disabled={!divForm.rationale.trim() || !divForm.assessedBy.trim()}>
              Submit Assessment
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
