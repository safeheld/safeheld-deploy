import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { regMonitorApi } from '../../api/client';

const card: React.CSSProperties = { background: 'white', borderRadius: '8px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' };
const th: React.CSSProperties = { padding: '10px 12px', textAlign: 'left', fontSize: '13px', color: '#64748b', fontWeight: 600, borderBottom: '2px solid #e2e8f0' };
const td: React.CSSProperties = { padding: '10px 12px', fontSize: '14px', borderBottom: '1px solid #f1f5f9' };
const btn = (bg: string): React.CSSProperties => ({ background: bg, color: 'white', border: 'none', padding: '6px 14px', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' });

function severityColor(s: string) {
  return s === 'CRITICAL' ? '#dc2626' : s === 'HIGH' ? '#ea580c' : s === 'MEDIUM' ? '#d97706' : '#16a34a';
}

function statusDot(source: any) {
  const lastEvent = source.changeEvents?.[0];
  if (!lastEvent) return { color: '#16a34a', label: 'No changes' };
  if (lastEvent.status === 'PROPOSED' || lastEvent.status === 'DETECTED' || lastEvent.status === 'ANALYSED') return { color: '#d97706', label: 'Changes pending' };
  if (['APPROVED', 'APPLIED'].includes(lastEvent.status)) return { color: '#16a34a', label: 'Applied' };
  return { color: '#64748b', label: lastEvent.status };
}

export default function RegMonitorPage() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<'sources' | 'events' | 'proposals'>('sources');
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const { data: sources, isLoading: sourcesLoading } = useQuery({ queryKey: ['reg-sources'], queryFn: regMonitorApi.getSources });
  const { data: eventsData, isLoading: eventsLoading } = useQuery({ queryKey: ['reg-events'], queryFn: () => regMonitorApi.getEvents() });
  const { data: proposalsData, isLoading: proposalsLoading } = useQuery({ queryKey: ['reg-proposals'], queryFn: () => regMonitorApi.getProposals({ status: 'PENDING' }) });

  const checkMutation = useMutation({ mutationFn: regMonitorApi.checkSource, onSuccess: () => qc.invalidateQueries({ queryKey: ['reg-sources'] }) });
  const runMutation = useMutation({ mutationFn: regMonitorApi.runFullMonitor, onSuccess: () => { qc.invalidateQueries({ queryKey: ['reg-sources'] }); qc.invalidateQueries({ queryKey: ['reg-events'] }); } });
  const approveMutation = useMutation({ mutationFn: regMonitorApi.approveProposal, onSuccess: () => qc.invalidateQueries({ queryKey: ['reg-proposals'] }) });
  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => regMonitorApi.rejectProposal(id, reason),
    onSuccess: () => { setRejectId(null); setRejectReason(''); qc.invalidateQueries({ queryKey: ['reg-proposals'] }); },
  });

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '10px 20px', cursor: 'pointer', fontWeight: active ? 700 : 400,
    borderBottom: active ? '3px solid var(--color-accent)' : '3px solid transparent',
    color: active ? 'var(--color-primary)' : '#64748b', fontSize: '14px', background: 'none', border: 'none',
  });

  return (
    <div style={{ padding: '24px', maxWidth: '1200px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '22px', color: 'var(--color-primary)' }}>Regulatory Monitor</h1>
          <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '14px' }}>AI-powered monitoring of regulatory sources across all frameworks</p>
        </div>
        <button style={btn('#3D3DFF')} onClick={() => runMutation.mutate()} disabled={runMutation.isPending}>
          {runMutation.isPending ? 'Running...' : 'Run Full Scan'}
        </button>
      </div>

      {runMutation.data && (
        <div style={{ ...card, marginBottom: '16px', background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
          <p style={{ margin: 0, fontSize: '14px', color: '#166534' }}>
            Scan complete: {(runMutation.data as any).checked} checked, {(runMutation.data as any).changed} changed, {(runMutation.data as any).errors} errors
          </p>
        </div>
      )}

      <div style={{ borderBottom: '1px solid #e2e8f0', marginBottom: '24px', display: 'flex', gap: '4px' }}>
        <button style={tabStyle(activeTab === 'sources')} onClick={() => setActiveTab('sources')}>Sources ({sources?.length || 0})</button>
        <button style={tabStyle(activeTab === 'events')} onClick={() => setActiveTab('events')}>Change Events ({eventsData?.pagination?.total || 0})</button>
        <button style={tabStyle(activeTab === 'proposals')} onClick={() => setActiveTab('proposals')}>Pending Proposals ({proposalsData?.pagination?.total || 0})</button>
      </div>

      {/* ── SOURCES TAB ── */}
      {activeTab === 'sources' && (
        <div style={card}>
          {sourcesLoading ? <p>Loading...</p> : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>Status</th>
                  <th style={th}>Framework</th>
                  <th style={th}>Source</th>
                  <th style={th}>Jurisdiction</th>
                  <th style={th}>Frequency</th>
                  <th style={th}>Last Checked</th>
                  <th style={th}>Changes</th>
                  <th style={th}></th>
                </tr>
              </thead>
              <tbody>
                {(sources || []).map((s: any) => {
                  const dot = statusDot(s);
                  return (
                    <tr key={s.id}>
                      <td style={td}><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: dot.color }} title={dot.label} /></td>
                      <td style={{ ...td, fontWeight: 600 }}>{s.framework}</td>
                      <td style={td}>
                        <a href={s.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#3D3DFF', textDecoration: 'none', fontSize: '13px' }}>{s.sourceName}</a>
                      </td>
                      <td style={td}>{s.jurisdiction}</td>
                      <td style={td}><span style={{ fontSize: '12px', background: '#f1f5f9', padding: '2px 8px', borderRadius: '4px' }}>{s.monitorFrequency}</span></td>
                      <td style={{ ...td, fontSize: '13px', color: '#64748b' }}>{s.lastChecked ? new Date(s.lastChecked).toLocaleString() : 'Never'}</td>
                      <td style={td}>{s._count?.changeEvents || 0}</td>
                      <td style={td}>
                        <button style={{ ...btn('#0C1445'), fontSize: '12px', padding: '4px 10px' }} onClick={() => checkMutation.mutate(s.id)} disabled={checkMutation.isPending}>
                          Check Now
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── EVENTS TAB ── */}
      {activeTab === 'events' && (
        <div style={card}>
          {eventsLoading ? <p>Loading...</p> : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>Detected</th>
                  <th style={th}>Framework</th>
                  <th style={th}>Source</th>
                  <th style={th}>Summary</th>
                  <th style={th}>Proposals</th>
                  <th style={th}>Status</th>
                </tr>
              </thead>
              <tbody>
                {(eventsData?.data || []).map((e: any) => (
                  <tr key={e.id}>
                    <td style={{ ...td, fontSize: '13px', whiteSpace: 'nowrap' }}>{new Date(e.detectedAt).toLocaleString()}</td>
                    <td style={{ ...td, fontWeight: 600 }}>{e.source?.framework}</td>
                    <td style={{ ...td, fontSize: '13px' }}>{e.source?.sourceName}</td>
                    <td style={{ ...td, fontSize: '13px', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.changeSummary || '—'}</td>
                    <td style={td}>{e._count?.proposals || 0}</td>
                    <td style={td}><span style={{ fontSize: '12px', background: e.status === 'APPLIED' ? '#dcfce7' : e.status === 'PROPOSED' ? '#fef3c7' : '#f1f5f9', padding: '2px 8px', borderRadius: '4px' }}>{e.status}</span></td>
                  </tr>
                ))}
                {(!eventsData?.data || eventsData.data.length === 0) && <tr><td colSpan={6} style={{ ...td, textAlign: 'center', color: '#94a3b8' }}>No change events yet</td></tr>}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── PROPOSALS TAB ── */}
      {activeTab === 'proposals' && (
        <div style={card}>
          {proposalsLoading ? <p>Loading...</p> : (
            <>
              {(proposalsData?.data || []).map((p: any) => (
                <div key={p.id} style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <span style={{ fontWeight: 700, fontSize: '15px', marginRight: '8px' }}>{p.ruleCode}</span>
                      <span style={{ background: severityColor(p.severity), color: 'white', padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600 }}>{p.severity}</span>
                      <span style={{ marginLeft: '8px', fontSize: '12px', color: '#64748b' }}>{p.proposedChangeType} | {p.framework}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button style={btn('#16a34a')} onClick={() => approveMutation.mutate(p.id)} disabled={approveMutation.isPending}>Approve</button>
                      <button style={btn('#dc2626')} onClick={() => setRejectId(p.id)}>Reject</button>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '12px' }}>
                    <div>
                      <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 600, marginBottom: '4px' }}>CURRENT RULE</div>
                      <div style={{ background: '#fef2f2', padding: '10px', borderRadius: '6px', fontSize: '13px', lineHeight: '1.5', minHeight: '60px' }}>
                        {p.currentRuleText || <em style={{ color: '#94a3b8' }}>New rule — no current text</em>}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 600, marginBottom: '4px' }}>PROPOSED CHANGE</div>
                      <div style={{ background: '#f0fdf4', padding: '10px', borderRadius: '6px', fontSize: '13px', lineHeight: '1.5', minHeight: '60px' }}>{p.proposedRuleText}</div>
                    </div>
                  </div>

                  <div style={{ marginTop: '8px', fontSize: '13px', color: '#475569' }}>
                    <strong>Rationale:</strong> {p.changeRationale}
                  </div>
                  {p.effectiveDate && <div style={{ marginTop: '4px', fontSize: '12px', color: '#64748b' }}>Effective: {new Date(p.effectiveDate).toLocaleDateString()}</div>}

                  {rejectId === p.id && (
                    <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
                      <input
                        value={rejectReason}
                        onChange={e => setRejectReason(e.target.value)}
                        placeholder="Rejection reason..."
                        style={{ flex: 1, padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px' }}
                      />
                      <button style={btn('#dc2626')} onClick={() => rejectMutation.mutate({ id: p.id, reason: rejectReason })} disabled={!rejectReason || rejectMutation.isPending}>
                        Confirm Reject
                      </button>
                      <button style={{ ...btn('#64748b') }} onClick={() => { setRejectId(null); setRejectReason(''); }}>Cancel</button>
                    </div>
                  )}
                </div>
              ))}
              {(!proposalsData?.data || proposalsData.data.length === 0) && (
                <p style={{ textAlign: 'center', color: '#94a3b8', padding: '32px 0' }}>No pending proposals</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
