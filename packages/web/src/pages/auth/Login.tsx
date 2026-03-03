import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await login(email, password);

      if (result.mfa_required || result.mfa_setup_required) {
        sessionStorage.setItem('temp_token', result.temp_token!);
        sessionStorage.setItem('mfa_setup_required', result.mfa_setup_required ? 'true' : 'false');
        navigate('/mfa');
      }
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      setError(message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--color-navy-900)',
      padding: '20px',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Background gradient orb */}
      <div style={{
        position: 'absolute',
        width: '600px', height: '600px',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(99,102,241,0.15) 0%, transparent 70%)',
        top: '-100px', right: '-100px',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute',
        width: '400px', height: '400px',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(99,102,241,0.1) 0%, transparent 70%)',
        bottom: '-50px', left: '-50px',
        pointerEvents: 'none',
      }} />

      <div style={{
        background: 'white',
        borderRadius: 'var(--radius-xl)',
        padding: '48px',
        width: '100%',
        maxWidth: '420px',
        boxShadow: 'var(--shadow-xl)',
        position: 'relative',
        border: '1px solid var(--color-navy-200)',
      }}>
        <div style={{ marginBottom: '36px', textAlign: 'center' }}>
          {/* Logo mark */}
          <div style={{
            width: '44px', height: '44px',
            background: 'var(--color-accent)',
            borderRadius: 'var(--radius-lg)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px',
            fontWeight: 800, color: 'white', fontSize: '18px',
            boxShadow: '0 4px 12px rgb(99 102 241 / 0.3)',
          }}>
            S
          </div>
          <h1 style={{
            fontSize: '22px', fontWeight: 700,
            color: 'var(--color-navy-900)',
            margin: '0 0 6px',
            letterSpacing: '-0.03em',
          }}>
            Welcome back
          </h1>
          <p style={{ color: 'var(--color-navy-500)', fontSize: '14px', margin: 0 }}>
            Sign in to Safeheld Compliance Platform
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <label style={{
              display: 'block', fontSize: '13px', fontWeight: 500,
              color: 'var(--color-navy-700)', marginBottom: '6px',
            }}>
              Email address
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoFocus
              placeholder="you@company.com"
              style={{
                width: '100%', padding: '10px 14px',
                border: '1px solid var(--color-navy-300)', borderRadius: 'var(--radius-md)',
                fontSize: '14px', outline: 'none', boxSizing: 'border-box',
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

          <div>
            <label style={{
              display: 'block', fontSize: '13px', fontWeight: 500,
              color: 'var(--color-navy-700)', marginBottom: '6px',
            }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              placeholder="\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022"
              style={{
                width: '100%', padding: '10px 14px',
                border: '1px solid var(--color-navy-300)', borderRadius: 'var(--radius-md)',
                fontSize: '14px', outline: 'none', boxSizing: 'border-box',
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
              padding: '12px 16px',
              background: 'var(--color-danger-light)',
              border: '1px solid #fecaca',
              borderRadius: 'var(--radius-md)',
              color: '#991b1b',
              fontSize: '13px',
              display: 'flex', alignItems: 'center', gap: '8px',
            }}>
              <span style={{ fontSize: '14px' }}>{'\u26D4'}</span>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%', padding: '11px',
              background: loading ? 'var(--color-accent-muted)' : 'var(--color-accent)',
              color: 'white', border: 'none', borderRadius: 'var(--radius-md)',
              fontSize: '14px', fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              marginTop: '4px',
              transition: 'background var(--transition-fast)',
              boxShadow: '0 1px 3px rgb(99 102 241 / 0.3)',
            }}
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <p style={{
          textAlign: 'center', fontSize: '11px',
          color: 'var(--color-navy-400)',
          marginTop: '28px', marginBottom: 0,
          lineHeight: 1.5,
        }}>
          All access is logged and monitored for compliance purposes.
        </p>
      </div>
    </div>
  );
}
