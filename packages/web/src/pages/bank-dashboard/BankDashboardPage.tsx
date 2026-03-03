import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { bankDashboardApi } from '../../api/client';
import { Button, Tabs, statusBadge } from '../../components/ui';

// ─── Types ────────────────────────────────────────────────────────────────────

type RAGStatus = 'GREEN' | 'AMBER' | 'RED';
type SortKey = 'firmName' | 'regime' | 'ragStatus' | 'lastReconDate' | 'openBreaches' | 'daysSinceLastUpload';
type SortDir = 'asc' | 'desc';

interface BreachCount { LOW: number; MEDIUM: number; HIGH: number; CRITICAL: number }
interface LetterSummary { CONFIRMED: number; PENDING: number; MISSING: number; EXPIRED: number }

interface FirmRow {
  firmId: string; firmName: string; regime: string; ragStatus: RAGStatus;
  lastReconDate: string | null; lastReconResult: string | null;
  openBreachCount: BreachCount; letterStatusSummary: LetterSummary;
  daysSinceLastUpload: number | null;
}

interface Portfolio {
  totalFirms: number; totalFundsUnderOversight: number;
  green: number; amber: number; red: number;
}

interface FirmSummary {
  firmId: string;
  reconciliationHistory: Array<{
    id: string; reconciliationDate: string; reconciliationType: string;
    currency: string; status: string; variance: number; dataCompleteness: string;
  }>;
  activeBreaches: Array<{
    id: string; breachType: string; severity: string; status: string;
    isNotifiable: boolean; description: string; createdAt: string;
  }>;
  accounts: Array<{
    id: string; bankName: string; accountNumberMasked: string; currency: string; letterStatus: string;
    currentLetter: { status: string; effectiveDate: string; expiryDate: string | null; annualReviewDue: string } | null;
    dueDiligence: { reviewStatus: string; nextReviewDue: string; ddOutcome: string } | null;
  }>;
}

// ─── Style helpers ────────────────────────────────────────────────────────────

const RAG_COLOR: Record<RAGStatus, string> = { GREEN: 'var(--color-success)', AMBER: 'var(--color-warning)', RED: 'var(--color-danger)' };
const RAG_BG: Record<RAGStatus, string> = { GREEN: 'var(--color-success-light)', AMBER: 'var(--color-warning-light)', RED: 'var(--color-danger-light)' };
const RAG_BORDER: Record<RAGStatus, string> = { GREEN: '#a7f3d0', AMBER: '#fde68a', RED: '#fecaca' };
const SEVERITY_COLOR: Record<string, string> = { CRITICAL: 'var(--color-danger)', HIGH: '#ea580c', MEDIUM: 'var(--color-warning)', LOW: 'var(--color-success)' };

function RAGBadge({ status }: { status: RAGStatus }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', padding: '2px 10px',
      borderRadius: '9999px', fontSize: '11px', fontWeight: 700,
      letterSpacing: '0.02em', lineHeight: '18px',
      color: RAG_COLOR[status], background: RAG_BG[status],
      border: `1px solid ${RAG_BORDER[status]}`,
    }}>
      {status}
    </span>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const color = SEVERITY_COLOR[severity] ?? 'var(--color-navy-500)';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', padding: '2px 10px',
      borderRadius: '9999px', fontSize: '11px', fontWeight: 600,
      lineHeight: '18px', color, background: `${color}12`, border: `1px solid ${color}30`,
    }}>
      {severity}
    </span>
  );
}

function fmt(n: number) {
  if (n >= 1_000_000) return `\u00A3${(n / 1_000_000).toFixed(1)}m`;
  if (n >= 1_000) return `\u00A3${(n / 1_000).toFixed(0)}k`;
  return `\u00A3${n.toLocaleString()}`;
}

// ─── Sortable column header ───────────────────────────────────────────────────

