import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../hooks/useAuth';
import { governanceApi } from '../../api/client';
import { Card, Table, Button, PageHeader, Pagination, statusBadge, Modal, Alert } from '../../components/ui';
import { format } from 'date-fns';

type Tab = 'accounts' | 'letters' | 'dd' | 'policies' | 'insurance' | 'resolution';

export default function GovernancePage() {
  const { user } = useAuth();
  const firmId = user!.firmId;
  const queryClient = useQueryClient();
  const isCompliance = ['COMPLIANCE_OFFICER', 'ADMIN'].includes(user!.role);

  const [activeTab, setActiveTab] = useState<Tab>('accounts');
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);
  const [error, setError] = useState('');

  // Accounts
  const { data: accountsResp, isLoading: accountsLoading } = useQuery({
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

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'accounts', label: 'Safeguarding Accounts' },
    { id: 'letters', label: 'Acknowledgement Letters' },
    { id: 'dd', label: 'Due Diligence' },
    { id: 'policies', label: 'Policy Documents' },
    { id: 'insurance', label: 'Insurance & Guarantees' },
    { id: 'resolution', label: 'Resolution Pack Health' },
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
      {activeTab === 'accounts' && (
        <Card title="Safeguarding Accounts Register">
          <Table
            loading={accountsLoading}
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
    </div>
  );
}
