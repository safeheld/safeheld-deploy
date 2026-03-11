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
      background: 'linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%)', padding: '20px',
    }}>
      <div style={{
        background: 'white', borderRadius: '12px', padding: '40px',
        width: '100%', maxWidth: '440px', boxShadow: '0 25px 50px rgba(0,0,0,0.3)',
      }}>
        <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#1e40af', marginTop: 0, marginBottom: '8px' }}>
          {isSetupRequired ? 'Set up Two-Factor Authentication' : 'Two-Factor Authentication'}
        </h2>
        <p style={{ color: '#6b7280', fontSize: '13px', marginTop: 0, marginBottom: '24px' }}>
          {isSetupRequired
            ? 'Scan the QR code with your authenticator app, then enter the 6-digit code to confirm.'
            : 'Enter the 6-digit code from your authenticator app.'}
        </p>

        {setupLoading && (
          <p style={{ textAlign: 'center', color: '#6b7280' }}>Loading QR code...</p>
        )}

        {qrData && (
          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <img src={qrData.qrCodeDataUrl} alt="QR Code" style={{ width: '180px', height: '180px' }} />
            <div style={{ marginTop: '12px', padding: '10px', background: '#f9fafb', borderRadius: '6px', fontFamily: 'monospace', fontSize: '13px', letterSpacing: '2px', color: '#374151' }}>
              {qrData.secret}
            </div>
            <p style={{ fontSize: '11px', color: '#9ca3af', marginTop: '6px' }}>
              Manual entry code if QR scan fails
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#374151', marginBottom: '4px' }}>
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
                width: '100%', padding: '12px 16px', boxSizing: 'border-box',
                border: '1px solid #d1d5db', borderRadius: '6px',
                fontSize: '24px', textAlign: 'center', letterSpacing: '8px',
                fontFamily: 'monospace', outline: 'none',
              }}
            />
          </div>

          {error && (
            <div style={{
              padding: '10px 14px', background: '#fee2e2', border: '1px solid #fca5a5',
              borderRadius: '6px', color: '#991b1b', fontSize: '13px',
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || code.length !== 6}
            style={{
              width: '100%', padding: '11px',
              background: loading || code.length !== 6 ? '#93c5fd' : '#1e40af',
              color: 'white', border: 'none', borderRadius: '6px',
              fontSize: '14px', fontWeight: 600,
              cursor: loading || code.length !== 6 ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Verifying...' : 'Verify Code'}
          </button>

          <button
            type="button"
            onClick={() => navigate('/login')}
            style={{
              background: 'none', border: 'none', color: '#6b7280',
              fontSize: '13px', cursor: 'pointer', padding: '0',
              textDecoration: 'underline',
            }}
          >
            ← Back to login
          </button>
        </form>
      </div>
    </div>
  );
}
