import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../hooks/useAuth';
import { reconciliationApi, breachApi, governanceApi } from '../../api/client';
import { StatCard, Card, Grid, statusBadge } from '../../components/ui';
import { format } from 'date-fns';

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

  const openBreaches = reconDash?.openBreaches ?? '—';
  const openBreaks = reconDash?.openBreaks ?? '—';
  const notifiableBreaches = breachesResp?.pagination?.total ?? 0;
  const rpackStatus = rpackHealth?.overallStatus || '—';

  const rpackColor = rpackStatus === 'GREEN' ? 'var(--color-success)'
    : rpackStatus === 'AMBER' ? 'var(--color-warning)'
    : rpackStatus === 'RED' ? 'var(--color-danger)' : undefined;

  return (
    <div>
      <h2 style={{ margin: '0 0 20px', fontSize: '20px', fontWeight: 700, color: 'var(--color-gray-900)' }}>
        Dashboard
      </h2>

      {/* Stat Cards */}
      <Grid cols={4} gap={16}>
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

      <div style={{ marginTop: '24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        {/* Latest Internal Reconciliation */}
        <Card title="Recent Internal Reconciliations">
          {reconDash?.latestInternalRuns?.length ? (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: 'var(--color-gray-50)' }}>
                  {['Date', 'Currency', 'Status', 'Variance'].map(h => (
                    <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: 'var(--color-gray-500)', fontSize: '12px', borderBottom: '1px solid var(--color-gray-200)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {reconDash.latestInternalRuns.map((run: { reconciliationDate: string; currency: string; status: string; variance: number }, i: number) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--color-gray-100)' }}>
                    <td style={{ padding: '8px 10px' }}>{format(new Date(run.reconciliationDate), 'dd MMM yyyy')}</td>
                    <td style={{ padding: '8px 10px' }}>{run.currency}</td>
                    <td style={{ padding: '8px 10px' }}>{statusBadge(run.status)}</td>
                    <td style={{ padding: '8px 10px', fontFamily: 'monospace', color: run.variance < 0 ? 'var(--color-danger)' : run.variance > 0 ? 'var(--color-success)' : undefined }}>
                      {run.variance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p style={{ color: 'var(--color-gray-400)', fontSize: '13px', textAlign: 'center', margin: '20px 0' }}>
              No reconciliation data yet.
            </p>
          )}
        </Card>

        {/* Resolution Pack Health */}
        <Card title="Resolution Pack Health">
          {rpackHealth?.components ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {(rpackHealth.components as Array<{ name: string; status: string; detail: string }>).map((comp) => (
                <div key={comp.name} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                  padding: '8px 10px', borderRadius: '6px',
                  background: comp.status === 'RED' ? '#fee2e2' : comp.status === 'AMBER' ? '#fef3c7' : '#d1fae5',
                }}>
                  <div>
                    <div style={{ fontWeight: 500, fontSize: '13px' }}>{comp.name}</div>
                    <div style={{ fontSize: '11px', color: 'var(--color-gray-500)', marginTop: '2px' }}>{comp.detail}</div>
                  </div>
                  {statusBadge(comp.status)}
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: 'var(--color-gray-400)', fontSize: '13px', textAlign: 'center', margin: '20px 0' }}>
              Run a resolution pack health check to see results.
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}
