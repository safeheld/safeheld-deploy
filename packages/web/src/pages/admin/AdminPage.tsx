import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '../../api/client';
import { Card, Table, Button, PageHeader, Pagination, statusBadge, Modal, Alert, Input, Select } from '../../components/ui';
import { format } from 'date-fns';

const REGIME_OPTIONS = [
  { value: '', label: '— Select Regime —' },
  { value: 'PS25_PI', label: 'PS25 Payment Institution' },
  { value: 'PS25_EMI', label: 'PS25 E-Money Institution' },
  { value: 'PS25_SMALL_EMI', label: 'PS25 Small EMI' },
  { value: 'CASS7', label: 'CASS 7' },
  { value: 'CASS15', label: 'CASS 15' },
  { value: 'MICA_CUSTODY', label: 'MiCA Custody' },
];

const METHOD_OPTIONS = [
  { value: '', label: '— Select Method —' },
  { value: 'SEGREGATION', label: 'Segregation' },
  { value: 'INSURANCE', label: 'Insurance' },
  { value: 'GUARANTEE', label: 'Guarantee' },
  { value: 'MIXED', label: 'Mixed' },
];

const ROLE_OPTIONS = [
  { value: '', label: '— Select Role —' },
  { value: 'COMPLIANCE_OFFICER', label: 'Compliance Officer' },
  { value: 'FINANCE_OPS', label: 'Finance Ops' },
  { value: 'AUDITOR', label: 'Auditor' },
  { value: 'BANK_VIEWER', label: 'Bank Viewer' },
  { value: 'ADMIN', label: 'Admin' },
];

