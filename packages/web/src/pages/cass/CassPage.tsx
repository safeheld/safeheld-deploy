import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../hooks/useAuth';
import { cassApi } from '../../api/client';
import { Card, Table, Button, PageHeader, Pagination, Modal, Alert, StatCard, Grid, statusBadge } from '../../components/ui';
import { format } from 'date-fns';

type Tab = 'dashboard' | 'assets' | 'cmar' | 'risk' | 'regulatory' | 'impact';

export default function CassPage() {
  const { user } = useAuth();
  const firmId = user!.firmId;
  const queryClient = useQueryClient();
  const isCompliance = ['COMPLIANCE_OFFICER', 'ADMIN'].includes(user!.role);

  const [activeTab, setActiveTab] = useState<Tab>('dashboard');

  const tabs: { key: Tab; label: string }[] = [
    { key: 'dashboard', label: 'Overview' },
    { key: 'assets', label: 'Custody Assets' },
    { key: 'cmar', label: 'CMAR' },
    { key: 'risk', label: 'Risk Controls' },
    { key: 'regulatory', label: 'Regulatory Updates' },
    { key: 'impact', label: 'Impact Assessments' },
  ];

  return (
    <div>
      <PageHeader title="CASS Module" />
      <p style={{ margin: '-16px 0 20px', fontSize: '14px', color: 'var(--color-navy-500)' }}>Client Assets Sourcebook — UK Investment Firms</p>

      {/* Tab Navigation */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '24px', borderBottom: '1px solid var(--color-navy-200)', paddingBottom: '0' }}>
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            style={{
              padding: '10px 20px', fontSize: '13px', fontWeight: 500,
              border: 'none', background: 'none', cursor: 'pointer',
              color: activeTab === t.key ? 'var(--color-accent)' : 'var(--color-navy-500)',
              borderBottom: activeTab === t.key ? '2px solid var(--color-accent)' : '2px solid transparent',
              marginBottom: '-1px', transition: 'all var(--transition-fast)',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'dashboard' && <CassDashboard firmId={firmId} />}
      {activeTab === 'assets' && <AssetsTab firmId={firmId} isCompliance={isCompliance} />}
      {activeTab === 'cmar' && <CmarTab firmId={firmId} isCompliance={isCompliance} />}
      {activeTab === 'risk' && <RiskControlsTab firmId={firmId} isCompliance={isCompliance} />}
      {activeTab === 'regulatory' && <RegulatoryTab firmId={firmId} isCompliance={isCompliance} />}
      {activeTab === 'impact' && <ImpactTab firmId={firmId} isCompliance={isCompliance} />}
    </div>
  );
}

// ─── Dashboard Tab ───────────────────────────────────────────────────────────

function CassDashboard({ firmId }: { firmId: string }) {
  const { data } = useQuery({
    queryKey: ['cass-dashboard', firmId],
    queryFn: () => cassApi.getDashboard(firmId),
  });

  return (
    <div>
      <Grid cols={4} gap={20}>
        <StatCard label="Custody Assets" value={data?.custodyAssets ?? '\u2014'} color="var(--color-accent)" />
        <StatCard
          label="Total Asset Value"
          value={data?.totalAssetValue ? `\u00A3${Number(data.totalAssetValue).toLocaleString()}` : '\u2014'}
          color="var(--color-navy-700)"
        />
        <StatCard label="CMAR Drafts" value={data?.cmarDrafts ?? '\u2014'} color="var(--color-warning)" />
        <StatCard label="High Risk Controls" value={data?.highRiskControls ?? '\u2014'} color="var(--color-danger)" />
      </Grid>
      <div style={{ marginTop: '20px' }}>
        <Grid cols={4} gap={20}>
          <StatCard label="New Reg Updates" value={data?.newRegulatoryUpdates ?? '\u2014'} color="var(--color-info)" />
          <StatCard label="Pending Assessments" value={data?.pendingAssessments ?? '\u2014'} color="var(--color-warning)" />
          <StatCard label="Open Breaches" value={data?.openBreaches ?? '\u2014'} color="var(--color-danger)" />
          <StatCard
            label="Next CMAR Deadline"
            value={data?.nextCmarDeadline ? format(new Date(data.nextCmarDeadline), 'dd MMM yyyy') : '\u2014'}
            color="var(--color-navy-600)"
          />
        </Grid>
      </div>
    </div>
  );
}

