import React from 'react';

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: React.ReactNode;
  description?: React.ReactNode;
  disabled?: boolean;
  id?: string;
}

export const Switch: React.FC<SwitchProps> = ({
  checked,
  onChange,
  label,
  description,
  disabled = false,
  id
}) => {
  const switchId = id || (typeof label === 'string' ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
      {(label || description) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          {label && (
            <label
              htmlFor={switchId}
              style={{
                fontSize: '13px',
                fontWeight: 500,
                color: disabled ? 'var(--text-disabled)' : 'var(--text-primary)',
                cursor: disabled ? 'not-allowed' : 'pointer'
              }}
            >
              {label}
            </label>
          )}
          {description && (
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              {description}
            </span>
          )}
        </div>
      )}

      <button
        id={switchId}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        style={{
          width: '36px',
          height: '20px',
          borderRadius: '9999px',
          backgroundColor: checked ? 'var(--accent-primary)' : 'rgba(255, 255, 255, 0.12)',
          border: '1px solid var(--border-subtle)',
          padding: '2px',
          display: 'flex',
          alignItems: 'center',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.5 : 1,
          transition: 'background-color 0.15s ease',
          position: 'relative'
        }}
      >
        <span
          style={{
            width: '14px',
            height: '14px',
            borderRadius: '50%',
            backgroundColor: '#ffffff',
            transform: checked ? 'translateX(16px)' : 'translateX(0)',
            transition: 'transform 0.15s ease',
            display: 'block'
          }}
          aria-hidden="true"
        />
      </button>
    </div>
  );
};
