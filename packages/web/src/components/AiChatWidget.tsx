import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth';
import { aiAssistantApi } from '../api/client';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const API_BASE = import.meta.env.VITE_API_URL || '/api/v1';

const suggestedPrompts = [
  'Why did my compliance score change?',
  'What are my most urgent actions?',
  'Explain my latest finding',
  'When is my next reconciliation due?',
  'Am I compliant with my framework?',
];

export default function AiChatWidget() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [proactiveAlert, setProactiveAlert] = useState<string | null>(null);
  const [sessionId] = useState(() => `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
  const [hasShownProactive, setHasShownProactive] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const firmId = user?.firmId;

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Load proactive alert on first open
  useEffect(() => {
    if (open && !hasShownProactive && firmId) {
      setHasShownProactive(true);
      aiAssistantApi.getProactiveAlert(firmId).then(data => {
        if (data.alert) {
          setProactiveAlert(data.alert);
          setMessages([{ role: 'assistant', content: data.alert }]);
        }
      }).catch(() => {});
    }
  }, [open, hasShownProactive, firmId]);

  // Focus input when opened
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || streaming || !firmId) return;

    const userMsg: Message = { role: 'user', content: text.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setStreaming(true);

    // Start streaming assistant response
    const assistantMsg: Message = { role: 'assistant', content: '' };
    setMessages(prev => [...prev, assistantMsg]);

    try {
      const token = localStorage.getItem('access_token');
      const response = await fetch(`${API_BASE}/firms/${firmId}/ai-assistant/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
          context_type: 'general',
          session_id: sessionId,
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: { message: 'Request failed' } }));
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: 'assistant', content: err.error?.message || 'Something went wrong. Please try again.' };
          return updated;
        });
        setStreaming(false);
        return;
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) throw new Error('No reader');

      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === 'chunk') {
              setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = {
                  role: 'assistant',
                  content: updated[updated.length - 1].content + data.content,
                };
                return updated;
              });
            }
          } catch {}
        }
      }
    } catch (err) {
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: 'assistant', content: 'Connection error. Please try again.' };
        return updated;
      });
    }

    setStreaming(false);
  }, [messages, streaming, firmId, sessionId]);

  const clearChat = () => {
    setMessages([]);
    setProactiveAlert(null);
    if (firmId) aiAssistantApi.clearHistory(firmId).catch(() => {});
  };

  if (!user || user.role === 'BANK_VIEWER') return null;

  // Floating button
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="AI Compliance Assistant"
        style={{
          position: 'fixed', bottom: '24px', right: '24px', width: '56px', height: '56px',
          borderRadius: '50%', border: 'none', cursor: 'pointer', zIndex: 9999,
          background: 'linear-gradient(135deg, #3D3DFF 0%, #6366f1 100%)',
          boxShadow: '0 4px 16px rgba(61,61,255,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'transform 0.2s, box-shadow 0.2s',
          animation: 'pulse 2s infinite',
        }}
        onMouseEnter={e => { (e.target as HTMLElement).style.transform = 'scale(1.1)'; }}
        onMouseLeave={e => { (e.target as HTMLElement).style.transform = 'scale(1)'; }}
      >
        <span style={{ fontSize: '24px', color: 'white' }}>&#10024;</span>
      </button>
    );
  }

  // Chat panel
  return (
    <div style={{
      position: 'fixed', bottom: '24px', right: '24px', width: '420px', height: '560px',
      borderRadius: '16px', background: 'white', zIndex: 9999,
      boxShadow: '0 8px 32px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column',
      overflow: 'hidden', animation: 'slideUp 0.3s ease-out',
    }}>
      {/* Header */}
      <div style={{
        background: 'linear-gradient(135deg, #0C1445 0%, #1a2366 100%)',
        padding: '16px', color: 'white',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '18px' }}>&#10024;</span>
            <div>
              <div style={{ fontWeight: 600, fontSize: '14px' }}>AI Compliance Assistant</div>
              <div style={{ fontSize: '11px', opacity: 0.7, display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
                Online
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={clearChat} title="Clear" style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: 'white', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer', fontSize: '11px' }}>Clear</button>
            <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: '18px', padding: '0 4px' }}>&times;</button>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', background: '#f8f9fa' }}>
        {messages.length === 0 && (
          <div>
            <div style={{ textAlign: 'center', color: '#9ca3af', fontSize: '13px', marginBottom: '16px', marginTop: '16px' }}>
              Ask me anything about your compliance status
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {suggestedPrompts.map((prompt, i) => (
                <button key={i} onClick={() => sendMessage(prompt)} style={{
                  padding: '10px 14px', background: 'white', border: '1px solid #e5e7eb',
                  borderRadius: '8px', textAlign: 'left', cursor: 'pointer', fontSize: '13px',
                  color: '#374151', transition: 'border-color 0.15s',
                }}
                onMouseEnter={e => { (e.target as HTMLElement).style.borderColor = '#3D3DFF'; }}
                onMouseLeave={e => { (e.target as HTMLElement).style.borderColor = '#e5e7eb'; }}
                >{prompt}</button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} style={{
            display: 'flex',
            justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
          }}>
            <div style={{
              maxWidth: '85%',
              padding: '10px 14px',
              borderRadius: msg.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
              background: msg.role === 'user' ? '#3D3DFF' : 'white',
              color: msg.role === 'user' ? 'white' : '#1f2937',
              fontSize: '13px',
              lineHeight: '1.5',
              boxShadow: msg.role === 'assistant' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}>
              {msg.content || (streaming && i === messages.length - 1 ? (
                <span style={{ opacity: 0.5 }}>Thinking...</span>
              ) : '')}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div style={{ padding: '12px 16px', borderTop: '1px solid #e5e7eb', background: 'white' }}>
        <form onSubmit={e => { e.preventDefault(); sendMessage(input); }} style={{ display: 'flex', gap: '8px' }}>
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Ask about your compliance..."
            disabled={streaming}
            style={{
              flex: 1, padding: '10px 14px', border: '1px solid #d1d5db', borderRadius: '8px',
              fontSize: '13px', outline: 'none',
            }}
            onFocus={e => { e.target.style.borderColor = '#3D3DFF'; }}
            onBlur={e => { e.target.style.borderColor = '#d1d5db'; }}
          />
          <button type="submit" disabled={streaming || !input.trim()} style={{
            padding: '10px 16px', background: streaming || !input.trim() ? '#9ca3af' : '#3D3DFF',
            color: 'white', border: 'none', borderRadius: '8px', cursor: streaming ? 'not-allowed' : 'pointer',
            fontWeight: 600, fontSize: '13px',
          }}>Send</button>
        </form>
      </div>

      {/* CSS animations */}
      <style>{`
        @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse { 0%, 100% { box-shadow: 0 4px 16px rgba(61,61,255,0.4); } 50% { box-shadow: 0 4px 24px rgba(61,61,255,0.6); } }
      `}</style>
    </div>
  );
}
