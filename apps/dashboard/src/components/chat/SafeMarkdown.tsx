import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';

interface SafeMarkdownProps {
  content: string;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Escapes unsafe URLs to prevent XSS (blocks javascript:, data:, etc.)
 */
export function sanitizeUrl(rawUrl: string): string | null {
  const trimmed = rawUrl.trim();
  // Allow relative URLs starting with / or #
  if (trimmed.startsWith('/') || trimmed.startsWith('#')) {
    return trimmed;
  }
  // Allow only explicit http and https protocols
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return trimmed;
    }
  } catch {
    // If not a valid full URL, reject
    return null;
  }
  return null;
}

/**
 * Code Block Component with Safe Copy Action
 */
const CodeBlock: React.FC<{ code: string; language?: string }> = ({ code, language }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard fallback
    }
  };

  return (
    <div
      style={{
        margin: '10px 0',
        borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--border-subtle)',
        background: '#04060a',
        overflow: 'hidden'
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 12px',
          background: 'rgba(255, 255, 255, 0.03)',
          borderBottom: '1px solid var(--border-subtle)',
          fontSize: '11px',
          fontFamily: 'var(--font-mono)',
          color: 'var(--text-muted)'
        }}
      >
        <span>{language || 'code'}</span>
        <button
          type="button"
          onClick={handleCopy}
          aria-label="Copy code to clipboard"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            background: 'transparent',
            border: 'none',
            color: copied ? 'var(--color-success-text)' : 'var(--text-secondary)',
            fontSize: '11px',
            cursor: 'pointer',
            padding: '2px 6px',
            borderRadius: '4px',
            transition: 'color 0.15s ease'
          }}
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <pre
        style={{
          margin: 0,
          padding: '12px',
          fontFamily: 'var(--font-mono)',
          fontSize: '12px',
          lineHeight: '1.6',
          color: '#e2e8f0',
          overflowX: 'auto',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word'
        }}
      >
        <code>{code}</code>
      </pre>
    </div>
  );
};

/**
 * Parses inline formatting: safe links, inline code, bold, italics.
 * All raw HTML tags are treated as plain text strings (NEVER dangerouslySetInnerHTML).
 */
