import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { bankDashboardApi } from '../../api/client';

// ─── Types ────────────────────────────────────────────────────────────────────

type RAGStatus = 'GREEN' | 'AMBER' | 'RED';
type SortKey = 'firmName' | 'regime' | 'ragStatus' | 'lastReconDate' | 'openBreaches' | 'daysSinceLastUpload';
type SortDir = 'asc' | 'desc';

interface BreachCount { LOW: number; MEDIUM: number; HIGH: number; CRITICAL: number }
interface LetterSummary { CONFIRMED: number; PENDING: number; MISSING: number; EXPIRED: number }

interface FirmRow {
  firmId: string;
  firmName: string;
  regime: string;
  ragStatus: RAGStatus;
  lastReconDate: string | null;
  lastReconResult: string | null;
  openBreachCount: BreachCount;
  letterStatusSummary: LetterSummary;
  daysSinceLastUpload: number | null;
}

interface Portfolio {
  totalFirms: number;
  totalFundsUnderOversight: number;
  green: number;
  amber: number;
  red: number;
}

interface FirmSummary {
  firmId: string;
  reconciliationHistory: Array<{
    id: string;
    reconciliationDate: string;
    reconciliationType: string;
    currency: string;
    status: string;
    variance: number;
    dataCompleteness: string;
  }>;
  activeBreaches: Array<{
    id: string;
    breachType: string;
    severity: string;
    status: string;
    isNotifiable: boolean;
    description: string;
    createdAt: string;
  }>;
  accounts: Array<{
    id: string;
    bankName: string;
    accountNumberMasked: string;
    currency: string;
    letterStatus: string;
    currentLetter: { status: string; effectiveDate: string; expiryDate: string | null; annualReviewDue: string } | null;
    dueDiligence: { reviewStatus: string; nextReviewDue: string; ddOutcome: string } | null;
  }>;
}

// ─── Style helpers ────────────────────────────────────────────────────────────

const RAG_COLOR: Record<RAGStatus, string> = {
  GREEN: '#16a34a',
  AMBER: '#d97706',
  RED: '#dc2626',
};

const RAG_BG: Record<RAGStatus, string> = {
  GREEN: '#f0fdf4',
  AMBER: '#fffbeb',
  RED: '#fef2f2',
};

const SEVERITY_COLOR: Record<string, string> = {
  CRITICAL: '#dc2626',
  HIGH: '#ea580c',
  MEDIUM: '#d97706',
  LOW: '#16a34a',
};

function RAGBadge({ status }: { status: RAGStatus }) {
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 10px',
      borderRadius: '4px',
      fontSize: '12px',
      fontWeight: 700,
      letterSpacing: '0.5px',
      color: RAG_COLOR[status],
      background: RAG_BG[status],
      border: `1px solid ${RAG_COLOR[status]}33`,
    }}>
      {status}
    </span>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const color = SEVERITY_COLOR[severity] ?? '#6b7280';
  return (
    <span style={{
      display: 'inline-block',
      padding: '1px 8px',
      borderRadius: '4px',
      fontSize: '11px',
      fontWeight: 600,
      color,
      background: `${color}15`,
      border: `1px solid ${color}33`,
    }}>
      {severity}
    </span>
  );
}

