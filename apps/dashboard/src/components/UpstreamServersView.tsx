import React, { useState, useEffect } from 'react';
import { UpstreamServer, ToolDefinition } from '../types/index.js';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.js';
import {
  PageHeader,
  Button,
  StatusBadge,
  Badge,
  Input,
  Checkbox,
  Modal,
  ConfirmDialog,
  EmptyState,
  Skeleton,
  Alert,
  useToast
} from './ui/index.js';
import {
  RefreshCw,
  Plus,
  Server,
  Settings,
  Trash2,
  ChevronDown,
  ChevronUp,
  Globe,
  Clock,
  Shield,
  Layers
} from 'lucide-react';

export const UpstreamServersView: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const toast = useToast();

  const [upstreams, setUpstreams] = useState<UpstreamServer[]>([]);
  const [tools, setTools] = useState<ToolDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modals & Confirmation
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingServer, setEditingServer] = useState<UpstreamServer | null>(null);
  const [deletingServer, setDeletingServer] = useState<UpstreamServer | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

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
      toast.success('Tools cache refreshed from all upstream servers');
    } catch (err: any) {
      setError(err.message || 'Failed to refresh tools');
      toast.error(err.message || 'Failed to refresh tools');
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
      toast.success(`Registered upstream server "${formName.trim()}"`);
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
        authToken: formAuthToken.trim() ? formAuthToken.trim() : undefined,
        timeoutMs: formTimeout,
        enabled: formEnabled
      });
      const name = formName.trim();
      setEditingServer(null);
      toast.success(`Updated upstream server "${name}"`);
      await fetchData();
    } catch (err: any) {
      setFormError(err.message || 'Failed to update upstream server');
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingServer) return;
    try {
      setIsDeleting(true);
      await api.deleteUpstream(deletingServer.id);
      const deletedName = deletingServer.name;
      setDeletingServer(null);
      toast.success(`Removed upstream server "${deletedName}"`);
      await fetchData();
    } catch (err: any) {
      setError(err.message || 'Failed to remove upstream server');
      toast.error(err.message || 'Failed to remove upstream server');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '0 24px 48px' }}>
      {/* Page Header */}
      <PageHeader
        title="Registered Upstream MCP Servers"
        description="Internal cluster services aggregated into the Gateway's single client-facing endpoint."
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Button
              variant="outline"
              onClick={handleRefreshTools}
              disabled={refreshing || loading}
              isLoading={refreshing}
              leftIcon={<RefreshCw size={14} />}
              aria-label="Refresh tools metadata"
            >
              Refresh Tools Cache
            </Button>

            {isAdmin && (
              <Button
                variant="primary"
                onClick={handleOpenCreate}
                leftIcon={<Plus size={14} />}
                aria-label="Register new upstream server"
              >
                Register Upstream
              </Button>
            )}
          </div>
        }
      />

      {/* Global Error Banner */}
      {error && (
        <Alert
          variant="danger"
          title="Cluster Communication Error"
          onDismiss={() => setError(null)}
          style={{ marginBottom: '20px' }}
        >
          {error}
        </Alert>
      )}

      {/* Upstream Servers Fleet */}
      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '20px' }}>
          {[1, 2, 3].map(i => (
            <div key={i} className="console-card" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px' }}>
                <Skeleton width="180px" height="20px" />
                <Skeleton width="80px" height="20px" borderRadius="12px" />
              </div>
              <Skeleton width="100%" height="14px" style={{ marginBottom: '8px' }} />
              <Skeleton width="70%" height="14px" style={{ marginBottom: '20px' }} />
              <Skeleton width="100%" height="80px" borderRadius="var(--radius-sm)" />
            </div>
          ))}
        </div>
      ) : upstreams.length === 0 ? (
        <EmptyState
          icon={<Server size={24} />}
          title="No Upstream MCP Servers Registered"
          description="Register an internal cluster service using Streamable HTTP to aggregate its tools into the gateway."
          actionLabel={isAdmin ? "Register Upstream" : undefined}
          onAction={isAdmin ? handleOpenCreate : undefined}
        />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: '20px' }}>
          {upstreams.map(server => {
            const serverTools = tools.filter(t => t.upstreamSlug === server.slug);
            const statusKey = !server.enabled ? 'disabled' : (server.status === 'connected' ? 'connected' : 'unreachable');

            return (
              <div
                key={server.id}
                className="console-card"
                style={{
                  padding: '20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '16px',
                  opacity: server.enabled ? 1 : 0.75,
                  borderStyle: server.enabled ? 'solid' : 'dashed'
                }}
              >
                {/* Card Header */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
                  <div>
                    <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                      {server.name}
                    </h3>
                    <div style={{ marginTop: '4px' }}>
                      <Badge variant="accent">
                        slug: {server.slug}
                      </Badge>
                    </div>
                  </div>
                  <div>
                    <StatusBadge status={statusKey} />
                  </div>
                </div>

                {/* Metadata details */}
                <div style={{ fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '8px', color: 'var(--text-secondary)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Globe size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                    <code style={{ color: 'var(--text-primary)', wordBreak: 'break-all', fontSize: '11px' }}>
                      {server.url}
                    </code>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Clock size={13} style={{ color: 'var(--text-muted)' }} />
                      <span>{server.timeoutMs}ms</span>
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Shield size={13} style={{ color: 'var(--text-muted)' }} />
                      <span>{server.hasAuthToken ? 'Injected Server-Side' : 'No Secret'}</span>
                    </span>
                  </div>
                </div>

                {/* Aggregated Tools Drawer/Accordion */}
                <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '12px', marginTop: 'auto' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Layers size={13} style={{ color: 'var(--accent-primary)' }} />
                      Declared Tools ({serverTools.length})
                    </span>
                  </div>

                  {serverTools.length === 0 ? (
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic', margin: 0 }}>
                      {server.enabled ? 'No tools discovered or service unreachable' : 'Tools omitted (server disabled)'}
                    </p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '220px', overflowY: 'auto' }}>
                      {serverTools.map(tool => {
                        const isExpanded = expandedTool === tool.name;
                        return (
                          <div
                            key={tool.name}
                            style={{
                              background: 'var(--bg-canvas)',
                              border: '1px solid var(--border-subtle)',
                              borderRadius: 'var(--radius-sm)',
                              padding: '8px 10px',
                              fontSize: '12px'
                            }}
                          >
                            <div
                              onClick={() => setExpandedTool(isExpanded ? null : tool.name)}
                              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
                            >
                              <code style={{ color: 'var(--accent-primary)', fontWeight: 600, fontSize: '12px' }}>
                                {tool.name}
                              </code>
                              <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                {isExpanded ? 'Hide' : 'Schema'}
                              </span>
                            </div>

                            {tool.description && (
                              <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px', marginBottom: 0 }}>
                                {tool.description}
                              </p>
                            )}

                            {isExpanded && (
                              <pre
                                style={{
                                  marginTop: '8px',
                                  padding: '8px',
                                  background: 'rgba(0, 0, 0, 0.4)',
                                  borderRadius: 'var(--radius-sm)',
                                  fontSize: '11px',
                                  color: 'var(--accent-success)',
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingTop: '12px', borderTop: '1px solid var(--border-subtle)' }}>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleOpenEdit(server)}
                      leftIcon={<Settings size={13} />}
                    >
                      Configure / Rotate
                    </Button>

                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => setDeletingServer(server)}
                      leftIcon={<Trash2 size={13} />}
                      style={{ marginLeft: 'auto' }}
                    >
                      Remove
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal: Create Upstream */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Register Upstream MCP Server"
        description="Connect an internal cluster service using Streamable HTTP. URLs are validated against SSRF protection policies."
        footer={
          <>
            <Button variant="outline" onClick={() => setShowCreateModal(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleSaveCreate}
              isLoading={formSubmitting}
            >
              Register Upstream
            </Button>
          </>
        }
      >
        {formError && (
          <Alert variant="danger" title="Registration Failed" style={{ marginBottom: '16px' }}>
            {formError}
          </Alert>
        )}

        <form onSubmit={handleSaveCreate} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <Input
            label="Server Display Name"
            required
            value={formName}
            onChange={e => setFormName(e.target.value)}
            placeholder="e.g. Warehouse Inventory"
          />

          <Input
            label="Server Slug (used in namespacing: <slug>__<tool>)"
            required
            pattern="^[a-z0-9-]+$"
            value={formSlug}
            onChange={e => setFormSlug(e.target.value.toLowerCase())}
            placeholder="e.g. inventory"
            helperText="Lowercase alphanumeric and hyphens only"
          />

          <Input
            label="Streamable HTTP Endpoint URL"
            type="url"
            required
            value={formUrl}
            onChange={e => setFormUrl(e.target.value)}
            placeholder="http://inventory-mcp:4002/mcp"
            leftIcon={<Globe size={14} />}
          />

          <Input
            label="Optional Upstream Secret / Bearer Token"
            type="password"
            value={formAuthToken}
            onChange={e => setFormAuthToken(e.target.value)}
            placeholder="Optional token injected strictly server-side"
            leftIcon={<Shield size={14} />}
            helperText="Stored credentials are encrypted and never exposed to clients"
          />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', alignItems: 'flex-start' }}>
            <Input
              label="Timeout (ms)"
              type="number"
              min={500}
              max={60000}
              value={formTimeout}
              onChange={e => setFormTimeout(Number(e.target.value))}
            />

            <div style={{ paddingTop: '26px' }}>
              <Checkbox
                label="Enabled initially"
                checked={formEnabled}
                onChange={e => setFormEnabled(e.target.checked)}
              />
            </div>
          </div>
        </form>
      </Modal>

      {/* Modal: Edit / Rotate Upstream */}
      <Modal
        isOpen={Boolean(editingServer)}
        onClose={() => setEditingServer(null)}
        title={`Configure Upstream: ${editingServer?.name || ''}`}
        description="Update service parameters or rotate credentials. Stored secrets are never revealed."
        footer={
          <>
            <Button variant="outline" onClick={() => setEditingServer(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleSaveEdit}
              isLoading={formSubmitting}
            >
              Save Changes
            </Button>
          </>
        }
      >
        {formError && (
          <Alert variant="danger" title="Update Failed" style={{ marginBottom: '16px' }}>
            {formError}
          </Alert>
        )}

        {editingServer && (
          <form onSubmit={handleSaveEdit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <Input
              label="Server Display Name"
              required
              value={formName}
              onChange={e => setFormName(e.target.value)}
            />

            <Input
              label="Streamable HTTP Endpoint URL"
              type="url"
              required
              value={formUrl}
              onChange={e => setFormUrl(e.target.value)}
              leftIcon={<Globe size={14} />}
            />

            <Input
              label="Rotate Credential (Bearer Token / Secret)"
              type="password"
              value={formAuthToken}
              onChange={e => setFormAuthToken(e.target.value)}
              placeholder="Leave blank to preserve existing secret"
              leftIcon={<Shield size={14} />}
              helperText={`Current status: ${editingServer.hasAuthToken ? 'Active secret configured' : 'No credential configured'}`}
            />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', alignItems: 'flex-start' }}>
              <Input
                label="Timeout (ms)"
                type="number"
                min={500}
                max={60000}
                value={formTimeout}
                onChange={e => setFormTimeout(Number(e.target.value))}
              />

              <div style={{ paddingTop: '26px' }}>
                <Checkbox
                  label="Service Enabled"
                  checked={formEnabled}
                  onChange={e => setFormEnabled(e.target.checked)}
                />
              </div>
            </div>
          </form>
        )}
      </Modal>

      {/* Confirm Remove Dialog */}
      <ConfirmDialog
        isOpen={Boolean(deletingServer)}
        title={`Remove Upstream Server "${deletingServer?.name || ''}"?`}
        description="This will immediately remove the server from the Gateway routing table. Any tools provided by this server will be unregistered from client sessions."
        confirmLabel="Remove Server"
        variant="danger"
        isLoading={isDeleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeletingServer(null)}
      />
    </div>
  );
};
