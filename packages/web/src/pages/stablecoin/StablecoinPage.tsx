import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../hooks/useAuth';
import { stablecoinApi } from '../../api/client';
import { Card, Table, Button, PageHeader, Pagination, Modal, Alert, StatCard, Grid, statusBadge } from '../../components/ui';
import { format } from 'date-fns';

type Tab = 'dashboard' | 'tokens' | 'peg' | 'reserves' | 'attestations';

export default function StablecoinPage() {
  const { user } = useAuth();
  const firmId = user!.firmId;
  const isCompliance = ['COMPLIANCE_OFFICER', 'ADMIN'].includes(user!.role);

  const [activeTab, setActiveTab] = useState<Tab>('dashboard');

  const tabs: { key: Tab; label: string }[] = [
    { key: 'dashboard', label: 'Overview' },
    { key: 'tokens', label: 'Tokens' },
    { key: 'peg', label: 'Peg Monitoring' },
    { key: 'reserves', label: 'Reserve Assets' },
    { key: 'attestations', label: 'Attestations' },
  ];

  return (
    <div>
      <PageHeader title="Stablecoin Module" />
      <p style={{ margin: '-16px 0 20px', fontSize: '14px', color: 'var(--color-navy-500)' }}>Token Issuance Tracking — Peg Verification & Reserve Attestations</p>

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

      {activeTab === 'dashboard' && <StablecoinDashboard firmId={firmId} />}
      {activeTab === 'tokens' && <TokensTab firmId={firmId} isCompliance={isCompliance} />}
      {activeTab === 'peg' && <PegTab firmId={firmId} isCompliance={isCompliance} />}
      {activeTab === 'reserves' && <ReservesTab firmId={firmId} isCompliance={isCompliance} />}
      {activeTab === 'attestations' && <AttestationsTab firmId={firmId} isCompliance={isCompliance} />}
    </div>
  );
}

// ─── Shared ──────────────────────────────────────────────────────────────────

const fieldLabel: React.CSSProperties = { display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--color-navy-700)', marginBottom: '6px' };
const fieldInput: React.CSSProperties = {
  width: '100%', padding: '9px 12px', border: '1px solid var(--color-navy-300)',
  borderRadius: 'var(--radius-md)', fontSize: '13px', boxSizing: 'border-box' as const,
  fontFamily: 'inherit', color: 'var(--color-navy-700)', background: 'white',
};

function FormField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label style={fieldLabel}>{label}{required && ' *'}</label>
      {children}
    </div>
  );
}

const pegColor = (s: string) =>
  s === 'ON_PEG' ? 'var(--color-success)' : s === 'MINOR_DEVIATION' ? 'var(--color-warning)' : s === 'MAJOR_DEVIATION' ? '#ea580c' : 'var(--color-danger)';

const coverageColor = (r: number) => r >= 1 ? 'var(--color-success)' : r >= 0.95 ? 'var(--color-warning)' : 'var(--color-danger)';

// ─── Dashboard ───────────────────────────────────────────────────────────────

function StablecoinDashboard({ firmId }: { firmId: string }) {
  const { data } = useQuery({
    queryKey: ['stablecoin-dashboard', firmId],
    queryFn: () => stablecoinApi.getDashboard(firmId),
  });

  return (
    <div>
      <Grid cols={4} gap={20}>
        <StatCard label="Tracked Tokens" value={data?.totalTokens ?? '\u2014'} color="var(--color-accent)" />
        <StatCard label="On-Peg Tokens" value={data?.onPegTokens ?? '\u2014'} color="var(--color-success)" />
        <StatCard label="Active Reserves" value={data?.activeReserveAssets ?? '\u2014'} color="var(--color-navy-700)" />
        <StatCard
          label="Reserve Value"
          value={data?.totalReserveValue ? `$${Number(data.totalReserveValue).toLocaleString()}` : '\u2014'}
          color="var(--color-navy-700)"
        />
      </Grid>
      <div style={{ height: '20px' }} />
      <Grid cols={4} gap={20}>
        <StatCard
          label="Coverage Ratio"
          value={data?.latestCoverageRatio ? `${(Number(data.latestCoverageRatio) * 100).toFixed(1)}%` : '\u2014'}
          color={data?.latestCoverageRatio ? coverageColor(Number(data.latestCoverageRatio)) : 'var(--color-navy-500)'}
        />
        <StatCard
          label="Latest Attestation"
          value={data?.latestAttestationDate ? format(new Date(data.latestAttestationDate), 'dd MMM yyyy') : '\u2014'}
          color="var(--color-navy-500)"
        />
        <StatCard label="Attestation Token" value={data?.latestAttestationToken || '\u2014'} color="var(--color-accent)" />
        <StatCard label="Peg Snapshots" value={data?.pegSnapshots ?? '\u2014'} color="var(--color-navy-500)" />
      </Grid>
    </div>
  );
}

