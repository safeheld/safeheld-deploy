import React from 'react';

// ─── Button ───────────────────────────────────────────────────────────────────

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}

const buttonStyles: Record<string, React.CSSProperties> = {
  primary: { background: 'var(--color-primary)', color: 'white', border: '1px solid var(--color-primary)' },
  secondary: { background: 'white', color: 'var(--color-gray-700)', border: '1px solid var(--color-gray-300)' },
  danger: { background: 'var(--color-danger)', color: 'white', border: '1px solid var(--color-danger)' },
  ghost: { background: 'transparent', color: 'var(--color-gray-600)', border: '1px solid transparent' },
};

const buttonSizes: Record<string, React.CSSProperties> = {
  sm: { padding: '4px 10px', fontSize: '12px', borderRadius: '4px' },
  md: { padding: '7px 14px', fontSize: '13px', borderRadius: '6px' },
  lg: { padding: '10px 20px', fontSize: '14px', borderRadius: '6px' },
};

export function Button({
  children, variant = 'primary', size = 'md', loading, disabled, style, ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '6px',
        fontWeight: 500, cursor: disabled || loading ? 'not-allowed' : 'pointer',
        opacity: disabled || loading ? 0.65 : 1, fontFamily: 'inherit',
        transition: 'all 0.15s',
        ...buttonStyles[variant],
        ...buttonSizes[size],
        ...style,
      }}
      {...props}
    >
      {loading ? '...' : children}
    </button>
  );
}

// ─── Badge ────────────────────────────────────────────────────────────────────

interface BadgeProps {
  label: string;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'neutral';
}

const badgeColors: Record<string, { bg: string; color: string }> = {
  default: { bg: 'var(--color-gray-100)', color: 'var(--color-gray-700)' },
  success: { bg: '#d1fae5', color: '#065f46' },
  warning: { bg: '#fef3c7', color: '#92400e' },
  danger: { bg: '#fee2e2', color: '#991b1b' },
  info: { bg: '#dbeafe', color: '#1e40af' },
  neutral: { bg: 'var(--color-gray-100)', color: 'var(--color-gray-600)' },
};

export function Badge({ label, variant = 'default' }: BadgeProps) {
  const colors = badgeColors[variant];
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: '12px',
      fontSize: '11px',
      fontWeight: 600,
      background: colors.bg,
      color: colors.color,
      whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  );
}

export function statusBadge(status: string): React.ReactElement {
  const map: Record<string, BadgeProps['variant']> = {
    MET: 'success', ACTIVE: 'success', ACCEPTED: 'success', RESOLVED: 'success', CLOSED: 'success',
    CURRENT: 'success', CONFIRMED: 'success', GREEN: 'success', PASS: 'success',
    SHORTFALL: 'danger', REJECTED: 'danger', DETECTED: 'danger', CRITICAL: 'danger',
    DISABLED: 'danger', EXPIRED: 'danger', MISSING: 'danger', FAIL: 'danger', RED: 'danger',
    EXCESS: 'warning', PARTIAL: 'warning', ACKNOWLEDGED: 'warning', REMEDIATING: 'warning',
    HIGH: 'warning', PENDING: 'warning', AMBER: 'warning', DUE: 'warning', EXPIRING: 'warning',
    MEDIUM: 'info', LOW: 'neutral', DRAFT: 'neutral', VALIDATING: 'neutral', OVERDUE: 'danger',
  };
  return <Badge label={status.replace(/_/g, ' ')} variant={map[status] || 'default'} />;
}

// ─── Card ─────────────────────────────────────────────────────────────────────

interface CardProps {
  title?: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
  actions?: React.ReactNode;
}

export function Card({ title, children, style, actions }: CardProps) {
  return (
    <div style={{
      background: 'white',
      border: '1px solid var(--color-gray-200)',
      borderRadius: '8px',
      boxShadow: 'var(--shadow-sm)',
      overflow: 'hidden',
      ...style,
    }}>
      {(title || actions) && (
        <div style={{
          padding: '14px 20px',
          borderBottom: '1px solid var(--color-gray-200)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          {title && <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-gray-800)', margin: 0 }}>{title}</h3>}
          {actions && <div style={{ display: 'flex', gap: '8px' }}>{actions}</div>}
        </div>
      )}
      <div style={{ padding: '20px' }}>{children}</div>
    </div>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}

export function StatCard({ label, value, sub, color }: StatCardProps) {
  return (
    <div style={{
      background: 'white',
      border: '1px solid var(--color-gray-200)',
      borderRadius: '8px',
      padding: '20px',
      boxShadow: 'var(--shadow-sm)',
    }}>
      <div style={{ fontSize: '12px', color: 'var(--color-gray-500)', fontWeight: 500, marginBottom: '8px' }}>
        {label}
      </div>
      <div style={{ fontSize: '28px', fontWeight: 700, color: color || 'var(--color-gray-900)' }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: '12px', color: 'var(--color-gray-400)', marginTop: '4px' }}>{sub}</div>}
    </div>
  );
}

// ─── Table ────────────────────────────────────────────────────────────────────

interface TableProps<T> {
  columns: Array<{
    key: string;
    header: string;
    render?: (row: T) => React.ReactNode;
    width?: string;
  }>;
  data: T[];
  loading?: boolean;
  emptyMessage?: string;
  onRowClick?: (row: T) => void;
}