// ─── Assets Tab ──────────────────────────────────────────────────────────────

function AssetsTab({ firmId, isCompliance }: { firmId: string; isCompliance: boolean }) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ assetName: '', assetType: 'CUSTODY_ASSET', clientId: '', clientName: '', quantity: '', marketValue: '', currency: 'GBP', custodian: '', isin: '', recordDate: new Date().toISOString().split('T')[0] });
  const [error, setError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['cass-assets', firmId, page],
    queryFn: () => cassApi.getAssets(firmId, { page: String(page) }),
  });

  const createMut = useMutation({
    mutationFn: () => cassApi.createAsset(firmId, {
      ...form,
      quantity: Number(form.quantity),
      marketValue: form.marketValue ? Number(form.marketValue) : undefined,
    }),
    onSuccess: () => { setShowCreate(false); queryClient.invalidateQueries({ queryKey: ['cass-assets', firmId] }); queryClient.invalidateQueries({ queryKey: ['cass-dashboard', firmId] }); },
    onError: (err: any) => setError(err?.response?.data?.error?.message || 'Failed to create asset'),
  });

  const assets = data?.data || [];
  const pagination = data?.pagination;

  return (
    <div>
      {isCompliance && (
        <div style={{ marginBottom: '16px' }}>
          <Button onClick={() => { setShowCreate(true); setError(''); }}>Add Asset</Button>
        </div>
      )}

      <Card>
        <Table
          loading={isLoading}
          data={assets}
          columns={[
            { key: 'assetName', header: 'Asset', width: '180px' },
            { key: 'assetType', header: 'Type', render: r => r.assetType.replace(/_/g, ' '), width: '120px' },
            { key: 'clientId', header: 'Client ID', width: '120px' },
            { key: 'isin', header: 'ISIN', render: r => r.isin || '\u2014', width: '120px' },
            { key: 'quantity', header: 'Quantity', render: r => <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>{Number(r.quantity).toLocaleString()}</span>, width: '100px' },
            { key: 'marketValue', header: 'Market Value', render: r => r.marketValue ? <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>{Number(r.marketValue).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span> : '\u2014', width: '130px' },
            { key: 'currency', header: 'CCY', width: '60px' },
            { key: 'custodian', header: 'Custodian', render: r => r.custodian || '\u2014', width: '140px' },
            { key: 'status', header: 'Status', render: r => statusBadge(r.status), width: '100px' },
            { key: 'recordDate', header: 'Record Date', render: r => format(new Date(r.recordDate), 'dd MMM yyyy'), width: '110px' },
          ]}
          emptyMessage="No custody assets found."
        />
        {pagination && <Pagination page={page} totalPages={pagination.totalPages} total={pagination.total} onPageChange={setPage} />}
      </Card>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Add Custody Asset">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <FormField label="Asset Name" value={form.assetName} onChange={v => setForm(f => ({ ...f, assetName: v }))} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <FormSelect label="Asset Type" value={form.assetType} onChange={v => setForm(f => ({ ...f, assetType: v }))}
              options={[{ v: 'CASH', l: 'Cash' }, { v: 'CUSTODY_ASSET', l: 'Custody Asset' }, { v: 'COLLATERAL', l: 'Collateral' }, { v: 'MANDATE', l: 'Mandate' }]} />
            <FormField label="Currency" value={form.currency} onChange={v => setForm(f => ({ ...f, currency: v }))} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <FormField label="Client ID" value={form.clientId} onChange={v => setForm(f => ({ ...f, clientId: v }))} />
            <FormField label="Client Name" value={form.clientName} onChange={v => setForm(f => ({ ...f, clientName: v }))} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <FormField label="Quantity" value={form.quantity} onChange={v => setForm(f => ({ ...f, quantity: v }))} type="number" />
            <FormField label="Market Value" value={form.marketValue} onChange={v => setForm(f => ({ ...f, marketValue: v }))} type="number" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <FormField label="ISIN" value={form.isin} onChange={v => setForm(f => ({ ...f, isin: v }))} />
            <FormField label="Custodian" value={form.custodian} onChange={v => setForm(f => ({ ...f, custodian: v }))} />
          </div>
          <FormField label="Record Date" value={form.recordDate} onChange={v => setForm(f => ({ ...f, recordDate: v }))} type="date" />
          {error && <Alert type="error" message={error} />}
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={() => createMut.mutate()} loading={createMut.isPending} disabled={!form.assetName || !form.clientId || !form.quantity}>Create Asset</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ─── CMAR Tab ────────────────────────────────────────────────────────────────

function CmarTab({ firmId, isCompliance }: { firmId: string; isCompliance: boolean }) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [showUpdate, setShowUpdate] = useState(false);
  const [selectedCmar, setSelectedCmar] = useState<any>(null);
  const [form, setForm] = useState({ reportingPeriodStart: '', reportingPeriodEnd: '', submissionDeadline: '', clientMoneyHeld: '', custodyAssetsHeld: '', notes: '' });
  const [updateForm, setUpdateForm] = useState({ status: '', fcaReference: '', notes: '' });
  const [error, setError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['cass-cmar', firmId, page],
    queryFn: () => cassApi.getCmarSubmissions(firmId, { page: String(page) }),
  });

  const createMut = useMutation({
    mutationFn: () => cassApi.createCmar(firmId, {
      ...form,
      clientMoneyHeld: form.clientMoneyHeld ? Number(form.clientMoneyHeld) : undefined,
      custodyAssetsHeld: form.custodyAssetsHeld ? Number(form.custodyAssetsHeld) : undefined,
    }),
    onSuccess: () => { setShowCreate(false); queryClient.invalidateQueries({ queryKey: ['cass-cmar', firmId] }); queryClient.invalidateQueries({ queryKey: ['cass-dashboard', firmId] }); },
    onError: (err: any) => setError(err?.response?.data?.error?.message || 'Failed to create CMAR'),
  });

  const updateMut = useMutation({
    mutationFn: () => cassApi.updateCmar(firmId, selectedCmar.id, {
      ...(updateForm.status ? { status: updateForm.status } : {}),
      ...(updateForm.fcaReference ? { fcaReference: updateForm.fcaReference } : {}),
      ...(updateForm.notes ? { notes: updateForm.notes } : {}),
    }),
    onSuccess: () => { setShowUpdate(false); queryClient.invalidateQueries({ queryKey: ['cass-cmar', firmId] }); },
    onError: (err: any) => setError(err?.response?.data?.error?.message || 'Update failed'),
  });

  const submissions = data?.data || [];
  const pagination = data?.pagination;

  const statusColors: Record<string, string> = {
    DRAFT: 'var(--color-navy-500)', IN_REVIEW: 'var(--color-warning)', SUBMITTED: 'var(--color-accent)',
    ACCEPTED: 'var(--color-success)', REJECTED: 'var(--color-danger)',
  };

  return (
    <div>
      {isCompliance && (
        <div style={{ marginBottom: '16px' }}>
          <Button onClick={() => { setShowCreate(true); setError(''); }}>New CMAR Submission</Button>
        </div>
      )}

      <Card>
        <Table
          loading={isLoading}
          data={submissions}
          columns={[
            { key: 'period', header: 'Period', render: r => `${format(new Date(r.reportingPeriodStart), 'dd MMM')} \u2014 ${format(new Date(r.reportingPeriodEnd), 'dd MMM yyyy')}`, width: '200px' },
            { key: 'submissionDeadline', header: 'Deadline', render: r => format(new Date(r.submissionDeadline), 'dd MMM yyyy'), width: '120px' },
            { key: 'status', header: 'Status', render: r => <span style={{ fontWeight: 600, fontSize: '12px', color: statusColors[r.status] || 'var(--color-navy-500)' }}>{r.status.replace(/_/g, ' ')}</span>, width: '110px' },
            { key: 'clientMoneyHeld', header: 'Client Money', render: r => r.clientMoneyHeld ? <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>{Number(r.clientMoneyHeld).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span> : '\u2014', width: '130px' },
            { key: 'custodyAssetsHeld', header: 'Custody Assets', render: r => r.custodyAssetsHeld ? <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>{Number(r.custodyAssetsHeld).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span> : '\u2014', width: '130px' },
            { key: 'numberOfClients', header: 'Clients', render: r => r.numberOfClients ?? '\u2014', width: '80px' },
            { key: 'reconciliationBreaches', header: 'Breaches', render: r => r.reconciliationBreaches ?? '\u2014', width: '80px' },
            {
              key: 'actions', header: '',
              render: r => isCompliance && r.status !== 'ACCEPTED' ? (
                <Button size="sm" variant="secondary" onClick={e => {
                  e.stopPropagation();
                  setSelectedCmar(r);
                  setUpdateForm({ status: r.status === 'DRAFT' ? 'IN_REVIEW' : r.status === 'IN_REVIEW' ? 'SUBMITTED' : '', fcaReference: '', notes: r.notes || '' });
                  setShowUpdate(true); setError('');
                }}>Update</Button>
              ) : null,
            },
          ]}
          emptyMessage="No CMAR submissions found."
        />
        {pagination && <Pagination page={page} totalPages={pagination.totalPages} total={pagination.total} onPageChange={setPage} />}
      </Card>

      {/* Create CMAR Modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New CMAR Submission">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <FormField label="Period Start" value={form.reportingPeriodStart} onChange={v => setForm(f => ({ ...f, reportingPeriodStart: v }))} type="date" />
            <FormField label="Period End" value={form.reportingPeriodEnd} onChange={v => setForm(f => ({ ...f, reportingPeriodEnd: v }))} type="date" />
          </div>
          <FormField label="Submission Deadline" value={form.submissionDeadline} onChange={v => setForm(f => ({ ...f, submissionDeadline: v }))} type="date" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <FormField label="Client Money Held" value={form.clientMoneyHeld} onChange={v => setForm(f => ({ ...f, clientMoneyHeld: v }))} type="number" />
            <FormField label="Custody Assets Held" value={form.custodyAssetsHeld} onChange={v => setForm(f => ({ ...f, custodyAssetsHeld: v }))} type="number" />
          </div>
          <FormTextarea label="Notes" value={form.notes} onChange={v => setForm(f => ({ ...f, notes: v }))} />
          {error && <Alert type="error" message={error} />}
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={() => createMut.mutate()} loading={createMut.isPending} disabled={!form.reportingPeriodStart || !form.reportingPeriodEnd || !form.submissionDeadline}>Create CMAR</Button>
          </div>
        </div>
      </Modal>

      {/* Update CMAR Modal */}
      <Modal open={showUpdate} onClose={() => setShowUpdate(false)} title="Update CMAR Submission">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {updateForm.status && (
            <p style={{ margin: 0, fontSize: '13px', color: 'var(--color-navy-600)' }}>
              Transition to: <strong style={{ color: 'var(--color-navy-900)' }}>{updateForm.status.replace(/_/g, ' ')}</strong>
            </p>
          )}
          {updateForm.status === 'SUBMITTED' && (
            <FormField label="FCA Reference" value={updateForm.fcaReference} onChange={v => setUpdateForm(f => ({ ...f, fcaReference: v }))} />
          )}
          <FormTextarea label="Notes" value={updateForm.notes} onChange={v => setUpdateForm(f => ({ ...f, notes: v }))} />
          {error && <Alert type="error" message={error} />}
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setShowUpdate(false)}>Cancel</Button>
            <Button onClick={() => updateMut.mutate()} loading={updateMut.isPending}>Update</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ─── Risk Controls Tab ───────────────────────────────────────────────────────

function RiskControlsTab({ firmId, isCompliance }: { firmId: string; isCompliance: boolean }) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    category: 'CLIENT_MONEY', title: '', description: '', likelihood: 'POSSIBLE', impact: 'MODERATE',
    controlDescription: '', controlOwner: '', nextReviewDue: '', mitigatingActions: '',
  });
  const [error, setError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['cass-risk-controls', firmId, page, categoryFilter],
    queryFn: () => cassApi.getRiskControls(firmId, { page: String(page), ...(categoryFilter ? { category: categoryFilter } : {}) }),
  });

  const createMut = useMutation({
    mutationFn: () => cassApi.createRiskControl(firmId, {
      ...form,
      nextReviewDue: form.nextReviewDue || undefined,
      mitigatingActions: form.mitigatingActions || undefined,
    }),
    onSuccess: () => { setShowCreate(false); queryClient.invalidateQueries({ queryKey: ['cass-risk-controls', firmId] }); queryClient.invalidateQueries({ queryKey: ['cass-dashboard', firmId] }); },
    onError: (err: any) => setError(err?.response?.data?.error?.message || 'Failed'),
  });

  const controls = data?.data || [];
  const pagination = data?.pagination;
  const categories = ['', 'CLIENT_MONEY', 'CUSTODY_ASSETS', 'RECONCILIATION', 'REPORTING', 'GOVERNANCE', 'OPERATIONAL'];

  const riskColor = (score: number) =>
    score >= 15 ? 'var(--color-danger)' : score >= 8 ? 'var(--color-warning)' : 'var(--color-success)';

  const statusColor = (s: string) => ({
    EFFECTIVE: 'var(--color-success)', PARTIALLY_EFFECTIVE: 'var(--color-warning)',
    INEFFECTIVE: 'var(--color-danger)', NOT_TESTED: 'var(--color-navy-500)',
  }[s] || 'var(--color-navy-500)');

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {categories.map(c => (
            <button key={c} onClick={() => { setCategoryFilter(c); setPage(1); }} style={{
              padding: '6px 14px', borderRadius: '9999px', fontSize: '12px', fontWeight: 500, cursor: 'pointer', border: '1px solid',
              background: categoryFilter === c ? 'var(--color-accent)' : 'white',
              color: categoryFilter === c ? 'white' : 'var(--color-navy-600)',
              borderColor: categoryFilter === c ? 'var(--color-accent)' : 'var(--color-navy-200)',
            }}>{c ? c.replace(/_/g, ' ') : 'All'}</button>
          ))}
        </div>
        {isCompliance && <Button onClick={() => { setShowCreate(true); setError(''); }}>Add Risk Control</Button>}
      </div>

      <Card>
        <Table
          loading={isLoading}
          data={controls}
          columns={[
            { key: 'category', header: 'Category', render: r => <span style={{ fontSize: '12px' }}>{r.category.replace(/_/g, ' ')}</span>, width: '130px' },
            { key: 'title', header: 'Title', width: '200px' },
            { key: 'riskScore', header: 'Risk Score', render: r => <span style={{ fontWeight: 700, fontSize: '13px', color: riskColor(r.riskScore) }}>{r.riskScore}</span>, width: '90px' },
            { key: 'likelihood', header: 'Likelihood', render: r => r.likelihood.replace(/_/g, ' '), width: '110px' },
            { key: 'impact', header: 'Impact', width: '90px' },
            { key: 'status', header: 'Status', render: r => <span style={{ fontWeight: 600, fontSize: '12px', color: statusColor(r.status) }}>{r.status.replace(/_/g, ' ')}</span>, width: '130px' },
            { key: 'controlOwner', header: 'Owner', render: r => r.controlOwner || '\u2014', width: '130px' },
            { key: 'nextReviewDue', header: 'Next Review', render: r => r.nextReviewDue ? format(new Date(r.nextReviewDue), 'dd MMM yyyy') : '\u2014', width: '110px' },
          ]}
          emptyMessage="No risk controls found."
        />
        {pagination && <Pagination page={page} totalPages={pagination.totalPages} total={pagination.total} onPageChange={setPage} />}
      </Card>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Add Risk Control">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <FormSelect label="Category" value={form.category} onChange={v => setForm(f => ({ ...f, category: v }))}
            options={[
              { v: 'CLIENT_MONEY', l: 'Client Money' }, { v: 'CUSTODY_ASSETS', l: 'Custody Assets' },
              { v: 'RECONCILIATION', l: 'Reconciliation' }, { v: 'REPORTING', l: 'Reporting' },
              { v: 'GOVERNANCE', l: 'Governance' }, { v: 'OPERATIONAL', l: 'Operational' },
            ]} />
          <FormField label="Title" value={form.title} onChange={v => setForm(f => ({ ...f, title: v }))} />
          <FormTextarea label="Risk Description" value={form.description} onChange={v => setForm(f => ({ ...f, description: v }))} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <FormSelect label="Likelihood" value={form.likelihood} onChange={v => setForm(f => ({ ...f, likelihood: v }))}
              options={[
                { v: 'RARE', l: 'Rare' }, { v: 'UNLIKELY', l: 'Unlikely' }, { v: 'POSSIBLE', l: 'Possible' },
                { v: 'LIKELY', l: 'Likely' }, { v: 'ALMOST_CERTAIN', l: 'Almost Certain' },
              ]} />
            <FormSelect label="Impact" value={form.impact} onChange={v => setForm(f => ({ ...f, impact: v }))}
              options={[
                { v: 'NEGLIGIBLE', l: 'Negligible' }, { v: 'MINOR', l: 'Minor' }, { v: 'MODERATE', l: 'Moderate' },
                { v: 'MAJOR', l: 'Major' }, { v: 'SEVERE', l: 'Severe' },
              ]} />
          </div>
          <FormTextarea label="Control Description" value={form.controlDescription} onChange={v => setForm(f => ({ ...f, controlDescription: v }))} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <FormField label="Control Owner" value={form.controlOwner} onChange={v => setForm(f => ({ ...f, controlOwner: v }))} />
            <FormField label="Next Review Due" value={form.nextReviewDue} onChange={v => setForm(f => ({ ...f, nextReviewDue: v }))} type="date" />
          </div>
          <FormTextarea label="Mitigating Actions" value={form.mitigatingActions} onChange={v => setForm(f => ({ ...f, mitigatingActions: v }))} />
          {error && <Alert type="error" message={error} />}
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={() => createMut.mutate()} loading={createMut.isPending} disabled={!form.title || !form.description || !form.controlDescription}>Create</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ─── Regulatory Updates Tab ──────────────────────────────────────────────────

