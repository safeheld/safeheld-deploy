import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../hooks/useAuth';
import { cryptoApi } from '../../api/client';
import { Card, Table, Button, PageHeader, Pagination, Modal, Alert, StatCard, Grid, statusBadge } from '../../components/ui';
import { format } from 'date-fns';

type Tab = 'dashboard' | 'wallets' | 'balances' | 'entitlements' | 'por' | 'lineage';

export default function CryptoPage() {
  const { user } = useAuth();
  const firmId = user!.firmId;
  const queryClient = useQueryClient();
  const isCompliance = ['COMPLIANCE_OFFICER', 'ADMIN'].includes(user!.role);

  const [activeTab, setActiveTab] = useState<Tab>('dashboard');

  const tabs: { key: Tab; label: string }[] = [
    { key: 'dashboard', label: 'Overview' },
    { key: 'wallets', label: 'Wallets' },
    { key: 'balances', label: 'Balances' },
    { key: 'entitlements', label: 'Entitlements' },
    { key: 'por', label: 'Proof of Reserves' },
    { key: 'lineage', label: 'Data Lineage' },
  ];

  return (
    <div>
      <PageHeader title="Crypto Module" />
      <p style={{ margin: '-16px 0 20px', fontSize: '14px', color: 'var(--color-navy-500)' }}>Digital Asset Custody — Wallet Reconciliation & Proof of Reserves</p>

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

      {activeTab === 'dashboard' && <CryptoDashboard firmId={firmId} />}
      {activeTab === 'wallets' && <WalletsTab firmId={firmId} isCompliance={isCompliance} />}
      {activeTab === 'balances' && <BalancesTab firmId={firmId} isCompliance={isCompliance} />}
      {activeTab === 'entitlements' && <EntitlementsTab firmId={firmId} isCompliance={isCompliance} />}
      {activeTab === 'por' && <ProofOfReservesTab firmId={firmId} isCompliance={isCompliance} />}
      {activeTab === 'lineage' && <DataLineageTab firmId={firmId} />}
    </div>
  );
}

// ─── Shared Form Helpers ──────────────────────────────────────────────────────

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

// ─── Dashboard Tab ────────────────────────────────────────────────────────────

function CryptoDashboard({ firmId }: { firmId: string }) {
  const { data } = useQuery({
    queryKey: ['crypto-dashboard', firmId],
    queryFn: () => cryptoApi.getDashboard(firmId),
  });

  const ratioColor = (r: string | null) => {
    if (!r) return 'var(--color-navy-500)';
    const n = Number(r);
    return n >= 1 ? 'var(--color-success)' : n >= 0.95 ? 'var(--color-warning)' : 'var(--color-danger)';
  };

  return (
    <div>
      <Grid cols={4} gap={20}>
        <StatCard label="Total Wallets" value={data?.totalWallets ?? '\u2014'} color="var(--color-accent)" />
        <StatCard label="Active Wallets" value={data?.activeWallets ?? '\u2014'} color="var(--color-success)" />
        <StatCard
          label="Total Balance (USD)"
          value={data?.totalBalanceUsd ? `$${Number(data.totalBalanceUsd).toLocaleString()}` : '\u2014'}
          color="var(--color-navy-700)"
        />
        <StatCard label="Unique Tokens" value={data?.uniqueTokens ?? '\u2014'} color="var(--color-accent)" />
      </Grid>
      <div style={{ height: '20px' }} />
      <Grid cols={4} gap={20}>
        <StatCard label="Total Clients" value={data?.totalClients ?? '\u2014'} color="var(--color-navy-700)" />
        <StatCard
          label="Reserve Ratio"
          value={data?.latestReserveRatio ? `${(Number(data.latestReserveRatio) * 100).toFixed(1)}%` : '\u2014'}
          color={ratioColor(data?.latestReserveRatio)}
        />
        <StatCard
          label="Latest PoR"
          value={data?.latestPoRDate ? format(new Date(data.latestPoRDate), 'dd MMM yyyy') : '\u2014'}
          color="var(--color-navy-500)"
        />
        <StatCard label="Lineage Events" value={data?.lineageEvents ?? '\u2014'} color="var(--color-navy-500)" />
      </Grid>
    </div>
  );
}