export function Table<T extends { id?: string }>({
  columns, data, loading, emptyMessage = 'No data.', onRowClick,
}: TableProps<T>) {
  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-gray-400)' }}>
        Loading...
      </div>
    );
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
        <thead>
          <tr style={{ background: 'var(--color-gray-50)' }}>
            {columns.map(col => (
              <th key={col.key} style={{
                padding: '10px 14px',
                textAlign: 'left',
                fontWeight: 600,
                color: 'var(--color-gray-600)',
                fontSize: '12px',
                borderBottom: '1px solid var(--color-gray-200)',
                whiteSpace: 'nowrap',
                width: col.width,
              }}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} style={{ padding: '40px', textAlign: 'center', color: 'var(--color-gray-400)' }}>
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((row, idx) => (
              <tr
                key={(row as Record<string, unknown>).id as string || idx}
                onClick={() => onRowClick?.(row)}
                style={{
                  borderBottom: '1px solid var(--color-gray-100)',
                  cursor: onRowClick ? 'pointer' : 'default',
                }}
                onMouseEnter={e => { if (onRowClick) (e.currentTarget as HTMLElement).style.background = 'var(--color-gray-50)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = ''; }}
              >
                {columns.map(col => (
                  <td key={col.key} style={{ padding: '10px 14px', color: 'var(--color-gray-700)' }}>
                    {col.render
                      ? col.render(row)
                      : String((row as Record<string, unknown>)[col.key] ?? '')}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

// ─── Input ────────────────────────────────────────────────────────────────────

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export function Input({ label, error, id, style, ...props }: InputProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      {label && (
        <label htmlFor={id} style={{ fontSize: '13px', fontWeight: 500, color: 'var(--color-gray-700)' }}>
          {label}
        </label>
      )}
      <input
        id={id}
        style={{
          padding: '8px 12px',
          border: `1px solid ${error ? 'var(--color-danger)' : 'var(--color-gray-300)'}`,
          borderRadius: '6px',
          fontSize: '14px',
          outline: 'none',
          width: '100%',
          fontFamily: 'inherit',
          ...style,
        }}
        {...props}
      />
      {error && <span style={{ fontSize: '12px', color: 'var(--color-danger)' }}>{error}</span>}
    </div>
  );
}

// ─── Select ───────────────────────────────────────────────────────────────────

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: Array<{ value: string; label: string }>;
}

export function Select({ label, error, id, options, style, ...props }: SelectProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      {label && (
        <label htmlFor={id} style={{ fontSize: '13px', fontWeight: 500, color: 'var(--color-gray-700)' }}>
          {label}
        </label>
      )}
      <select
        id={id}
        style={{
          padding: '8px 12px',
          border: `1px solid ${error ? 'var(--color-danger)' : 'var(--color-gray-300)'}`,
          borderRadius: '6px',
          fontSize: '14px',
          background: 'white',
          fontFamily: 'inherit',
          ...style,
        }}
        {...props}
      >
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      {error && <span style={{ fontSize: '12px', color: 'var(--color-danger)' }}>{error}</span>}
    </div>
  );
}

// ─── Alert ────────────────────────────────────────────────────────────────────

interface AlertProps {
  type: 'error' | 'warning' | 'success' | 'info';
  message: string;
}

const alertStyles: Record<string, { bg: string; border: string; color: string }> = {
  error: { bg: '#fee2e2', border: '#fca5a5', color: '#991b1b' },
  warning: { bg: '#fef3c7', border: '#fcd34d', color: '#92400e' },
  success: { bg: '#d1fae5', border: '#6ee7b7', color: '#065f46' },
  info: { bg: '#dbeafe', border: '#93c5fd', color: '#1e40af' },
};

export function Alert({ type, message }: AlertProps) {
  const s = alertStyles[type];
  return (
    <div style={{
      padding: '10px 16px',
      background: s.bg,
      border: `1px solid ${s.border}`,
      borderRadius: '6px',
      color: s.color,
      fontSize: '13px',
    }}>
      {message}
    </div>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  width?: number;
}

export function Modal({ open, onClose, title, children, width = 480 }: ModalProps) {
  if (!open) return null;
  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000, padding: '20px',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: 'white', borderRadius: '8px', width: '100%', maxWidth: width,
        maxHeight: '90vh', overflow: 'auto',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
      }}>
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--color-gray-200)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600 }}>{title}</h3>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', fontSize: '20px',
              cursor: 'pointer', color: 'var(--color-gray-400)',
              lineHeight: 1, padding: '0 4px',
            }}
          >×</button>
        </div>
        <div style={{ padding: '20px' }}>{children}</div>
      </div>
    </div>
  );
}

// ─── Pagination ───────────────────────────────────────────────────────────────

interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ page, totalPages, total, onPageChange }: PaginationProps) {
  if (totalPages <= 1) return null;
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '12px 16px', borderTop: '1px solid var(--color-gray-200)',
      fontSize: '13px', color: 'var(--color-gray-500)',
    }}>
      <span>{total} total results</span>
      <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
        <Button variant="secondary" size="sm" onClick={() => onPageChange(page - 1)} disabled={page <= 1}>
          ‹ Prev
        </Button>
        <span style={{ padding: '0 12px' }}>Page {page} of {totalPages}</span>
        <Button variant="secondary" size="sm" onClick={() => onPageChange(page + 1)} disabled={page >= totalPages}>
          Next ›
        </Button>
      </div>
    </div>
  );
}

// ─── Section Header ───────────────────────────────────────────────────────────

export function PageHeader({ title, actions }: { title: string; actions?: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      marginBottom: '20px',
    }}>
      <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: 'var(--color-gray-900)' }}>
        {title}
      </h2>
      {actions && <div style={{ display: 'flex', gap: '8px' }}>{actions}</div>}
    </div>
  );
}

// ─── Grid ─────────────────────────────────────────────────────────────────────

export function Grid({ cols = 2, gap = 16, children }: { cols?: number; gap?: number; children: React.ReactNode }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${cols}, 1fr)`,
      gap: `${gap}px`,
    }}>
      {children}
    </div>
  );
}
