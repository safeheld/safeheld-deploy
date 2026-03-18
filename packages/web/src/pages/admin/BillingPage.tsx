import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { billingApi } from '../../api/client';

function formatGBP(n: number) { return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(n); }
function formatBalance(n: number) { return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(n); }
function statusBadge(status: string) {
  const colors: Record<string, string> = { TRIAL: '#3D3DFF', ACTIVE: '#22c55e', SUSPENDED: '#ef4444', CANCELLED: '#6b7280', PAID: '#22c55e', PENDING: '#f59e0b', FAILED: '#ef4444', DRAFT: '#6b7280', VOID: '#9ca3af' };
  return <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600, background: `${colors[status] || '#6b7280'}20`, color: colors[status] || '#6b7280' }}>{status}</span>;
}

const cardStyle: React.CSSProperties = { background: 'white', borderRadius: '8px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' };
const thStyle: React.CSSProperties = { padding: '10px 12px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#6b7280', borderBottom: '2px solid #e5e7eb' };
const tdStyle: React.CSSProperties = { padding: '10px 12px', fontSize: '13px', borderBottom: '1px solid #f3f4f6' };

export default function BillingPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'dashboard' | 'firms' | 'invoices'>('dashboard');
  const [editFirmId, setEditFirmId] = useState<string | null>(null);
  const [editData, setEditData] = useState({ baseMonthlyFee: 0, basisPointsRate: 0, billingStatus: '', trialEndsAt: '', notes: '' });

  const { data: dashboard } = useQuery({ queryKey: ['billing-dashboard'], queryFn: billingApi.getDashboard, enabled: activeTab === 'dashboard' });
  const { data: firmsResp } = useQuery({ queryKey: ['billing-firms'], queryFn: () => billingApi.getFirms(), enabled: activeTab === 'firms' });
  const { data: invoicesResp } = useQuery({ queryKey: ['billing-invoices'], queryFn: () => billingApi.getInvoices(), enabled: activeTab === 'invoices' });

  const updateMutation = useMutation({
    mutationFn: ({ firmId, data }: { firmId: string; data: object }) => billingApi.updateFirm(firmId, data),
    onSuccess: () => { setEditFirmId(null); queryClient.invalidateQueries({ queryKey: ['billing-firms'] }); queryClient.invalidateQueries({ queryKey: ['billing-dashboard'] }); },
  });

  const extendMutation = useMutation({
    mutationFn: ({ firmId, date }: { firmId: string; date: string }) => billingApi.extendTrial(firmId, date),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['billing-firms'] }); },
  });

  const invoiceMutation = useMutation({
    mutationFn: (firmId: string) => billingApi.triggerInvoice(firmId),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['billing-invoices'] }); queryClient.invalidateQueries({ queryKey: ['billing-firms'] }); },
  });

  const tabs = [
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'firms', label: 'Firms' },
    { key: 'invoices', label: 'Invoices' },
  ] as const;

  return (
    <div style={{ padding: '24px' }}>
      <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--color-primary)', marginBottom: '20px' }}>Billing</h1>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '24px', borderBottom: '2px solid #e5e7eb', paddingBottom: '0' }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)} style={{
            padding: '8px 16px', fontSize: '14px', fontWeight: activeTab === t.key ? 600 : 400,
            color: activeTab === t.key ? 'var(--color-accent)' : '#6b7280', background: 'none', border: 'none',
            borderBottom: activeTab === t.key ? '2px solid var(--color-accent)' : '2px solid transparent',
            cursor: 'pointer', marginBottom: '-2px',
          }}>{t.label}</button>
        ))}
      </div>

      {/* Dashboard */}
      {activeTab === 'dashboard' && dashboard && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
            {[
              { label: 'MRR', value: formatGBP(dashboard.mrr) },
              { label: 'ARR', value: formatGBP(dashboard.arr) },
              { label: 'Funds Under Verification', value: formatBalance(dashboard.totalFundsUnderVerification) },
              { label: 'Basis Points Revenue', value: formatGBP(dashboard.basisPointsRevenueThisMonth) },
            ].map(c => (
              <div key={c.label} style={cardStyle}>
                <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>{c.label}</div>
                <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--color-primary)' }}>{c.value}</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
            {[
              { label: 'Active Firms', value: dashboard.activeFirms, color: '#22c55e' },
              { label: 'Trial Firms', value: dashboard.trialFirms, color: '#3D3DFF' },
              { label: 'Suspended', value: dashboard.suspendedFirms, color: '#ef4444' },
            ].map(c => (
              <div key={c.label} style={cardStyle}>
                <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>{c.label}</div>
                <div style={{ fontSize: '28px', fontWeight: 700, color: c.color }}>{c.value}</div>
              </div>
            ))}
          </div>
          <div style={{ ...cardStyle, marginTop: '16px' }}>
            <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Avg Contract Value</div>
            <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--color-primary)' }}>{formatGBP(dashboard.avgContractValue)}/month</div>
          </div>
        </div>
      )}

      {/* Firms */}
      {activeTab === 'firms' && firmsResp && (
        <div style={cardStyle}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>Firm</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Base Fee</th>
                <th style={thStyle}>Last Balance</th>
                <th style={thStyle}>Last Invoice</th>
                <th style={thStyle}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {(firmsResp.data || []).map((f: any) => (
                <tr key={f.id}>
                  <td style={tdStyle}><strong>{f.name}</strong></td>
                  <td style={tdStyle}>{statusBadge(f.billingStatus)}</td>
                  <td style={tdStyle}>{formatGBP(Number(f.baseMonthlyFee))}</td>
                  <td style={tdStyle}>{f.billingInvoices?.[0] ? formatBalance(Number(f.billingInvoices[0].monthEndBalance)) : '—'}</td>
                  <td style={tdStyle}>{f.billingInvoices?.[0] ? <>{formatGBP(Number(f.billingInvoices[0].totalAmount))} {statusBadge(f.billingInvoices[0].status)}</> : '—'}</td>
                  <td style={tdStyle}>
                    <button onClick={() => { setEditFirmId(f.id); setEditData({ baseMonthlyFee: Number(f.baseMonthlyFee), basisPointsRate: Number(f.basisPointsRate), billingStatus: f.billingStatus, trialEndsAt: f.trialEndsAt?.split('T')[0] || '', notes: '' }); }} style={{ padding: '4px 8px', fontSize: '12px', border: '1px solid #d1d5db', borderRadius: '4px', background: 'white', cursor: 'pointer', marginRight: '4px' }}>Edit</button>
                    <button onClick={() => invoiceMutation.mutate(f.id)} style={{ padding: '4px 8px', fontSize: '12px', border: '1px solid #d1d5db', borderRadius: '4px', background: 'white', cursor: 'pointer' }}>Invoice</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit Modal */}
      {editFirmId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', borderRadius: '12px', padding: '24px', width: '440px', maxHeight: '90vh', overflow: 'auto' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: 600 }}>Edit Billing Settings</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <label style={{ fontSize: '13px', fontWeight: 500 }}>
                Base Monthly Fee (GBP)
                <input type="number" value={editData.baseMonthlyFee} onChange={e => setEditData({ ...editData, baseMonthlyFee: Number(e.target.value) })} style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px', marginTop: '4px' }} />
              </label>
              <label style={{ fontSize: '13px', fontWeight: 500 }}>
                Basis Points Rate
                <input type="number" step="0.0000001" value={editData.basisPointsRate} onChange={e => setEditData({ ...editData, basisPointsRate: Number(e.target.value) })} style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px', marginTop: '4px' }} />
              </label>
              <label style={{ fontSize: '13px', fontWeight: 500 }}>
                Billing Status
                <select value={editData.billingStatus} onChange={e => setEditData({ ...editData, billingStatus: e.target.value })} style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px', marginTop: '4px' }}>
                  <option value="TRIAL">TRIAL</option>
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="SUSPENDED">SUSPENDED</option>
                  <option value="CANCELLED">CANCELLED</option>
                </select>
              </label>
              <label style={{ fontSize: '13px', fontWeight: 500 }}>
                Trial Ends At
                <input type="date" value={editData.trialEndsAt} onChange={e => setEditData({ ...editData, trialEndsAt: e.target.value })} style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px', marginTop: '4px' }} />
              </label>
              <label style={{ fontSize: '13px', fontWeight: 500 }}>
                Notes
                <textarea value={editData.notes} onChange={e => setEditData({ ...editData, notes: e.target.value })} rows={3} style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px', marginTop: '4px', resize: 'vertical' }} />
              </label>
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '16px', justifyContent: 'flex-end' }}>
              <button onClick={() => setEditFirmId(null)} style={{ padding: '8px 16px', border: '1px solid #d1d5db', borderRadius: '6px', background: 'white', cursor: 'pointer' }}>Cancel</button>
              <button onClick={() => updateMutation.mutate({ firmId: editFirmId, data: editData })} style={{ padding: '8px 16px', border: 'none', borderRadius: '6px', background: 'var(--color-accent)', color: 'white', fontWeight: 600, cursor: 'pointer' }}>
                {updateMutation.isPending ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invoices */}
      {activeTab === 'invoices' && invoicesResp && (
        <div style={cardStyle}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>Firm</th>
                <th style={thStyle}>Period</th>
                <th style={thStyle}>Balance</th>
                <th style={thStyle}>Base Fee</th>
                <th style={thStyle}>Basis Points</th>
                <th style={thStyle}>Total</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Paid</th>
              </tr>
            </thead>
            <tbody>
              {(invoicesResp.data || []).map((inv: any) => (
                <tr key={inv.id}>
                  <td style={tdStyle}>{inv.firm?.name || '—'}</td>
                  <td style={tdStyle}>{new Date(inv.periodStart).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}</td>
                  <td style={tdStyle}>{formatBalance(Number(inv.monthEndBalance))}</td>
                  <td style={tdStyle}>{formatGBP(Number(inv.baseFee))}</td>
                  <td style={tdStyle}>{formatGBP(Number(inv.basisPointsAmount))}</td>
                  <td style={tdStyle}><strong>{formatGBP(Number(inv.totalAmount))}</strong></td>
                  <td style={tdStyle}>{statusBadge(inv.status)}</td>
                  <td style={tdStyle}>{inv.paidAt ? new Date(inv.paidAt).toLocaleDateString('en-GB') : '—'}</td>
                </tr>
              ))}
              {(!invoicesResp.data || invoicesResp.data.length === 0) && (
                <tr><td colSpan={8} style={{ ...tdStyle, textAlign: 'center', color: '#9ca3af' }}>No invoices yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