// ─── Wallets Tab ──────────────────────────────────────────────────────────────

function WalletsTab({ firmId, isCompliance }: { firmId: string; isCompliance: boolean }) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [networkFilter, setNetworkFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [showUpdate, setShowUpdate] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const [form, setForm] = useState({ walletName: '', walletType: 'HOT', network: 'ETHEREUM', address: '', custodian: '', isMultisig: false, requiredSignatures: '', totalSignatories: '', notes: '' });
  const [updateForm, setUpdateForm] = useState({ status: 'ACTIVE', notes: '' });
  const [error, setError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['crypto-wallets', firmId, page, networkFilter, statusFilter],
    queryFn: () => cryptoApi.getWallets(firmId, {
      page: String(page),
      ...(networkFilter ? { network: networkFilter } : {}),
      ...(statusFilter ? { status: statusFilter } : {}),
    }),
  });

  const createMut = useMutation({
    mutationFn: () => cryptoApi.createWallet(firmId, {
      ...form,
      isMultisig: form.isMultisig,
      requiredSignatures: form.requiredSignatures ? Number(form.requiredSignatures) : undefined,
      totalSignatories: form.totalSignatories ? Number(form.totalSignatories) : undefined,
    }),
    onSuccess: () => { setShowCreate(false); queryClient.invalidateQueries({ queryKey: ['crypto-wallets', firmId] }); queryClient.invalidateQueries({ queryKey: ['crypto-dashboard', firmId] }); },
    onError: (err: any) => setError(err?.response?.data?.error?.message || 'Failed to create wallet.'),
  });

  const updateMut = useMutation({
    mutationFn: () => cryptoApi.updateWallet(firmId, selected!.id, updateForm),
    onSuccess: () => { setShowUpdate(false); queryClient.invalidateQueries({ queryKey: ['crypto-wallets', firmId] }); queryClient.invalidateQueries({ queryKey: ['crypto-dashboard', firmId] }); },
    onError: (err: any) => setError(err?.response?.data?.error?.message || 'Failed to update wallet.'),
  });

  const wallets = data?.data || [];
  const pagination = data?.pagination;
  const networks = ['', 'ETHEREUM', 'BITCOIN', 'POLYGON', 'ARBITRUM', 'OPTIMISM', 'SOLANA', 'AVALANCHE', 'BSC', 'OTHER'];
  const statuses = ['', 'ACTIVE', 'FROZEN', 'DECOMMISSIONED'];

  const walletTypeColor = (t: string) =>
    t === 'HOT' ? 'var(--color-danger)' : t === 'COLD' ? 'var(--color-accent)' : t === 'WARM' ? 'var(--color-warning)' : 'var(--color-navy-500)';

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <select value={networkFilter} onChange={e => { setNetworkFilter(e.target.value); setPage(1); }} style={{ ...fieldInput, width: 'auto' }}>
            <option value="">All Networks</option>
            {networks.filter(Boolean).map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }} style={{ ...fieldInput, width: 'auto' }}>
            <option value="">All Statuses</option>
            {statuses.filter(Boolean).map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        {isCompliance && <Button onClick={() => { setShowCreate(true); setError(''); }}>Add Wallet</Button>}
      </div>

      <Card>
        <Table
          loading={isLoading}
          data={wallets}
          columns={[
            { key: 'walletName', header: 'Name', width: '180px' },
            {
              key: 'walletType', header: 'Type', width: '100px',
              render: (r: any) => <span style={{ fontWeight: 600, fontSize: '12px', color: walletTypeColor(r.walletType) }}>{r.walletType}</span>,
            },
            { key: 'network', header: 'Network', width: '110px' },
            {
              key: 'address', header: 'Address', width: '200px',
              render: (r: any) => <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}>{r.address.slice(0, 10)}...{r.address.slice(-6)}</span>,
            },
            { key: 'status', header: 'Status', render: (r: any) => statusBadge(r.status), width: '120px' },
            { key: 'custodian', header: 'Custodian', render: (r: any) => r.custodian || '\u2014', width: '120px' },
            {
              key: 'multisig', header: 'Multisig', width: '90px',
              render: (r: any) => r.isMultisig
                ? <span style={{ fontSize: '12px', color: 'var(--color-accent)', fontWeight: 600 }}>{r.requiredSignatures}/{r.totalSignatories}</span>
                : <span style={{ fontSize: '12px', color: 'var(--color-navy-400)' }}>No</span>,
            },
            { key: 'createdAt', header: 'Created', render: (r: any) => format(new Date(r.createdAt), 'dd MMM yyyy'), width: '110px' },
            ...(isCompliance ? [{
              key: 'actions', header: '',
              render: (r: any) => r.status !== 'DECOMMISSIONED' ? (
                <Button size="sm" variant="secondary" onClick={(e: any) => {
                  e.stopPropagation();
                  setSelected(r);
                  setUpdateForm({ status: r.status, notes: r.notes || '' });
                  setShowUpdate(true);
                  setError('');
                }}>Edit</Button>
              ) : null,
            }] : []),
          ]}
          emptyMessage="No wallets found."
        />
        {pagination && <Pagination page={page} totalPages={pagination.totalPages} total={pagination.total} onPageChange={setPage} />}
      </Card>

      {/* Create Modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Add Wallet">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <FormField label="Wallet Name" required>
            <input style={fieldInput} value={form.walletName} onChange={e => setForm(p => ({ ...p, walletName: e.target.value }))} placeholder="e.g. Main Hot Wallet" />
          </FormField>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <FormField label="Type" required>
              <select style={fieldInput} value={form.walletType} onChange={e => setForm(p => ({ ...p, walletType: e.target.value }))}>
                {['HOT', 'COLD', 'WARM', 'CUSTODIAL', 'OMNIBUS'].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </FormField>
            <FormField label="Network" required>
              <select style={fieldInput} value={form.network} onChange={e => setForm(p => ({ ...p, network: e.target.value }))}>
                {networks.filter(Boolean).map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </FormField>
          </div>
          <FormField label="Address" required>
            <input style={{ ...fieldInput, fontFamily: 'var(--font-mono)', fontSize: '12px' }} value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} placeholder="0x..." />
          </FormField>
          <FormField label="Custodian">
            <input style={fieldInput} value={form.custodian} onChange={e => setForm(p => ({ ...p, custodian: e.target.value }))} placeholder="e.g. Fireblocks, BitGo" />
          </FormField>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input type="checkbox" checked={form.isMultisig} onChange={e => setForm(p => ({ ...p, isMultisig: e.target.checked }))} />
            <label style={{ fontSize: '13px', color: 'var(--color-navy-700)' }}>Multisig wallet</label>
          </div>
          {form.isMultisig && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <FormField label="Required Signatures">
                <input type="number" style={fieldInput} value={form.requiredSignatures} onChange={e => setForm(p => ({ ...p, requiredSignatures: e.target.value }))} />
              </FormField>
              <FormField label="Total Signatories">
                <input type="number" style={fieldInput} value={form.totalSignatories} onChange={e => setForm(p => ({ ...p, totalSignatories: e.target.value }))} />
              </FormField>
            </div>
          )}
          <FormField label="Notes">
            <textarea style={{ ...fieldInput, resize: 'vertical' as const }} rows={3} value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
          </FormField>
          {error && <Alert type="error" message={error} />}
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={() => createMut.mutate()} loading={createMut.isPending} disabled={!form.walletName || !form.address}>Create Wallet</Button>
          </div>
        </div>
      </Modal>

      {/* Update Modal */}
      <Modal open={showUpdate} onClose={() => setShowUpdate(false)} title="Update Wallet">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {selected && (
            <div style={{ padding: '12px 14px', background: 'var(--color-navy-50)', borderRadius: 'var(--radius-md)', fontSize: '13px', border: '1px solid var(--color-navy-200)' }}>
              <strong>{selected.walletName}</strong> <span style={{ color: 'var(--color-navy-400)' }}>{'\u2014'} {selected.network}</span>
            </div>
          )}
          <FormField label="Status">
            <select style={fieldInput} value={updateForm.status} onChange={e => setUpdateForm(p => ({ ...p, status: e.target.value }))}>
              {['ACTIVE', 'FROZEN', 'DECOMMISSIONED'].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </FormField>
          <FormField label="Notes">
            <textarea style={{ ...fieldInput, resize: 'vertical' as const }} rows={3} value={updateForm.notes} onChange={e => setUpdateForm(p => ({ ...p, notes: e.target.value }))} />
          </FormField>
          {error && <Alert type="error" message={error} />}
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setShowUpdate(false)}>Cancel</Button>
            <Button onClick={() => updateMut.mutate()} loading={updateMut.isPending}>Update Wallet</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ─── Balances Tab ─────────────────────────────────────────────────────────────