// ─── Tokens Tab ──────────────────────────────────────────────────────────────

function TokensTab({ firmId, isCompliance }: { firmId: string; isCompliance: boolean }) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pegFilter, setPegFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [showUpdate, setShowUpdate] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const [form, setForm] = useState({ symbol: '', name: '', contractAddress: '', network: 'ETHEREUM', pegCurrency: 'USD', pegTarget: '1.0', regime: 'UNREGULATED', issuerName: '', notes: '' });
  const [updateForm, setUpdateForm] = useState({ currentPrice: '', pegStatus: 'ON_PEG', totalSupply: '', circulatingSupply: '', notes: '' });
  const [error, setError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['stablecoin-tokens', firmId, page, pegFilter],
    queryFn: () => stablecoinApi.getTokens(firmId, {
      page: String(page),
      ...(pegFilter ? { peg_status: pegFilter } : {}),
    }),
  });

  const createMut = useMutation({
    mutationFn: () => stablecoinApi.createToken(firmId, {
      ...form,
      pegTarget: Number(form.pegTarget),
    }),
    onSuccess: () => { setShowCreate(false); queryClient.invalidateQueries({ queryKey: ['stablecoin-tokens', firmId] }); queryClient.invalidateQueries({ queryKey: ['stablecoin-dashboard', firmId] }); },
    onError: (err: any) => setError(err?.response?.data?.error?.message || 'Failed to create token.'),
  });

  const updateMut = useMutation({
    mutationFn: () => stablecoinApi.updateToken(firmId, selected!.id, {
      currentPrice: updateForm.currentPrice ? Number(updateForm.currentPrice) : undefined,
      pegStatus: updateForm.pegStatus || undefined,
      totalSupply: updateForm.totalSupply || undefined,
      circulatingSupply: updateForm.circulatingSupply || undefined,
      notes: updateForm.notes || undefined,
    }),
    onSuccess: () => { setShowUpdate(false); queryClient.invalidateQueries({ queryKey: ['stablecoin-tokens', firmId] }); queryClient.invalidateQueries({ queryKey: ['stablecoin-dashboard', firmId] }); },
    onError: (err: any) => setError(err?.response?.data?.error?.message || 'Update failed.'),
  });

  const tokens = data?.data || [];
  const pagination = data?.pagination;
  const networks = ['ETHEREUM', 'BITCOIN', 'POLYGON', 'ARBITRUM', 'OPTIMISM', 'SOLANA', 'AVALANCHE', 'BSC', 'OTHER'];
  const pegStatuses = ['', 'ON_PEG', 'MINOR_DEVIATION', 'MAJOR_DEVIATION', 'DEPEGGED'];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <select value={pegFilter} onChange={e => { setPegFilter(e.target.value); setPage(1); }} style={{ ...fieldInput, width: 'auto' }}>
          <option value="">All Peg Statuses</option>
          {pegStatuses.filter(Boolean).map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
        </select>
        {isCompliance && <Button onClick={() => { setShowCreate(true); setError(''); }}>Add Token</Button>}
      </div>

      <Card>
        <Table
          loading={isLoading}
          data={tokens}
          columns={[
            { key: 'symbol', header: 'Symbol', render: (r: any) => <strong>{r.symbol}</strong>, width: '80px' },
            { key: 'name', header: 'Name', width: '160px' },
            { key: 'network', header: 'Network', width: '100px' },
            { key: 'pegCurrency', header: 'Peg', render: (r: any) => `${r.pegCurrency} ${Number(r.pegTarget).toFixed(2)}`, width: '80px' },
            {
              key: 'currentPrice', header: 'Price', width: '100px',
              render: (r: any) => r.currentPrice ? <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>${Number(r.currentPrice).toFixed(4)}</span> : '\u2014',
            },
            {
              key: 'pegStatus', header: 'Peg Status', width: '130px',
              render: (r: any) => <span style={{ fontWeight: 600, fontSize: '12px', color: pegColor(r.pegStatus) }}>{r.pegStatus.replace(/_/g, ' ')}</span>,
            },
            {
              key: 'circulatingSupply', header: 'Circulating', width: '140px',
              render: (r: any) => r.circulatingSupply ? <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>{Number(r.circulatingSupply).toLocaleString()}</span> : '\u2014',
            },
            { key: 'regime', header: 'Regime', render: (r: any) => r.regime.replace(/_/g, ' '), width: '110px' },
            ...(isCompliance ? [{
              key: 'actions', header: '',
              render: (r: any) => (
                <Button size="sm" variant="secondary" onClick={(e: any) => {
                  e.stopPropagation();
                  setSelected(r);
                  setUpdateForm({ currentPrice: r.currentPrice?.toString() || '', pegStatus: r.pegStatus, totalSupply: r.totalSupply?.toString() || '', circulatingSupply: r.circulatingSupply?.toString() || '', notes: r.notes || '' });
                  setShowUpdate(true);
                  setError('');
                }}>Update</Button>
              ),
            }] : []),
          ]}
          emptyMessage="No stablecoin tokens tracked."
        />
        {pagination && <Pagination page={page} totalPages={pagination.totalPages} total={pagination.total} onPageChange={setPage} />}
      </Card>

      {/* Create Token Modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Add Stablecoin Token">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <FormField label="Symbol" required>
              <input style={fieldInput} value={form.symbol} onChange={e => setForm(p => ({ ...p, symbol: e.target.value }))} placeholder="e.g. USDC" />
            </FormField>
            <FormField label="Name" required>
              <input style={fieldInput} value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. USD Coin" />
            </FormField>
          </div>
          <FormField label="Contract Address">
            <input style={{ ...fieldInput, fontFamily: 'var(--font-mono)', fontSize: '12px' }} value={form.contractAddress} onChange={e => setForm(p => ({ ...p, contractAddress: e.target.value }))} placeholder="0x..." />
          </FormField>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px' }}>
            <FormField label="Network" required>
              <select style={fieldInput} value={form.network} onChange={e => setForm(p => ({ ...p, network: e.target.value }))}>
                {networks.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </FormField>
            <FormField label="Peg Currency" required>
              <input style={fieldInput} value={form.pegCurrency} onChange={e => setForm(p => ({ ...p, pegCurrency: e.target.value }))} maxLength={3} />
            </FormField>
            <FormField label="Peg Target">
              <input type="number" step="0.01" style={fieldInput} value={form.pegTarget} onChange={e => setForm(p => ({ ...p, pegTarget: e.target.value }))} />
            </FormField>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <FormField label="Regulatory Regime">
              <select style={fieldInput} value={form.regime} onChange={e => setForm(p => ({ ...p, regime: e.target.value }))}>
                {['UNREGULATED', 'MICA', 'GENIUS_ACT', 'UK_FCA', 'OTHER'].map(r => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}
              </select>
            </FormField>
            <FormField label="Issuer Name">
              <input style={fieldInput} value={form.issuerName} onChange={e => setForm(p => ({ ...p, issuerName: e.target.value }))} placeholder="e.g. Circle" />
            </FormField>
          </div>
          <FormField label="Notes">
            <textarea style={{ ...fieldInput, resize: 'vertical' as const }} rows={2} value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
          </FormField>
          {error && <Alert type="error" message={error} />}
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={() => createMut.mutate()} loading={createMut.isPending} disabled={!form.symbol || !form.name}>Create Token</Button>
          </div>
        </div>
      </Modal>

      {/* Update Token Modal */}
      <Modal open={showUpdate} onClose={() => setShowUpdate(false)} title="Update Token">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {selected && (
            <div style={{ padding: '12px 14px', background: 'var(--color-navy-50)', borderRadius: 'var(--radius-md)', fontSize: '13px', border: '1px solid var(--color-navy-200)' }}>
              <strong>{selected.symbol}</strong> {'\u2014'} {selected.name}
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <FormField label="Current Price">
              <input type="number" step="0.0001" style={fieldInput} value={updateForm.currentPrice} onChange={e => setUpdateForm(p => ({ ...p, currentPrice: e.target.value }))} />
            </FormField>
            <FormField label="Peg Status">
              <select style={fieldInput} value={updateForm.pegStatus} onChange={e => setUpdateForm(p => ({ ...p, pegStatus: e.target.value }))}>
                {['ON_PEG', 'MINOR_DEVIATION', 'MAJOR_DEVIATION', 'DEPEGGED'].map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
              </select>
            </FormField>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <FormField label="Total Supply">
              <input style={fieldInput} value={updateForm.totalSupply} onChange={e => setUpdateForm(p => ({ ...p, totalSupply: e.target.value }))} />
            </FormField>
            <FormField label="Circulating Supply">
              <input style={fieldInput} value={updateForm.circulatingSupply} onChange={e => setUpdateForm(p => ({ ...p, circulatingSupply: e.target.value }))} />
            </FormField>
          </div>
          <FormField label="Notes">
            <textarea style={{ ...fieldInput, resize: 'vertical' as const }} rows={2} value={updateForm.notes} onChange={e => setUpdateForm(p => ({ ...p, notes: e.target.value }))} />
          </FormField>
          {error && <Alert type="error" message={error} />}
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setShowUpdate(false)}>Cancel</Button>
            <Button onClick={() => updateMut.mutate()} loading={updateMut.isPending}>Update Token</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ─── Peg Monitoring Tab ──────────────────────────────────────────────────────

function PegTab({ firmId, isCompliance }: { firmId: string; isCompliance: boolean }) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pegFilter, setPegFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ tokenId: '', price: '', snapshotAt: '', totalSupply: '', marketCap: '', volume24h: '' });
  const [error, setError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['stablecoin-peg', firmId, page, pegFilter],
    queryFn: () => stablecoinApi.getPegSnapshots(firmId, {
      page: String(page),
      ...(pegFilter ? { peg_status: pegFilter } : {}),
    }),
  });

  const { data: tokensData } = useQuery({
    queryKey: ['stablecoin-tokens-all', firmId],
    queryFn: () => stablecoinApi.getTokens(firmId, { page: '1', pageSize: '200' }),
  });

  const createMut = useMutation({
    mutationFn: () => stablecoinApi.createPegSnapshot(firmId, {
      tokenId: form.tokenId,
      price: Number(form.price),
      snapshotAt: form.snapshotAt,
      totalSupply: form.totalSupply || undefined,
      marketCap: form.marketCap ? Number(form.marketCap) : undefined,
      volume24h: form.volume24h ? Number(form.volume24h) : undefined,
    }),
    onSuccess: () => { setShowCreate(false); queryClient.invalidateQueries({ queryKey: ['stablecoin-peg', firmId] }); queryClient.invalidateQueries({ queryKey: ['stablecoin-dashboard', firmId] }); queryClient.invalidateQueries({ queryKey: ['stablecoin-tokens', firmId] }); },
    onError: (err: any) => setError(err?.response?.data?.error?.message || 'Failed to record snapshot.'),
  });

  const snapshots = data?.data || [];
  const pagination = data?.pagination;
  const tokens = tokensData?.data || [];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <select value={pegFilter} onChange={e => { setPegFilter(e.target.value); setPage(1); }} style={{ ...fieldInput, width: 'auto' }}>
          <option value="">All Statuses</option>
          {['ON_PEG', 'MINOR_DEVIATION', 'MAJOR_DEVIATION', 'DEPEGGED'].map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
        </select>
        {isCompliance && <Button onClick={() => { setShowCreate(true); setError(''); }}>Record Snapshot</Button>}
      </div>

      <Card>
        <Table
          loading={isLoading}
          data={snapshots}
          columns={[
            { key: 'token', header: 'Token', render: (r: any) => <strong>{r.token?.symbol}</strong>, width: '80px' },
            {
              key: 'price', header: 'Price', width: '110px',
              render: (r: any) => <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>${Number(r.price).toFixed(4)}</span>,
            },
            {
              key: 'pegTarget', header: 'Target', width: '90px',
              render: (r: any) => <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>${Number(r.pegTarget).toFixed(4)}</span>,
            },
            {
              key: 'deviationPct', header: 'Deviation', width: '100px',
              render: (r: any) => {
                const d = Number(r.deviationPct);
                return <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', fontWeight: 600, color: Math.abs(d) <= 0.5 ? 'var(--color-success)' : Math.abs(d) <= 2 ? 'var(--color-warning)' : 'var(--color-danger)' }}>{d >= 0 ? '+' : ''}{d.toFixed(2)}%</span>;
              },
            },
            {
              key: 'pegStatus', header: 'Status', width: '130px',
              render: (r: any) => <span style={{ fontWeight: 600, fontSize: '12px', color: pegColor(r.pegStatus) }}>{r.pegStatus.replace(/_/g, ' ')}</span>,
            },
            {
              key: 'marketCap', header: 'Market Cap', width: '130px',
              render: (r: any) => r.marketCap ? <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>${Number(r.marketCap).toLocaleString()}</span> : '\u2014',
            },
            { key: 'snapshotAt', header: 'Snapshot', render: (r: any) => format(new Date(r.snapshotAt), 'dd MMM yyyy HH:mm'), width: '150px' },
          ]}
          emptyMessage="No peg snapshots recorded."
        />
        {pagination && <Pagination page={page} totalPages={pagination.totalPages} total={pagination.total} onPageChange={setPage} />}
      </Card>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Record Peg Snapshot">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <FormField label="Token" required>
            <select style={fieldInput} value={form.tokenId} onChange={e => setForm(p => ({ ...p, tokenId: e.target.value }))}>
              <option value="">Select token...</option>
              {tokens.map((t: any) => <option key={t.id} value={t.id}>{t.symbol} ({t.name})</option>)}
            </select>
          </FormField>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <FormField label="Price" required>
              <input type="number" step="0.0001" style={fieldInput} value={form.price} onChange={e => setForm(p => ({ ...p, price: e.target.value }))} placeholder="e.g. 0.9998" />
            </FormField>
            <FormField label="Snapshot Date/Time" required>
              <input type="datetime-local" style={fieldInput} value={form.snapshotAt} onChange={e => setForm(p => ({ ...p, snapshotAt: e.target.value }))} />
            </FormField>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px' }}>
            <FormField label="Total Supply">
              <input style={fieldInput} value={form.totalSupply} onChange={e => setForm(p => ({ ...p, totalSupply: e.target.value }))} />
            </FormField>
            <FormField label="Market Cap (USD)">
              <input type="number" style={fieldInput} value={form.marketCap} onChange={e => setForm(p => ({ ...p, marketCap: e.target.value }))} />
            </FormField>
            <FormField label="24h Volume (USD)">
              <input type="number" style={fieldInput} value={form.volume24h} onChange={e => setForm(p => ({ ...p, volume24h: e.target.value }))} />
            </FormField>
          </div>
          {error && <Alert type="error" message={error} />}
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={() => createMut.mutate()} loading={createMut.isPending} disabled={!form.tokenId || !form.price || !form.snapshotAt}>Record Snapshot</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ─── Reserve Assets Tab ──────────────────────────────────────────────────────

function ReservesTab({ firmId, isCompliance }: { firmId: string; isCompliance: boolean }) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ tokenId: '', assetType: 'CASH', description: '', custodian: '', faceValue: '', marketValue: '', currency: 'USD', maturityDate: '', isin: '', notes: '', recordDate: '' });
  const [error, setError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['stablecoin-reserves', firmId, page, typeFilter],
    queryFn: () => stablecoinApi.getReserveAssets(firmId, {
      page: String(page),
      ...(typeFilter ? { asset_type: typeFilter } : {}),
    }),
  });

  const { data: tokensData } = useQuery({
    queryKey: ['stablecoin-tokens-all', firmId],
    queryFn: () => stablecoinApi.getTokens(firmId, { page: '1', pageSize: '200' }),
  });

  const createMut = useMutation({
    mutationFn: () => stablecoinApi.createReserveAsset(firmId, {
      ...form,
      faceValue: Number(form.faceValue),
      marketValue: form.marketValue ? Number(form.marketValue) : undefined,
      maturityDate: form.maturityDate || undefined,
      isin: form.isin || undefined,
      notes: form.notes || undefined,
    }),
    onSuccess: () => { setShowCreate(false); queryClient.invalidateQueries({ queryKey: ['stablecoin-reserves', firmId] }); queryClient.invalidateQueries({ queryKey: ['stablecoin-dashboard', firmId] }); },
    onError: (err: any) => setError(err?.response?.data?.error?.message || 'Failed to create reserve asset.'),
  });

  const assets = data?.data || [];
  const pagination = data?.pagination;
  const tokens = tokensData?.data || [];
  const assetTypes = ['', 'CASH', 'TREASURY_BILL', 'GOVERNMENT_BOND', 'MONEY_MARKET_FUND', 'COMMERCIAL_PAPER', 'CERTIFICATE_OF_DEPOSIT', 'CRYPTO_COLLATERAL', 'OTHER'];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <select value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(1); }} style={{ ...fieldInput, width: 'auto' }}>
          <option value="">All Asset Types</option>
          {assetTypes.filter(Boolean).map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
        </select>
        {isCompliance && <Button onClick={() => { setShowCreate(true); setError(''); }}>Add Reserve Asset</Button>}
      </div>

      <Card>
        <Table
          loading={isLoading}
          data={assets}
          columns={[
            { key: 'token', header: 'Token', render: (r: any) => <strong>{r.token?.symbol}</strong>, width: '80px' },
            { key: 'assetType', header: 'Type', render: (r: any) => r.assetType.replace(/_/g, ' '), width: '140px' },
            { key: 'description', header: 'Description', width: '200px' },
            { key: 'custodian', header: 'Custodian', render: (r: any) => r.custodian || '\u2014', width: '120px' },
            {
              key: 'faceValue', header: 'Face Value', width: '130px',
              render: (r: any) => <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>{r.currency} {Number(r.faceValue).toLocaleString()}</span>,
            },
            {
              key: 'marketValue', header: 'Market Value', width: '130px',
              render: (r: any) => r.marketValue ? <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>{r.currency} {Number(r.marketValue).toLocaleString()}</span> : '\u2014',
            },
            { key: 'status', header: 'Status', render: (r: any) => statusBadge(r.status), width: '100px' },
            { key: 'maturityDate', header: 'Maturity', render: (r: any) => r.maturityDate ? format(new Date(r.maturityDate), 'dd MMM yyyy') : '\u2014', width: '110px' },
            { key: 'recordDate', header: 'Recorded', render: (r: any) => format(new Date(r.recordDate), 'dd MMM yyyy'), width: '110px' },
          ]}
          emptyMessage="No reserve assets recorded."
        />
        {pagination && <Pagination page={page} totalPages={pagination.totalPages} total={pagination.total} onPageChange={setPage} />}
      </Card>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Add Reserve Asset">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <FormField label="Token" required>
              <select style={fieldInput} value={form.tokenId} onChange={e => setForm(p => ({ ...p, tokenId: e.target.value }))}>
                <option value="">Select token...</option>
                {tokens.map((t: any) => <option key={t.id} value={t.id}>{t.symbol} ({t.name})</option>)}
              </select>
            </FormField>
            <FormField label="Asset Type" required>
              <select style={fieldInput} value={form.assetType} onChange={e => setForm(p => ({ ...p, assetType: e.target.value }))}>
                {assetTypes.filter(Boolean).map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
              </select>
            </FormField>
          </div>
          <FormField label="Description" required>
            <input style={fieldInput} value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="e.g. US 3-month T-Bill" />
          </FormField>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px' }}>
            <FormField label="Face Value" required>
              <input type="number" style={fieldInput} value={form.faceValue} onChange={e => setForm(p => ({ ...p, faceValue: e.target.value }))} />
            </FormField>
            <FormField label="Market Value">
              <input type="number" style={fieldInput} value={form.marketValue} onChange={e => setForm(p => ({ ...p, marketValue: e.target.value }))} />
            </FormField>
            <FormField label="Currency" required>
              <input style={fieldInput} value={form.currency} onChange={e => setForm(p => ({ ...p, currency: e.target.value }))} maxLength={3} />
            </FormField>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px' }}>
            <FormField label="Custodian">
              <input style={fieldInput} value={form.custodian} onChange={e => setForm(p => ({ ...p, custodian: e.target.value }))} />
            </FormField>
            <FormField label="ISIN">
              <input style={fieldInput} value={form.isin} onChange={e => setForm(p => ({ ...p, isin: e.target.value }))} maxLength={12} />
            </FormField>
            <FormField label="Maturity Date">
              <input type="date" style={fieldInput} value={form.maturityDate} onChange={e => setForm(p => ({ ...p, maturityDate: e.target.value }))} />
            </FormField>
          </div>
          <FormField label="Record Date" required>
            <input type="date" style={fieldInput} value={form.recordDate} onChange={e => setForm(p => ({ ...p, recordDate: e.target.value }))} />
          </FormField>
          {error && <Alert type="error" message={error} />}
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={() => createMut.mutate()} loading={createMut.isPending} disabled={!form.tokenId || !form.description || !form.faceValue || !form.recordDate}>Add Asset</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ─── Attestations Tab ────────────────────────────────────────────────────────

function AttestationsTab({ firmId, isCompliance }: { firmId: string; isCompliance: boolean }) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [showGenerate, setShowGenerate] = useState(false);
  const [genForm, setGenForm] = useState({ tokenId: '', snapshotDate: '' });
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['stablecoin-attestations', firmId, page],
    queryFn: () => stablecoinApi.getAttestations(firmId, { page: String(page) }),
  });

  const { data: tokensData } = useQuery({
    queryKey: ['stablecoin-tokens-all', firmId],
    queryFn: () => stablecoinApi.getTokens(firmId, { page: '1', pageSize: '200' }),
  });

  const genMut = useMutation({
    mutationFn: () => stablecoinApi.generateAttestation(firmId, genForm.tokenId, genForm.snapshotDate),
    onSuccess: () => { setShowGenerate(false); queryClient.invalidateQueries({ queryKey: ['stablecoin-attestations', firmId] }); queryClient.invalidateQueries({ queryKey: ['stablecoin-dashboard', firmId] }); },
    onError: (err: any) => setError(err?.response?.data?.error?.message || 'Failed to generate attestation.'),
  });

  const attestations = data?.data || [];
  const pagination = data?.pagination;
  const tokens = tokensData?.data || [];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <p style={{ margin: 0, fontSize: '13px', color: 'var(--color-navy-500)' }}>Cryptographic attestation verifying reserve assets cover circulating supply.</p>
        {isCompliance && <Button onClick={() => { setShowGenerate(true); setError(''); setGenForm({ tokenId: '', snapshotDate: '' }); }}>Generate Attestation</Button>}
      </div>

      <Card>
        <Table
          loading={isLoading}
          data={attestations}
          columns={[
            { key: 'token', header: 'Token', render: (r: any) => <strong>{r.token?.symbol}</strong>, width: '80px' },
            { key: 'snapshotDate', header: 'Snapshot', render: (r: any) => format(new Date(r.snapshotDate), 'dd MMM yyyy'), width: '120px' },
            { key: 'status', header: 'Status', render: (r: any) => statusBadge(r.status), width: '110px' },
            {
              key: 'coverageRatio', header: 'Coverage', width: '110px',
              render: (r: any) => <span style={{ fontWeight: 700, fontSize: '14px', color: coverageColor(Number(r.coverageRatio)) }}>{(Number(r.coverageRatio) * 100).toFixed(1)}%</span>,
            },
            {
              key: 'totalReserveValue', header: 'Reserves', width: '140px',
              render: (r: any) => <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>${Number(r.totalReserveValue).toLocaleString()}</span>,
            },
            {
              key: 'totalCirculatingValue', header: 'Circulating', width: '140px',
              render: (r: any) => <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>${Number(r.totalCirculatingValue).toLocaleString()}</span>,
            },
            {
              key: 'attestationHash', header: 'Hash', width: '160px',
              render: (r: any) => r.attestationHash ? <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--color-navy-500)' }}>{r.attestationHash.slice(0, 16)}...{r.attestationHash.slice(-8)}</span> : '\u2014',
            },
            {
              key: 'expand', header: '',
              render: (r: any) => (
                <Button size="sm" variant="secondary" onClick={(e: any) => { e.stopPropagation(); setExpanded(expanded === r.id ? null : r.id); }}>
                  {expanded === r.id ? 'Hide' : 'Details'}
                </Button>
              ),
            },
          ]}
          emptyMessage="No attestations generated yet."
        />
        {pagination && <Pagination page={page} totalPages={pagination.totalPages} total={pagination.total} onPageChange={setPage} />}
      </Card>

      {/* Expanded breakdown */}
      {expanded && attestations.find((a: any) => a.id === expanded) && (() => {
        const att = attestations.find((a: any) => a.id === expanded);
        const breakdown = att.assetBreakdown as any[] || [];
        return (
          <Card>
            <div style={{ padding: '16px' }}>
              <h4 style={{ margin: '0 0 12px', fontSize: '14px', color: 'var(--color-navy-800)' }}>Asset Breakdown</h4>
              <Table
                data={breakdown}
                columns={[
                  { key: 'type', header: 'Asset Type', render: (r: any) => <strong>{(r.type || '').replace(/_/g, ' ')}</strong>, width: '180px' },
                  { key: 'count', header: 'Count', width: '80px' },
                  { key: 'faceValue', header: 'Face Value', render: (r: any) => <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>${Number(r.faceValue || 0).toLocaleString()}</span>, width: '150px' },
                  { key: 'marketValue', header: 'Market Value', render: (r: any) => <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>${Number(r.marketValue || 0).toLocaleString()}</span>, width: '150px' },
                ]}
                emptyMessage="No asset data."
              />
            </div>
          </Card>
        );
      })()}

      <Modal open={showGenerate} onClose={() => setShowGenerate(false)} title="Generate Reserve Attestation">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <Alert type="warning" message="This will compute reserve coverage and generate a cryptographic attestation hash." />
          <FormField label="Token" required>
            <select style={fieldInput} value={genForm.tokenId} onChange={e => setGenForm(p => ({ ...p, tokenId: e.target.value }))}>
              <option value="">Select token...</option>
              {tokens.map((t: any) => <option key={t.id} value={t.id}>{t.symbol} ({t.name})</option>)}
            </select>
          </FormField>
          <FormField label="Snapshot Date" required>
            <input type="date" style={fieldInput} value={genForm.snapshotDate} onChange={e => setGenForm(p => ({ ...p, snapshotDate: e.target.value }))} />
          </FormField>
          {error && <Alert type="error" message={error} />}
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setShowGenerate(false)}>Cancel</Button>
            <Button onClick={() => genMut.mutate()} loading={genMut.isPending} disabled={!genForm.tokenId || !genForm.snapshotDate}>Generate Attestation</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
