import React, { useRef, useEffect } from 'react';
import { Send, CornerDownLeft } from 'lucide-react';
import { Button } from '../ui/index.js';

interface ChatComposerProps {
  input: string;
  onChange: (value: string) => void;
  onSend: () => void;
  isLoading: boolean;
  placeholder?: string;
}

export const ChatComposer: React.FC<ChatComposerProps> = ({
  input,
  onChange,
  onSend,
  isLoading,
  placeholder = "Ask a question or request a tool action (e.g. 'What orders came in today?')..."
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea height to fit content gracefully up to 160px
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const scrollH = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = `${Math.min(Math.max(scrollH, 52), 160)}px`;
    }
  }, [input]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isLoading && input.trim()) {
        onSend();
      }
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border-default)',
        background: 'var(--bg-surface)',
        boxShadow: 'var(--shadow-sm)',
        transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
        overflow: 'hidden'
      }}
      onFocusCapture={e => {
        e.currentTarget.style.borderColor = 'var(--color-primary)';
        e.currentTarget.style.boxShadow = 'var(--focus-ring)';
      }}
      onBlurCapture={e => {
        e.currentTarget.style.borderColor = 'var(--border-default)';
        e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-end', padding: '10px 14px 6px', gap: '10px' }}>
        <textarea
          ref={textareaRef}
          value={input}
          onChange={e => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={isLoading}
          rows={1}
          aria-label="Ask assistant or invoke MCP tool"
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: 'var(--text-primary)',
            fontSize: '13px',
            fontFamily: 'var(--font-sans)',
            lineHeight: '1.5',
            resize: 'none',
            minHeight: '40px',
            maxHeight: '160px'
          }}
        />

        <Button
          type="button"
          variant="primary"
          onClick={onSend}
          disabled={isLoading || !input.trim()}
          isLoading={isLoading}
          aria-label="Send message"
          leftIcon={<Send size={14} />}
          style={{
            paddingLeft: '16px',
            paddingRight: '16px',
            height: '36px',
            alignSelf: 'flex-end'
          }}
        >
          Send
        </Button>
      </div>

      {/* Composer Footer Hints */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '4px 14px 8px',
          fontSize: '11px',
          color: 'var(--text-muted)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <CornerDownLeft size={11} />
          <span>Press <strong>Enter</strong> to send, <strong>Shift + Enter</strong> for newline</span>
        </div>
        <div>
          {input.length > 0 && <span>{input.length} characters</span>}
        </div>
      </div>
    </div>
  );
};