function BalancesTab({ firmId, isCompliance }: { firmId: string; isCompliance: boolean }) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [tokenFilter, setTokenFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ walletId: '', tokenSymbol: '', tokenName: '', contractAddress: '', balance: '', balanceUsd: '', snapshotDate: '', blockNumber: '' });
  const [error, setError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['crypto-balances', firmId, page, tokenFilter],
    queryFn: () => cryptoApi.getBalances(firmId, {
      page: String(page),
      ...(tokenFilter ? { token_symbol: tokenFilter } : {}),
    }),
  });

  const { data: walletsData } = useQuery({
    queryKey: ['crypto-wallets-all', firmId],
    queryFn: () => cryptoApi.getWallets(firmId, { page: '1', pageSize: '200' }),
  });

  const createMut = useMutation({
    mutationFn: () => cryptoApi.createBalance(firmId, {
      ...form,
      balanceUsd: form.balanceUsd ? Number(form.balanceUsd) : undefined,
    }),
    onSuccess: () => { setShowCreate(false); queryClient.invalidateQueries({ queryKey: ['crypto-balances', firmId] }); queryClient.invalidateQueries({ queryKey: ['crypto-dashboard', firmId] }); },
    onError: (err: any) => setError(err?.response?.data?.error?.message || 'Failed to create balance.'),
  });

  const balances = data?.data || [];
  const pagination = data?.pagination;
  const wallets = walletsData?.data || [];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <input style={{ ...fieldInput, width: '200px' }} placeholder="Filter by token..." value={tokenFilter} onChange={e => { setTokenFilter(e.target.value); setPage(1); }} />
        {isCompliance && <Button onClick={() => { setShowCreate(true); setError(''); }}>Record Balance</Button>}
      </div>

      <Card>
        <Table
          loading={isLoading}
          data={balances}
          columns={[
            { key: 'wallet', header: 'Wallet', render: (r: any) => r.wallet?.walletName || '\u2014', width: '160px' },
            { key: 'network', header: 'Network', render: (r: any) => r.wallet?.network || '\u2014', width: '100px' },
            { key: 'tokenSymbol', header: 'Token', render: (r: any) => <span style={{ fontWeight: 600 }}>{r.tokenSymbol}</span>, width: '80px' },
            {
              key: 'balance', header: 'Balance', width: '160px',
              render: (r: any) => <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>{Number(r.balance).toLocaleString(undefined, { maximumFractionDigits: 8 })}</span>,
            },
            {
              key: 'balanceUsd', header: 'USD Value', width: '130px',
              render: (r: any) => r.balanceUsd ? <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>${Number(r.balanceUsd).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span> : '\u2014',
            },
            { key: 'snapshotDate', header: 'Snapshot', render: (r: any) => format(new Date(r.snapshotDate), 'dd MMM yyyy'), width: '120px' },
            { key: 'blockNumber', header: 'Block #', render: (r: any) => r.blockNumber ? <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}>{r.blockNumber}</span> : '\u2014', width: '110px' },
          ]}
          emptyMessage="No balances recorded."
        />
        {pagination && <Pagination page={page} totalPages={pagination.totalPages} total={pagination.total} onPageChange={setPage} />}
      </Card>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Record Wallet Balance">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <FormField label="Wallet" required>
            <select style={fieldInput} value={form.walletId} onChange={e => setForm(p => ({ ...p, walletId: e.target.value }))}>
              <option value="">Select wallet...</option>
              {wallets.map((w: any) => <option key={w.id} value={w.id}>{w.walletName} ({w.network})</option>)}
            </select>
          </FormField>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <FormField label="Token Symbol" required>
              <input style={fieldInput} value={form.tokenSymbol} onChange={e => setForm(p => ({ ...p, tokenSymbol: e.target.value }))} placeholder="e.g. ETH, BTC" />
            </FormField>
            <FormField label="Token Name">
              <input style={fieldInput} value={form.tokenName} onChange={e => setForm(p => ({ ...p, tokenName: e.target.value }))} placeholder="e.g. Ethereum" />
            </FormField>
          </div>
          <FormField label="Contract Address">
            <input style={{ ...fieldInput, fontFamily: 'var(--font-mono)', fontSize: '12px' }} value={form.contractAddress} onChange={e => setForm(p => ({ ...p, contractAddress: e.target.value }))} placeholder="Leave blank for native tokens" />
          </FormField>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <FormField label="Balance" required>
              <input style={fieldInput} value={form.balance} onChange={e => setForm(p => ({ ...p, balance: e.target.value }))} placeholder="e.g. 100.5" />
            </FormField>
            <FormField label="USD Value">
              <input type="number" style={fieldInput} value={form.balanceUsd} onChange={e => setForm(p => ({ ...p, balanceUsd: e.target.value }))} placeholder="e.g. 250000" />
            </FormField>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <FormField label="Snapshot Date" required>
              <input type="date" style={fieldInput} value={form.snapshotDate} onChange={e => setForm(p => ({ ...p, snapshotDate: e.target.value }))} />
            </FormField>
            <FormField label="Block Number">
              <input style={fieldInput} value={form.blockNumber} onChange={e => setForm(p => ({ ...p, blockNumber: e.target.value }))} placeholder="Optional" />
            </FormField>
          </div>
          {error && <Alert type="error" message={error} />}
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={() => createMut.mutate()} loading={createMut.isPending} disabled={!form.walletId || !form.tokenSymbol || !form.balance || !form.snapshotDate}>Record Balance</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ─── Entitlements Tab ─────────────────────────────────────────────────────────

