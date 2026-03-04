import React from 'react';

// ─── Button ───────────────────────────────────────────────────────────────────

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}

const buttonStyles: Record<string, React.CSSProperties> = {
  primary: {
    background: 'var(--color-accent)',
    color: 'white',
    border: '1px solid var(--color-accent)',
    boxShadow: '0 1px 2px rgb(61 61 255 / 0.2)',
  },
  secondary: {
    background: 'white',
    color: 'var(--color-navy-700)',
    border: '1px solid var(--color-navy-200)',
    boxShadow: 'var(--shadow-xs)',
  },
  outline: {
    background: 'transparent',
    color: 'var(--color-accent)',
    border: '1px solid var(--color-accent)',
  },
  danger: {
    background: 'var(--color-danger)',
    color: 'white',
    border: '1px solid var(--color-danger)',
    boxShadow: '0 1px 2px rgb(239 68 68 / 0.2)',
  },
  ghost: {
    background: 'transparent',
    color: 'var(--color-navy-500)',
    border: '1px solid transparent',
  },
};

const buttonSizes: Record<string, React.CSSProperties> = {
  sm: { padding: '6px 12px', fontSize: '12px', borderRadius: 'var(--radius-md)', lineHeight: '16px' },
  md: { padding: '8px 16px', fontSize: '13px', borderRadius: 'var(--radius-md)', lineHeight: '18px' },
  lg: { padding: '10px 20px', fontSize: '14px', borderRadius: 'var(--radius-md)', lineHeight: '20px' },
};

export function Button({
  children, variant = 'primary', size = 'md', loading, disabled, style, ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
        fontWeight: 500, cursor: disabled || loading ? 'not-allowed' : 'pointer',
        opacity: disabled || loading ? 0.55 : 1, fontFamily: 'inherit',
        transition: 'all var(--transition-fast)',
        letterSpacing: '-0.01em',
        whiteSpace: 'nowrap',
        ...buttonStyles[variant],
        ...buttonSizes[size],
        ...style,
      }}
      {...props}
    >
      {loading && (
        <span style={{
          display: 'inline-block', width: '14px', height: '14px',
          border: '2px solid currentColor', borderTopColor: 'transparent',
          borderRadius: '50%', animation: 'spin 0.7s linear infinite',
        }} />
      )}
      {loading ? 'Loading...' : children}
    </button>
  );
}

// ─── Badge ────────────────────────────────────────────────────────────────────

interface BadgeProps {
  label: string;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'neutral';
}

const badgeColors: Record<string, { bg: string; color: string; border: string }> = {
  default: { bg: 'var(--color-navy-100)', color: 'var(--color-navy-600)', border: 'var(--color-navy-200)' },
  success: { bg: 'var(--color-success-light)', color: 'var(--color-success-dark)', border: '#a7f3d0' },
  warning: { bg: 'var(--color-warning-light)', color: '#92400e', border: '#fde68a' },
  danger: { bg: 'var(--color-danger-light)', color: '#991b1b', border: '#fecaca' },
  info: { bg: 'var(--color-info-light)', color: '#1e40af', border: '#bfdbfe' },
  neutral: { bg: 'var(--color-navy-100)', color: 'var(--color-navy-500)', border: 'var(--color-navy-200)' },
};

export function Badge({ label, variant = 'default' }: BadgeProps) {
  const colors = badgeColors[variant];
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      padding: '2px 10px',
      borderRadius: '9999px',
      fontSize: '11px',
      fontWeight: 600,
      letterSpacing: '0.01em',
      background: colors.bg,
      color: colors.color,
      border: `1px solid ${colors.border}`,
      whiteSpace: 'nowrap',
      lineHeight: '18px',
    }}>
      {label}
    </span>
  );
}

