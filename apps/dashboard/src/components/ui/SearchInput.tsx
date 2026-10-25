import React from 'react';
import { Search, X } from 'lucide-react';

export interface SearchInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  value: string;
  onChange: (value: string) => void;
  onClear?: () => void;
  placeholder?: string;
  width?: string | number;
}

export const SearchInput = React.forwardRef<HTMLInputElement, SearchInputProps>(
  (
    {
      value,
      onChange,
      onClear,
      placeholder = 'Search...',
      width = '100%',
      style = {},
      className = '',
      id,
      disabled,
      ...props
    },
    ref
  ) => {
    const inputId = id || 'search-input';

    const handleClear = () => {
      onChange('');
      if (onClear) onClear();
    };

    return (
      <div
        className="console-search-box"
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          width,
          maxWidth: '100%'
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: '10px',
            color: 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            pointerEvents: 'none'
          }}
          aria-hidden="true"
        >
          <Search size={14} />
        </div>

        <input
          id={inputId}
          ref={ref}
          type="search"
          aria-label={props['aria-label'] || placeholder || 'Search'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className={`console-input ${className}`}
          style={{
            paddingLeft: '32px',
            paddingRight: value ? '30px' : '12px',
            height: 'var(--control-height-md)',
            fontSize: '13px',
            ...style
          }}
          {...props}
        />

        {value && !disabled && (
          <button
            type="button"
            onClick={handleClear}
            aria-label="Clear search input"
            style={{
              position: 'absolute',
              right: '8px',
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '2px',
              borderRadius: 'var(--radius-xs)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'color 0.12s ease'
            }}
          >
            <X size={13} />
          </button>
        )}
      </div>
    );
  }
);

SearchInput.displayName = 'SearchInput';