export default function AdminPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [activeTab, setActiveTab] = useState<'firms' | 'users'>('firms');
  const [showFirmModal, setShowFirmModal] = useState(false);
  const [showUserModal, setShowUserModal] = useState(false);
  const [selectedFirmId, setSelectedFirmId] = useState('');
  const [error, setError] = useState('');
  const [firmForm, setFirmForm] = useState({
    name: '', fcaFrn: '', regime: '', safeguardingMethod: '', baseCurrency: 'GBP',
    materialDiscrepancyPct: '', materialDiscrepancyAbs: '',
  });
  const [userForm, setUserForm] = useState({
    email: '', password: '', name: '', role: '', accessExpiresAt: '',
  });

  const { data: firmsResp, isLoading } = useQuery({
    queryKey: ['admin-firms', page],
    queryFn: () => adminApi.getFirms({ page: String(page) }),
    enabled: activeTab === 'firms',
  });

  const createFirmMutation = useMutation({
    mutationFn: () => adminApi.createFirm({
      name: firmForm.name,
      fcaFrn: firmForm.fcaFrn || undefined,
      regime: firmForm.regime,
      safeguardingMethod: firmForm.safeguardingMethod,
      baseCurrency: firmForm.baseCurrency,
      materialDiscrepancyPct: firmForm.materialDiscrepancyPct ? parseFloat(firmForm.materialDiscrepancyPct) : undefined,
      materialDiscrepancyAbs: firmForm.materialDiscrepancyAbs ? parseFloat(firmForm.materialDiscrepancyAbs) : undefined,
    }),
    onSuccess: () => {
      setShowFirmModal(false);
      queryClient.invalidateQueries({ queryKey: ['admin-firms'] });
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      setError(msg || 'Failed to create firm.');
    },
  });

  const createUserMutation = useMutation({
    mutationFn: () => adminApi.createUser(selectedFirmId, {
      email: userForm.email,
      password: userForm.password,
      name: userForm.name,
      role: userForm.role,
      accessExpiresAt: userForm.accessExpiresAt ? new Date(userForm.accessExpiresAt).toISOString() : undefined,
    }),
    onSuccess: () => {
      setShowUserModal(false);
      setUserForm({ email: '', password: '', name: '', role: '', accessExpiresAt: '' });
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      setError(msg || 'Failed to create user.');
    },
  });

  const firms = firmsResp?.data || [];
  const pagination = firmsResp?.pagination;

  return (
    <div>
      <PageHeader
        title="Administration"
        actions={
          <div style={{ display: 'flex', gap: '8px' }}>
            {activeTab === 'firms' && (
              <Button onClick={() => { setShowFirmModal(true); setError(''); }}>Add Firm</Button>
            )}
            {activeTab === 'users' && (
              <Button onClick={() => { setShowUserModal(true); setError(''); }}>Add User</Button>
            )}
          </div>
        }
      />

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0', borderBottom: '2px solid var(--color-gray-200)', marginBottom: '20px' }}>
        {[{ id: 'firms', label: 'Firms' }, { id: 'users', label: 'Create User' }].map(tab => (
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

      {activeTab === 'firms' && (
        <Card>
          <Table
            loading={isLoading}
            data={firms}
            columns={[
              { key: 'name', header: 'Firm Name' },
              { key: 'fcaFrn', header: 'FCA FRN', render: r => r.fcaFrn || '—', width: '120px' },
              { key: 'regime', header: 'Regime', width: '140px' },
              { key: 'safeguardingMethod', header: 'Method', width: '140px' },
              { key: 'status', header: 'Status', render: r => statusBadge(r.status), width: '100px' },
              { key: 'baseCurrency', header: 'CCY', width: '60px' },
              { key: 'createdAt', header: 'Created', render: r => format(new Date(r.createdAt), 'dd MMM yyyy'), width: '110px' },
              {
                key: 'users', header: 'Users', width: '80px',
                render: r => r._count?.users ?? '—',
              },
            ]}
          />
          {pagination && (
            <Pagination page={page} totalPages={pagination.totalPages} total={pagination.total} onPageChange={setPage} />
          )}
        </Card>
      )}

      {activeTab === 'users' && (
        <Card title="Create User Under Firm">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', maxWidth: '480px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px' }}>Firm</label>
              <select
                value={selectedFirmId}
                onChange={e => setSelectedFirmId(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--color-gray-300)', borderRadius: '6px', fontSize: '13px' }}
              >
                <option value="">— Select Firm —</option>
                {firms.map((f: { id: string; name: string }) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </div>
            <Input label="Full Name" value={userForm.name} onChange={e => setUserForm(p => ({ ...p, name: e.target.value }))} />
            <Input label="Email" type="email" value={userForm.email} onChange={e => setUserForm(p => ({ ...p, email: e.target.value }))} />
            <Input label="Password (min 12 chars)" type="password" value={userForm.password} onChange={e => setUserForm(p => ({ ...p, password: e.target.value }))} />
            <Select label="Role" options={ROLE_OPTIONS} value={userForm.role} onChange={e => setUserForm(p => ({ ...p, role: e.target.value }))} />
            {['AUDITOR', 'BANK_VIEWER'].includes(userForm.role) && (
              <Input label="Access Expires At" type="datetime-local" value={userForm.accessExpiresAt} onChange={e => setUserForm(p => ({ ...p, accessExpiresAt: e.target.value }))} />
            )}
            {error && <Alert type="error" message={error} />}
            {createUserMutation.isSuccess && <Alert type="success" message="User created successfully." />}
            <Button
              onClick={() => { setError(''); createUserMutation.mutate(); }}
              loading={createUserMutation.isPending}
              disabled={!selectedFirmId || !userForm.email || !userForm.password || !userForm.name || !userForm.role}
            >
              Create User
            </Button>
          </div>
        </Card>
      )}

      {/* Create Firm Modal */}
      <Modal open={showFirmModal} onClose={() => setShowFirmModal(false)} title="Add New Firm" width={540}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <Input label="Firm Name *" value={firmForm.name} onChange={e => setFirmForm(p => ({ ...p, name: e.target.value }))} />
          <Input label="FCA FRN (optional)" value={firmForm.fcaFrn} onChange={e => setFirmForm(p => ({ ...p, fcaFrn: e.target.value }))} />
          <Select label="Regime *" options={REGIME_OPTIONS} value={firmForm.regime} onChange={e => setFirmForm(p => ({ ...p, regime: e.target.value }))} />
          <Select label="Safeguarding Method *" options={METHOD_OPTIONS} value={firmForm.safeguardingMethod} onChange={e => setFirmForm(p => ({ ...p, safeguardingMethod: e.target.value }))} />
          <Input label="Base Currency" value={firmForm.baseCurrency} maxLength={3} onChange={e => setFirmForm(p => ({ ...p, baseCurrency: e.target.value.toUpperCase() }))} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <Input label="Material Discrepancy (%)" type="number" step="0.01" value={firmForm.materialDiscrepancyPct} onChange={e => setFirmForm(p => ({ ...p, materialDiscrepancyPct: e.target.value }))} />
            <Input label="Material Discrepancy (abs)" type="number" step="0.01" value={firmForm.materialDiscrepancyAbs} onChange={e => setFirmForm(p => ({ ...p, materialDiscrepancyAbs: e.target.value }))} />
          </div>
          {error && <Alert type="error" message={error} />}
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setShowFirmModal(false)}>Cancel</Button>
            <Button
              onClick={() => createFirmMutation.mutate()}
              loading={createFirmMutation.isPending}
              disabled={!firmForm.name || !firmForm.regime || !firmForm.safeguardingMethod}
            >
              Create Firm
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