function fmt(n: number) {
  if (n >= 1_000_000) return `£${(n / 1_000_000).toFixed(1)}m`;
  if (n >= 1_000) return `£${(n / 1_000).toFixed(0)}k`;
  return `£${n.toLocaleString()}`;
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
        padding: '10px 12px',
        textAlign: 'left',
        fontSize: '12px',
        fontWeight: 600,
        color: active ? 'var(--color-primary)' : 'var(--color-gray-500)',
        cursor: 'pointer',
        userSelect: 'none',
        whiteSpace: 'nowrap',
        borderBottom: '2px solid var(--color-gray-200)',
        background: 'var(--color-gray-50)',
      }}
    >
      {label} {active ? (dir === 'asc' ? '↑' : '↓') : ''}
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

  // ─── Sorting ───────────────────────────────────────────────────────────────

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
        cmp = tb - ta;
        break;
      }
      case 'daysSinceLastUpload':
        cmp = (b.daysSinceLastUpload ?? 999) - (a.daysSinceLastUpload ?? 999);
        break;
    }
    return sortDir === 'asc' ? cmp : -cmp;
  });

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d: SortDir) => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  // ─── CSV export ────────────────────────────────────────────────────────────

  async function handleExport() {
    setExportLoading(true);
    try {
      const resp = await bankDashboardApi.exportCsv();
      const url = URL.createObjectURL(new Blob([resp.data], { type: 'text/csv' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `bank-dashboard-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExportLoading(false);
    }
  }

  // ─── Alert count badge ─────────────────────────────────────────────────────

  const totalOpenBreaches = firms.reduce((sum, f) =>
    sum + f.openBreachCount.LOW + f.openBreachCount.MEDIUM + f.openBreachCount.HIGH + f.openBreachCount.CRITICAL, 0
  );

  // ─── Render ────────────────────────────────────────────────────────────────

  const tableCell: React.CSSProperties = {
    padding: '10px 12px',
    borderBottom: '1px solid var(--color-gray-100)',
    fontSize: '13px',
    color: 'var(--color-gray-800)',
    verticalAlign: 'middle',
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
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>

      {/* Page header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 700, color: 'var(--color-gray-900)' }}>
            Bank Aggregate Dashboard
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--color-gray-500)' }}>
            Portfolio-level view of all linked payment firms
          </p>
        </div>
        <button
          onClick={handleExport}
          disabled={exportLoading || firms.length === 0}
          style={{
            padding: '8px 16px',
            background: 'var(--color-primary)',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontSize: '13px',
            fontWeight: 500,
            cursor: exportLoading ? 'not-allowed' : 'pointer',
            opacity: exportLoading ? 0.7 : 1,
          }}
        >
          {exportLoading ? 'Exporting…' : '↓ Export CSV'}
        </button>
      </div>

      {/* Portfolio risk summary bar */}
      {portfolio && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: '12px',
          marginBottom: '24px',
          padding: '16px 20px',
          background: 'white',
          border: '1px solid var(--color-gray-200)',
          borderRadius: '8px',
          boxShadow: 'var(--shadow-sm)',
        }}>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--color-gray-500)', fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase' }}>
              Total Firms
            </div>
            <div style={{ fontSize: '26px', fontWeight: 700, color: 'var(--color-gray-900)', marginTop: '4px' }}>
              {portfolio.totalFirms}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--color-gray-500)', fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase' }}>
              Funds Under Oversight
            </div>
            <div style={{ fontSize: '26px', fontWeight: 700, color: 'var(--color-gray-900)', marginTop: '4px' }}>
              {fmt(portfolio.totalFundsUnderOversight)}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '11px', color: RAG_COLOR.GREEN, fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase' }}>
              ● Green
            </div>
            <div style={{ fontSize: '26px', fontWeight: 700, color: RAG_COLOR.GREEN, marginTop: '4px' }}>
              {portfolio.green}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '11px', color: RAG_COLOR.AMBER, fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase' }}>
              ● Amber
            </div>
            <div style={{ fontSize: '26px', fontWeight: 700, color: RAG_COLOR.AMBER, marginTop: '4px' }}>
              {portfolio.amber}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '11px', color: RAG_COLOR.RED, fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase' }}>
              ● Red
            </div>
            <div style={{ fontSize: '26px', fontWeight: 700, color: RAG_COLOR.RED, marginTop: '4px' }}>
              {portfolio.red}
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0', marginBottom: '16px', borderBottom: '2px solid var(--color-gray-200)' }}>
        {(['overview', 'alerts'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => { setActiveTab(tab); setSelectedFirmId(null); }}
            style={{
              padding: '10px 20px',
              border: 'none',
              borderBottom: activeTab === tab ? '2px solid var(--color-primary)' : '2px solid transparent',
              marginBottom: '-2px',
              background: 'transparent',
              color: activeTab === tab ? 'var(--color-primary)' : 'var(--color-gray-500)',
              fontWeight: activeTab === tab ? 600 : 400,
              fontSize: '14px',
              cursor: 'pointer',
            }}
          >
            {tab === 'overview' ? 'Firm Overview' : (
              <span>
                Alerts
                {totalOpenBreaches > 0 && (
                  <span style={{
                    marginLeft: '6px',
                    background: 'var(--color-danger)',
                    color: 'white',
                    borderRadius: '10px',
                    padding: '1px 7px',
                    fontSize: '11px',
                    fontWeight: 700,
                  }}>
                    {totalOpenBreaches}
                  </span>
                )}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Firm Overview tab */}
      {activeTab === 'overview' && !selectedFirmId && (
        <div style={{ background: 'white', border: '1px solid var(--color-gray-200)', borderRadius: '8px', boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <SortHeader label="Firm Name" sortKey="firmName" current={sortKey} dir={sortDir} onSort={handleSort} />
                <SortHeader label="Regime" sortKey="regime" current={sortKey} dir={sortDir} onSort={handleSort} />
                <SortHeader label="RAG" sortKey="ragStatus" current={sortKey} dir={sortDir} onSort={handleSort} />
                <SortHeader label="Last Recon" sortKey="lastReconDate" current={sortKey} dir={sortDir} onSort={handleSort} />
                <th style={{ padding: '10px 12px', fontSize: '12px', fontWeight: 600, color: 'var(--color-gray-500)', borderBottom: '2px solid var(--color-gray-200)', background: 'var(--color-gray-50)', textAlign: 'left' }}>
                  Recon Result
                </th>
                <SortHeader label="Open Breaches" sortKey="openBreaches" current={sortKey} dir={sortDir} onSort={handleSort} />
                <th style={{ padding: '10px 12px', fontSize: '12px', fontWeight: 600, color: 'var(--color-gray-500)', borderBottom: '2px solid var(--color-gray-200)', background: 'var(--color-gray-50)', textAlign: 'left' }}>
                  Letters
                </th>
                <SortHeader label="Days Since Upload" sortKey="daysSinceLastUpload" current={sortKey} dir={sortDir} onSort={handleSort} />
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ ...tableCell, textAlign: 'center', color: 'var(--color-gray-400)', padding: '40px' }}>
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
                      style={{ cursor: 'pointer', transition: 'background 0.1s' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-gray-50)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'white')}
                    >
                      <td style={tableCell}>
                        <div style={{ fontWeight: 500 }}>{firm.firmName}</div>
                      </td>
                      <td style={tableCell}>
                        <span style={{ fontSize: '12px', color: 'var(--color-gray-500)', fontFamily: 'var(--font-mono)' }}>
                          {firm.regime.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td style={tableCell}>
                        <RAGBadge status={firm.ragStatus} />
                      </td>
                      <td style={tableCell}>
                        {firm.lastReconDate ?? <span style={{ color: 'var(--color-gray-400)' }}>—</span>}
                      </td>
                      <td style={tableCell}>
                        {firm.lastReconResult ? (
                          <span style={{
                            fontSize: '12px',
                            fontWeight: 600,
                            color: firm.lastReconResult === 'MET' ? 'var(--color-success)' :
                              firm.lastReconResult === 'SHORTFALL' ? 'var(--color-danger)' : 'var(--color-gray-600)',
                          }}>
                            {firm.lastReconResult}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--color-gray-400)' }}>—</span>
                        )}
                      </td>
                      <td style={tableCell}>
                        {totalBreaches === 0 ? (
                          <span style={{ color: 'var(--color-gray-400)', fontSize: '12px' }}>None</span>
                        ) : (
                          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                            {firm.openBreachCount.CRITICAL > 0 && (
                              <span style={{ fontSize: '12px', fontWeight: 700, color: SEVERITY_COLOR.CRITICAL }}>
                                {firm.openBreachCount.CRITICAL}C
                              </span>
                            )}
                            {firm.openBreachCount.HIGH > 0 && (
                              <span style={{ fontSize: '12px', fontWeight: 700, color: SEVERITY_COLOR.HIGH }}>
                                {firm.openBreachCount.HIGH}H
                              </span>
                            )}
                            {firm.openBreachCount.MEDIUM > 0 && (
                              <span style={{ fontSize: '12px', fontWeight: 700, color: SEVERITY_COLOR.MEDIUM }}>
                                {firm.openBreachCount.MEDIUM}M
                              </span>
                            )}
                            {firm.openBreachCount.LOW > 0 && (
                              <span style={{ fontSize: '12px', fontWeight: 700, color: SEVERITY_COLOR.LOW }}>
                                {firm.openBreachCount.LOW}L
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td style={tableCell}>
                        <div style={{ fontSize: '12px' }}>
                          {firm.letterStatusSummary.CONFIRMED > 0 && (
                            <span style={{ color: 'var(--color-success)', marginRight: '4px' }}>
                              {firm.letterStatusSummary.CONFIRMED}✓
                            </span>
                          )}
                          {firm.letterStatusSummary.PENDING > 0 && (
                            <span style={{ color: 'var(--color-warning)', marginRight: '4px' }}>
                              {firm.letterStatusSummary.PENDING}P
                            </span>
                          )}
                          {firm.letterStatusSummary.MISSING > 0 && (
                            <span style={{ color: 'var(--color-danger)', marginRight: '4px' }}>
                              {firm.letterStatusSummary.MISSING}!
                            </span>
                          )}
                          {firm.letterStatusSummary.EXPIRED > 0 && (
                            <span style={{ color: 'var(--color-danger)' }}>
                              {firm.letterStatusSummary.EXPIRED}✕
                            </span>
                          )}
                          {Object.values(firm.letterStatusSummary).every(v => v === 0) && (
                            <span style={{ color: 'var(--color-gray-400)' }}>—</span>
                          )}
                        </div>
                      </td>
                      <td style={tableCell}>
                        {firm.daysSinceLastUpload === null ? (
                          <span style={{ color: 'var(--color-gray-400)' }}>—</span>
                        ) : (
                          <span style={{
                            color: firm.daysSinceLastUpload > 3 ? 'var(--color-danger)' :
                              firm.daysSinceLastUpload > 1 ? 'var(--color-warning)' : 'var(--color-gray-700)',
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
          <button
            onClick={() => setSelectedFirmId(null)}
            style={{
              marginBottom: '16px',
              padding: '6px 12px',
              background: 'transparent',
              border: '1px solid var(--color-gray-300)',
              borderRadius: '6px',
              fontSize: '13px',
              cursor: 'pointer',
              color: 'var(--color-gray-600)',
            }}
          >
            ← Back to Overview
          </button>

          {summaryLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
              <div className="spinner" />
            </div>
          ) : firmSummary ? (
            <FirmSummaryView summary={firmSummary} firmName={firms.find(f => f.firmId === selectedFirmId)?.firmName ?? selectedFirmId} />
          ) : (
            <div style={{ color: 'var(--color-danger)', padding: '24px' }}>Failed to load firm summary.</div>
          )}
        </div>
      )}

      {/* Alerts tab */}
      {activeTab === 'alerts' && (
        <div style={{ background: 'white', border: '1px solid var(--color-gray-200)', borderRadius: '8px', boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
          {alertsLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}><div className="spinner" /></div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Firm', 'Severity', 'Type', 'Status', 'Notifiable', 'Age (days)', 'Description'].map(h => (
                    <th key={h} style={{
                      padding: '10px 12px', textAlign: 'left', fontSize: '12px', fontWeight: 600,
                      color: 'var(--color-gray-500)', borderBottom: '2px solid var(--color-gray-200)',
                      background: 'var(--color-gray-50)',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {!alerts || alerts.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ ...tableCell, textAlign: 'center', color: 'var(--color-gray-400)', padding: '40px' }}>
                      No open alerts across linked firms.
                    </td>
                  </tr>
                ) : (
                  alerts.map((alert: any) => (
                    <tr key={alert.id}>
                      <td style={tableCell}><span style={{ fontWeight: 500 }}>{alert.firmName}</span></td>
                      <td style={tableCell}><SeverityBadge severity={alert.severity} /></td>
                      <td style={{ ...tableCell, fontSize: '12px', fontFamily: 'var(--font-mono)' }}>
                        {alert.breachType.replace(/_/g, ' ')}
                      </td>
                      <td style={{ ...tableCell, fontSize: '12px', color: 'var(--color-gray-500)' }}>{alert.status}</td>
                      <td style={tableCell}>
                        {alert.isNotifiable ? (
                          <span style={{ fontSize: '12px', color: 'var(--color-danger)', fontWeight: 600 }}>Yes</span>
                        ) : (
                          <span style={{ fontSize: '12px', color: 'var(--color-gray-400)' }}>No</span>
                        )}
                      </td>
                      <td style={{ ...tableCell, fontWeight: alert.ageDays > 5 ? 700 : 400, color: alert.ageDays > 5 ? 'var(--color-danger)' : 'var(--color-gray-700)' }}>
                        {alert.ageDays}
                      </td>
                      <td style={{ ...tableCell, maxWidth: '320px', fontSize: '12px', color: 'var(--color-gray-600)' }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={alert.description}>
                          {alert.description}
                        </div>
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
    padding: '10px 12px',
    borderBottom: '1px solid var(--color-gray-100)',
    fontSize: '13px',
    color: 'var(--color-gray-800)',
    verticalAlign: 'middle',
  };

  const sectionCard: React.CSSProperties = {
    background: 'white',
    border: '1px solid var(--color-gray-200)',
    borderRadius: '8px',
    boxShadow: 'var(--shadow-sm)',
    overflow: 'hidden',
    marginBottom: '20px',
  };

  const sectionHeader: React.CSSProperties = {
    padding: '12px 16px',
    borderBottom: '1px solid var(--color-gray-200)',
    background: 'var(--color-gray-50)',
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--color-gray-700)',
  };

  return (
    <div>
      <h2 style={{ margin: '0 0 20px', fontSize: '18px', fontWeight: 700, color: 'var(--color-gray-900)' }}>
        {firmName}
      </h2>

      {/* Reconciliation history */}
      <div style={sectionCard}>
        <div style={sectionHeader}>Recent Reconciliation History</div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Date', 'Type', 'Currency', 'Status', 'Variance', 'Data Completeness'].map(h => (
                <th key={h} style={{
                  padding: '8px 12px', textAlign: 'left', fontSize: '12px',
                  fontWeight: 600, color: 'var(--color-gray-500)',
                  borderBottom: '1px solid var(--color-gray-200)',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {summary.reconciliationHistory.length === 0 ? (
              <tr><td colSpan={6} style={{ ...tableCell, textAlign: 'center', color: 'var(--color-gray-400)' }}>No reconciliation history.</td></tr>
            ) : (
              summary.reconciliationHistory.map(run => (
                <tr key={run.id}>
                  <td style={tableCell}>{new Date(run.reconciliationDate).toLocaleDateString('en-GB')}</td>
                  <td style={{ ...tableCell, fontSize: '12px', color: 'var(--color-gray-500)' }}>{run.reconciliationType}</td>
                  <td style={{ ...tableCell, fontFamily: 'var(--font-mono)', fontSize: '12px' }}>{run.currency}</td>
                  <td style={tableCell}>
                    <span style={{
                      fontSize: '12px', fontWeight: 600,
                      color: run.status === 'MET' ? 'var(--color-success)' :
                        run.status === 'SHORTFALL' ? 'var(--color-danger)' : 'var(--color-gray-600)',
                    }}>
                      {run.status}
                    </span>
                  </td>
                  <td style={{ ...tableCell, fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
                    {Number(run.variance).toLocaleString('en-GB', { minimumFractionDigits: 2 })}
                  </td>
                  <td style={{ ...tableCell, fontSize: '12px', color: 'var(--color-gray-500)' }}>
                    {run.dataCompleteness.replace(/_/g, ' ')}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Active breaches */}
      <div style={sectionCard}>
        <div style={sectionHeader}>
          Active Breaches
          {summary.activeBreaches.length > 0 && (
            <span style={{
              marginLeft: '8px', background: 'var(--color-danger)', color: 'white',
              borderRadius: '10px', padding: '1px 8px', fontSize: '11px', fontWeight: 700,
            }}>
              {summary.activeBreaches.length}
            </span>
          )}
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Severity', 'Type', 'Status', 'Notifiable', 'Detected', 'Description'].map(h => (
                <th key={h} style={{
                  padding: '8px 12px', textAlign: 'left', fontSize: '12px',
                  fontWeight: 600, color: 'var(--color-gray-500)',
                  borderBottom: '1px solid var(--color-gray-200)',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {summary.activeBreaches.length === 0 ? (
              <tr><td colSpan={6} style={{ ...tableCell, textAlign: 'center', color: 'var(--color-gray-400)' }}>No active breaches.</td></tr>
            ) : (
              summary.activeBreaches.map(b => (
                <tr key={b.id}>
                  <td style={tableCell}><SeverityBadge severity={b.severity} /></td>
                  <td style={{ ...tableCell, fontSize: '12px', fontFamily: 'var(--font-mono)' }}>
                    {b.breachType.replace(/_/g, ' ')}
                  </td>
                  <td style={{ ...tableCell, fontSize: '12px', color: 'var(--color-gray-500)' }}>{b.status}</td>
                  <td style={tableCell}>
                    <span style={{ fontSize: '12px', color: b.isNotifiable ? 'var(--color-danger)' : 'var(--color-gray-400)', fontWeight: b.isNotifiable ? 600 : 400 }}>
                      {b.isNotifiable ? 'Yes' : 'No'}
                    </span>
                  </td>
                  <td style={{ ...tableCell, fontSize: '12px' }}>
                    {new Date(b.createdAt).toLocaleDateString('en-GB')}
                  </td>
                  <td style={{ ...tableCell, fontSize: '12px', color: 'var(--color-gray-600)', maxWidth: '280px' }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={b.description}>
                      {b.description}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Accounts / Letters / DD */}
      <div style={sectionCard}>
        <div style={sectionHeader}>Safeguarding Accounts</div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Bank', 'Account', 'Currency', 'Letter Status', 'Letter Expiry', 'DD Review', 'DD Next Due'].map(h => (
                <th key={h} style={{
                  padding: '8px 12px', textAlign: 'left', fontSize: '12px',
                  fontWeight: 600, color: 'var(--color-gray-500)',
                  borderBottom: '1px solid var(--color-gray-200)',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {summary.accounts.length === 0 ? (
              <tr><td colSpan={7} style={{ ...tableCell, textAlign: 'center', color: 'var(--color-gray-400)' }}>No active accounts.</td></tr>
            ) : (
              summary.accounts.map(a => {
                const letterColor = a.letterStatus === 'CONFIRMED' ? 'var(--color-success)' :
                  a.letterStatus === 'EXPIRED' || a.letterStatus === 'MISSING' ? 'var(--color-danger)' :
                  'var(--color-warning)';
                const ddColor = a.dueDiligence?.reviewStatus === 'CURRENT' ? 'var(--color-success)' :
                  a.dueDiligence?.reviewStatus === 'OVERDUE' ? 'var(--color-danger)' : 'var(--color-warning)';
                return (
                  <tr key={a.id}>
                    <td style={{ ...tableCell, fontWeight: 500 }}>{a.bankName}</td>
                    <td style={{ ...tableCell, fontFamily: 'var(--font-mono)', fontSize: '12px' }}>{a.accountNumberMasked}</td>
                    <td style={{ ...tableCell, fontFamily: 'var(--font-mono)', fontSize: '12px' }}>{a.currency}</td>
                    <td style={tableCell}>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: letterColor }}>{a.letterStatus}</span>
                    </td>
                    <td style={{ ...tableCell, fontSize: '12px', color: 'var(--color-gray-500)' }}>
                      {a.currentLetter?.expiryDate
                        ? new Date(a.currentLetter.expiryDate).toLocaleDateString('en-GB')
                        : <span style={{ color: 'var(--color-gray-400)' }}>—</span>}
                    </td>
                    <td style={tableCell}>
                      {a.dueDiligence ? (
                        <span style={{ fontSize: '12px', fontWeight: 600, color: ddColor }}>
                          {a.dueDiligence.reviewStatus}
                        </span>
                      ) : <span style={{ color: 'var(--color-gray-400)', fontSize: '12px' }}>—</span>}
                    </td>
                    <td style={{ ...tableCell, fontSize: '12px', color: 'var(--color-gray-500)' }}>
                      {a.dueDiligence?.nextReviewDue
                        ? new Date(a.dueDiligence.nextReviewDue).toLocaleDateString('en-GB')
                        : <span style={{ color: 'var(--color-gray-400)' }}>—</span>}
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
