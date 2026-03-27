import React from 'react';

// ─── Shimmer Animation ───────────────────────────────────────────────────────

const shimmerStyleId = 'safeheld-shimmer-style';

function ensureShimmerStyle() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(shimmerStyleId)) return;
  const style = document.createElement('style');
  style.id = shimmerStyleId;
  style.textContent = `
    @keyframes safeheld-shimmer {
      0% { background-position: -400px 0; }
      100% { background-position: 400px 0; }
    }
  `;
  document.head.appendChild(style);
}

const shimmerBar: React.CSSProperties = {
  background: 'linear-gradient(90deg, var(--color-gray-100) 25%, var(--color-gray-200) 50%, var(--color-gray-100) 75%)',
  backgroundSize: '800px 100%',
  animation: 'safeheld-shimmer 1.5s infinite linear',
  borderRadius: '4px',
};

// ─── LoadingSkeleton ─────────────────────────────────────────────────────────

interface LoadingSkeletonProps {
  type: 'table' | 'cards' | 'detail';
  rows?: number;
}

export function LoadingSkeleton({ type, rows = 5 }: LoadingSkeletonProps) {
  ensureShimmerStyle();

  if (type === 'table') {
    return (
      <div style={{ background: 'white', border: '1px solid var(--color-gray-200)', borderRadius: '8px', overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
        {/* Header row */}
        <div style={{ display: 'flex', gap: '16px', padding: '14px 20px', background: 'var(--color-gray-50)', borderBottom: '1px solid var(--color-gray-200)' }}>
          {[120, 80, 140, 100, 90].map((w, i) => (
            <div key={i} style={{ ...shimmerBar, height: '12px', width: `${w}px` }} />
          ))}
        </div>
        {/* Data rows */}
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} style={{ display: 'flex', gap: '16px', padding: '14px 20px', borderBottom: i < rows - 1 ? '1px solid var(--color-gray-100)' : 'none' }}>
            {[120, 80, 140, 100, 90].map((w, j) => (
              <div key={j} style={{ ...shimmerBar, height: '14px', width: `${w + (i * 7 + j * 13) % 30 - 15}px` }} />
            ))}
          </div>
        ))}
      </div>
    );
  }

  if (type === 'cards') {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} style={{
            background: 'white', border: '1px solid var(--color-gray-200)', borderRadius: '8px',
            padding: '20px', boxShadow: 'var(--shadow-sm)',
          }}>
            <div style={{ ...shimmerBar, height: '12px', width: '80px', marginBottom: '12px' }} />
            <div style={{ ...shimmerBar, height: '28px', width: '60px', marginBottom: '8px' }} />
            <div style={{ ...shimmerBar, height: '10px', width: '100px' }} />
          </div>
        ))}
      </div>
    );
  }

  // detail
  return (
    <div style={{ background: 'white', border: '1px solid var(--color-gray-200)', borderRadius: '8px', padding: '24px', boxShadow: 'var(--shadow-sm)' }}>
      <div style={{ ...shimmerBar, height: '20px', width: '200px', marginBottom: '20px' }} />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ ...shimmerBar, height: '14px', width: `${70 + (i * 17) % 30}%`, marginBottom: '12px' }} />
      ))}
    </div>
  );
}

// ─── EmptyState ──────────────────────────────────────────────────────────────

interface EmptyStateProps {
  icon: string;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ icon, title, description, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '60px 20px', textAlign: 'center',
    }}>
      <div style={{ fontSize: '48px', marginBottom: '16px', lineHeight: 1 }}>{icon}</div>
      <h3 style={{
        margin: '0 0 8px', fontSize: '16px', fontWeight: 600,
        color: 'var(--color-gray-800)',
      }}>
        {title}
      </h3>
      <p style={{
        margin: '0 0 20px', fontSize: '13px', color: 'var(--color-gray-500)',
        maxWidth: '360px', lineHeight: '1.5',
      }}>
        {description}
      </p>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            padding: '8px 16px', fontSize: '13px', fontWeight: 500,
            background: 'var(--color-primary)', color: 'white',
            border: '1px solid var(--color-primary)', borderRadius: '6px',
            cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

// ─── ErrorState ──────────────────────────────────────────────────────────────

interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div style={{
      background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '8px',
      padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center',
      textAlign: 'center',
    }}>
      <div style={{ fontSize: '32px', marginBottom: '12px', lineHeight: 1 }}>!</div>
      <p style={{
        margin: '0 0 16px', fontSize: '14px', color: '#991b1b',
        fontWeight: 500, maxWidth: '400px',
      }}>
        {message}
      </p>
      {onRetry && (
        <button
          onClick={onRetry}
          style={{
            padding: '7px 16px', fontSize: '13px', fontWeight: 500,
            background: 'white', color: '#991b1b',
            border: '1px solid #fca5a5', borderRadius: '6px',
            cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          Retry
        </button>
      )}
    </div>
  );
}
