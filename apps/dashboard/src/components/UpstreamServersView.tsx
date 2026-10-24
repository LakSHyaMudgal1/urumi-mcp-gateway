import React, { useState, useEffect } from 'react';
import { UpstreamServer, ToolDefinition } from '../types/index.js';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.js';

export const UpstreamServersView: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [upstreams, setUpstreams] = useState<UpstreamServer[]>([]);
  const [tools, setTools] = useState<ToolDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modals & Forms
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingServer, setEditingServer] = useState<UpstreamServer | null>(null);

  // Form State
  const [formName, setFormName] = useState('');
  const [formSlug, setFormSlug] = useState('');
  const [formUrl, setFormUrl] = useState('');
  const [formAuthToken, setFormAuthToken] = useState('');
  const [formTimeout, setFormTimeout] = useState(10000);
  const [formEnabled, setFormEnabled] = useState(true);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Expanded tool schemas
  const [expandedTool, setExpandedTool] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [upstreamsData, toolsData] = await Promise.all([
        api.getUpstreams(),
        api.getTools()
      ]);
      setUpstreams(upstreamsData);
      setTools(toolsData.tools);
    } catch (err: any) {
      setError(err.message || 'Failed to load upstream servers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleRefreshTools = async () => {
    try {
      setRefreshing(true);
      setError(null);
      const res = await api.refreshTools();
      setTools(res.tools);
      // Re-fetch upstreams to sync statuses
      const upstreamsData = await api.getUpstreams();
      setUpstreams(upstreamsData);
    } catch (err: any) {
      setError(err.message || 'Failed to refresh tools');
    } finally {
      setRefreshing(false);
    }
  };

  const handleOpenCreate = () => {
    setFormName('');
    setFormSlug('');
    setFormUrl('');
    setFormAuthToken('');
    setFormTimeout(10000);
    setFormEnabled(true);
    setFormError(null);
    setShowCreateModal(true);
  };

  const handleOpenEdit = (server: UpstreamServer) => {
    setEditingServer(server);
    setFormName(server.name);
    setFormSlug(server.slug);
    setFormUrl(server.url);
    setFormAuthToken(''); // Always empty: allow replacement without revealing existing secret
    setFormTimeout(server.timeoutMs);
    setFormEnabled(server.enabled);
    setFormError(null);
  };

  const handleSaveCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormSubmitting(true);
    setFormError(null);
    try {
      await api.createUpstream({
        name: formName.trim(),
        slug: formSlug.trim(),
        url: formUrl.trim(),
        authToken: formAuthToken.trim() || null,
        timeoutMs: formTimeout,
        enabled: formEnabled
      });
      setShowCreateModal(false);
      await fetchData();
    } catch (err: any) {
      setFormError(err.message || 'Failed to register upstream server');
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingServer) return;
    setFormSubmitting(true);
    setFormError(null);
    try {
      await api.updateUpstream(editingServer.id, {
        name: formName.trim(),
        url: formUrl.trim(),
        // Only pass authToken if user typed something new; empty string keeps old token
        authToken: formAuthToken.trim() ? formAuthToken.trim() : undefined,
        timeoutMs: formTimeout,
        enabled: formEnabled
      });
      setEditingServer(null);
      await fetchData();
    } catch (err: any) {
      setFormError(err.message || 'Failed to update upstream server');
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleDelete = async (server: UpstreamServer) => {
    if (!window.confirm(`Are you sure you want to remove upstream server "${server.name}"?`)) {
      return;
    }
    try {
      await api.deleteUpstream(server.id);
      await fetchData();
    } catch (err: any) {
      setError(err.message || 'Failed to remove upstream server');
    }
  };

  const getStatusBadge = (status: string, enabled: boolean) => {
    if (!enabled) {
      return (
        <span style={{ padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600, background: 'rgba(100, 116, 139, 0.2)', color: '#94a3b8', border: '1px solid rgba(100, 116, 139, 0.3)' }}>
          Disabled
        </span>
      );
    }
    if (status === 'connected') {
      return (
        <span style={{ padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600, background: 'rgba(16, 185, 129, 0.15)', color: 'var(--accent-success)', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
          Connected
        </span>
      );
    }
    return (
      <span style={{ padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600, background: 'rgba(239, 68, 68, 0.15)', color: 'var(--accent-danger)', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
        Unreachable
      </span>
    );
  };

  return (
    <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '0 24px 48px' }}>
      {/* View Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)' }}>
            Registered Upstream MCP Servers
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Internal cluster services aggregated into the Gateway's single client-facing endpoint.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={handleRefreshTools}
            disabled={refreshing || loading}
            aria-label="Refresh tools metadata"
            style={{
              padding: '8px 16px',
              fontSize: '13px',
              fontWeight: 500,
              borderRadius: '8px',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-primary)',
              cursor: 'pointer'
            }}
          >
            {refreshing ? 'Refreshing Cache...' : '↻ Refresh Tools Cache'}
          </button>

          {isAdmin && (
            <button
              onClick={handleOpenCreate}
              aria-label="Register new upstream server"
              style={{
                padding: '8px 16px',
                fontSize: '13px',
                fontWeight: 600,
                borderRadius: '8px',
                background: 'var(--accent-primary)',
                border: 'none',
                color: '#ffffff',
                cursor: 'pointer',
                boxShadow: '0 2px 8px var(--accent-glow)'
              }}
            >
              + Register Upstream
            </button>
          )}
        </div>
      </div>

      {/* Global Error Banner */}
      {error && (
        <div
          role="alert"
          style={{
            padding: '12px 16px',
            borderRadius: '8px',
            background: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            color: '#fca5a5',
            fontSize: '13px',
            marginBottom: '20px'
          }}
        >
          {error}
        </div>
      )}

      {/* Upstream Servers Grid */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
          Loading upstream server fleet...
        </div>
      ) : upstreams.length === 0 ? (
        <div className="glass-panel" style={{ padding: '40px', textAlign: 'center' }}>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>No upstream MCP servers are currently registered.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '20px' }}>
          {upstreams.map(server => {
            const serverTools = tools.filter(t => t.upstreamSlug === server.slug);

            return (
              <div
                key={server.id}
                className="glass-panel"
                style={{
                  padding: '20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px',
                  border: server.enabled ? '1px solid var(--border-subtle)' : '1px dashed rgba(255, 255, 255, 0.08)',
                  opacity: server.enabled ? 1 : 0.75
                }}
              >
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <div>
                    <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {server.name}
                    </h3>
                    <code style={{ fontSize: '11px', color: 'var(--accent-primary)', background: 'rgba(99, 102, 241, 0.1)', padding: '2px 6px', borderRadius: '4px', marginTop: '4px', display: 'inline-block' }}>
                      slug: {server.slug}
                    </code>
                  </div>
                  <div>{getStatusBadge(server.status, server.enabled)}</div>
                </div>

                {/* Metadata */}
                <div style={{ fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '6px', color: 'var(--text-secondary)' }}>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Endpoint URL: </span>
                    <code style={{ color: 'var(--text-primary)', wordBreak: 'break-all' }}>{server.url}</code>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Timeout: </span>
                    <span>{server.timeoutMs}ms</span>
                    <span style={{ margin: '0 8px', color: 'var(--border-subtle)' }}>•</span>
                    <span style={{ color: 'var(--text-muted)' }}>Credentials: </span>
                    <span>{server.hasAuthToken ? 'Injected Server-Side (Masked)' : 'None'}</span>
                  </div>
                </div>

                {/* Aggregated Tools for this server */}
                <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
                      Tools Declared ({serverTools.length})
                    </span>
                  </div>

                  {serverTools.length === 0 ? (
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                      {server.enabled ? 'No tools discovered or server unreachable' : 'Tools omitted (server disabled)'}
                    </p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {serverTools.map(tool => {
                        const isExpanded = expandedTool === tool.name;
                        return (
                          <div
                            key={tool.name}
                            style={{
                              background: 'rgba(15, 23, 42, 0.4)',
                              borderRadius: '6px',
                              padding: '8px',
                              fontSize: '12px'
                            }}
                          >
                            <div
                              onClick={() => setExpandedTool(isExpanded ? null : tool.name)}
                              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
                            >
                              <code style={{ color: '#a5b4fc', fontWeight: 600 }}>{tool.name}</code>
                              <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                                {isExpanded ? '▲ Hide Schema' : '▼ View Schema'}
                              </span>
                            </div>

                            {tool.description && (
                              <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                                {tool.description}
                              </p>
                            )}

                            {isExpanded && (
                              <pre
                                style={{
                                  marginTop: '8px',
                                  padding: '8px',
                                  background: 'rgba(0, 0, 0, 0.4)',
                                  borderRadius: '4px',
                                  fontSize: '11px',
                                  color: '#34d399',
                                  overflowX: 'auto',
                                  fontFamily: 'var(--font-mono)'
                                }}
                              >
                                {JSON.stringify(tool.inputSchema, null, 2)}
                              </pre>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Admin Controls */}
                {isAdmin && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: 'auto', paddingTop: '10px', borderTop: '1px solid var(--border-subtle)' }}>
                    <button
                      onClick={() => handleOpenEdit(server)}
                      style={{
                        padding: '6px 12px',
                        fontSize: '12px',
                        borderRadius: '6px',
                        background: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid var(--border-subtle)',
                        color: 'var(--text-primary)',
                        cursor: 'pointer'
                      }}
                    >
                      Configure / Rotate
                    </button>

                    <button
                      onClick={() => handleDelete(server)}
                      style={{
                        padding: '6px 12px',
                        fontSize: '12px',
                        borderRadius: '6px',
                        background: 'rgba(239, 68, 68, 0.1)',
                        border: '1px solid rgba(239, 68, 68, 0.25)',
                        color: '#f87171',
                        cursor: 'pointer',
                        marginLeft: 'auto'
                      }}
                    >
                      Remove
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal: Create Upstream */}
      {showCreateModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0, 0, 0, 0.75)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '16px' }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: '520px', padding: '28px', borderRadius: '16px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
              Register Upstream MCP Server
            </h3>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              Connect an internal cluster service using Streamable HTTP. Upstream URLs are validated against SSRF protection policies.
            </p>

            {formError && (
              <div role="alert" style={{ padding: '10px', borderRadius: '6px', background: 'rgba(239, 68, 68, 0.15)', color: '#fca5a5', fontSize: '12px', marginBottom: '16px' }}>
                {formError}
              </div>
            )}

            <form onSubmit={handleSaveCreate} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  Server Display Name
                </label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  placeholder="e.g. Warehouse Inventory"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', background: 'rgba(15, 23, 42, 0.6)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', fontSize: '13px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  Server Slug (used in namespacing: &lt;slug&gt;__&lt;tool&gt;)
                </label>
                <input
                  type="text"
                  required
                  pattern="^[a-z0-9-]+$"
                  value={formSlug}
                  onChange={e => setFormSlug(e.target.value.toLowerCase())}
                  placeholder="e.g. inventory"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', background: 'rgba(15, 23, 42, 0.6)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', fontSize: '13px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  Streamable HTTP Endpoint URL
                </label>
                <input
                  type="url"
                  required
                  value={formUrl}
                  onChange={e => setFormUrl(e.target.value)}
                  placeholder="http://inventory-mcp:4002/mcp"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', background: 'rgba(15, 23, 42, 0.6)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', fontSize: '13px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  Optional Upstream Secret / Bearer Token
                </label>
                <input
                  type="password"
                  value={formAuthToken}
                  onChange={e => setFormAuthToken(e.target.value)}
                  placeholder="Optional token injected strictly server-side"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', background: 'rgba(15, 23, 42, 0.6)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', fontSize: '13px' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    Timeout (ms)
                  </label>
                  <input
                    type="number"
                    min="500"
                    max="60000"
                    value={formTimeout}
                    onChange={e => setFormTimeout(Number(e.target.value))}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', background: 'rgba(15, 23, 42, 0.6)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', fontSize: '13px' }}
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', marginTop: '22px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: 'var(--text-primary)' }}>
                    <input
                      type="checkbox"
                      checked={formEnabled}
                      onChange={e => setFormEnabled(e.target.checked)}
                    />
                    Enabled initially
                  </label>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px' }}>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  style={{ padding: '8px 16px', borderRadius: '6px', background: 'transparent', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  style={{ padding: '8px 18px', borderRadius: '6px', background: 'var(--accent-primary)', border: 'none', color: '#ffffff', fontWeight: 600, cursor: 'pointer' }}
                >
                  {formSubmitting ? 'Registering...' : 'Register Upstream'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edit / Rotate Upstream */}
      {editingServer && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0, 0, 0, 0.75)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '16px' }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: '520px', padding: '28px', borderRadius: '16px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
              Configure Upstream: {editingServer.name}
            </h3>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              Update service settings or rotate credentials. Stored secrets are never revealed.
            </p>

            {formError && (
              <div role="alert" style={{ padding: '10px', borderRadius: '6px', background: 'rgba(239, 68, 68, 0.15)', color: '#fca5a5', fontSize: '12px', marginBottom: '16px' }}>
                {formError}
              </div>
            )}

            <form onSubmit={handleSaveEdit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  Server Display Name
                </label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', background: 'rgba(15, 23, 42, 0.6)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', fontSize: '13px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  Streamable HTTP Endpoint URL
                </label>
                <input
                  type="url"
                  required
                  value={formUrl}
                  onChange={e => setFormUrl(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', background: 'rgba(15, 23, 42, 0.6)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', fontSize: '13px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  Rotate Credential (Bearer Token / Secret)
                </label>
                <input
                  type="password"
                  value={formAuthToken}
                  onChange={e => setFormAuthToken(e.target.value)}
                  placeholder="Leave blank to keep existing secret, or enter new token"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', background: 'rgba(15, 23, 42, 0.6)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', fontSize: '13px' }}
                />
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                  Current status: {editingServer.hasAuthToken ? 'Active secret configured' : 'No credential configured'}
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    Timeout (ms)
                  </label>
                  <input
                    type="number"
                    min="500"
                    max="60000"
                    value={formTimeout}
                    onChange={e => setFormTimeout(Number(e.target.value))}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', background: 'rgba(15, 23, 42, 0.6)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', fontSize: '13px' }}
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', marginTop: '22px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: 'var(--text-primary)' }}>
                    <input
                      type="checkbox"
                      checked={formEnabled}
                      onChange={e => setFormEnabled(e.target.checked)}
                    />
                    Enabled
                  </label>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px' }}>
                <button
                  type="button"
                  onClick={() => setEditingServer(null)}
                  style={{ padding: '8px 16px', borderRadius: '6px', background: 'transparent', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  style={{ padding: '8px 18px', borderRadius: '6px', background: 'var(--accent-primary)', border: 'none', color: '#ffffff', fontWeight: 600, cursor: 'pointer' }}
                >
                  {formSubmitting ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
