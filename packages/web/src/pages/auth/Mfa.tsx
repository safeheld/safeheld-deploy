import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

export default function MfaPage() {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [qrData, setQrData] = useState<{ qrCodeDataUrl: string; secret: string } | null>(null);
  const [setupLoading, setSetupLoading] = useState(false);

  const { setupMfa, verifyMfa } = useAuth();
  const navigate = useNavigate();

  const tempToken = sessionStorage.getItem('temp_token') || '';
  const isSetupRequired = sessionStorage.getItem('mfa_setup_required') === 'true';

  useEffect(() => {
    if (!tempToken) {
      navigate('/login');
      return;
    }

    if (isSetupRequired) {
      setSetupLoading(true);
      setupMfa(tempToken)
        .then(setQrData)
        .catch(() => { setError('Failed to initiate MFA setup. Please log in again.'); })
        .finally(() => setSetupLoading(false));
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await verifyMfa(tempToken, code, isSetupRequired);
      sessionStorage.removeItem('temp_token');
      sessionStorage.removeItem('mfa_setup_required');
      navigate('/dashboard');
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      setError(message || 'Invalid code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--color-navy-900)', padding: '20px',
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute',
        width: '600px', height: '600px',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(99,102,241,0.15) 0%, transparent 70%)',
        top: '-100px', right: '-100px',
        pointerEvents: 'none',
      }} />

      <div style={{
        background: 'white', borderRadius: 'var(--radius-xl)', padding: '48px',
        width: '100%', maxWidth: '440px', boxShadow: 'var(--shadow-xl)',
        border: '1px solid var(--color-navy-200)', position: 'relative',
      }}>
        <div style={{
          width: '44px', height: '44px',
          background: 'var(--color-accent)',
          borderRadius: 'var(--radius-lg)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 20px',
          boxShadow: '0 4px 12px rgb(99 102 241 / 0.3)',
        }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
        </div>

        <h2 style={{
          fontSize: '20px', fontWeight: 700,
          color: 'var(--color-navy-900)',
          marginTop: 0, marginBottom: '8px',
          textAlign: 'center', letterSpacing: '-0.02em',
        }}>
          {isSetupRequired ? 'Set up Two-Factor Auth' : 'Two-Factor Authentication'}
        </h2>
        <p style={{
          color: 'var(--color-navy-500)', fontSize: '13px',
          marginTop: 0, marginBottom: '28px', textAlign: 'center',
          lineHeight: 1.5,
        }}>
          {isSetupRequired
            ? 'Scan the QR code with your authenticator app, then enter the 6-digit code.'
            : 'Enter the 6-digit code from your authenticator app.'}
        </p>

        {setupLoading && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div className="spinner" style={{ margin: '0 auto' }} />
          </div>
        )}

        {qrData && (
          <div style={{ textAlign: 'center', marginBottom: '28px' }}>
            <div style={{
              background: 'var(--color-navy-50)',
              borderRadius: 'var(--radius-lg)',
              padding: '20px',
              border: '1px solid var(--color-navy-200)',
              display: 'inline-block',
            }}>
              <img src={qrData.qrCodeDataUrl} alt="QR Code" style={{ width: '180px', height: '180px' }} />
            </div>
            <div style={{
              marginTop: '16px', padding: '10px 16px',
              background: 'var(--color-navy-50)',
              borderRadius: 'var(--radius-md)',
              fontFamily: 'var(--font-mono)', fontSize: '13px',
              letterSpacing: '2px', color: 'var(--color-navy-700)',
              border: '1px solid var(--color-navy-200)',
            }}>
              {qrData.secret}
            </div>
            <p style={{ fontSize: '11px', color: 'var(--color-navy-400)', marginTop: '8px' }}>
              Manual entry code if QR scan fails
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <label style={{
              display: 'block', fontSize: '13px', fontWeight: 500,
              color: 'var(--color-navy-700)', marginBottom: '6px',
            }}>
              Authentication Code
            </label>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              required
              autoFocus
              placeholder="000000"
              style={{
                width: '100%', padding: '14px 16px', boxSizing: 'border-box',
                border: '1px solid var(--color-navy-300)', borderRadius: 'var(--radius-md)',
                fontSize: '24px', textAlign: 'center', letterSpacing: '8px',
                fontFamily: 'var(--font-mono)', outline: 'none',
                color: 'var(--color-navy-800)',
                transition: 'border-color var(--transition-fast), box-shadow var(--transition-fast)',
              }}
              onFocus={e => {
                e.target.style.borderColor = 'var(--color-accent)';
                e.target.style.boxShadow = '0 0 0 3px rgb(99 102 241 / 0.1)';
              }}
              onBlur={e => {
                e.target.style.borderColor = 'var(--color-navy-300)';
                e.target.style.boxShadow = 'none';
              }}
            />
          </div>

          {error && (
            <div style={{
              padding: '12px 16px', background: 'var(--color-danger-light)',
              border: '1px solid #fecaca', borderRadius: 'var(--radius-md)',
              color: '#991b1b', fontSize: '13px',
              display: 'flex', alignItems: 'center', gap: '8px',
            }}>
              <span>{'\u26D4'}</span>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || code.length !== 6}
            style={{
              width: '100%', padding: '11px',
              background: loading || code.length !== 6 ? 'var(--color-accent-muted)' : 'var(--color-accent)',
              color: 'white', border: 'none', borderRadius: 'var(--radius-md)',
              fontSize: '14px', fontWeight: 600,
              cursor: loading || code.length !== 6 ? 'not-allowed' : 'pointer',
              boxShadow: '0 1px 3px rgb(99 102 241 / 0.3)',
            }}
          >
            {loading ? 'Verifying...' : 'Verify Code'}
          </button>

          <button
            type="button"
            onClick={() => navigate('/login')}
            style={{
              background: 'none', border: 'none',
              color: 'var(--color-navy-500)',
              fontSize: '13px', cursor: 'pointer', padding: '0',
              fontWeight: 500,
            }}
          >
            {'\u2190'} Back to login
          </button>
        </form>
      </div>
    </div>
  );
}
