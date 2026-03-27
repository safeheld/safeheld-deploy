import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../hooks/useAuth';
import { resolutionPackApi } from '../../api/client';
import { Card, Table, Button, PageHeader, StatCard, Grid, Alert, Badge, statusBadge, LoadingSkeleton, EmptyState, ErrorState } from '../../components/ui';
import { format } from 'date-fns';

export default function ResolutionPackPage() {
  const { user } = useAuth();
  const firmId = user!.firmId;
  const queryClient = useQueryClient();
  const isComplianceOrAdmin = ['COMPLIANCE_OFFICER', 'ADMIN'].includes(user!.role);

  const [activeTab, setActiveTab] = useState<'components' | 'history'>('components');

  const { data: packData, isLoading: packLoading, error: packError, refetch: packRefetch } = useQuery({
    queryKey: ['resolution-pack', firmId],
    queryFn: () => resolutionPackApi.generate(firmId),
  });

  const { data: stalenessData } = useQuery({
    queryKey: ['resolution-pack-staleness', firmId],
    queryFn: () => resolutionPackApi.getStaleness(firmId),
  });

  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: ['resolution-pack-history', firmId],
    queryFn: () => resolutionPackApi.getHistory(firmId),
    enabled: activeTab === 'history',
  });

  const generateMutation = useMutation({
    mutationFn: () => resolutionPackApi.generate(firmId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['resolution-pack', firmId] });
      queryClient.invalidateQueries({ queryKey: ['resolution-pack-history', firmId] });
    },
  });

  const handleDownloadPdf = async () => {
    try {
      const response = await resolutionPackApi.download(firmId);
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `resolution-pack-${new Date().toISOString().split('T')[0]}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // handled silently
    }
  };

  const staleAlerts = (stalenessData || []).filter((s: any) => s.isStale);

  const tabs = [
    { id: 'components', label: 'Components' },
    { id: 'history', label: 'History' },
  ];

  return (
    <div>
      <PageHeader
        title="Resolution Pack"
        actions={isComplianceOrAdmin ? (
          <div style={{ display: 'flex', gap: '10px' }}>
            <Button onClick={() => generateMutation.mutate()} loading={generateMutation.isPending}>
              Generate Pack
            </Button>
            <Button variant="secondary" onClick={handleDownloadPdf}>
              Download PDF
            </Button>
          </div>
        ) : undefined}
      />

      {packError && <ErrorState message="Failed to load resolution pack." onRetry={() => packRefetch()} />}
      {packLoading && <LoadingSkeleton type="cards" />}

      {/* Staleness alerts */}
      {staleAlerts.length > 0 && (
        <div style={{ marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {staleAlerts.map((alert: any, i: number) => (
            <Alert key={i} type="warning" message={`${alert.component} is stale - last updated ${alert.lastUpdated ? format(new Date(alert.lastUpdated), 'dd MMM yyyy') : 'never'}`} />
          ))}
        </div>
      )}

      {generateMutation.isSuccess && (
        <div style={{ marginBottom: '16px' }}>
          <Alert type="success" message="Resolution pack generated successfully." />
        </div>
      )}

      {/* Stat cards */}
      <div style={{ marginBottom: '20px' }}>
        <Grid cols={4}>
          <StatCard
            label="Completeness"
            value={packData ? `${packData.completenessPercent ?? 0}%` : '—'}
            color={packData?.completenessPercent === 100 ? 'var(--color-success)' : 'var(--color-warning)'}
          />
          <StatCard
            label="Components Complete"
            value={packData?.components?.filter((c: any) => c.status === 'GREEN').length ?? '—'}
          />
          <StatCard
            label="Components Missing"
            value={packData?.components?.filter((c: any) => c.status === 'RED').length ?? '—'}
            color="var(--color-danger)"
          />
          <StatCard
            label="Last Updated"
            value={packData?.generatedAt ? format(new Date(packData.generatedAt), 'dd MMM yyyy') : '—'}
          />
        </Grid>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0', borderBottom: '2px solid var(--color-gray-200)', marginBottom: '20px' }}>
        {tabs.map(tab => (
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

      {activeTab === 'components' && (
        <Card title="Resolution Pack Components">
          <Table
            loading={packLoading}
            data={packData?.components || []}
            columns={[
              { key: 'name', header: 'Component' },
              { key: 'status', header: 'Status', render: (r: any) => statusBadge(r.status), width: '100px' },
              { key: 'lastUpdated', header: 'Last Updated', render: (r: any) => r.lastUpdated ? format(new Date(r.lastUpdated), 'dd MMM yyyy') : '—' },
              { key: 'details', header: 'Details', render: (r: any) => r.details || '—' },
            ]}
            emptyMessage="No resolution pack data. Click 'Generate Pack' to create one."
          />
        </Card>
      )}

      {activeTab === 'history' && (
        <Card title="Version History">
          <Table
            loading={historyLoading}
            data={historyData?.data || historyData || []}
            columns={[
              { key: 'version', header: 'Version', width: '80px' },
              { key: 'completenessPercent', header: 'Completeness', render: (r: any) => `${r.completenessPercent}%`, width: '120px' },
              { key: 'generatedAt', header: 'Generated', render: (r: any) => r.generatedAt ? format(new Date(r.generatedAt), 'dd MMM yyyy HH:mm') : '—' },
              { key: 'generatedBy', header: 'Generated By', render: (r: any) => r.generatedByUser?.name || r.generatedBy || '—' },
            ]}
            emptyMessage="No version history yet."
          />
        </Card>
      )}
    </div>
  );
}