function EntitlementsTab({ firmId, isCompliance }: { firmId: string; isCompliance: boolean }) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [clientFilter, setClientFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ clientId: '', clientName: '', tokenSymbol: '', entitledBalance: '', entitledValueUsd: '', recordDate: '' });
  const [error, setError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['crypto-entitlements', firmId, page, clientFilter],
    queryFn: () => cryptoApi.getEntitlements(firmId, {
      page: String(page),
      ...(clientFilter ? { client_id: clientFilter } : {}),
    }),
  });

  const createMut = useMutation({
    mutationFn: () => cryptoApi.createEntitlement(firmId, {
      ...form,
      entitledValueUsd: form.entitledValueUsd ? Number(form.entitledValueUsd) : undefined,
    }),
    onSuccess: () => { setShowCreate(false); queryClient.invalidateQueries({ queryKey: ['crypto-entitlements', firmId] }); queryClient.invalidateQueries({ queryKey: ['crypto-dashboard', firmId] }); },
    onError: (err: any) => setError(err?.response?.data?.error?.message || 'Failed to create entitlement.'),
  });

  const entitlements = data?.data || [];
  const pagination = data?.pagination;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <input style={{ ...fieldInput, width: '200px' }} placeholder="Filter by client ID..." value={clientFilter} onChange={e => { setClientFilter(e.target.value); setPage(1); }} />
        {isCompliance && <Button onClick={() => { setShowCreate(true); setError(''); }}>Add Entitlement</Button>}
      </div>

      <Card>
        <Table
          loading={isLoading}
          data={entitlements}
          columns={[
            { key: 'clientId', header: 'Client ID', width: '130px', render: (r: any) => <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>{r.clientId}</span> },
            { key: 'clientName', header: 'Client Name', render: (r: any) => r.clientName || '\u2014', width: '160px' },
            { key: 'tokenSymbol', header: 'Token', render: (r: any) => <span style={{ fontWeight: 600 }}>{r.tokenSymbol}</span>, width: '80px' },
            {
              key: 'entitledBalance', header: 'Entitled Balance', width: '160px',
              render: (r: any) => <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>{Number(r.entitledBalance).toLocaleString(undefined, { maximumFractionDigits: 8 })}</span>,
            },
            {
              key: 'entitledValueUsd', header: 'USD Value', width: '130px',
              render: (r: any) => r.entitledValueUsd ? <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>${Number(r.entitledValueUsd).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span> : '\u2014',
            },
            { key: 'recordDate', header: 'Record Date', render: (r: any) => format(new Date(r.recordDate), 'dd MMM yyyy'), width: '120px' },
          ]}
          emptyMessage="No client entitlements recorded."
        />
        {pagination && <Pagination page={page} totalPages={pagination.totalPages} total={pagination.total} onPageChange={setPage} />}
      </Card>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Add Client Entitlement">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <FormField label="Client ID" required>
              <input style={fieldInput} value={form.clientId} onChange={e => setForm(p => ({ ...p, clientId: e.target.value }))} />
            </FormField>
            <FormField label="Client Name">
              <input style={fieldInput} value={form.clientName} onChange={e => setForm(p => ({ ...p, clientName: e.target.value }))} />
            </FormField>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <FormField label="Token Symbol" required>
              <input style={fieldInput} value={form.tokenSymbol} onChange={e => setForm(p => ({ ...p, tokenSymbol: e.target.value }))} placeholder="e.g. ETH" />
            </FormField>
            <FormField label="Entitled Balance" required>
              <input style={fieldInput} value={form.entitledBalance} onChange={e => setForm(p => ({ ...p, entitledBalance: e.target.value }))} />
            </FormField>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <FormField label="USD Value">
              <input type="number" style={fieldInput} value={form.entitledValueUsd} onChange={e => setForm(p => ({ ...p, entitledValueUsd: e.target.value }))} />
            </FormField>
            <FormField label="Record Date" required>
              <input type="date" style={fieldInput} value={form.recordDate} onChange={e => setForm(p => ({ ...p, recordDate: e.target.value }))} />
            </FormField>
          </div>
          {error && <Alert type="error" message={error} />}
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={() => createMut.mutate()} loading={createMut.isPending} disabled={!form.clientId || !form.tokenSymbol || !form.entitledBalance || !form.recordDate}>Add Entitlement</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ─── Proof of Reserves Tab ────────────────────────────────────────────────────

function ProofOfReservesTab({ firmId, isCompliance }: { firmId: string; isCompliance: boolean }) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [showGenerate, setShowGenerate] = useState(false);
  const [snapshotDate, setSnapshotDate] = useState('');
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['crypto-por', firmId, page],
    queryFn: () => cryptoApi.getProofOfReserves(firmId, { page: String(page) }),
  });

  const genMut = useMutation({
    mutationFn: () => cryptoApi.generateProofOfReserves(firmId, snapshotDate),
    onSuccess: () => { setShowGenerate(false); queryClient.invalidateQueries({ queryKey: ['crypto-por', firmId] }); queryClient.invalidateQueries({ queryKey: ['crypto-dashboard', firmId] }); },
    onError: (err: any) => setError(err?.response?.data?.error?.message || 'Failed to generate proof.'),
  });

  const proofs = data?.data || [];
  const pagination = data?.pagination;

  const ratioColor = (r: number) => r >= 1 ? 'var(--color-success)' : r >= 0.95 ? 'var(--color-warning)' : 'var(--color-danger)';

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <p style={{ margin: 0, fontSize: '13px', color: 'var(--color-navy-500)' }}>Cryptographic attestation comparing on-chain reserves to client entitlements.</p>
        {isCompliance && <Button onClick={() => { setShowGenerate(true); setError(''); setSnapshotDate(''); }}>Generate PoR</Button>}
      </div>

      <Card>
        <Table
          loading={isLoading}
          data={proofs}
          columns={[
            { key: 'snapshotDate', header: 'Snapshot', render: (r: any) => format(new Date(r.snapshotDate), 'dd MMM yyyy'), width: '120px' },
            { key: 'status', header: 'Status', render: (r: any) => statusBadge(r.status), width: '110px' },
            {
              key: 'reserveRatio', header: 'Reserve Ratio', width: '130px',
              render: (r: any) => <span style={{ fontWeight: 700, fontSize: '14px', color: ratioColor(Number(r.reserveRatio)) }}>{(Number(r.reserveRatio) * 100).toFixed(1)}%</span>,
            },
            {
              key: 'totalReservesUsd', header: 'Reserves (USD)', width: '150px',
              render: (r: any) => <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>${Number(r.totalReservesUsd).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>,
            },
            {
              key: 'totalEntitlementsUsd', header: 'Entitlements (USD)', width: '150px',
              render: (r: any) => <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>${Number(r.totalEntitlementsUsd).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>,
            },
            {
              key: 'attestationHash', header: 'Attestation Hash', width: '180px',
              render: (r: any) => r.attestationHash ? <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--color-navy-500)' }}>{r.attestationHash.slice(0, 16)}...{r.attestationHash.slice(-8)}</span> : '\u2014',
            },
            { key: 'verifiedAt', header: 'Verified', render: (r: any) => r.verifiedAt ? format(new Date(r.verifiedAt), 'dd MMM yyyy HH:mm') : '\u2014', width: '150px' },
            {
              key: 'expand', header: '',
              render: (r: any) => (
                <Button size="sm" variant="secondary" onClick={(e: any) => { e.stopPropagation(); setExpanded(expanded === r.id ? null : r.id); }}>
                  {expanded === r.id ? 'Hide' : 'Details'}
                </Button>
              ),
            },
          ]}
          emptyMessage="No proof of reserves generated yet."
        />
        {pagination && <Pagination page={page} totalPages={pagination.totalPages} total={pagination.total} onPageChange={setPage} />}
      </Card>

      {/* Expanded detail for a proof */}
      {expanded && proofs.find((p: any) => p.id === expanded) && (() => {
        const proof = proofs.find((p: any) => p.id === expanded);
        const tokenBreakdown = proof.tokenBreakdown as any[] || [];
        return (
          <Card>
            <div style={{ padding: '16px' }}>
              <h4 style={{ margin: '0 0 12px', fontSize: '14px', color: 'var(--color-navy-800)' }}>Token Breakdown</h4>
              <Table
                data={tokenBreakdown}
                columns={[
                  { key: 'symbol', header: 'Token', render: (r: any) => <strong>{r.symbol}</strong>, width: '80px' },
                  { key: 'reserves_bal', header: 'Reserve Balance', render: (r: any) => <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>{Number(r.reserves?.balance || 0).toLocaleString()}</span>, width: '150px' },
                  { key: 'reserves_usd', header: 'Reserve USD', render: (r: any) => <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>${Number(r.reserves?.usd || 0).toLocaleString()}</span>, width: '130px' },
                  { key: 'ent_bal', header: 'Entitlement Balance', render: (r: any) => <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>{Number(r.entitlements?.balance || 0).toLocaleString()}</span>, width: '150px' },
                  { key: 'ent_usd', header: 'Entitlement USD', render: (r: any) => <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>${Number(r.entitlements?.usd || 0).toLocaleString()}</span>, width: '130px' },
                  {
                    key: 'ratio', header: 'Ratio', width: '90px',
                    render: (r: any) => r.ratio != null ? <span style={{ fontWeight: 700, color: ratioColor(r.ratio) }}>{(r.ratio * 100).toFixed(1)}%</span> : '\u2014',
                  },
                ]}
                emptyMessage="No token data."
              />
            </div>
          </Card>
        );
      })()}

      <Modal open={showGenerate} onClose={() => setShowGenerate(false)} title="Generate Proof of Reserves">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <Alert type="warning" message="This will compute reserves vs entitlements for the selected date and generate a cryptographic attestation hash." />
          <FormField label="Snapshot Date" required>
            <input type="date" style={fieldInput} value={snapshotDate} onChange={e => setSnapshotDate(e.target.value)} />
          </FormField>
          {error && <Alert type="error" message={error} />}
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setShowGenerate(false)}>Cancel</Button>
            <Button onClick={() => genMut.mutate()} loading={genMut.isPending} disabled={!snapshotDate}>Generate Proof</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ─── Data Lineage Tab ─────────────────────────────────────────────────────────

