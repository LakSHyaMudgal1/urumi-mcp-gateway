import React from 'react';

export interface CardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  variant?: 'default' | 'flat' | 'subtle' | 'ghost';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  header?: React.ReactNode;
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  footer?: React.ReactNode;
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  (
    {
      variant = 'default',
      padding = 'md',
      header,
      title,
      description,
      actions,
      footer,
      children,
      style = {},
      className = '',
      ...props
    },
    ref
  ) => {
    const getVariantStyles = (): React.CSSProperties => {
      switch (variant) {
        case 'flat':
          return {
            backgroundColor: 'transparent',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'none'
          };
        case 'subtle':
          return {
            backgroundColor: 'var(--bg-subtle)',
            border: '1px solid var(--border-muted)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'none'
          };
        case 'ghost':
          return {
            backgroundColor: 'transparent',
            border: 'none',
            borderRadius: '0',
            boxShadow: 'none'
          };
        case 'default':
        default:
          return {
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-sm)'
          };
      }
    };

    const getPaddingValue = (): string => {
      switch (padding) {
        case 'none':
          return '0';
        case 'sm':
          return '12px 16px';
        case 'lg':
          return '24px 28px';
        case 'md':
        default:
          return '18px 20px';
      }
    };

    const hasHeader = header || title || description || actions;

    return (
      <div
        ref={ref}
        className={`console-card ${className}`}
        style={{
          ...getVariantStyles(),
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          transition: 'border-color 0.15s ease',
          ...style
        }}
        {...props}
      >
        {hasHeader && (
          <div
            style={{
              padding: getPaddingValue(),
              borderBottom: '1px solid var(--border-muted)',
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: '12px',
              flexWrap: 'wrap'
            }}
          >
            {header || (
              <div style={{ flex: 1, minWidth: 0 }}>
                {title && (
                  <h3
                    style={{
                      fontSize: '14px',
                      fontWeight: 600,
                      color: 'var(--text-primary)',
                      letterSpacing: '-0.01em',
                      lineHeight: 1.3
                    }}
                  >
                    {title}
                  </h3>
                )}
                {description && (
                  <p
                    style={{
                      fontSize: '12px',
                      color: 'var(--text-secondary)',
                      marginTop: '3px',
                      lineHeight: 1.45
                    }}
                  >
                    {description}
                  </p>
                )}
              </div>
            )}
            {actions && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                {actions}
              </div>
            )}
          </div>
        )}

        <div style={{ padding: getPaddingValue(), flex: 1 }}>{children}</div>

        {footer && (
          <div
            style={{
              padding: '12px 18px',
              borderTop: '1px solid var(--border-muted)',
              backgroundColor: 'var(--bg-surface-elevated)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: '10px'
            }}
          >
            {footer}
          </div>
        )}
      </div>
    );
  }
);

Card.displayName = 'Card';
