import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../api/queryClient.js';
import { api } from '../api/client.js';
import { PageHeader } from './ui/PageHeader.js';
import { Button } from './ui/Button.js';
import { Badge } from './ui/Badge.js';
import { useToast } from './ui/Toast.js';
import {
  Terminal,
  Code2,
  Laptop,
  Bug,
  Copy,
  Check,
  ShieldCheck,
  FileCode2,
  Layers,
  Key
} from 'lucide-react';

export const ClientSetupView: React.FC = () => {
  const [copiedSection, setCopiedSection] = useState<string | null>(null);
  const { success } = useToast();

  const { data: keys = [] } = useQuery({
    queryKey: queryKeys.keys,
    queryFn: () => api.getKeys().catch(() => [])
  });

  const activeKeys = keys.filter(k => !k.revokedAt);

  const gatewayUrl =
    typeof window !== 'undefined'
      ? `${window.location.protocol}//${window.location.hostname}:4000/mcp`
      : 'http://localhost:4000/mcp';

  const copyToClipboard = (text: string, sectionId: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSection(sectionId);
    success(`Copied ${label} to clipboard`);
    setTimeout(() => setCopiedSection(null), 2000);
  };

  const claudeCodeCommand = `claude mcp add urumi-gateway --transport streamable-http ${gatewayUrl} --header "Authorization: Bearer YOUR_GATEWAY_API_KEY"`;

  const claudeDesktopConfig = JSON.stringify(
    {
      mcpServers: {
        'urumi-gateway': {
          url: gatewayUrl,
          headers: {
            Authorization: 'Bearer YOUR_GATEWAY_API_KEY'
          }
        }
      }
    },
    null,
    2
  );

  const cursorConfig = JSON.stringify(
    {
      name: 'urumi-gateway',
      type: 'streamable-http',
      url: gatewayUrl,
      headers: {
        Authorization: 'Bearer YOUR_GATEWAY_API_KEY'
      }
    },
    null,
    2
  );

  const inspectorCommand = `npx @modelcontextprotocol/inspector ${gatewayUrl} --header "Authorization: Bearer YOUR_GATEWAY_API_KEY"`;

  const nodeClientSnippet = `import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const transport = new StreamableHTTPClientTransport(
  new URL('${gatewayUrl}'),
  {
    requestInit: {
      headers: {
        'Authorization': 'Bearer YOUR_GATEWAY_API_KEY'
      }
    }
  }
);

const client = new Client({ name: 'my-app', version: '1.0.0' }, { capabilities: {} });
await client.connect(transport);
const tools = await client.listTools();
console.log('Aggregated cluster tools:', tools);`;

  return (
    <div className="page-container" style={{ maxWidth: '1080px' }}>
      <PageHeader
        title="Client Integration Guide"
        description="Connect external AI clients, IDEs, and scripts through the single streamable HTTP gateway endpoint with personal API key authentication."
        badge={
          <Badge variant="accent" dot>
            Streamable HTTP
          </Badge>
        }
      />

      {/* Primary Gateway Endpoint Callout */}
      <div
        className="console-card"
        style={{
          padding: '20px 24px',
          marginBottom: '24px',
          backgroundColor: 'var(--bg-surface-elevated)',
          border: '1px solid var(--accent-border)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Layers size={16} style={{ color: 'var(--accent-text)' }} />
            <span
              style={{
                fontSize: '11px',
                fontWeight: 600,
                color: 'var(--accent-text)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}
            >
              Unified Gateway MCP Endpoint
            </span>
          </div>
          <Badge variant="neutral">Gateway Protected</Badge>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '10px', flexWrap: 'wrap' }}>
          <code
            style={{
              flex: 1,
              minWidth: '260px',
              padding: '10px 14px',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'var(--bg-input)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--color-info-text)',
              fontFamily: 'var(--font-mono)',
              fontSize: '13px'
            }}
          >
            {gatewayUrl}
          </code>
          <Button
            variant="primary"
            size="md"
            onClick={() => copyToClipboard(gatewayUrl, 'url', 'MCP Endpoint URL')}
            icon={copiedSection === 'url' ? <Check size={14} /> : <Copy size={14} />}
          >
            {copiedSection === 'url' ? 'Copied' : 'Copy Endpoint'}
          </Button>
        </div>

        <div
          style={{
            marginTop: '12px',
            fontSize: '12px',
            color: 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            lineHeight: 1.5
          }}
        >
          <ShieldCheck size={15} style={{ color: 'var(--color-success-text)', flexShrink: 0 }} />
          <span>
            <strong>Upstream Isolation:</strong> Upstream services (WooCommerce, Inventory, Shipping) are private cluster workloads. External clients connect through the central gateway using personal API keys.
          </span>
        </div>
      </div>

      {/* Active API Key Context Notice */}
      <div
        className="console-card"
        style={{
          padding: '14px 20px',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          backgroundColor: activeKeys.length > 0 ? 'rgba(16, 185, 129, 0.05)' : 'rgba(245, 158, 11, 0.05)',
          borderColor: activeKeys.length > 0 ? 'rgba(16, 185, 129, 0.25)' : 'rgba(245, 158, 11, 0.25)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Key size={16} style={{ color: activeKeys.length > 0 ? 'var(--color-success)' : 'var(--color-warning)' }} />
          <span style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
            {activeKeys.length > 0 ? (
              <>
                You have <strong>{activeKeys.length} active API key{activeKeys.length === 1 ? '' : 's'}</strong> available. Replace <code>YOUR_GATEWAY_API_KEY</code> in the templates below with your secret key.
              </>
            ) : (
              <>
                No active API keys found on your account. Generate a personal key in <strong>Team & API Keys</strong> before connecting external clients.
              </>
            )}
          </span>
        </div>
        {activeKeys.length > 0 && (
          <Badge variant="success">
            Key: {activeKeys[0].keyPrefix}••••••••
          </Badge>
        )}
      </div>

      {/* Guide Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Claude Code */}
        <div className="console-card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Terminal size={16} style={{ color: 'var(--text-muted)' }} />
              <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                1. Claude Code CLI
              </h3>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => copyToClipboard(claudeCodeCommand, 'claude-code', 'Claude Code command')}
              icon={copiedSection === 'claude-code' ? <Check size={13} /> : <Copy size={13} />}
            >
              {copiedSection === 'claude-code' ? 'Copied' : 'Copy Command'}
            </Button>
          </div>
          <pre
            style={{
              padding: '12px 14px',
              backgroundColor: 'var(--bg-input)',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-primary)',
              fontSize: '12px',
              overflowX: 'auto',
              fontFamily: 'var(--font-mono)',
              lineHeight: 1.5
            }}
          >
            {claudeCodeCommand}
          </pre>
        </div>

        {/* Cursor */}
        <div className="console-card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Code2 size={16} style={{ color: 'var(--text-muted)' }} />
              <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                2. Cursor IDE Settings (.cursor/mcp.json)
              </h3>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => copyToClipboard(cursorConfig, 'cursor', 'Cursor configuration')}
              icon={copiedSection === 'cursor' ? <Check size={13} /> : <Copy size={13} />}
            >
              {copiedSection === 'cursor' ? 'Copied' : 'Copy JSON'}
            </Button>
          </div>
          <pre
            style={{
              padding: '12px 14px',
              backgroundColor: 'var(--bg-input)',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-primary)',
              fontSize: '12px',
              overflowX: 'auto',
              fontFamily: 'var(--font-mono)',
              lineHeight: 1.5
            }}
          >
            {cursorConfig}
          </pre>
        </div>

        {/* Claude Desktop */}
        <div className="console-card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Laptop size={16} style={{ color: 'var(--text-muted)' }} />
              <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                3. Claude Desktop (claude_desktop_config.json)
              </h3>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => copyToClipboard(claudeDesktopConfig, 'claude-desktop', 'Claude Desktop config')}
              icon={copiedSection === 'claude-desktop' ? <Check size={13} /> : <Copy size={13} />}
            >
              {copiedSection === 'claude-desktop' ? 'Copied' : 'Copy JSON'}
            </Button>
          </div>
          <pre
            style={{
              padding: '12px 14px',
              backgroundColor: 'var(--bg-input)',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-primary)',
              fontSize: '12px',
              overflowX: 'auto',
              fontFamily: 'var(--font-mono)',
              lineHeight: 1.5
            }}
          >
            {claudeDesktopConfig}
          </pre>
        </div>

        {/* MCP Inspector */}
        <div className="console-card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Bug size={16} style={{ color: 'var(--text-muted)' }} />
              <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                4. Official MCP Inspector (Session Debugger)
              </h3>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => copyToClipboard(inspectorCommand, 'inspector', 'MCP Inspector command')}
              icon={copiedSection === 'inspector' ? <Check size={13} /> : <Copy size={13} />}
            >
              {copiedSection === 'inspector' ? 'Copied' : 'Copy Command'}
            </Button>
          </div>
          <pre
            style={{
              padding: '12px 14px',
              backgroundColor: 'var(--bg-input)',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-primary)',
              fontSize: '12px',
              overflowX: 'auto',
              fontFamily: 'var(--font-mono)',
              lineHeight: 1.5
            }}
          >
            {inspectorCommand}
          </pre>
        </div>

        {/* TypeScript SDK Client */}
        <div className="console-card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FileCode2 size={16} style={{ color: 'var(--text-muted)' }} />
              <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                5. Programmatic TypeScript SDK Client
              </h3>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => copyToClipboard(nodeClientSnippet, 'sdk', 'SDK client snippet')}
              icon={copiedSection === 'sdk' ? <Check size={13} /> : <Copy size={13} />}
            >
              {copiedSection === 'sdk' ? 'Copied' : 'Copy Code'}
            </Button>
          </div>
          <pre
            style={{
              padding: '12px 14px',
              backgroundColor: 'var(--bg-input)',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--color-info-text)',
              fontSize: '11px',
              overflowX: 'auto',
              fontFamily: 'var(--font-mono)',
              lineHeight: 1.55
            }}
          >
            {nodeClientSnippet}
          </pre>
        </div>
      </div>
    </div>
  );
};
