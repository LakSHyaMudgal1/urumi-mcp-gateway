import React from 'react';

export interface DividerProps extends React.HTMLAttributes<HTMLDivElement> {
  orientation?: 'horizontal' | 'vertical';
  label?: React.ReactNode;
  spacing?: 'none' | 'sm' | 'md' | 'lg';
}

export const Divider: React.FC<DividerProps> = ({
  orientation = 'horizontal',
  label,
  spacing = 'md',
  style = {},
  className = '',
  ...props
}) => {
  const getMargin = (): string => {
    switch (spacing) {
      case 'none':
        return '0';
      case 'sm':
        return orientation === 'horizontal' ? '12px 0' : '0 8px';
      case 'lg':
        return orientation === 'horizontal' ? '28px 0' : '0 20px';
      case 'md':
      default:
        return orientation === 'horizontal' ? '20px 0' : '0 14px';
    }
  };

  if (orientation === 'vertical') {
    return (
      <div
        role="separator"
        aria-orientation="vertical"
        className={className}
        style={{
          width: '1px',
          alignSelf: 'stretch',
          backgroundColor: 'var(--border-muted)',
          margin: getMargin(),
          display: 'inline-block',
          ...style
        }}
        {...props}
      />
    );
  }

  if (label) {
    return (
      <div
        role="separator"
        aria-orientation="horizontal"
        className={className}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          margin: getMargin(),
          ...style
        }}
        {...props}
      >
        <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--border-muted)' }} />
        <span
          style={{
            fontSize: '11px',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: 'var(--text-muted)'
          }}
        >
          {label}
        </span>
        <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--border-muted)' }} />
      </div>
    );
  }

  return (
    <hr
      role="separator"
      aria-orientation="horizontal"
      className={className}
      style={{
        border: 'none',
        borderTop: '1px solid var(--border-muted)',
        margin: getMargin(),
        width: '100%',
        ...style
      }}
      {...props}
    />
  );
};
