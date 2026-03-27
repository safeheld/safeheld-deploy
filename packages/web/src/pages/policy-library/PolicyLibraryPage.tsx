import React, { useState, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../hooks/useAuth';
import { policyLibraryApi } from '../../api/client';
import { Card, Table, Button, PageHeader, Modal, Alert, statusBadge, Badge, LoadingSkeleton, ErrorState } from '../../components/ui';
import { format } from 'date-fns';

const DOCUMENT_TYPES = [
  'SAFEGUARDING_POLICY', 'CASS_RESOLUTION_PLAN', 'WIND_DOWN_PLAN',
  'BUSINESS_CONTINUITY', 'DISASTER_RECOVERY', 'BOARD_REPORTING_POLICY',
  'RECONCILIATION_PROCEDURE', 'BREACH_MANAGEMENT_POLICY', 'OUTSOURCING_POLICY',
  'AML_POLICY', 'OTHER',
];

const SUGGESTED_PROMPTS = [
  'What are the key requirements of our safeguarding policy?',
  'When was the last board approval for our CASS resolution plan?',
  'Summarise our breach management procedures.',
  'What are the reconciliation frequency requirements?',
];

export default function PolicyLibraryPage() {
  const { user } = useAuth();
  const firmId = user!.firmId;
  const queryClient = useQueryClient();
  const isComplianceOrAdmin = ['COMPLIANCE_OFFICER', 'ADMIN'].includes(user!.role);

  const [activeTab, setActiveTab] = useState<'documents' | 'checklist' | 'chat'>('documents');

  // Upload modal
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadForm, setUploadForm] = useState({
    documentType: 'SAFEGUARDING_POLICY', title: '', reviewFrequencyMonths: '12',
    boardApproved: false, boardApprovalDate: '', textContent: '',
  });
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  // Chat
  const [chatMessages, setChatMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState('');
  const chatSessionId = useRef(`session-${Date.now()}`);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const { data: policiesData, isLoading: policiesLoading, error: policiesError, refetch: policiesRefetch } = useQuery({
    queryKey: ['policy-library', firmId],
    queryFn: () => policyLibraryApi.getPolicies(firmId),
    enabled: activeTab === 'documents',
  });

  const { data: reviewAlerts } = useQuery({
    queryKey: ['policy-review-alerts', firmId],
    queryFn: () => policyLibraryApi.getReviewAlerts(firmId),
    enabled: activeTab === 'documents',
  });

  const { data: checklistData, isLoading: checklistLoading } = useQuery({
    queryKey: ['policy-checklist', firmId],
    queryFn: () => policyLibraryApi.getChecklist(firmId),
    enabled: activeTab === 'checklist',
  });

  const uploadPolicyMutation = useMutation({
    mutationFn: () => {
      const formData = new FormData();
      formData.append('file', uploadFile!);
      formData.append('documentType', uploadForm.documentType);
      formData.append('title', uploadForm.title);
      if (uploadForm.reviewFrequencyMonths) formData.append('reviewFrequencyMonths', uploadForm.reviewFrequencyMonths);
      formData.append('boardApproved', String(uploadForm.boardApproved));
      if (uploadForm.boardApprovalDate) formData.append('boardApprovalDate', uploadForm.boardApprovalDate);
      if (uploadForm.textContent) formData.append('textContent', uploadForm.textContent);
      return policyLibraryApi.uploadPolicy(firmId, formData);
    },
    onSuccess: () => {
      setShowUploadModal(false);
      setUploadFile(null);
      setUploadForm({ documentType: 'SAFEGUARDING_POLICY', title: '', reviewFrequencyMonths: '12', boardApproved: false, boardApprovalDate: '', textContent: '' });
      queryClient.invalidateQueries({ queryKey: ['policy-library', firmId] });
      queryClient.invalidateQueries({ queryKey: ['policy-checklist', firmId] });
    },
  });

  const sendChatMessage = useCallback(async (question: string) => {
    if (!question.trim()) return;
    setChatError('');
    setChatLoading(true);
    setChatMessages(prev => [...prev, { role: 'user', content: question }]);
    setChatInput('');

    try {
      const token = localStorage.getItem('access_token');
      const apiBase = (import.meta as any).env?.VITE_API_URL || '/api/v1';
      const response = await fetch(`${apiBase}/firms/${firmId}/policy-library/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          question,
          session_id: chatSessionId.current,
        }),
      });

      if (response.status === 503) {
        setChatError('AI assistant is not configured. Please contact your administrator.');
        setChatLoading(false);
        return;
      }

      if (!response.ok) {
        setChatError('Failed to get AI response. Please try again.');
        setChatLoading(false);
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        setChatError('Streaming not supported.');
        setChatLoading(false);
        return;
      }

      let fullContent = '';
      const decoder = new TextDecoder();
      setChatMessages(prev => [...prev, { role: 'assistant', content: '' }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        const lines = text.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === 'chunk') {
                fullContent += data.content;
                setChatMessages(prev => {
                  const updated = [...prev];
                  updated[updated.length - 1] = { role: 'assistant', content: fullContent };
                  return updated;
                });
              } else if (data.type === 'error') {
                setChatError(data.message);
              }
            } catch {
              // ignore parse errors on partial chunks
            }
          }
        }
      }
    } catch (err: any) {
      setChatError(err.message || 'Failed to connect to AI assistant.');
    } finally {
      setChatLoading(false);
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [firmId]);

  const tabs = [
    { id: 'documents', label: 'Documents' },
    { id: 'checklist', label: 'Required Checklist' },
    { id: 'chat', label: 'AI Chat' },
  ];

  const policies = policiesData?.data || policiesData || [];
  const alerts = reviewAlerts || [];
  const checklist = checklistData || [];

  return (
    <div>
      <PageHeader title="Policy Library" />

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

      {activeTab === 'documents' && policiesError && (
        <ErrorState message="Failed to load policy documents." onRetry={() => policiesRefetch()} />
      )}
      {activeTab === 'documents' && policiesLoading && <LoadingSkeleton type="table" />}
      {activeTab === 'documents' && !policiesError && !policiesLoading && (
        <div>
          {/* Review alerts */}
          {Array.isArray(alerts) && alerts.length > 0 && (
            <div style={{ marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {alerts.map((alert: any, i: number) => (
                <Alert key={i} type="warning" message={alert.message || `${alert.title || alert.documentType}: Review overdue`} />
              ))}
            </div>
          )}

          <Card
            title="Policy Documents"
            actions={isComplianceOrAdmin ? (
              <Button onClick={() => setShowUploadModal(true)}>Upload Policy</Button>
            ) : undefined}
          >
            <Table
              loading={policiesLoading}
              data={policies}
              columns={[
                { key: 'documentType', header: 'Type', render: (r: any) => <Badge label={(r.documentType || '').replace(/_/g, ' ')} variant="info" />, width: '180px' },
                { key: 'title', header: 'Title' },
                { key: 'version', header: 'Version', width: '80px' },
                { key: 'status', header: 'Status', render: (r: any) => statusBadge(r.status || 'DRAFT'), width: '100px' },
                { key: 'boardApproved', header: 'Board Approved', render: (r: any) => <Badge label={r.boardApproved ? 'Yes' : 'No'} variant={r.boardApproved ? 'success' : 'neutral'} />, width: '120px' },
                { key: 'nextReviewDue', header: 'Review Due', render: (r: any) => r.nextReviewDue ? format(new Date(r.nextReviewDue), 'dd MMM yyyy') : '—' },
                { key: 'lastReviewedAt', header: 'Last Reviewed', render: (r: any) => r.lastReviewedAt ? format(new Date(r.lastReviewedAt), 'dd MMM yyyy') : '—' },
              ]}
              emptyMessage="No policy documents uploaded yet."
            />
          </Card>
        </div>
      )}

      {activeTab === 'checklist' && checklistLoading && <LoadingSkeleton type="table" />}
      {activeTab === 'checklist' && !checklistLoading && (
        <Card title="Required Policy Documents Checklist">
          {(
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {(Array.isArray(checklist) ? checklist : []).map((item: any, i: number) => (
                <div key={i} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '12px 16px', border: '1px solid var(--color-gray-200)', borderRadius: '6px',
                  background: item.status === 'PRESENT' ? '#f0fdf4' : item.status === 'MISSING' ? '#fef2f2' : 'white',
                }}>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--color-gray-800)' }}>
                      {(item.documentType || item.type || '').replace(/_/g, ' ')}
                    </div>
                    {item.description && (
                      <div style={{ fontSize: '12px', color: 'var(--color-gray-500)', marginTop: '2px' }}>{item.description}</div>
                    )}
                  </div>
                  {statusBadge(item.status || 'MISSING')}
                </div>
              ))}
              {(!Array.isArray(checklist) || checklist.length === 0) && (
                <div style={{ color: 'var(--color-gray-400)', textAlign: 'center', padding: '20px' }}>No checklist data available.</div>
              )}
            </div>
          )}
        </Card>
      )}

      {activeTab === 'chat' && (
        <Card title="AI Policy Assistant">
          {chatError && (
            <div style={{ marginBottom: '12px' }}>
              <Alert type={chatError.includes('not configured') ? 'info' : 'error'} message={chatError} />
            </div>
          )}

          {/* Chat messages */}
          <div style={{
            minHeight: '300px', maxHeight: '500px', overflowY: 'auto',
            border: '1px solid var(--color-gray-200)', borderRadius: '6px',
            padding: '16px', marginBottom: '12px', background: 'var(--color-gray-50)',
          }}>
            {chatMessages.length === 0 && (
              <div style={{ color: 'var(--color-gray-400)', textAlign: 'center', padding: '40px 20px' }}>
                <div style={{ fontSize: '15px', fontWeight: 500, marginBottom: '8px' }}>Ask questions about your policies</div>
                <div style={{ fontSize: '13px' }}>The AI assistant can help you find information in your uploaded policy documents.</div>
              </div>
            )}
            {chatMessages.map((msg, i) => (
              <div key={i} style={{
                marginBottom: '12px',
                display: 'flex',
                justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
              }}>
                <div style={{
                  maxWidth: '80%',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  lineHeight: '1.5',
                  background: msg.role === 'user' ? 'var(--color-primary)' : 'white',
                  color: msg.role === 'user' ? 'white' : 'var(--color-gray-800)',
                  border: msg.role === 'assistant' ? '1px solid var(--color-gray-200)' : 'none',
                  whiteSpace: 'pre-wrap',
                }}>
                  {msg.content || (chatLoading && i === chatMessages.length - 1 ? 'Thinking...' : '')}
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          {/* Suggested prompts */}
          {chatMessages.length === 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
              {SUGGESTED_PROMPTS.map((prompt, i) => (
                <button
                  key={i}
                  onClick={() => sendChatMessage(prompt)}
                  style={{
                    padding: '6px 12px', background: 'white', border: '1px solid var(--color-gray-300)',
                    borderRadius: '16px', fontSize: '12px', cursor: 'pointer', color: 'var(--color-gray-600)',
                  }}
                >
                  {prompt}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(chatInput); } }}
              placeholder="Ask a question about your policies..."
              style={{
                flex: 1, padding: '10px 14px', border: '1px solid var(--color-gray-300)',
                borderRadius: '6px', fontSize: '13px', outline: 'none',
              }}
              disabled={chatLoading}
            />
            <Button onClick={() => sendChatMessage(chatInput)} loading={chatLoading} disabled={!chatInput.trim()}>
              Send
            </Button>
          </div>
        </Card>
      )}

      {/* Upload Policy Modal */}
      <Modal open={showUploadModal} onClose={() => setShowUploadModal(false)} title="Upload Policy Document" width={560}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px' }}>Document Type *</label>
            <select value={uploadForm.documentType} onChange={e => setUploadForm(p => ({ ...p, documentType: e.target.value }))}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--color-gray-300)', borderRadius: '6px', fontSize: '13px', background: 'white' }}>
              {DOCUMENT_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px' }}>Title *</label>
            <input value={uploadForm.title} onChange={e => setUploadForm(p => ({ ...p, title: e.target.value }))}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--color-gray-300)', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px' }}>File *</label>
            <input type="file" accept=".pdf,.doc,.docx,.txt"
              onChange={e => setUploadFile(e.target.files?.[0] || null)}
              style={{ fontSize: '13px' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px' }}>Review Frequency (months)</label>
              <input type="number" value={uploadForm.reviewFrequencyMonths} onChange={e => setUploadForm(p => ({ ...p, reviewFrequencyMonths: e.target.value }))}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--color-gray-300)', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px' }}>Board Approval Date</label>
              <input type="date" value={uploadForm.boardApprovalDate} onChange={e => setUploadForm(p => ({ ...p, boardApprovalDate: e.target.value }))}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--color-gray-300)', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }} />
            </div>
          </div>
          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 500, cursor: 'pointer' }}>
              <input type="checkbox" checked={uploadForm.boardApproved} onChange={e => setUploadForm(p => ({ ...p, boardApproved: e.target.checked }))} />
              Board Approved
            </label>
          </div>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setShowUploadModal(false)}>Cancel</Button>
            <Button onClick={() => uploadPolicyMutation.mutate()} loading={uploadPolicyMutation.isPending}
              disabled={!uploadForm.title || !uploadFile}>
              Upload
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
