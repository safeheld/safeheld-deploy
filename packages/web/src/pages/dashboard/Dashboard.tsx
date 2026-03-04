import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../hooks/useAuth';
import { reconciliationApi, breachApi, governanceApi, reportingApi } from '../../api/client';
import { StatCard, Card, Grid, Button, statusBadge } from '../../components/ui';
import { format } from 'date-fns';

function downloadPdf(fetcher: () => Promise<{ data: Blob }>, name: string) {
  fetcher().then(({ data }) => {
    const url = window.URL.createObjectURL(data);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name}-${new Date().toISOString().split('T')[0]}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  }).catch(() => {
    alert('Failed to generate report. Please try again.');
  });
}

export default function DashboardPage() {
  const { user } = useAuth();
  const firmId = user!.firmId;

  const { data: reconDash } = useQuery({
    queryKey: ['recon-dashboard', firmId],
    queryFn: () => reconciliationApi.getDashboard(firmId),
  });

  const { data: breachesResp } = useQuery({
    queryKey: ['breaches', firmId, { is_notifiable: 'true' }],
    queryFn: () => breachApi.getBreaches(firmId, { is_notifiable: 'true' }),
  });

  const { data: rpackHealth } = useQuery({
    queryKey: ['resolution-pack-health', firmId],
    queryFn: () => governanceApi.getResolutionPackHealth(firmId),
  });

  const openBreaches = reconDash?.openBreaches ?? '\u2014';
  const openBreaks = reconDash?.openBreaks ?? '\u2014';
  const notifiableBreaches = breachesResp?.pagination?.total ?? 0;
  const rpackStatus = rpackHealth?.overallStatus || '\u2014';

  const rpackColor = rpackStatus === 'GREEN' ? 'var(--color-success)'
    : rpackStatus === 'AMBER' ? 'var(--color-warning)'
    : rpackStatus === 'RED' ? 'var(--color-danger)' : undefined;

  return (
    <div>
      <div style={{ marginBottom: '28px' }}>
        <h2 style={{
          margin: 0, fontSize: '22px', fontWeight: 700,
          color: 'var(--color-navy-900)', letterSpacing: '-0.025em',
        }}>
          Dashboard
        </h2>
        <p style={{ margin: '4px 0 0', fontSize: '14px', color: 'var(--color-navy-500)' }}>
          Overview of your safeguarding compliance status
        </p>
      </div>

      {/* Export Buttons */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        <Button variant="outline" size="sm" onClick={() => downloadPdf(() => reportingApi.exportSafeguardingReport(firmId), 'safeguarding-report')}>
          Export Safeguarding Report
        </Button>
        <Button variant="outline" size="sm" onClick={() => downloadPdf(() => reportingApi.exportReconciliationSummary(firmId), 'reconciliation-summary')}>
          Export Reconciliation Summary
        </Button>
        <Button variant="outline" size="sm" onClick={() => downloadPdf(() => reportingApi.exportBreachReport(firmId), 'breach-report')}>
          Export Breach Report
        </Button>
      </div>

      {/* Stat Cards */}
      <Grid cols={4} gap={20}>
        <StatCard
          label="Open Breaches"
          value={openBreaches}
          sub="requires attention"
          color={Number(openBreaches) > 0 ? 'var(--color-danger)' : undefined}
        />
        <StatCard
          label="Open External Breaks"
          value={openBreaks}
          sub="reconciliation breaks"
          color={Number(openBreaks) > 0 ? 'var(--color-warning)' : undefined}
        />
        <StatCard
          label="Notifiable Breaches"
          value={notifiableBreaches}
          sub="FCA notification required"
          color={notifiableBreaches > 0 ? 'var(--color-danger)' : undefined}
        />
        <StatCard
          label="Resolution Pack"
          value={rpackStatus}
          sub="overall health"
          color={rpackColor}
        />
      </Grid>

      <div style={{ marginTop: '28px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        {/* Latest Internal Reconciliation */}
        <Card title="Recent Internal Reconciliations">
          {reconDash?.latestInternalRuns?.length ? (
            <div style={{ margin: '-24px', marginTop: '-24px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr>
                    {['Date', 'Currency', 'Status', 'Variance'].map(h => (
                      <th key={h} style={{
                        padding: '12px 16px', textAlign: 'left', fontWeight: 600,
                        color: 'var(--color-navy-500)', fontSize: '11px',
                        letterSpacing: '0.04em', textTransform: 'uppercase',
                        borderBottom: '1px solid var(--color-navy-200)',
                        background: 'var(--color-navy-50)',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {reconDash.latestInternalRuns.map((run: { reconciliationDate: string; currency: string; status: string; variance: number }, i: number) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--color-navy-100)' }}>
                      <td style={{ padding: '12px 16px', color: 'var(--color-navy-700)' }}>
                        {format(new Date(run.reconciliationDate), 'dd MMM yyyy')}
                      </td>
                      <td style={{ padding: '12px 16px', fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--color-navy-600)' }}>
                        {run.currency}
                      </td>
                      <td style={{ padding: '12px 16px' }}>{statusBadge(run.status)}</td>
                      <td style={{
                        padding: '12px 16px',
                        fontFamily: 'var(--font-mono)', fontSize: '13px',
                        color: run.variance < 0 ? 'var(--color-danger)' : run.variance > 0 ? 'var(--color-success)' : 'var(--color-navy-600)',
                        fontWeight: 500,
                      }}>
                        {run.variance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p style={{ color: 'var(--color-navy-400)', fontSize: '13px', textAlign: 'center', margin: '24px 0' }}>
              No reconciliation data yet.
            </p>
          )}
        </Card>

        {/* Resolution Pack Health */}
        <Card title="Resolution Pack Health">
          {rpackHealth?.components ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {(rpackHealth.components as Array<{ name: string; status: string; detail: string }>).map((comp) => (
                <div key={comp.name} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                  padding: '12px 16px', borderRadius: 'var(--radius-md)',
                  background: comp.status === 'RED' ? 'var(--color-danger-light)'
                    : comp.status === 'AMBER' ? 'var(--color-warning-light)'
                    : 'var(--color-success-light)',
                  border: `1px solid ${
                    comp.status === 'RED' ? '#fecaca'
                    : comp.status === 'AMBER' ? '#fde68a'
                    : '#a7f3d0'
                  }`,
                }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--color-navy-800)' }}>{comp.name}</div>
                    <div style={{ fontSize: '12px', color: 'var(--color-navy-500)', marginTop: '3px' }}>{comp.detail}</div>
                  </div>
                  {statusBadge(comp.status)}
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: 'var(--color-navy-400)', fontSize: '13px', textAlign: 'center', margin: '24px 0' }}>
              Run a resolution pack health check to see results.
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}
