import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../hooks/useAuth';
import { governanceApi } from '../../api/client';
import { Card, Table, Button, PageHeader, Pagination, statusBadge, Modal, Alert, LoadingSkeleton, ErrorState } from '../../components/ui';
import { format } from 'date-fns';

type Tab = 'accounts' | 'letters' | 'dd' | 'policies' | 'insurance' | 'resolution' | 'responsibilities';

export default function GovernancePage() {
  const { user } = useAuth();
  const firmId = user!.firmId;
  const queryClient = useQueryClient();
  const isCompliance = ['COMPLIANCE_OFFICER', 'ADMIN'].includes(user!.role);

  const [activeTab, setActiveTab] = useState<Tab>('accounts');
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [showEditAccount, setShowEditAccount] = useState(false);
  const [editAccountData, setEditAccountData] = useState<any>(null);
  const [editForm, setEditForm] = useState({ bankName: '', designation: '', status: '', currency: '' });
  const [showResponsibilityModal, setShowResponsibilityModal] = useState(false);
  const [responsibilityForm, setResponsibilityForm] = useState({ role: '', personName: '', description: '', effectiveDate: '' });

  // Accounts
  const { data: accountsResp, isLoading: accountsLoading, error: accountsError, refetch: accountsRefetch } = useQuery({
    queryKey: ['sg-accounts', firmId],
    queryFn: () => governanceApi.getAccounts(firmId),
    enabled: activeTab === 'accounts' || activeTab === 'letters' || activeTab === 'dd',
  });

  // Letters for selected account
  const { data: letters } = useQuery({
    queryKey: ['letters', firmId, selectedAccount],
    queryFn: () => governanceApi.getLetters(firmId, selectedAccount!),
    enabled: !!selectedAccount && activeTab === 'letters',
  });

  // Due Diligence
  const { data: ddResp } = useQuery({
    queryKey: ['dd', firmId],
    queryFn: () => governanceApi.getDueDiligence(firmId),
    enabled: activeTab === 'dd',
  });

  // Policies
  const { data: policiesResp } = useQuery({
    queryKey: ['policies', firmId],
    queryFn: () => governanceApi.getPolicies(firmId),
    enabled: activeTab === 'policies',
  });

  // Insurance
  const { data: insuranceResp } = useQuery({
    queryKey: ['insurance', firmId],
    queryFn: () => governanceApi.getInsurance(firmId),
    enabled: activeTab === 'insurance',
  });

  // Resolution Pack Health
  const { data: rpackHealth, refetch: refetchHealth } = useQuery({
    queryKey: ['resolution-pack-health', firmId],
    queryFn: () => governanceApi.getResolutionPackHealth(firmId),
    enabled: activeTab === 'resolution',
  });

  const checkHealthMutation = useMutation({
    mutationFn: () => governanceApi.checkResolutionPack(firmId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['resolution-pack-health', firmId] });
      refetchHealth();
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      setError(msg || 'Health check failed.');
    },
  });

  // Responsibilities
  const { data: responsibilitiesResp } = useQuery({
    queryKey: ['responsibilities', firmId],
    queryFn: () => governanceApi.getResponsibilities(firmId),
    enabled: activeTab === 'responsibilities',
  });

  const editAccountMutation = useMutation({
    mutationFn: () => governanceApi.updateAccount(firmId, editAccountData!.id, editForm),
    onSuccess: () => {
      setShowEditAccount(false);
      queryClient.invalidateQueries({ queryKey: ['sg-accounts', firmId] });
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      setError(msg || 'Update failed.');
    },
  });

  const createResponsibilityMutation = useMutation({
    mutationFn: () => governanceApi.createResponsibility(firmId, {
      ...responsibilityForm,
      effectiveDate: responsibilityForm.effectiveDate || undefined,
    }),
    onSuccess: () => {
      setShowResponsibilityModal(false);
      queryClient.invalidateQueries({ queryKey: ['responsibilities', firmId] });
      setResponsibilityForm({ role: '', personName: '', description: '', effectiveDate: '' });
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      setError(msg || 'Failed to create responsibility.');
    },
  });

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'accounts', label: 'Safeguarding Accounts' },
    { id: 'letters', label: 'Acknowledgement Letters' },
    { id: 'dd', label: 'Due Diligence' },
    { id: 'policies', label: 'Policy Documents' },
    { id: 'insurance', label: 'Insurance & Guarantees' },
    { id: 'resolution', label: 'Resolution Pack Health' },
    { id: 'responsibilities', label: 'Responsibilities' },
  ];

  return (
    <div>
      <PageHeader title="Governance" />

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0', borderBottom: '2px solid var(--color-gray-200)', marginBottom: '20px', overflowX: 'auto' }}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '10px 16px', background: 'none', border: 'none', whiteSpace: 'nowrap',
              borderBottom: activeTab === tab.id ? '2px solid var(--color-primary)' : '2px solid transparent',
              marginBottom: '-2px', cursor: 'pointer', fontSize: '13px', fontWeight: 500,
              color: activeTab === tab.id ? 'var(--color-primary)' : 'var(--color-gray-500)',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error && <div style={{ marginBottom: '16px' }}><Alert type="error" message={error} /></div>}

      {/* Safeguarding Accounts */}
      {activeTab === 'accounts' && accountsError && (
        <ErrorState message="Failed to load safeguarding accounts." onRetry={() => accountsRefetch()} />
      )}
      {activeTab === 'accounts' && accountsLoading && <LoadingSkeleton type="table" />}
      {activeTab === 'accounts' && !accountsError && !accountsLoading && (
        <Card title="Safeguarding Accounts Register">
          <Table
            loading={false}
            data={accountsResp?.data || []}
            columns={[
              { key: 'bankName', header: 'Bank Name' },
              { key: 'accountNumberMasked', header: 'Account No.' },
              { key: 'externalAccountId', header: 'External ID' },
              { key: 'currency', header: 'CCY', width: '60px' },
              { key: 'designation', header: 'Designation', width: '200px' },
              { key: 'status', header: 'Status', render: r => statusBadge(r.status), width: '100px' },
              { key: 'letterStatus', header: 'Letter', render: r => statusBadge(r.letterStatus), width: '100px' },
              { key: 'openedDate', header: 'Opened', render: r => format(new Date(r.openedDate), 'dd MMM yyyy'), width: '110px' },
              ...(isCompliance ? [{
                key: 'actions', header: '',
                render: (r: any) => (
                  <Button size="sm" variant="secondary" onClick={(e: any) => {
                    e.stopPropagation();
                    setEditAccountData(r);
                    setEditForm({
                      bankName: r.bankName || '',
                      designation: r.designation || '',
                      status: r.status || '',
                      currency: r.currency || '',
                    });
                    setShowEditAccount(true);
                    setError('');
                  }}>Edit</Button>
                ),
              }] : []),
            ]}
            emptyMessage="No safeguarding accounts registered."
          />
        </Card>
      )}

      {/* Letters */}
      {activeTab === 'letters' && (
        <div>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px', color: 'var(--color-gray-700)' }}>
              Select Account
            </label>
            <select
              value={selectedAccount || ''}
              onChange={e => setSelectedAccount(e.target.value || null)}
              style={{ padding: '8px 12px', border: '1px solid var(--color-gray-300)', borderRadius: '6px', fontSize: '13px', minWidth: '300px' }}
            >
              <option value="">— Choose account —</option>
              {(accountsResp?.data || []).map((a: { id: string; bankName: string; accountNumberMasked: string }) => (
                <option key={a.id} value={a.id}>{a.bankName} ({a.accountNumberMasked})</option>
              ))}
            </select>
          </div>
          {selectedAccount && (
            <Card title="Acknowledgement Letters">
              <Table
                data={letters || []}
                columns={[
                  { key: 'version', header: 'Version', width: '80px' },
                  { key: 'status', header: 'Status', render: r => statusBadge(r.status), width: '100px' },
                  { key: 'effectiveDate', header: 'Effective', render: r => format(new Date(r.effectiveDate), 'dd MMM yyyy') },
                  { key: 'expiryDate', header: 'Expiry', render: r => r.expiryDate ? format(new Date(r.expiryDate), 'dd MMM yyyy') : '—' },
                  { key: 'annualReviewDue', header: 'Annual Review Due', render: r => format(new Date(r.annualReviewDue), 'dd MMM yyyy') },
                  { key: 'uploadDate', header: 'Uploaded', render: r => format(new Date(r.uploadDate), 'dd MMM yyyy') },
                ]}
                emptyMessage="No letters on file for this account."
              />
            </Card>
          )}
        </div>
      )}

      {/* Due Diligence */}
      {activeTab === 'dd' && (
        <Card title="Third-Party Due Diligence">
          <Table
            data={ddResp?.data || []}
            columns={[
              { key: 'bankName', header: 'Bank' },
              { key: 'reviewStatus', header: 'Status', render: r => statusBadge(r.reviewStatus) },
              { key: 'ddOutcome', header: 'Outcome', render: r => statusBadge(r.ddOutcome) },
              { key: 'lastReviewDate', header: 'Last Review', render: r => format(new Date(r.lastReviewDate), 'dd MMM yyyy') },
              { key: 'nextReviewDue', header: 'Next Due', render: r => format(new Date(r.nextReviewDue), 'dd MMM yyyy') },
              { key: 'initialDdDate', header: 'Initial DD', render: r => format(new Date(r.initialDdDate), 'dd MMM yyyy') },
            ]}
            emptyMessage="No due diligence records found."
          />
        </Card>
      )}

      {/* Policy Documents */}
      {activeTab === 'policies' && (
        <Card title="Policy Documents">
          <Table
            data={policiesResp?.data || []}
            columns={[
              { key: 'documentType', header: 'Type', render: r => r.documentType.replace(/_/g, ' ') },
              { key: 'title', header: 'Title' },
              { key: 'version', header: 'Ver', width: '60px' },
              { key: 'status', header: 'Status', render: r => statusBadge(r.status), width: '100px' },
              { key: 'boardApproved', header: 'Board Approved', render: r => r.boardApproved ? 'Yes' : 'No', width: '120px' },
              { key: 'annualReviewDue', header: 'Review Due', render: r => r.annualReviewDue ? format(new Date(r.annualReviewDue), 'dd MMM yyyy') : '—' },
              { key: 'createdAt', header: 'Uploaded', render: r => format(new Date(r.createdAt), 'dd MMM yyyy') },
            ]}
            emptyMessage="No policy documents uploaded."
          />
        </Card>
      )}

      {/* Insurance */}
      {activeTab === 'insurance' && (
        <Card title="Insurance &amp; Guarantees">
          <Table
            data={insuranceResp?.data || []}
            columns={[
              { key: 'insurerName', header: 'Insurer' },
              { key: 'policyNumber', header: 'Policy Number' },
              { key: 'coverageType', header: 'Type', width: '120px' },
              { key: 'coverageAmount', header: 'Coverage', render: r => `${r.coverageCurrency} ${Number(r.coverageAmount).toLocaleString()}`, width: '140px' },
              { key: 'status', header: 'Status', render: r => statusBadge(r.status), width: '100px' },
              { key: 'effectiveDate', header: 'Effective', render: r => format(new Date(r.effectiveDate), 'dd MMM yyyy') },
              { key: 'expiryDate', header: 'Expiry', render: r => format(new Date(r.expiryDate), 'dd MMM yyyy') },
            ]}
            emptyMessage="No insurance or guarantee records."
          />
        </Card>
      )}

      {/* Resolution Pack Health */}
      {activeTab === 'resolution' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
            <Button onClick={() => checkHealthMutation.mutate()} loading={checkHealthMutation.isPending}>
              Run Health Check
            </Button>
          </div>
          {rpackHealth ? (
            <Card title={`Resolution Pack Health — ${rpackHealth.overallStatus || '—'}`}>
              {rpackHealth.components ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {(rpackHealth.components as Array<{ name: string; status: string; detail: string }>).map((comp) => (
                    <div key={comp.name} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                      padding: '12px 16px', borderRadius: '8px', border: '1px solid',
                      borderColor: comp.status === 'RED' ? '#fca5a5' : comp.status === 'AMBER' ? '#fcd34d' : '#6ee7b7',
                      background: comp.status === 'RED' ? '#fff1f2' : comp.status === 'AMBER' ? '#fffbeb' : '#f0fdf4',
                    }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '14px' }}>{comp.name}</div>
                        <div style={{ fontSize: '12px', color: 'var(--color-gray-600)', marginTop: '3px' }}>{comp.detail}</div>
                      </div>
                      {statusBadge(comp.status)}
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ color: 'var(--color-gray-400)', textAlign: 'center', padding: '20px 0' }}>
                  Run a health check to see results.
                </p>
              )}
            </Card>
          ) : (
            <Card>
              <p style={{ color: 'var(--color-gray-400)', textAlign: 'center', padding: '40px 0' }}>
                Click "Run Health Check" to assess your resolution pack readiness.
              </p>
            </Card>
          )}
        </div>
      )}

      {/* Responsibilities Tab */}
      {activeTab === 'responsibilities' && (
        <div>
          {isCompliance && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
              <Button onClick={() => { setShowResponsibilityModal(true); setError(''); }}>
                Assign Responsibility
              </Button>
            </div>
          )}
          <Card title="Responsibility Assignments">
            <Table
              data={responsibilitiesResp?.data || []}
              columns={[
                { key: 'role', header: 'Role', render: r => (r.role || '').replace(/_/g, ' '), width: '180px' },
                { key: 'personName', header: 'Person', width: '180px' },
                { key: 'description', header: 'Description', width: '250px' },
                { key: 'status', header: 'Status', render: r => statusBadge(r.status), width: '100px' },
                { key: 'effectiveDate', header: 'Effective', render: r => r.effectiveDate ? format(new Date(r.effectiveDate), 'dd MMM yyyy') : '\u2014', width: '120px' },
                { key: 'createdAt', header: 'Created', render: r => r.createdAt ? format(new Date(r.createdAt), 'dd MMM yyyy') : '\u2014', width: '110px' },
              ]}
              emptyMessage="No responsibility assignments found."
            />
          </Card>
        </div>
      )}

      {/* Edit Account Modal */}
      <Modal open={showEditAccount} onClose={() => setShowEditAccount(false)} title="Edit Safeguarding Account">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {editAccountData && (
            <div style={{ padding: '12px', background: 'var(--color-gray-50)', borderRadius: '6px', fontSize: '13px' }}>
              <strong>{editAccountData.bankName}</strong> ({editAccountData.accountNumberMasked})
            </div>
          )}
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px' }}>Bank Name</label>
            <input
              value={editForm.bankName}
              onChange={e => setEditForm(p => ({ ...p, bankName: e.target.value }))}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--color-gray-300)', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px' }}>Designation</label>
            <input
              value={editForm.designation}
              onChange={e => setEditForm(p => ({ ...p, designation: e.target.value }))}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--color-gray-300)', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }}
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px' }}>Status</label>
              <select
                value={editForm.status}
                onChange={e => setEditForm(p => ({ ...p, status: e.target.value }))}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--color-gray-300)', borderRadius: '6px', fontSize: '13px' }}
              >
                <option value="ACTIVE">Active</option>
                <option value="CLOSING">Closing</option>
                <option value="CLOSED">Closed</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px' }}>Currency</label>
              <input
                value={editForm.currency}
                onChange={e => setEditForm(p => ({ ...p, currency: e.target.value }))}
                maxLength={3}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--color-gray-300)', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }}
              />
            </div>
          </div>
          {error && <Alert type="error" message={error} />}
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setShowEditAccount(false)}>Cancel</Button>
            <Button onClick={() => editAccountMutation.mutate()} loading={editAccountMutation.isPending}>
              Save Changes
            </Button>
          </div>
        </div>
      </Modal>

      {/* Assign Responsibility Modal */}
      <Modal open={showResponsibilityModal} onClose={() => setShowResponsibilityModal(false)} title="Assign Responsibility">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px' }}>Role *</label>
            <select
              value={responsibilityForm.role}
              onChange={e => setResponsibilityForm(p => ({ ...p, role: e.target.value }))}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--color-gray-300)', borderRadius: '6px', fontSize: '13px' }}
            >
              <option value="">Select role...</option>
              <option value="SAFEGUARDING_OFFICER">Safeguarding Officer</option>
              <option value="COMPLIANCE_OVERSIGHT">Compliance Oversight</option>
              <option value="RECONCILIATION_OWNER">Reconciliation Owner</option>
              <option value="RESOLUTION_PACK_OWNER">Resolution Pack Owner</option>
              <option value="BANK_RELATIONSHIP">Bank Relationship</option>
              <option value="SENIOR_MANAGER">Senior Manager</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px' }}>Person Name *</label>
            <input
              value={responsibilityForm.personName}
              onChange={e => setResponsibilityForm(p => ({ ...p, personName: e.target.value }))}
              placeholder="Full name of responsible person"
              style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--color-gray-300)', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px' }}>Description</label>
            <textarea
              value={responsibilityForm.description}
              onChange={e => setResponsibilityForm(p => ({ ...p, description: e.target.value }))}
              rows={3}
              placeholder="Describe the scope of this responsibility..."
              style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--color-gray-300)', borderRadius: '6px', fontSize: '13px', resize: 'vertical', boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px' }}>Effective Date</label>
            <input
              type="date"
              value={responsibilityForm.effectiveDate}
              onChange={e => setResponsibilityForm(p => ({ ...p, effectiveDate: e.target.value }))}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--color-gray-300)', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }}
            />
          </div>
          {error && <Alert type="error" message={error} />}
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setShowResponsibilityModal(false)}>Cancel</Button>
            <Button onClick={() => createResponsibilityMutation.mutate()} loading={createResponsibilityMutation.isPending} disabled={!responsibilityForm.role || !responsibilityForm.personName}>
              Assign
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