function RegulatoryTab({ firmId, isCompliance }: { firmId: string; isCompliance: boolean }) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ title: '', source: 'FCA', publishedDate: '', effectiveDate: '', summary: '', affectedRegimes: 'CASS7', assignedTo: '' });
  const [error, setError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['cass-regulatory', firmId, page, statusFilter],
    queryFn: () => cassApi.getRegulatoryUpdates(firmId, { page: String(page), ...(statusFilter ? { status: statusFilter } : {}) }),
  });

  const createMut = useMutation({
    mutationFn: () => cassApi.createRegulatoryUpdate(firmId, {
      ...form,
      effectiveDate: form.effectiveDate || undefined,
      affectedRegimes: form.affectedRegimes.split(',').map(s => s.trim()),
    }),
    onSuccess: () => { setShowCreate(false); queryClient.invalidateQueries({ queryKey: ['cass-regulatory', firmId] }); queryClient.invalidateQueries({ queryKey: ['cass-dashboard', firmId] }); },
    onError: (err: any) => setError(err?.response?.data?.error?.message || 'Failed'),
  });

  const updates = data?.data || [];
  const pagination = data?.pagination;
  const statuses = ['', 'NEW', 'UNDER_REVIEW', 'IMPACT_ASSESSED', 'IMPLEMENTED', 'NOT_APPLICABLE'];

  const statusColor = (s: string) => ({
    NEW: 'var(--color-info)', UNDER_REVIEW: 'var(--color-warning)', IMPACT_ASSESSED: 'var(--color-accent)',
    IMPLEMENTED: 'var(--color-success)', NOT_APPLICABLE: 'var(--color-navy-400)',
  }[s] || 'var(--color-navy-500)');

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {statuses.map(s => (
            <button key={s} onClick={() => { setStatusFilter(s); setPage(1); }} style={{
              padding: '6px 14px', borderRadius: '9999px', fontSize: '12px', fontWeight: 500, cursor: 'pointer', border: '1px solid',
              background: statusFilter === s ? 'var(--color-accent)' : 'white',
              color: statusFilter === s ? 'white' : 'var(--color-navy-600)',
              borderColor: statusFilter === s ? 'var(--color-accent)' : 'var(--color-navy-200)',
            }}>{s ? s.replace(/_/g, ' ') : 'All'}</button>
          ))}
        </div>
        {isCompliance && <Button onClick={() => { setShowCreate(true); setError(''); }}>Add Update</Button>}
      </div>

      <Card>
        <Table
          loading={isLoading}
          data={updates}
          columns={[
            { key: 'title', header: 'Title', width: '250px' },
            { key: 'source', header: 'Source', width: '100px' },
            { key: 'publishedDate', header: 'Published', render: r => format(new Date(r.publishedDate), 'dd MMM yyyy'), width: '120px' },
            { key: 'effectiveDate', header: 'Effective', render: r => r.effectiveDate ? format(new Date(r.effectiveDate), 'dd MMM yyyy') : '\u2014', width: '120px' },
            { key: 'status', header: 'Status', render: r => <span style={{ fontWeight: 600, fontSize: '12px', color: statusColor(r.status) }}>{r.status.replace(/_/g, ' ')}</span>, width: '130px' },
            { key: 'assignedTo', header: 'Assigned To', render: r => r.assignedTo || '\u2014', width: '130px' },
            { key: 'assessments', header: 'Assessments', render: r => r.impactAssessments?.length || 0, width: '100px' },
          ]}
          emptyMessage="No regulatory updates found."
        />
        {pagination && <Pagination page={page} totalPages={pagination.totalPages} total={pagination.total} onPageChange={setPage} />}
      </Card>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Add Regulatory Update">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <FormField label="Title" value={form.title} onChange={v => setForm(f => ({ ...f, title: v }))} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <FormField label="Source" value={form.source} onChange={v => setForm(f => ({ ...f, source: v }))} />
            <FormField label="Affected Regimes (comma-separated)" value={form.affectedRegimes} onChange={v => setForm(f => ({ ...f, affectedRegimes: v }))} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <FormField label="Published Date" value={form.publishedDate} onChange={v => setForm(f => ({ ...f, publishedDate: v }))} type="date" />
            <FormField label="Effective Date" value={form.effectiveDate} onChange={v => setForm(f => ({ ...f, effectiveDate: v }))} type="date" />
          </div>
          <FormTextarea label="Summary" value={form.summary} onChange={v => setForm(f => ({ ...f, summary: v }))} />
          <FormField label="Assigned To" value={form.assignedTo} onChange={v => setForm(f => ({ ...f, assignedTo: v }))} />
          {error && <Alert type="error" message={error} />}
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={() => createMut.mutate()} loading={createMut.isPending} disabled={!form.title || !form.publishedDate || !form.summary}>Create</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ─── Impact Assessments Tab ──────────────────────────────────────────────────