function SortHeader({
  label, sortKey, current, dir, onSort,
}: {
  label: string; sortKey: SortKey;
  current: SortKey; dir: SortDir; onSort: (k: SortKey) => void;
}) {
  const active = current === sortKey;
  return (
    <th
      onClick={() => onSort(sortKey)}
      style={{
        padding: '12px 14px', textAlign: 'left', fontSize: '11px', fontWeight: 600,
        color: active ? 'var(--color-accent)' : 'var(--color-navy-500)',
        cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap',
        borderBottom: '1px solid var(--color-navy-200)',
        background: 'var(--color-navy-50)',
        letterSpacing: '0.04em', textTransform: 'uppercase',
      }}
    >
      {label} {active ? (dir === 'asc' ? '\u2191' : '\u2193') : ''}
    </th>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function BankDashboardPage() {
  const [sortKey, setSortKey] = useState<SortKey>('ragStatus');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [selectedFirmId, setSelectedFirmId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'alerts'>('overview');
  const [exportLoading, setExportLoading] = useState(false);

  const { data: overviewData, isLoading: overviewLoading, error: overviewError } = useQuery({
    queryKey: ['bank-dashboard-overview'],
    queryFn: () => bankDashboardApi.getOverview(),
    staleTime: 60_000,
  });

  const { data: alerts, isLoading: alertsLoading } = useQuery({
    queryKey: ['bank-dashboard-alerts'],
    queryFn: () => bankDashboardApi.getAlerts(),
    enabled: activeTab === 'alerts',
    staleTime: 60_000,
  });

  const { data: firmSummary, isLoading: summaryLoading } = useQuery<FirmSummary>({
    queryKey: ['bank-dashboard-firm', selectedFirmId],
    queryFn: () => bankDashboardApi.getFirmSummary(selectedFirmId!),
    enabled: !!selectedFirmId,
    staleTime: 60_000,
  });

  const portfolio: Portfolio | undefined = overviewData?.portfolio;
  const firms: FirmRow[] = overviewData?.firms ?? [];

  const RAG_RANK: Record<RAGStatus, number> = { RED: 2, AMBER: 1, GREEN: 0 };

  const sorted = [...firms].sort((a, b) => {
    let cmp = 0;
    switch (sortKey) {
      case 'firmName': cmp = a.firmName.localeCompare(b.firmName); break;
      case 'regime': cmp = a.regime.localeCompare(b.regime); break;
      case 'ragStatus': cmp = (RAG_RANK[b.ragStatus] ?? 0) - (RAG_RANK[a.ragStatus] ?? 0); break;
      case 'lastReconDate': cmp = (a.lastReconDate ?? '').localeCompare(b.lastReconDate ?? ''); break;
      case 'openBreaches': {
        const ta = a.openBreachCount.CRITICAL * 1000 + a.openBreachCount.HIGH * 100 + a.openBreachCount.MEDIUM * 10 + a.openBreachCount.LOW;
        const tb = b.openBreachCount.CRITICAL * 1000 + b.openBreachCount.HIGH * 100 + b.openBreachCount.MEDIUM * 10 + b.openBreachCount.LOW;
        cmp = tb - ta; break;
      }
      case 'daysSinceLastUpload':
        cmp = (b.daysSinceLastUpload ?? 999) - (a.daysSinceLastUpload ?? 999); break;
    }
    return sortDir === 'asc' ? cmp : -cmp;
  });

  function handleSort(key: SortKey) {
    if (key === sortKey) setSortDir((d: SortDir) => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  }

  async function handleExport() {
    setExportLoading(true);
    try {
      const resp = await bankDashboardApi.exportCsv();
      const url = URL.createObjectURL(new Blob([resp.data], { type: 'text/csv' }));
      const a = document.createElement('a');
      a.href = url; a.download = `bank-dashboard-${new Date().toISOString().split('T')[0]}.csv`;
      a.click(); URL.revokeObjectURL(url);
    } finally { setExportLoading(false); }
  }

  const totalOpenBreaches = firms.reduce((sum, f) =>
    sum + f.openBreachCount.LOW + f.openBreachCount.MEDIUM + f.openBreachCount.HIGH + f.openBreachCount.CRITICAL, 0
  );

  const tableCell: React.CSSProperties = {
    padding: '12px 14px', borderBottom: '1px solid var(--color-navy-100)',
    fontSize: '13px', color: 'var(--color-navy-700)', verticalAlign: 'middle',
  };

  if (overviewLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '300px' }}>
        <div className="spinner" />
      </div>
    );
  }

  if (overviewError) {
    return (
      <div style={{ padding: '24px', color: 'var(--color-danger)' }}>
        Failed to load bank dashboard data.
      </div>
    );
  }

  return (
    <div>
      {/* Page header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '28px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 700, color: 'var(--color-navy-900)', letterSpacing: '-0.025em' }}>
            Bank Aggregate Dashboard
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: '14px', color: 'var(--color-navy-500)' }}>
            Portfolio-level view of all linked payment firms
          </p>
        </div>
        <Button onClick={handleExport} loading={exportLoading} disabled={firms.length === 0}>
          Export CSV
        </Button>
      </div>

      {/* Portfolio risk summary bar */}
      {portfolio && (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '16px',
          marginBottom: '28px', padding: '20px 24px',
          background: 'white', border: '1px solid var(--color-navy-200)',
          borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)',
        }}>
          {[
            { label: 'Total Firms', value: portfolio.totalFirms, color: 'var(--color-navy-900)' },
            { label: 'Funds Under Oversight', value: fmt(portfolio.totalFundsUnderOversight), color: 'var(--color-navy-900)' },
            { label: 'Green', value: portfolio.green, color: RAG_COLOR.GREEN },
            { label: 'Amber', value: portfolio.amber, color: RAG_COLOR.AMBER },
            { label: 'Red', value: portfolio.red, color: RAG_COLOR.RED },
          ].map(item => (
            <div key={item.label}>
              <div style={{ fontSize: '11px', color: item.label === 'Green' || item.label === 'Amber' || item.label === 'Red' ? item.color : 'var(--color-navy-500)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                {item.label}
              </div>
              <div style={{ fontSize: '28px', fontWeight: 700, color: item.color, marginTop: '6px', letterSpacing: '-0.02em' }}>
                {item.value}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <Tabs
        tabs={[
          { id: 'overview', label: 'Firm Overview' },
          { id: 'alerts', label: 'Alerts', count: totalOpenBreaches },
        ]}
        activeTab={activeTab}
        onChange={id => { setActiveTab(id as typeof activeTab); setSelectedFirmId(null); }}
      />

      {/* Firm Overview tab */}
      {activeTab === 'overview' && !selectedFirmId && (
        <div style={{
          background: 'white', border: '1px solid var(--color-navy-200)',
          borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden',
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <SortHeader label="Firm Name" sortKey="firmName" current={sortKey} dir={sortDir} onSort={handleSort} />
                <SortHeader label="Regime" sortKey="regime" current={sortKey} dir={sortDir} onSort={handleSort} />
                <SortHeader label="RAG" sortKey="ragStatus" current={sortKey} dir={sortDir} onSort={handleSort} />
                <SortHeader label="Last Recon" sortKey="lastReconDate" current={sortKey} dir={sortDir} onSort={handleSort} />
                <th style={{ padding: '12px 14px', fontSize: '11px', fontWeight: 600, color: 'var(--color-navy-500)', borderBottom: '1px solid var(--color-navy-200)', background: 'var(--color-navy-50)', textAlign: 'left', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  Recon Result
                </th>
                <SortHeader label="Open Breaches" sortKey="openBreaches" current={sortKey} dir={sortDir} onSort={handleSort} />
                <th style={{ padding: '12px 14px', fontSize: '11px', fontWeight: 600, color: 'var(--color-navy-500)', borderBottom: '1px solid var(--color-navy-200)', background: 'var(--color-navy-50)', textAlign: 'left', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  Letters
                </th>
                <SortHeader label="Days Since Upload" sortKey="daysSinceLastUpload" current={sortKey} dir={sortDir} onSort={handleSort} />
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ ...tableCell, textAlign: 'center', color: 'var(--color-navy-400)', padding: '48px' }}>
                    No firms linked to your bank institution.
                  </td>
                </tr>
              ) : (
                sorted.map(firm => {
                  const totalBreaches = firm.openBreachCount.LOW + firm.openBreachCount.MEDIUM + firm.openBreachCount.HIGH + firm.openBreachCount.CRITICAL;
                  return (
                    <tr
                      key={firm.firmId}
                      onClick={() => setSelectedFirmId(firm.firmId)}
                      style={{ cursor: 'pointer', transition: 'background var(--transition-fast)' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-navy-50)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'white')}
                    >
                      <td style={tableCell}><span style={{ fontWeight: 500, color: 'var(--color-navy-800)' }}>{firm.firmName}</span></td>
                      <td style={tableCell}><span style={{ fontSize: '12px', color: 'var(--color-navy-500)', fontFamily: 'var(--font-mono)' }}>{firm.regime.replace(/_/g, ' ')}</span></td>
                      <td style={tableCell}><RAGBadge status={firm.ragStatus} /></td>
                      <td style={tableCell}>{firm.lastReconDate ?? <span style={{ color: 'var(--color-navy-400)' }}>{'\u2014'}</span>}</td>
                      <td style={tableCell}>
                        {firm.lastReconResult ? (
                          <span style={{ fontSize: '12px', fontWeight: 600, color: firm.lastReconResult === 'MET' ? 'var(--color-success)' : firm.lastReconResult === 'SHORTFALL' ? 'var(--color-danger)' : 'var(--color-navy-600)' }}>{firm.lastReconResult}</span>
                        ) : <span style={{ color: 'var(--color-navy-400)' }}>{'\u2014'}</span>}
                      </td>
                      <td style={tableCell}>
                        {totalBreaches === 0 ? (
                          <span style={{ color: 'var(--color-navy-400)', fontSize: '12px' }}>None</span>
                        ) : (
                          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                            {firm.openBreachCount.CRITICAL > 0 && <span style={{ fontSize: '12px', fontWeight: 700, color: SEVERITY_COLOR.CRITICAL }}>{firm.openBreachCount.CRITICAL}C</span>}
                            {firm.openBreachCount.HIGH > 0 && <span style={{ fontSize: '12px', fontWeight: 700, color: SEVERITY_COLOR.HIGH }}>{firm.openBreachCount.HIGH}H</span>}
                            {firm.openBreachCount.MEDIUM > 0 && <span style={{ fontSize: '12px', fontWeight: 700, color: SEVERITY_COLOR.MEDIUM }}>{firm.openBreachCount.MEDIUM}M</span>}
                            {firm.openBreachCount.LOW > 0 && <span style={{ fontSize: '12px', fontWeight: 700, color: SEVERITY_COLOR.LOW }}>{firm.openBreachCount.LOW}L</span>}
                          </div>
                        )}
                      </td>
                      <td style={tableCell}>
                        <div style={{ fontSize: '12px' }}>
                          {firm.letterStatusSummary.CONFIRMED > 0 && <span style={{ color: 'var(--color-success)', marginRight: '4px' }}>{firm.letterStatusSummary.CONFIRMED}{'\u2713'}</span>}
                          {firm.letterStatusSummary.PENDING > 0 && <span style={{ color: 'var(--color-warning)', marginRight: '4px' }}>{firm.letterStatusSummary.PENDING}P</span>}
                          {firm.letterStatusSummary.MISSING > 0 && <span style={{ color: 'var(--color-danger)', marginRight: '4px' }}>{firm.letterStatusSummary.MISSING}!</span>}
                          {firm.letterStatusSummary.EXPIRED > 0 && <span style={{ color: 'var(--color-danger)' }}>{firm.letterStatusSummary.EXPIRED}{'\u2717'}</span>}
                          {Object.values(firm.letterStatusSummary).every(v => v === 0) && <span style={{ color: 'var(--color-navy-400)' }}>{'\u2014'}</span>}
                        </div>
                      </td>
                      <td style={tableCell}>
                        {firm.daysSinceLastUpload === null ? (
                          <span style={{ color: 'var(--color-navy-400)' }}>{'\u2014'}</span>
                        ) : (
                          <span style={{
                            color: firm.daysSinceLastUpload > 3 ? 'var(--color-danger)' : firm.daysSinceLastUpload > 1 ? 'var(--color-warning)' : 'var(--color-navy-700)',
                            fontWeight: firm.daysSinceLastUpload > 1 ? 600 : 400,
                          }}>
                            {firm.daysSinceLastUpload}d
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Firm Summary (deep dive) */}
      {activeTab === 'overview' && selectedFirmId && (
        <div>
          <Button variant="secondary" onClick={() => setSelectedFirmId(null)} style={{ marginBottom: '20px' }}>
            {'\u2190'} Back to Overview
          </Button>

          {summaryLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}><div className="spinner" /></div>
          ) : firmSummary ? (
            <FirmSummaryView summary={firmSummary} firmName={firms.find(f => f.firmId === selectedFirmId)?.firmName ?? selectedFirmId} />
          ) : (
            <div style={{ color: 'var(--color-danger)', padding: '24px' }}>Failed to load firm summary.</div>
          )}
        </div>
      )}

      {/* Alerts tab */}
      {activeTab === 'alerts' && (
        <div style={{
          background: 'white', border: '1px solid var(--color-navy-200)',
          borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden',
        }}>
          {alertsLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}><div className="spinner" /></div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Firm', 'Severity', 'Type', 'Status', 'Notifiable', 'Age (days)', 'Description'].map(h => (
                    <th key={h} style={{
                      padding: '12px 14px', textAlign: 'left', fontSize: '11px', fontWeight: 600,
                      color: 'var(--color-navy-500)', borderBottom: '1px solid var(--color-navy-200)',
                      background: 'var(--color-navy-50)', letterSpacing: '0.04em', textTransform: 'uppercase',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {!alerts || alerts.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ ...tableCell, textAlign: 'center', color: 'var(--color-navy-400)', padding: '48px' }}>
                      No open alerts across linked firms.
                    </td>
                  </tr>
                ) : (
                  alerts.map((alert: any) => (
                    <tr key={alert.id}>
                      <td style={tableCell}><span style={{ fontWeight: 500, color: 'var(--color-navy-800)' }}>{alert.firmName}</span></td>
                      <td style={tableCell}><SeverityBadge severity={alert.severity} /></td>
                      <td style={{ ...tableCell, fontSize: '12px', fontFamily: 'var(--font-mono)' }}>{alert.breachType.replace(/_/g, ' ')}</td>
                      <td style={tableCell}>{statusBadge(alert.status)}</td>
                      <td style={tableCell}>
                        {alert.isNotifiable
                          ? <span style={{ fontSize: '12px', color: 'var(--color-danger)', fontWeight: 600 }}>Yes</span>
                          : <span style={{ fontSize: '12px', color: 'var(--color-navy-400)' }}>No</span>
                        }
                      </td>
                      <td style={{ ...tableCell, fontWeight: alert.ageDays > 5 ? 700 : 400, color: alert.ageDays > 5 ? 'var(--color-danger)' : 'var(--color-navy-700)' }}>{alert.ageDays}</td>
                      <td style={{ ...tableCell, maxWidth: '320px', fontSize: '12px', color: 'var(--color-navy-600)' }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={alert.description}>{alert.description}</div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Firm Summary Sub-view ────────────────────────────────────────────────────

function FirmSummaryView({ summary, firmName }: { summary: FirmSummary; firmName: string }) {
  const tableCell: React.CSSProperties = {
    padding: '12px 14px', borderBottom: '1px solid var(--color-navy-100)',
    fontSize: '13px', color: 'var(--color-navy-700)', verticalAlign: 'middle',
  };

  const sectionCard: React.CSSProperties = {
    background: 'white', border: '1px solid var(--color-navy-200)',
    borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)',
    overflow: 'hidden', marginBottom: '24px',
  };

  const sectionHeader: React.CSSProperties = {
    padding: '14px 18px', borderBottom: '1px solid var(--color-navy-200)',
    background: 'var(--color-navy-50)', fontSize: '13px', fontWeight: 600,
    color: 'var(--color-navy-700)', display: 'flex', alignItems: 'center', gap: '8px',
  };

  const thStyle: React.CSSProperties = {
    padding: '10px 14px', textAlign: 'left', fontSize: '11px',
    fontWeight: 600, color: 'var(--color-navy-500)',
    borderBottom: '1px solid var(--color-navy-200)',
    letterSpacing: '0.04em', textTransform: 'uppercase',
  };

  return (
    <div>
      <h2 style={{ margin: '0 0 24px', fontSize: '18px', fontWeight: 700, color: 'var(--color-navy-900)', letterSpacing: '-0.02em' }}>
        {firmName}
      </h2>

      <div style={sectionCard}>
        <div style={sectionHeader}>Recent Reconciliation History</div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>{['Date', 'Type', 'Currency', 'Status', 'Variance', 'Data Completeness'].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
          <tbody>
            {summary.reconciliationHistory.length === 0 ? (
              <tr><td colSpan={6} style={{ ...tableCell, textAlign: 'center', color: 'var(--color-navy-400)' }}>No reconciliation history.</td></tr>
            ) : (
              summary.reconciliationHistory.map(run => (
                <tr key={run.id}>
                  <td style={tableCell}>{new Date(run.reconciliationDate).toLocaleDateString('en-GB')}</td>
                  <td style={{ ...tableCell, fontSize: '12px', color: 'var(--color-navy-500)' }}>{run.reconciliationType}</td>
                  <td style={{ ...tableCell, fontFamily: 'var(--font-mono)', fontSize: '12px' }}>{run.currency}</td>
                  <td style={tableCell}>{statusBadge(run.status)}</td>
                  <td style={{ ...tableCell, fontFamily: 'var(--font-mono)', fontSize: '12px' }}>{Number(run.variance).toLocaleString('en-GB', { minimumFractionDigits: 2 })}</td>
                  <td style={{ ...tableCell, fontSize: '12px', color: 'var(--color-navy-500)' }}>{run.dataCompleteness.replace(/_/g, ' ')}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div style={sectionCard}>
        <div style={sectionHeader}>
          Active Breaches
          {summary.activeBreaches.length > 0 && (
            <span style={{
              background: 'var(--color-danger)', color: 'white',
              borderRadius: '9999px', padding: '1px 8px', fontSize: '11px', fontWeight: 700,
            }}>{summary.activeBreaches.length}</span>
          )}
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>{['Severity', 'Type', 'Status', 'Notifiable', 'Detected', 'Description'].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
          <tbody>
            {summary.activeBreaches.length === 0 ? (
              <tr><td colSpan={6} style={{ ...tableCell, textAlign: 'center', color: 'var(--color-navy-400)' }}>No active breaches.</td></tr>
            ) : (
              summary.activeBreaches.map(b => (
                <tr key={b.id}>
                  <td style={tableCell}><SeverityBadge severity={b.severity} /></td>
                  <td style={{ ...tableCell, fontSize: '12px', fontFamily: 'var(--font-mono)' }}>{b.breachType.replace(/_/g, ' ')}</td>
                  <td style={tableCell}>{statusBadge(b.status)}</td>
                  <td style={tableCell}><span style={{ fontSize: '12px', color: b.isNotifiable ? 'var(--color-danger)' : 'var(--color-navy-400)', fontWeight: b.isNotifiable ? 600 : 400 }}>{b.isNotifiable ? 'Yes' : 'No'}</span></td>
                  <td style={{ ...tableCell, fontSize: '12px' }}>{new Date(b.createdAt).toLocaleDateString('en-GB')}</td>
                  <td style={{ ...tableCell, fontSize: '12px', color: 'var(--color-navy-600)', maxWidth: '280px' }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={b.description}>{b.description}</div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div style={sectionCard}>
        <div style={sectionHeader}>Safeguarding Accounts</div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>{['Bank', 'Account', 'Currency', 'Letter Status', 'Letter Expiry', 'DD Review', 'DD Next Due'].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
          <tbody>
            {summary.accounts.length === 0 ? (
              <tr><td colSpan={7} style={{ ...tableCell, textAlign: 'center', color: 'var(--color-navy-400)' }}>No active accounts.</td></tr>
            ) : (
              summary.accounts.map(a => {
                const letterColor = a.letterStatus === 'CONFIRMED' ? 'var(--color-success)' :
                  a.letterStatus === 'EXPIRED' || a.letterStatus === 'MISSING' ? 'var(--color-danger)' : 'var(--color-warning)';
                const ddColor = a.dueDiligence?.reviewStatus === 'CURRENT' ? 'var(--color-success)' :
                  a.dueDiligence?.reviewStatus === 'OVERDUE' ? 'var(--color-danger)' : 'var(--color-warning)';
                return (
                  <tr key={a.id}>
                    <td style={{ ...tableCell, fontWeight: 500 }}>{a.bankName}</td>
                    <td style={{ ...tableCell, fontFamily: 'var(--font-mono)', fontSize: '12px' }}>{a.accountNumberMasked}</td>
                    <td style={{ ...tableCell, fontFamily: 'var(--font-mono)', fontSize: '12px' }}>{a.currency}</td>
                    <td style={tableCell}><span style={{ fontSize: '12px', fontWeight: 600, color: letterColor }}>{a.letterStatus}</span></td>
                    <td style={{ ...tableCell, fontSize: '12px', color: 'var(--color-navy-500)' }}>
                      {a.currentLetter?.expiryDate ? new Date(a.currentLetter.expiryDate).toLocaleDateString('en-GB') : <span style={{ color: 'var(--color-navy-400)' }}>{'\u2014'}</span>}
                    </td>
                    <td style={tableCell}>
                      {a.dueDiligence ? <span style={{ fontSize: '12px', fontWeight: 600, color: ddColor }}>{a.dueDiligence.reviewStatus}</span> : <span style={{ color: 'var(--color-navy-400)', fontSize: '12px' }}>{'\u2014'}</span>}
                    </td>
                    <td style={{ ...tableCell, fontSize: '12px', color: 'var(--color-navy-500)' }}>
                      {a.dueDiligence?.nextReviewDue ? new Date(a.dueDiligence.nextReviewDue).toLocaleDateString('en-GB') : <span style={{ color: 'var(--color-navy-400)' }}>{'\u2014'}</span>}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