export function statusBadge(status: string): React.ReactElement {
  const map: Record<string, BadgeProps['variant']> = {
    MET: 'success', ACTIVE: 'success', ACCEPTED: 'success', RESOLVED: 'success', CLOSED: 'success',
    CURRENT: 'success', CONFIRMED: 'success', GREEN: 'success', PASS: 'success', APPROVED: 'success',
    SHORTFALL: 'danger', REJECTED: 'danger', DETECTED: 'danger', CRITICAL: 'danger',
    DISABLED: 'danger', EXPIRED: 'danger', MISSING: 'danger', FAIL: 'danger', RED: 'danger', OVERDUE: 'danger',
    EXCESS: 'warning', PARTIAL: 'warning', ACKNOWLEDGED: 'warning', REMEDIATING: 'warning',
    HIGH: 'warning', PENDING: 'warning', AMBER: 'warning', DUE: 'warning', EXPIRING: 'warning',
    MEDIUM: 'info', LOW: 'neutral', DRAFT: 'neutral', VALIDATING: 'neutral',
    INCOMPLETE: 'warning', NO_DATA: 'neutral', ONBOARDING: 'info',
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
      border: '1px solid var(--color-navy-200)',
      borderRadius: 'var(--radius-lg)',
      boxShadow: 'var(--shadow-sm)',
      overflow: 'hidden',
      ...style,
    }}>
      {(title || actions) && (
        <div style={{
          padding: '16px 24px',
          borderBottom: '1px solid var(--color-navy-100)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          {title && (
            <h3 style={{
              fontSize: '14px', fontWeight: 600,
              color: 'var(--color-navy-900)',
              margin: 0,
              letterSpacing: '-0.01em',
            }}>
              {title}
            </h3>
          )}
          {actions && <div style={{ display: 'flex', gap: '8px' }}>{actions}</div>}
        </div>
      )}
      <div style={{ padding: '24px' }}>{children}</div>
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
      border: '1px solid var(--color-navy-200)',
      borderRadius: 'var(--radius-lg)',
      padding: '24px',
      boxShadow: 'var(--shadow-sm)',
      display: 'flex',
      flexDirection: 'column',
      gap: '4px',
    }}>
      <div style={{
        fontSize: '12px', color: 'var(--color-navy-500)',
        fontWeight: 500, textTransform: 'uppercase',
        letterSpacing: '0.05em',
      }}>
        {label}
      </div>
      <div style={{
        fontSize: '30px', fontWeight: 700,
        color: color || 'var(--color-navy-900)',
        letterSpacing: '-0.02em',
        lineHeight: 1.2,
      }}>
        {value}
      </div>
      {sub && (
        <div style={{
          fontSize: '12px', color: 'var(--color-navy-400)',
          marginTop: '2px',
        }}>
          {sub}
        </div>
      )}
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
      <div style={{ padding: '48px', textAlign: 'center', color: 'var(--color-navy-400)' }}>
        <div className="spinner" style={{ margin: '0 auto 12px' }} />
        <div style={{ fontSize: '13px' }}>Loading data...</div>
      </div>
    );
  }

  return (
    <div style={{ overflowX: 'auto', margin: '-24px', marginTop: '-24px' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
        <thead>
          <tr>
            {columns.map(col => (
              <th key={col.key} style={{
                padding: '12px 16px',
                textAlign: 'left',
                fontWeight: 600,
                color: 'var(--color-navy-500)',
                fontSize: '11px',
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                borderBottom: '1px solid var(--color-navy-200)',
                background: 'var(--color-navy-50)',
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
              <td colSpan={columns.length} style={{
                padding: '48px 16px', textAlign: 'center',
                color: 'var(--color-navy-400)', fontSize: '13px',
              }}>
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((row, idx) => (
              <tr
                key={(row as Record<string, unknown>).id as string || idx}
                onClick={() => onRowClick?.(row)}
                style={{
                  borderBottom: '1px solid var(--color-navy-100)',
                  cursor: onRowClick ? 'pointer' : 'default',
                  transition: 'background var(--transition-fast)',
                }}
                onMouseEnter={e => {
                  if (onRowClick) (e.currentTarget as HTMLElement).style.background = 'var(--color-navy-50)';
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.background = '';
                }}
              >
                {columns.map(col => (
                  <td key={col.key} style={{
                    padding: '12px 16px',
                    color: 'var(--color-navy-700)',
                  }}>
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {label && (
        <label htmlFor={id} style={{
          fontSize: '13px', fontWeight: 500,
          color: 'var(--color-navy-700)',
          letterSpacing: '-0.01em',
        }}>
          {label}
        </label>
      )}
      <input
        id={id}
        style={{
          padding: '9px 13px',
          border: `1px solid ${error ? 'var(--color-danger)' : 'var(--color-navy-300)'}`,
          borderRadius: 'var(--radius-md)',
          fontSize: '14px',
          outline: 'none',
          width: '100%',
          fontFamily: 'inherit',
          color: 'var(--color-navy-800)',
          background: 'white',
          transition: 'border-color var(--transition-fast), box-shadow var(--transition-fast)',
          ...style,
        }}
        onFocus={e => {
          e.target.style.borderColor = 'var(--color-accent)';
          e.target.style.boxShadow = '0 0 0 3px rgb(61 61 255 / 0.1)';
        }}
        onBlur={e => {
          e.target.style.borderColor = error ? 'var(--color-danger)' : 'var(--color-navy-300)';
          e.target.style.boxShadow = 'none';
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {label && (
        <label htmlFor={id} style={{
          fontSize: '13px', fontWeight: 500,
          color: 'var(--color-navy-700)',
          letterSpacing: '-0.01em',
        }}>
          {label}
        </label>
      )}
      <select
        id={id}
        style={{
          padding: '9px 13px',
          border: `1px solid ${error ? 'var(--color-danger)' : 'var(--color-navy-300)'}`,
          borderRadius: 'var(--radius-md)',
          fontSize: '14px',
          background: 'white',
          fontFamily: 'inherit',
          color: 'var(--color-navy-800)',
          cursor: 'pointer',
          transition: 'border-color var(--transition-fast)',
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

const alertIcons: Record<string, string> = {
  error: '\u26D4',
  warning: '\u26A0',
  success: '\u2714',
  info: '\u2139',
};

const alertStyles: Record<string, { bg: string; border: string; color: string; iconColor: string }> = {
  error: { bg: 'var(--color-danger-light)', border: '#fecaca', color: '#991b1b', iconColor: 'var(--color-danger)' },
  warning: { bg: 'var(--color-warning-light)', border: '#fde68a', color: '#92400e', iconColor: 'var(--color-warning)' },
  success: { bg: 'var(--color-success-light)', border: '#a7f3d0', color: '#065f46', iconColor: 'var(--color-success)' },
  info: { bg: 'var(--color-info-light)', border: '#bfdbfe', color: '#1e40af', iconColor: 'var(--color-info)' },
};

export function Alert({ type, message }: AlertProps) {
  const s = alertStyles[type];
  return (
    <div style={{
      padding: '12px 16px',
      background: s.bg,
      border: `1px solid ${s.border}`,
      borderRadius: 'var(--radius-md)',
      color: s.color,
      fontSize: '13px',
      display: 'flex',
      alignItems: 'flex-start',
      gap: '10px',
      lineHeight: '1.5',
    }}>
      <span style={{ fontSize: '14px', color: s.iconColor, lineHeight: '1.4', flexShrink: 0 }}>
        {alertIcons[type]}
      </span>
      <span>{message}</span>
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
        position: 'fixed', inset: 0,
        background: 'rgba(12, 20, 69, 0.6)',
        backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000, padding: '20px',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: 'white',
        borderRadius: 'var(--radius-xl)',
        width: '100%', maxWidth: width,
        maxHeight: '90vh', overflow: 'auto',
        boxShadow: 'var(--shadow-xl)',
        border: '1px solid var(--color-navy-200)',
      }}>
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid var(--color-navy-100)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <h3 style={{
            margin: 0, fontSize: '16px', fontWeight: 600,
            color: 'var(--color-navy-900)',
            letterSpacing: '-0.01em',
          }}>
            {title}
          </h3>
          <button
            onClick={onClose}
            style={{
              background: 'var(--color-navy-100)', border: 'none',
              width: '28px', height: '28px',
              borderRadius: '50%',
              fontSize: '16px',
              cursor: 'pointer', color: 'var(--color-navy-500)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'background var(--transition-fast)',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-navy-200)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'var(--color-navy-100)')}
          >
            \u00D7
          </button>
        </div>
        <div style={{ padding: '24px' }}>{children}</div>
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
      padding: '16px 24px',
      borderTop: '1px solid var(--color-navy-100)',
      fontSize: '13px', color: 'var(--color-navy-500)',
      margin: '0 -24px -24px',
    }}>
      <span style={{ fontWeight: 500 }}>
        {total.toLocaleString()} total results
      </span>
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
        <Button variant="secondary" size="sm" onClick={() => onPageChange(page - 1)} disabled={page <= 1}>
          Prev
        </Button>
        <span style={{ padding: '0 12px', fontSize: '13px', fontWeight: 500, color: 'var(--color-navy-700)' }}>
          {page} / {totalPages}
        </span>
        <Button variant="secondary" size="sm" onClick={() => onPageChange(page + 1)} disabled={page >= totalPages}>
          Next
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
      marginBottom: '24px',
    }}>
      <h2 style={{
        margin: 0, fontSize: '22px',
        fontWeight: 700,
        color: 'var(--color-navy-900)',
        letterSpacing: '-0.025em',
      }}>
        {title}
      </h2>
      {actions && <div style={{ display: 'flex', gap: '10px' }}>{actions}</div>}
    </div>
  );
}

// ─── Grid ─────────────────────────────────────────────────────────────────────

export function Grid({ cols = 2, gap = 20, children }: { cols?: number; gap?: number; children: React.ReactNode }) {
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

// ─── Tabs ─────────────────────────────────────────────────────────────────────

interface TabsProps {
  tabs: Array<{ id: string; label: string; count?: number }>;
  activeTab: string;
  onChange: (id: string) => void;
}

export function Tabs({ tabs, activeTab, onChange }: TabsProps) {
  return (
    <div style={{
      display: 'flex', gap: '0',
      borderBottom: '1px solid var(--color-navy-200)',
      marginBottom: '24px',
      overflowX: 'auto',
    }}>
      {tabs.map(tab => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          style={{
            padding: '12px 20px',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === tab.id
              ? '2px solid var(--color-accent)'
              : '2px solid transparent',
            marginBottom: '-1px',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: activeTab === tab.id ? 600 : 500,
            color: activeTab === tab.id ? 'var(--color-accent)' : 'var(--color-navy-500)',
            whiteSpace: 'nowrap',
            transition: 'color var(--transition-fast)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          {tab.label}
          {tab.count !== undefined && tab.count > 0 && (
            <span style={{
              background: activeTab === tab.id ? 'var(--color-accent)' : 'var(--color-navy-200)',
              color: activeTab === tab.id ? 'white' : 'var(--color-navy-600)',
              fontSize: '11px',
              fontWeight: 600,
              borderRadius: '9999px',
              padding: '1px 8px',
              lineHeight: '18px',
            }}>
              {tab.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

export function EmptyState({ message, action }: { message: string; action?: React.ReactNode }) {
  return (
    <div style={{
      textAlign: 'center',
      padding: '48px 24px',
      color: 'var(--color-navy-400)',
    }}>
      <div style={{
        width: '48px', height: '48px',
        background: 'var(--color-navy-100)',
        borderRadius: '50%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        margin: '0 auto 16px',
        fontSize: '20px', color: 'var(--color-navy-400)',
      }}>
        ?
      </div>
      <p style={{ fontSize: '14px', margin: '0 0 16px', color: 'var(--color-navy-500)' }}>{message}</p>
      {action}
    </div>
  );
}