function ImpactTab({ firmId, isCompliance }: { firmId: string; isCompliance: boolean }) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ regulatoryUpdateId: '', assessedBy: '', impactLevel: 'MODERATE', affectedProcesses: '', requiredChanges: '', implementationDeadline: '' });
  const [error, setError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['cass-impact', firmId, page],
    queryFn: () => cassApi.getImpactAssessments(firmId, { page: String(page) }),
  });

  // Fetch regulatory updates for the dropdown
  const { data: regUpdates } = useQuery({
    queryKey: ['cass-regulatory-all', firmId],
    queryFn: () => cassApi.getRegulatoryUpdates(firmId, { page_size: '100' }),
  });

  const createMut = useMutation({
    mutationFn: () => cassApi.createImpactAssessment(firmId, {
      ...form,
      affectedProcesses: form.affectedProcesses.split(',').map(s => s.trim()).filter(Boolean),
      implementationDeadline: form.implementationDeadline || undefined,
    }),
    onSuccess: () => { setShowCreate(false); queryClient.invalidateQueries({ queryKey: ['cass-impact', firmId] }); queryClient.invalidateQueries({ queryKey: ['cass-dashboard', firmId] }); },
    onError: (err: any) => setError(err?.response?.data?.error?.message || 'Failed'),
  });

  const assessments = data?.data || [];
  const pagination = data?.pagination;

  const impactColor = (l: string) => ({
    NEGLIGIBLE: 'var(--color-navy-400)', MINOR: 'var(--color-navy-500)',
    MODERATE: 'var(--color-warning)', MAJOR: '#ea580c', SEVERE: 'var(--color-danger)',
  }[l] || 'var(--color-navy-500)');

  return (
    <div>
      {isCompliance && (
        <div style={{ marginBottom: '16px' }}>
          <Button onClick={() => { setShowCreate(true); setError(''); }}>New Assessment</Button>
        </div>
      )}

      <Card>
        <Table
          loading={isLoading}
          data={assessments}
          columns={[
            { key: 'regulatoryUpdate', header: 'Regulatory Update', render: r => r.regulatoryUpdate?.title || '\u2014', width: '250px' },
            { key: 'assessedBy', header: 'Assessed By', width: '140px' },
            { key: 'impactLevel', header: 'Impact', render: r => <span style={{ fontWeight: 600, fontSize: '12px', color: impactColor(r.impactLevel) }}>{r.impactLevel}</span>, width: '100px' },
            { key: 'status', header: 'Status', render: r => statusBadge(r.status), width: '110px' },
            { key: 'implementationDeadline', header: 'Deadline', render: r => r.implementationDeadline ? format(new Date(r.implementationDeadline), 'dd MMM yyyy') : '\u2014', width: '120px' },
            { key: 'createdAt', header: 'Created', render: r => format(new Date(r.createdAt), 'dd MMM yyyy'), width: '110px' },
          ]}
          emptyMessage="No impact assessments found."
        />
        {pagination && <Pagination page={page} totalPages={pagination.totalPages} total={pagination.total} onPageChange={setPage} />}
      </Card>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New Impact Assessment">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--color-navy-700)', marginBottom: '6px' }}>Regulatory Update</label>
            <select
              value={form.regulatoryUpdateId}
              onChange={e => setForm(f => ({ ...f, regulatoryUpdateId: e.target.value }))}
              style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--color-navy-300)', borderRadius: 'var(--radius-md)', fontSize: '13px', color: 'var(--color-navy-700)', background: 'white' }}
            >
              <option value="">Select a regulatory update...</option>
              {(regUpdates?.data || []).map((u: any) => (
                <option key={u.id} value={u.id}>{u.title}</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <FormField label="Assessed By" value={form.assessedBy} onChange={v => setForm(f => ({ ...f, assessedBy: v }))} />
            <FormSelect label="Impact Level" value={form.impactLevel} onChange={v => setForm(f => ({ ...f, impactLevel: v }))}
              options={[
                { v: 'NEGLIGIBLE', l: 'Negligible' }, { v: 'MINOR', l: 'Minor' }, { v: 'MODERATE', l: 'Moderate' },
                { v: 'MAJOR', l: 'Major' }, { v: 'SEVERE', l: 'Severe' },
              ]} />
          </div>
          <FormField label="Affected Processes (comma-separated)" value={form.affectedProcesses} onChange={v => setForm(f => ({ ...f, affectedProcesses: v }))} />
          <FormTextarea label="Required Changes" value={form.requiredChanges} onChange={v => setForm(f => ({ ...f, requiredChanges: v }))} />
          <FormField label="Implementation Deadline" value={form.implementationDeadline} onChange={v => setForm(f => ({ ...f, implementationDeadline: v }))} type="date" />
          {error && <Alert type="error" message={error} />}
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={() => createMut.mutate()} loading={createMut.isPending} disabled={!form.regulatoryUpdateId || !form.assessedBy || !form.requiredChanges}>Create</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ─── Shared Form Components ──────────────────────────────────────────────────

function FormField({ label, value, onChange, type = 'text' }: {
  label: string; value: string; onChange: (v: string) => void; type?: string;
}) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--color-navy-700)', marginBottom: '6px' }}>{label}</label>
      <input
        type={type} value={value} onChange={e => onChange(e.target.value)}
        style={{
          width: '100%', padding: '9px 12px', border: '1px solid var(--color-navy-300)',
          borderRadius: 'var(--radius-md)', fontSize: '13px', boxSizing: 'border-box',
          fontFamily: 'inherit', color: 'var(--color-navy-700)',
        }}
      />
    </div>
  );
}

function FormTextarea({ label, value, onChange, rows = 3 }: {
  label: string; value: string; onChange: (v: string) => void; rows?: number;
}) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--color-navy-700)', marginBottom: '6px' }}>{label}</label>
      <textarea
        value={value} onChange={e => onChange(e.target.value)} rows={rows}
        style={{
          width: '100%', padding: '9px 12px', border: '1px solid var(--color-navy-300)',
          borderRadius: 'var(--radius-md)', fontSize: '13px', resize: 'vertical',
          boxSizing: 'border-box', fontFamily: 'inherit', color: 'var(--color-navy-700)',
        }}
      />
    </div>
  );
}

function FormSelect({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void;
  options: { v: string; l: string }[];
}) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--color-navy-700)', marginBottom: '6px' }}>{label}</label>
      <select
        value={value} onChange={e => onChange(e.target.value)}
        style={{
          width: '100%', padding: '9px 12px', border: '1px solid var(--color-navy-300)',
          borderRadius: 'var(--radius-md)', fontSize: '13px', color: 'var(--color-navy-700)', background: 'white',
        }}
      >
        {options.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
    </div>
  );
}
