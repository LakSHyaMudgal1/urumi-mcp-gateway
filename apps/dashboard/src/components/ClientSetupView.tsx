import React, { useState } from 'react';

export const ClientSetupView: React.FC = () => {
  const [copiedSection, setCopiedSection] = useState<string | null>(null);

  // Derive gateway MCP endpoint URL from current origin or default local port 4000
  const gatewayUrl = typeof window !== 'undefined'
    ? `${window.location.protocol}//${window.location.hostname}:4000/mcp`
    : 'http://localhost:4000/mcp';

  const copyToClipboard = (text: string, sectionId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSection(sectionId);
    setTimeout(() => setCopiedSection(null), 2000);
  };

  const claudeCodeCommand = `claude mcp add urumi-gateway --transport streamable-http ${gatewayUrl} --header "Authorization: Bearer YOUR_GATEWAY_API_KEY"`;

  const claudeDesktopConfig = JSON.stringify(
    {
      mcpServers: {
        "urumi-gateway": {
          url: gatewayUrl,
          headers: {
            Authorization: "Bearer YOUR_GATEWAY_API_KEY"
          }
        }
      }
    },
    null,
    2
  );

  const cursorConfig = JSON.stringify(
    {
      name: "urumi-gateway",
      type: "streamable-http",
      url: gatewayUrl,
      headers: {
        Authorization: "Bearer YOUR_GATEWAY_API_KEY"
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
    <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '0 24px 48px' }}>
      {/* Header */}
      <div style={{ marginBottom: '28px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)' }}>
          MCP Client Integration Guide
        </h2>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
          Connect external MCP clients and AI assistants through the single gateway endpoint.
        </p>
      </div>

      {/* Primary Gateway Endpoint Box */}
      <div
        className="glass-panel"
        style={{
          padding: '24px',
          marginBottom: '28px',
          background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.1), rgba(59, 130, 246, 0.05))',
          border: '1px solid var(--border-accent)',
          borderRadius: '12px'
        }}
      >
        <span style={{ fontSize: '11px', fontWeight: 700, color: '#a5b4fc', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Unified Cluster MCP Endpoint
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '10px', flexWrap: 'wrap' }}>
          <code
            style={{
              flex: 1,
              minWidth: '260px',
              padding: '12px 16px',
              borderRadius: '8px',
              background: 'rgba(0, 0, 0, 0.5)',
              border: '1px solid var(--border-subtle)',
              color: '#38bdf8',
              fontFamily: 'var(--font-mono)',
              fontSize: '14px'
            }}
          >
            {gatewayUrl}
          </code>
          <button
            onClick={() => copyToClipboard(gatewayUrl, 'url')}
            style={{
              padding: '12px 18px',
              borderRadius: '8px',
              background: copiedSection === 'url' ? 'var(--accent-success)' : 'var(--accent-primary)',
              color: '#ffffff',
              border: 'none',
              fontWeight: 600,
              fontSize: '13px',
              cursor: 'pointer'
            }}
          >
            {copiedSection === 'url' ? '✓ Copied' : 'Copy Endpoint'}
          </button>
        </div>

        <div style={{ marginTop: '14px', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
          <p>
            🔒 <strong>Zero Direct Upstream Exposure:</strong> Upstream services (WooCommerce, Inventory, Shipping) are internal ClusterIP workloads. External clients and LLMs authenticate strictly through this endpoint using their Gateway API key.
          </p>
        </div>
      </div>

      {/* Guide Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Claude Code */}
        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>
              1. Claude Code CLI
            </h3>
            <button
              onClick={() => copyToClipboard(claudeCodeCommand, 'claude-code')}
              style={{ padding: '6px 12px', fontSize: '12px', borderRadius: '6px', background: 'rgba(255, 255, 255, 0.05)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', cursor: 'pointer' }}
            >
              {copiedSection === 'claude-code' ? '✓ Copied' : 'Copy Command'}
            </button>
          </div>
          <pre style={{ padding: '12px', background: 'rgba(0, 0, 0, 0.5)', borderRadius: '6px', color: '#cbd5e1', fontSize: '12px', overflowX: 'auto', fontFamily: 'var(--font-mono)' }}>
            {claudeCodeCommand}
          </pre>
        </div>

        {/* Cursor */}
        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>
              2. Cursor IDE Settings (MCP)
            </h3>
            <button
              onClick={() => copyToClipboard(cursorConfig, 'cursor')}
              style={{ padding: '6px 12px', fontSize: '12px', borderRadius: '6px', background: 'rgba(255, 255, 255, 0.05)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', cursor: 'pointer' }}
            >
              {copiedSection === 'cursor' ? '✓ Copied' : 'Copy JSON'}
            </button>
          </div>
          <pre style={{ padding: '12px', background: 'rgba(0, 0, 0, 0.5)', borderRadius: '6px', color: '#cbd5e1', fontSize: '12px', overflowX: 'auto', fontFamily: 'var(--font-mono)' }}>
            {cursorConfig}
          </pre>
        </div>

        {/* Claude Desktop */}
        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>
              3. Claude Desktop (<code style={{ fontSize: '12px' }}>claude_desktop_config.json</code>)
            </h3>
            <button
              onClick={() => copyToClipboard(claudeDesktopConfig, 'claude-desktop')}
              style={{ padding: '6px 12px', fontSize: '12px', borderRadius: '6px', background: 'rgba(255, 255, 255, 0.05)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', cursor: 'pointer' }}
            >
              {copiedSection === 'claude-desktop' ? '✓ Copied' : 'Copy JSON'}
            </button>
          </div>
          <pre style={{ padding: '12px', background: 'rgba(0, 0, 0, 0.5)', borderRadius: '6px', color: '#cbd5e1', fontSize: '12px', overflowX: 'auto', fontFamily: 'var(--font-mono)' }}>
            {claudeDesktopConfig}
          </pre>
        </div>

        {/* MCP Inspector */}
        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>
              4. MCP Inspector (Debugging)
            </h3>
            <button
              onClick={() => copyToClipboard(inspectorCommand, 'inspector')}
              style={{ padding: '6px 12px', fontSize: '12px', borderRadius: '6px', background: 'rgba(255, 255, 255, 0.05)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', cursor: 'pointer' }}
            >
              {copiedSection === 'inspector' ? '✓ Copied' : 'Copy Command'}
            </button>
          </div>
          <pre style={{ padding: '12px', background: 'rgba(0, 0, 0, 0.5)', borderRadius: '6px', color: '#cbd5e1', fontSize: '12px', overflowX: 'auto', fontFamily: 'var(--font-mono)' }}>
            {inspectorCommand}
          </pre>
        </div>

        {/* Programmatic SDK */}
        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>
              5. TypeScript SDK Client
            </h3>
            <button
              onClick={() => copyToClipboard(nodeClientSnippet, 'sdk')}
              style={{ padding: '6px 12px', fontSize: '12px', borderRadius: '6px', background: 'rgba(255, 255, 255, 0.05)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', cursor: 'pointer' }}
            >
              {copiedSection === 'sdk' ? '✓ Copied' : 'Copy Code'}
            </button>
          </div>
          <pre style={{ padding: '12px', background: 'rgba(0, 0, 0, 0.5)', borderRadius: '6px', color: '#a5f3fc', fontSize: '11px', overflowX: 'auto', fontFamily: 'var(--font-mono)', lineHeight: '1.5' }}>
            {nodeClientSnippet}
          </pre>
        </div>
      </div>
    </div>
  );
};
