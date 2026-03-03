import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../hooks/useAuth';
import { adminApi } from '../../api/client';
import { Card, Table, PageHeader, Pagination, Button } from '../../components/ui';
import { format } from 'date-fns';

export default function AuditPage() {
  const { user } = useAuth();
  const firmId = user!.firmId;
  const isAdmin = user!.role === 'ADMIN';

  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ action: '', entityType: '', from: '', to: '' });

  const queryParams: Record<string, string> = {
    page: String(page),
    ...(isAdmin ? {} : { firmId }),
  };
  if (filters.action) queryParams.action = filters.action;
  if (filters.entityType) queryParams.entityType = filters.entityType;
  if (filters.from) queryParams.from = filters.from;
  if (filters.to) queryParams.to = filters.to;

  const { data: logsResp, isLoading } = useQuery({
    queryKey: ['audit-log', page, filters],
    queryFn: () => adminApi.getAuditLog(queryParams),
  });

  const handleExport = () => {
    adminApi.exportAuditLog(queryParams).then(response => {
      const url = URL.createObjectURL(new Blob([response.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-log-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    });
  };

  const logs = logsResp?.data || [];
  const pagination = logsResp?.pagination;

  const inputStyle: React.CSSProperties = {
    padding: '8px 12px', border: '1px solid var(--color-navy-300)',
    borderRadius: 'var(--radius-md)', fontSize: '13px', minWidth: '180px',
    color: 'var(--color-navy-700)', background: 'white',
  };

  return (
    <div>
      <PageHeader
        title="Audit Log"
        actions={isAdmin ? (
          <Button variant="secondary" onClick={handleExport}>Export CSV</Button>
        ) : undefined}
      />

      {/* Filters */}
      <div style={{
        display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap',
        padding: '16px 20px',
        background: 'white',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--color-navy-200)',
        boxShadow: 'var(--shadow-xs)',
      }}>
        <input
          type="text"
          placeholder="Filter by action..."
          value={filters.action}
          onChange={e => setFilters(p => ({ ...p, action: e.target.value }))}
          style={inputStyle}
        />
        <input
          type="text"
          placeholder="Filter by entity type..."
          value={filters.entityType}
          onChange={e => setFilters(p => ({ ...p, entityType: e.target.value }))}
          style={inputStyle}
        />
        <input
          type="date"
          value={filters.from}
          onChange={e => setFilters(p => ({ ...p, from: e.target.value }))}
          style={{ ...inputStyle, minWidth: 'auto' }}
        />
        <input
          type="date"
          value={filters.to}
          onChange={e => setFilters(p => ({ ...p, to: e.target.value }))}
          style={{ ...inputStyle, minWidth: 'auto' }}
        />
        {(filters.action || filters.entityType || filters.from || filters.to) && (
          <Button variant="ghost" size="sm" onClick={() => setFilters({ action: '', entityType: '', from: '', to: '' })}>
            Clear filters
          </Button>
        )}
      </div>

      <Card>
        <Table
          loading={isLoading}
          data={logs}
          columns={[
            { key: 'createdAt', header: 'Timestamp', render: r => <span style={{ fontSize: '12px' }}>{format(new Date(r.createdAt), 'dd MMM yyyy HH:mm:ss')}</span>, width: '170px' },
            { key: 'action', header: 'Action', render: r => <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--color-accent)', fontWeight: 500 }}>{r.action}</span> },
            { key: 'entityType', header: 'Entity', width: '160px' },
            { key: 'entityId', header: 'Entity ID', render: r => <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--color-navy-400)' }}>{r.entityId?.substring(0, 8)}...</span>, width: '110px' },
            { key: 'user', header: 'User', render: r => r.user ? `${r.user.name} <${r.user.email}>` : '\u2014' },
            { key: 'ipAddress', header: 'IP', render: r => <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--color-navy-500)' }}>{r.ipAddress || '\u2014'}</span>, width: '120px' },
          ]}
          emptyMessage="No audit log entries found."
        />
        {pagination && (
          <Pagination page={page} totalPages={pagination.totalPages} total={pagination.total} onPageChange={setPage} />
        )}
      </Card>
    </div>
  );
}