export function parseInlineMarkdown(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // Regex to match:
  // 1. Links: [text](url)
  // 2. Inline code: `code`
  // 3. Bold: **text**
  // 4. Italic: *text*
  const pattern = /(\[([^\]]+)\]\(([^)]+)\)|`([^`]+)`|\*\*([^*]+)\*\*|\*([^*]+)\*)/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    const [fullMatch, , linkText, linkUrl, inlineCode, boldText, italicText] = match;

    if (linkText && linkUrl) {
      const safe = sanitizeUrl(linkUrl);
      if (safe) {
        nodes.push(
          <a
            key={`link-${match.index}`}
            href={safe}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: 'var(--accent-text)',
              textDecoration: 'underline',
              textUnderlineOffset: '2px'
            }}
          >
            {linkText}
          </a>
        );
      } else {
        // Disallowed URL scheme (e.g. javascript:); render safely as plain text
        nodes.push(linkText);
      }
    } else if (inlineCode) {
      nodes.push(
        <code
          key={`code-${match.index}`}
          style={{
            background: 'var(--bg-surface-elevated)',
            border: '1px solid var(--border-subtle)',
            padding: '2px 5px',
            borderRadius: '4px',
            fontSize: '0.9em',
            fontFamily: 'var(--font-mono)',
            color: 'var(--text-primary)',
            wordBreak: 'break-word'
          }}
        >
          {inlineCode}
        </code>
      );
    } else if (boldText) {
      nodes.push(<strong key={`bold-${match.index}`} style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{boldText}</strong>);
    } else if (italicText) {
      nodes.push(<em key={`italic-${match.index}`} style={{ fontStyle: 'italic', color: 'var(--text-secondary)' }}>{italicText}</em>);
    } else {
      nodes.push(fullMatch);
    }

    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

/**
 * Safe Markdown Parser Component.
 * Parses lines into code blocks, headers, bullet lists, and paragraphs.
 * Completely eliminates any vulnerability to raw HTML execution.
 */
export const SafeMarkdown: React.FC<SafeMarkdownProps> = ({ content, className, style }) => {
  if (!content) return null;

  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];

  let inCodeBlock = false;
  let codeBuffer: string[] = [];
  let codeLanguage = '';

  let listItemsBuffer: string[] = [];
  let listKey = 0;

  const flushList = () => {
    if (listItemsBuffer.length > 0) {
      elements.push(
        <ul
          key={`list-${listKey++}`}
          style={{
            margin: '8px 0',
            paddingLeft: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px'
          }}
        >
          {listItemsBuffer.map((item, idx) => (
            <li key={idx} style={{ lineHeight: '1.6' }}>
              {parseInlineMarkdown(item)}
            </li>
          ))}
        </ul>
      );
      listItemsBuffer = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check for fenced code block toggle
    if (line.trim().startsWith('```')) {
      flushList();
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeLanguage = line.trim().slice(3).trim();
        codeBuffer = [];
      } else {
        inCodeBlock = false;
        elements.push(
          <CodeBlock
            key={`codeblock-${i}`}
            code={codeBuffer.join('\n')}
            language={codeLanguage}
          />
        );
        codeBuffer = [];
        codeLanguage = '';
      }
      continue;
    }

    if (inCodeBlock) {
      codeBuffer.push(line);
      continue;
    }

    // Bullet points (- or * )
    const bulletMatch = line.match(/^(\s*[-*]\s+)(.*)$/);
    if (bulletMatch) {
      listItemsBuffer.push(bulletMatch[2]);
      continue;
    }

    // Numbered list (1. 2. )
    const numMatch = line.match(/^(\s*\d+\.\s+)(.*)$/);
    if (numMatch) {
      listItemsBuffer.push(numMatch[2]);
      continue;
    }

    // Flush any pending list if current line is not a list item
    flushList();

    // Headers
    if (line.startsWith('### ')) {
      elements.push(
        <h4
          key={`h4-${i}`}
          style={{
            fontSize: '14px',
            fontWeight: 600,
            color: 'var(--text-primary)',
            marginTop: '12px',
            marginBottom: '4px'
          }}
        >
          {parseInlineMarkdown(line.slice(4))}
        </h4>
      );
      continue;
    }

    if (line.startsWith('## ')) {
      elements.push(
        <h3
          key={`h3-${i}`}
          style={{
            fontSize: '15px',
            fontWeight: 600,
            color: 'var(--text-primary)',
            marginTop: '14px',
            marginBottom: '6px'
          }}
        >
          {parseInlineMarkdown(line.slice(3))}
        </h3>
      );
      continue;
    }

    if (line.startsWith('# ')) {
      elements.push(
        <h2
          key={`h2-${i}`}
          style={{
            fontSize: '16px',
            fontWeight: 700,
            color: 'var(--text-primary)',
            marginTop: '16px',
            marginBottom: '8px'
          }}
        >
          {parseInlineMarkdown(line.slice(2))}
        </h2>
      );
      continue;
    }

    // Empty lines act as paragraph spacers
    if (!line.trim()) {
      elements.push(<div key={`spacer-${i}`} style={{ height: '8px' }} />);
      continue;
    }

    // Standard paragraph line
    elements.push(
      <p
        key={`p-${i}`}
        style={{
          margin: '4px 0',
          lineHeight: '1.6',
          wordBreak: 'break-word',
          overflowWrap: 'anywhere'
        }}
      >
        {parseInlineMarkdown(line)}
      </p>
    );
  }

  // Flush remaining list or unclosed code block
  flushList();
  if (inCodeBlock && codeBuffer.length > 0) {
    elements.push(
      <CodeBlock
        key="codeblock-unclosed"
        code={codeBuffer.join('\n')}
        language={codeLanguage}
      />
    );
  }

  return (
    <div
      className={className}
      style={{
        fontSize: '13px',
        color: 'var(--text-primary)',
        ...style
      }}
    >
      {elements}
    </div>
  );
};
