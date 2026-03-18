import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { deepIngestionApi } from '../../api/client';

const card: React.CSSProperties = { background: 'white', borderRadius: '8px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' };
const th: React.CSSProperties = { padding: '10px 12px', textAlign: 'left', fontSize: '13px', color: '#64748b', fontWeight: 600, borderBottom: '2px solid #e2e8f0' };
const td: React.CSSProperties = { padding: '10px 12px', fontSize: '13px', borderBottom: '1px solid #f1f5f9' };
const btn = (bg: string): React.CSSProperties => ({ background: bg, color: 'white', border: 'none', padding: '6px 14px', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' });

const statusColors: Record<string, string> = { VERIFIED: '#16a34a', UPDATED: '#3D3DFF', CREATED: '#8b5cf6', UNVERIFIED: '#dc2626' };

function ConfidenceBar({ score }: { score: number }) {
  const color = score >= 90 ? '#16a34a' : score >= 70 ? '#3D3DFF' : score >= 50 ? '#d97706' : '#dc2626';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <div style={{ width: '60px', height: '6px', background: '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
        <div style={{ width: `${score}%`, height: '100%', background: color, borderRadius: '3px' }} />
      </div>
      <span style={{ fontSize: '12px', color, fontWeight: 600 }}>{score}</span>
    </div>
  );
}

export default function DeepIngestionPage() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<'status' | 'results'>('status');
  const [statusFilter, setStatusFilter] = useState<string>('');

  const { data: statusData, isLoading: statusLoading } = useQuery({ queryKey: ['di-status'], queryFn: deepIngestionApi.getStatus });
  const { data: resultsData, isLoading: resultsLoading } = useQuery({
    queryKey: ['di-results', statusFilter],
    queryFn: () => deepIngestionApi.getResults(statusFilter ? { validation_status: statusFilter } : {}),
  });

  const runAllMutation = useMutation({ mutationFn: deepIngestionApi.runAll, onSuccess: () => qc.invalidateQueries({ queryKey: ['di-status'] }) });
  const confirmMutation = useMutation({ mutationFn: deepIngestionApi.confirmResult, onSuccess: () => qc.invalidateQueries({ queryKey: ['di-results'] }) });
  const rejectMutation = useMutation({ mutationFn: deepIngestionApi.rejectResult, onSuccess: () => qc.invalidateQueries({ queryKey: ['di-results'] }) });

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '10px 20px', cursor: 'pointer', fontWeight: active ? 700 : 400,
    borderBottom: active ? '3px solid var(--color-accent)' : '3px solid transparent',
    color: active ? 'var(--color-primary)' : '#64748b', fontSize: '14px', background: 'none', border: 'none',
  });

  const byFramework = statusData?.byFramework || [];

  return (
    <div style={{ padding: '24px', maxWidth: '1200px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '22px', color: 'var(--color-primary)' }}>Deep Ingestion</h1>
          <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '14px' }}>Layer 3 — Validate every rule against source legislation using AI</p>
        </div>
        <button style={btn('#3D3DFF')} onClick={() => runAllMutation.mutate()} disabled={runAllMutation.isPending}>
          {runAllMutation.isPending ? 'Running...' : 'Run Full Ingestion'}
        </button>
      </div>

      {runAllMutation.data && (
        <div style={{ ...card, marginBottom: '16px', background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
          <p style={{ margin: 0, fontSize: '14px', color: '#166534' }}>Ingestion started — check status for progress.</p>
        </div>
      )}

      <div style={{ borderBottom: '1px solid #e2e8f0', marginBottom: '24px', display: 'flex', gap: '4px' }}>
        <button style={tabStyle(activeTab === 'status')} onClick={() => setActiveTab('status')}>Framework Status</button>
        <button style={tabStyle(activeTab === 'results')} onClick={() => setActiveTab('results')}>Validation Results ({resultsData?.pagination?.total || 0})</button>
      </div>

      {/* STATUS TAB */}
      {activeTab === 'status' && (
        <div style={card}>
          {statusLoading ? <p>Loading...</p> : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>Framework</th>
                  <th style={th}>Documents</th>
                  <th style={th}>Last Ingested</th>
                  <th style={th}>Verified</th>
                  <th style={th}>Updated</th>
                  <th style={th}>Created</th>
                  <th style={th}>Unverified</th>
                  <th style={th}>Progress</th>
                </tr>
              </thead>
              <tbody>
                {byFramework.map((fw: any) => {
                  const total = fw.verified + fw.updated + fw.created + fw.unverified;
                  const pct = total > 0 ? Math.round(((fw.verified + fw.updated) / total) * 100) : 0;
                  return (
                    <tr key={fw.framework}>
                      <td style={{ ...td, fontWeight: 700 }}>{fw.framework}</td>
                      <td style={td}>{fw.documents}</td>
                      <td style={{ ...td, fontSize: '12px', color: '#64748b' }}>{fw.lastIngested ? new Date(fw.lastIngested).toLocaleString() : 'Never'}</td>
                      <td style={{ ...td, color: '#16a34a', fontWeight: 600 }}>{fw.verified}</td>
                      <td style={{ ...td, color: '#3D3DFF', fontWeight: 600 }}>{fw.updated}</td>
                      <td style={{ ...td, color: '#8b5cf6', fontWeight: 600 }}>{fw.created}</td>
                      <td style={{ ...td, color: fw.unverified > 0 ? '#dc2626' : '#64748b', fontWeight: 600 }}>{fw.unverified}</td>
                      <td style={td}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <div style={{ width: '80px', height: '8px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                            <div style={{ width: `${pct}%`, height: '100%', background: pct >= 80 ? '#16a34a' : pct >= 50 ? '#d97706' : '#dc2626', borderRadius: '4px' }} />
                          </div>
                          <span style={{ fontSize: '12px', color: '#64748b' }}>{pct}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {byFramework.length === 0 && <tr><td colSpan={8} style={{ ...td, textAlign: 'center', color: '#94a3b8' }}>No ingestion data yet — run full ingestion to start</td></tr>}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* RESULTS TAB */}
      {activeTab === 'results' && (
        <div style={card}>
          <div style={{ marginBottom: '16px', display: 'flex', gap: '8px' }}>
            {['', 'VERIFIED', 'UPDATED', 'CREATED', 'UNVERIFIED'].map(s => (
              <button
                key={s || 'all'}
                onClick={() => setStatusFilter(s)}
                style={{
                  padding: '4px 12px', borderRadius: '4px', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                  background: statusFilter === s ? (statusColors[s] || '#0C1445') : '#f1f5f9',
                  color: statusFilter === s ? 'white' : '#64748b',
                  border: 'none',
                }}
              >
                {s || 'All'}
              </button>
            ))}
          </div>

          {resultsLoading ? <p>Loading...</p> : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>Rule Code</th>
                  <th style={th}>Framework</th>
                  <th style={th}>Status</th>
                  <th style={th}>Confidence</th>
                  <th style={th}>Source Article</th>
                  <th style={th}>Obligation</th>
                  <th style={th}></th>
                </tr>
              </thead>
              <tbody>
                {(resultsData?.data || []).map((r: any) => (
                  <tr key={r.id} style={{ background: r.validationStatus === 'UNVERIFIED' ? '#fef2f2' : undefined }}>
                    <td style={{ ...td, fontWeight: 600 }}>{r.ruleCode || '—'}</td>
                    <td style={td}>{r.framework}</td>
                    <td style={td}>
                      <span style={{
                        background: statusColors[r.validationStatus] || '#64748b',
                        color: 'white', padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600,
                      }}>{r.validationStatus}</span>
                    </td>
                    <td style={td}><ConfidenceBar score={r.confidenceScore} /></td>
                    <td style={{ ...td, fontSize: '12px' }}>{r.sourceArticle || '—'}</td>
                    <td style={{ ...td, maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.extractedObligation}>{r.extractedObligation}</td>
                    <td style={td}>
                      {r.validationStatus === 'UNVERIFIED' && !r.adminReviewed && (
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button style={{ ...btn('#16a34a'), padding: '3px 8px', fontSize: '11px' }} onClick={() => confirmMutation.mutate(r.id)}>Confirm</button>
                          <button style={{ ...btn('#dc2626'), padding: '3px 8px', fontSize: '11px' }} onClick={() => rejectMutation.mutate(r.id)}>Reject</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {(!resultsData?.data || resultsData.data.length === 0) && (
                  <tr><td colSpan={7} style={{ ...td, textAlign: 'center', color: '#94a3b8' }}>No validation results yet</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
