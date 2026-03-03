import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../hooks/useAuth';
import { governanceApi } from '../../api/client';
import { Card, Table, Button, PageHeader, statusBadge, Alert, Tabs } from '../../components/ui';
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

  const { data: accountsResp, isLoading: accountsLoading } = useQuery({
    queryKey: ['sg-accounts', firmId],
    queryFn: () => governanceApi.getAccounts(firmId),
    enabled: activeTab === 'accounts' || activeTab === 'letters' || activeTab === 'dd',
  });

  const { data: letters } = useQuery({
    queryKey: ['letters', firmId, selectedAccount],
    queryFn: () => governanceApi.getLetters(firmId, selectedAccount!),
    enabled: !!selectedAccount && activeTab === 'letters',
  });

  const { data: ddResp } = useQuery({
    queryKey: ['dd', firmId],
    queryFn: () => governanceApi.getDueDiligence(firmId),
    enabled: activeTab === 'dd',
  });

  const { data: policiesResp } = useQuery({
    queryKey: ['policies', firmId],
    queryFn: () => governanceApi.getPolicies(firmId),
    enabled: activeTab === 'policies',
  });

  const { data: insuranceResp } = useQuery({
    queryKey: ['insurance', firmId],
    queryFn: () => governanceApi.getInsurance(firmId),
    enabled: activeTab === 'insurance',
  });

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

  const tabs: Array<{ id: string; label: string }> = [
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

      <Tabs
        tabs={tabs}
        activeTab={activeTab}
        onChange={id => setActiveTab(id as Tab)}
      />

      {error && <div style={{ marginBottom: '20px' }}><Alert type="error" message={error} /></div>}

      {activeTab === 'accounts' && (
        <Card title="Safeguarding Accounts Register">
          <Table
            loading={accountsLoading}
            data={accountsResp?.data || []}
            columns={[
              { key: 'bankName', header: 'Bank Name' },
              { key: 'accountNumberMasked', header: 'Account No.', render: r => <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>{r.accountNumberMasked}</span> },
              { key: 'externalAccountId', header: 'External ID', render: r => <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--color-navy-500)' }}>{r.externalAccountId}</span> },
              { key: 'currency', header: 'CCY', width: '60px' },
              { key: 'designation', header: 'Designation', width: '200px' },
              { key: 'status', header: 'Status', render: r => statusBadge(r.status), width: '110px' },
              { key: 'letterStatus', header: 'Letter', render: r => statusBadge(r.letterStatus), width: '110px' },
              { key: 'openedDate', header: 'Opened', render: r => format(new Date(r.openedDate), 'dd MMM yyyy'), width: '110px' },
            ]}
            emptyMessage="No safeguarding accounts registered."
          />
        </Card>
      )}

      {activeTab === 'letters' && (
        <div>
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '8px', color: 'var(--color-navy-700)' }}>
              Select Account
            </label>
            <select
              value={selectedAccount || ''}
              onChange={e => setSelectedAccount(e.target.value || null)}
              style={{
                padding: '9px 14px', border: '1px solid var(--color-navy-300)',
                borderRadius: 'var(--radius-md)', fontSize: '13px', minWidth: '320px',
                color: 'var(--color-navy-700)', background: 'white',
              }}
            >
              <option value="">{'\u2014'} Choose account {'\u2014'}</option>
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
                  { key: 'status', header: 'Status', render: r => statusBadge(r.status), width: '110px' },
                  { key: 'effectiveDate', header: 'Effective', render: r => format(new Date(r.effectiveDate), 'dd MMM yyyy') },
                  { key: 'expiryDate', header: 'Expiry', render: r => r.expiryDate ? format(new Date(r.expiryDate), 'dd MMM yyyy') : '\u2014' },
                  { key: 'annualReviewDue', header: 'Annual Review Due', render: r => format(new Date(r.annualReviewDue), 'dd MMM yyyy') },
                  { key: 'uploadDate', header: 'Uploaded', render: r => format(new Date(r.uploadDate), 'dd MMM yyyy') },
                ]}
                emptyMessage="No letters on file for this account."
              />
            </Card>
          )}
        </div>
      )}

      {activeTab === 'dd' && (
        <Card title="Third-Party Due Diligence">
          <Table
            data={ddResp?.data || []}
            columns={[
              { key: 'bankName', header: 'Bank' },
              { key: 'reviewStatus', header: 'Status', render: r => statusBadge(r.reviewStatus), width: '110px' },
              { key: 'ddOutcome', header: 'Outcome', render: r => statusBadge(r.ddOutcome), width: '110px' },
              { key: 'lastReviewDate', header: 'Last Review', render: r => format(new Date(r.lastReviewDate), 'dd MMM yyyy') },
              { key: 'nextReviewDue', header: 'Next Due', render: r => format(new Date(r.nextReviewDue), 'dd MMM yyyy') },
              { key: 'initialDdDate', header: 'Initial DD', render: r => format(new Date(r.initialDdDate), 'dd MMM yyyy') },
            ]}
            emptyMessage="No due diligence records found."
          />
        </Card>
      )}

      {activeTab === 'policies' && (
        <Card title="Policy Documents">
          <Table
            data={policiesResp?.data || []}
            columns={[
              { key: 'documentType', header: 'Type', render: r => r.documentType.replace(/_/g, ' ') },
              { key: 'title', header: 'Title' },
              { key: 'version', header: 'Ver', width: '60px' },
              { key: 'status', header: 'Status', render: r => statusBadge(r.status), width: '110px' },
              { key: 'boardApproved', header: 'Board Approved', render: r => r.boardApproved ? <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>Yes</span> : <span style={{ color: 'var(--color-navy-400)' }}>No</span>, width: '120px' },
              { key: 'annualReviewDue', header: 'Review Due', render: r => r.annualReviewDue ? format(new Date(r.annualReviewDue), 'dd MMM yyyy') : '\u2014' },
              { key: 'createdAt', header: 'Uploaded', render: r => format(new Date(r.createdAt), 'dd MMM yyyy') },
            ]}
            emptyMessage="No policy documents uploaded."
          />
        </Card>
      )}

      {activeTab === 'insurance' && (
        <Card title="Insurance &amp; Guarantees">
          <Table
            data={insuranceResp?.data || []}
            columns={[
              { key: 'insurerName', header: 'Insurer' },
              { key: 'policyNumber', header: 'Policy Number', render: r => <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>{r.policyNumber}</span> },
              { key: 'coverageType', header: 'Type', width: '120px' },
              { key: 'coverageAmount', header: 'Coverage', render: r => <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>{r.coverageCurrency} {Number(r.coverageAmount).toLocaleString()}</span>, width: '140px' },
              { key: 'status', header: 'Status', render: r => statusBadge(r.status), width: '110px' },
              { key: 'effectiveDate', header: 'Effective', render: r => format(new Date(r.effectiveDate), 'dd MMM yyyy') },
              { key: 'expiryDate', header: 'Expiry', render: r => format(new Date(r.expiryDate), 'dd MMM yyyy') },
            ]}
            emptyMessage="No insurance or guarantee records."
          />
        </Card>
      )}

      {activeTab === 'resolution' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '20px' }}>
            <Button onClick={() => checkHealthMutation.mutate()} loading={checkHealthMutation.isPending}>
              Run Health Check
            </Button>
          </div>
          {rpackHealth ? (
            <Card title={`Resolution Pack Health \u2014 ${rpackHealth.overallStatus || '\u2014'}`}>
              {rpackHealth.components ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {(rpackHealth.components as Array<{ name: string; status: string; detail: string }>).map((comp) => (
                    <div key={comp.name} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                      padding: '14px 18px', borderRadius: 'var(--radius-md)', border: '1px solid',
                      borderColor: comp.status === 'RED' ? '#fecaca' : comp.status === 'AMBER' ? '#fde68a' : '#a7f3d0',
                      background: comp.status === 'RED' ? 'var(--color-danger-light)' : comp.status === 'AMBER' ? 'var(--color-warning-light)' : 'var(--color-success-light)',
                    }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--color-navy-800)' }}>{comp.name}</div>
                        <div style={{ fontSize: '12px', color: 'var(--color-navy-500)', marginTop: '4px' }}>{comp.detail}</div>
                      </div>
                      {statusBadge(comp.status)}
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ color: 'var(--color-navy-400)', textAlign: 'center', padding: '24px 0' }}>
                  Run a health check to see results.
                </p>
              )}
            </Card>
          ) : (
            <Card>
              <p style={{ color: 'var(--color-navy-400)', textAlign: 'center', padding: '48px 0', fontSize: '14px' }}>
                Click "Run Health Check" to assess your resolution pack readiness.
              </p>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