function DataLineageTab({ firmId }: { firmId: string }) {
  const [page, setPage] = useState(1);
  const [eventTypeFilter, setEventTypeFilter] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['crypto-lineage', firmId, page, eventTypeFilter],
    queryFn: () => cryptoApi.getDataLineage(firmId, {
      page: String(page),
      ...(eventTypeFilter ? { event_type: eventTypeFilter } : {}),
    }),
  });

  const events = data?.data || [];
  const pagination = data?.pagination;
  const eventTypes = ['', 'IMPORT', 'TRANSFORM', 'VALIDATION', 'ATTESTATION', 'EXPORT', 'RECONCILIATION'];

  const eventColor = (t: string) =>
    t === 'ATTESTATION' ? 'var(--color-accent)' : t === 'VALIDATION' ? 'var(--color-success)' : t === 'RECONCILIATION' ? 'var(--color-warning)' : 'var(--color-navy-600)';

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <select value={eventTypeFilter} onChange={e => { setEventTypeFilter(e.target.value); setPage(1); }} style={{ ...fieldInput, width: 'auto' }}>
          <option value="">All Event Types</option>
          {eventTypes.filter(Boolean).map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      <Card>
        <Table
          loading={isLoading}
          data={events}
          columns={[
            {
              key: 'eventType', header: 'Event Type', width: '140px',
              render: (r: any) => <span style={{ fontWeight: 600, fontSize: '12px', color: eventColor(r.eventType) }}>{r.eventType}</span>,
            },
            { key: 'sourceSystem', header: 'Source', render: (r: any) => r.sourceSystem || '\u2014', width: '160px' },
            { key: 'entityType', header: 'Entity Type', render: (r: any) => r.entityType?.replace(/_/g, ' ') || '\u2014', width: '140px' },
            { key: 'entityId', header: 'Entity ID', render: (r: any) => r.entityId ? <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}>{r.entityId.slice(0, 8)}...</span> : '\u2014', width: '100px' },
            { key: 'recordCount', header: 'Records', render: (r: any) => r.recordCount ?? '\u2014', width: '80px' },
            {
              key: 'dataHash', header: 'Data Hash', width: '160px',
              render: (r: any) => r.dataHash ? <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--color-navy-500)' }}>{r.dataHash.slice(0, 12)}...{r.dataHash.slice(-6)}</span> : '\u2014',
            },
            { key: 'createdAt', header: 'Timestamp', render: (r: any) => format(new Date(r.createdAt), 'dd MMM yyyy HH:mm'), width: '150px' },
          ]}
          emptyMessage="No data lineage events."
        />
        {pagination && <Pagination page={page} totalPages={pagination.totalPages} total={pagination.total} onPageChange={setPage} />}
      </Card>
    </div>
  );
}
