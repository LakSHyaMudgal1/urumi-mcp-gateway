import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { UpstreamServer, ToolDefinition, AuditLog } from '../types/index.js';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.js';
import {
  PageHeader,
  Button,
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
  Shield,
  Search,
  Filter,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  CheckCircle2,
  AlertTriangle,
  PauseCircle,
  Zap,
  Power,
  AlertCircle,
  X
} from 'lucide-react';

/**
 * Sanitizes endpoint URL to display only hostname, port, and path,
 * strictly stripping any embedded credentials or userinfo.
 */
export function extractEndpointHostname(urlStr: string): string {
  try {
    const parsed = new URL(urlStr);
    const hostWithPort = `${parsed.hostname}${parsed.port ? `:${parsed.port}` : ''}`;
    const cleanPath = parsed.pathname !== '/' ? parsed.pathname : '';
    return `${hostWithPort}${cleanPath}`;
  } catch {
    return urlStr.replace(/^https?:\/\//, '').split('@').pop() || urlStr;
  }
}

/**
 * Infers server domain category from slug and name.
 */
export function getServerCategory(slug: string, name: string): string {
  const s = `${slug} ${name}`.toLowerCase();
  if (s.includes('woo') || s.includes('store') || s.includes('shop') || s.includes('commerce')) {
    return 'E-Commerce';
  }
  if (s.includes('invent') || s.includes('stock') || s.includes('catalog') || s.includes('wareh')) {
    return 'Inventory';
  }
  if (s.includes('ship') || s.includes('fulfill') || s.includes('logist') || s.includes('post') || s.includes('carrier')) {
    return 'Shipping';
  }
  return 'Cluster Service';
}

/**
 * Formats relative timestamp or returns default.
 */
export function formatCheckedTime(isoString?: string | null): string {
  if (!isoString) return 'Not checked yet';
  try {
    const diffMs = Date.now() - new Date(isoString).getTime();
    if (diffMs < 0) return 'Just now';
    const seconds = Math.floor(diffMs / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  } catch {
    return isoString;
  }
}

export const UpstreamServersView: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const toast = useToast();

  // Core Data
  const [upstreams, setUpstreams] = useState<UpstreamServer[]>([]);
  const [tools, setTools] = useState<ToolDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Table Filters & Pagination
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'connected' | 'unreachable' | 'disabled'>('all');
  const [sortBy, setSortBy] = useState<'name-asc' | 'name-desc' | 'status' | 'tools-desc' | 'timeout-asc'>('name-asc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);

  // Per-Row Async States (never freezes whole table)
  const [testingRowId, setTestingRowId] = useState<string | null>(null);
  const [togglingRowId, setTogglingRowId] = useState<string | null>(null);

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingServer, setEditingServer] = useState<UpstreamServer | null>(null);
  const [deletingServer, setDeletingServer] = useState<UpstreamServer | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [selectedServerForDetail, setSelectedServerForDetail] = useState<UpstreamServer | null>(null);

  // Detail Modal State
  const [detailTab, setDetailTab] = useState<'tools' | 'health' | 'logs'>('tools');
  const [serverAuditLogs, setServerAuditLogs] = useState<AuditLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [expandedTool, setExpandedTool] = useState<string | null>(null);

  // Add/Edit Form State
  const [formName, setFormName] = useState('');
  const [formSlug, setFormSlug] = useState('');
  const [formUrl, setFormUrl] = useState('');
  const [formAuthToken, setFormAuthToken] = useState('');
  const [formTimeout, setFormTimeout] = useState(10000);
  const [formEnabled, setFormEnabled] = useState(true);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [formGlobalError, setFormGlobalError] = useState<string | null>(null);

  // Load Initial Data
  const fetchData = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Global Refresh All Tools & Statuses
  const handleRefreshAll = async () => {
    try {
      setRefreshingAll(true);
      setError(null);
      const res = await api.refreshTools();
      setTools(res.tools);
      const upstreamsData = await api.getUpstreams();
      setUpstreams(upstreamsData);
      toast.success(`Tools cache synchronized (${res.count} tools active)`);
    } catch (err: any) {
      setError(err.message || 'Failed to refresh tools');
      toast.error(err.message || 'Failed to refresh tools');
    } finally {
      setRefreshingAll(false);
    }
  };

  // Per-Row Test Connection
  const handleTestConnection = async (server: UpstreamServer) => {
    if (!server.enabled) {
      toast.error(`Cannot test disabled server "${server.name}". Enable it first.`);
      return;
    }
    try {
      setTestingRowId(server.id);
      const res = await api.testUpstream(server.id);
      if (res.success) {
        toast.success(`Connected to ${server.name} in ${res.latencyMs}ms (${res.toolCount || 0} tools)`);
      } else {
        toast.error(`Connection failed for ${server.name}: ${res.error || 'Server unreachable'}`);
      }
      // Silently refresh upstreams to update status and lastCheckedAt
      const updatedList = await api.getUpstreams();
      setUpstreams(updatedList);
    } catch (err: any) {
      toast.error(err.message || `Failed to test connection to ${server.name}`);
    } finally {
      setTestingRowId(null);
    }
  };

  // Per-Row Enable/Disable Toggle
  const handleToggleEnable = async (server: UpstreamServer) => {
    try {
      setTogglingRowId(server.id);
      const nextState = !server.enabled;
      await api.updateUpstream(server.id, { enabled: nextState });
      toast.success(`Server "${server.name}" ${nextState ? 'enabled' : 'disabled'}`);
      const [upstreamsData, toolsData] = await Promise.all([
        api.getUpstreams(),
        api.getTools()
      ]);
      setUpstreams(upstreamsData);
      setTools(toolsData.tools);
    } catch (err: any) {
      toast.error(err.message || `Failed to update status for ${server.name}`);
    } finally {
      setTogglingRowId(null);
    }
  };

  // Open Server Detail Modal
  const handleOpenDetail = async (server: UpstreamServer) => {
    setSelectedServerForDetail(server);
    setDetailTab('tools');
    setExpandedTool(null);
    setServerAuditLogs([]);

    if (isAdmin) {
      try {
        setLoadingLogs(true);
        const res = await api.getAuditLogs({ upstreamSlug: server.slug, limit: 10 });
        setServerAuditLogs(res.logs || []);
      } catch {
        // Silently tolerate if audit logs fail or restricted
      } finally {
        setLoadingLogs(false);
      }
    }
  };

  // Form Validation
  const validateForm = (isEdit: boolean): boolean => {
    const errors: Record<string, string> = {};

    if (!formName.trim()) {
      errors.name = 'Server display name is required.';
    } else if (formName.trim().length > 100) {
      errors.name = 'Server display name must not exceed 100 characters.';
    }

    if (!isEdit) {
      if (!formSlug.trim()) {
        errors.slug = 'Server slug is required.';
      } else if (!/^[a-z0-9-]+$/.test(formSlug.trim())) {
        errors.slug = 'Slug must contain only lowercase letters, numbers, and hyphens (e.g. "inventory").';
      } else if (formSlug.trim().length > 50) {
        errors.slug = 'Slug must not exceed 50 characters.';
      }
    }

    if (!formUrl.trim()) {
      errors.url = 'Streamable HTTP endpoint URL is required.';
    } else {
      try {
        const parsed = new URL(formUrl.trim());
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          errors.url = 'Only HTTP and HTTPS protocols are supported.';
        } else if (parsed.hostname === '169.254.169.254' || parsed.hostname.includes('metadata.google')) {
          errors.url = 'Target rejected: Cloud metadata IPs are blocked by SSRF security policy.';
        }
      } catch {
        errors.url = 'Must be a valid URL (e.g. http://inventory-mcp:4002/mcp).';
      }
    }

    if (isNaN(formTimeout) || formTimeout < 500 || formTimeout > 60000) {
      errors.timeout = 'Timeout must be an integer between 500ms and 60,000ms.';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Open Create
  const handleOpenCreate = () => {
    setFormName('');
    setFormSlug('');
    setFormUrl('');
    setFormAuthToken('');
    setFormTimeout(10000);
    setFormEnabled(true);
    setFormErrors({});
    setFormGlobalError(null);
    setShowCreateModal(true);
  };

  // Open Edit
  const handleOpenEdit = (server: UpstreamServer) => {
    setEditingServer(server);
    setFormName(server.name);
    setFormSlug(server.slug);
    setFormUrl(server.url);
    setFormAuthToken(''); // Always empty: write-only secret
    setFormTimeout(server.timeoutMs);
    setFormEnabled(server.enabled);
    setFormErrors({});
    setFormGlobalError(null);
  };

  // Save Create
  const handleSaveCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm(false)) return;

    setFormSubmitting(true);
    setFormGlobalError(null);
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
      setFormGlobalError(err.message || 'Failed to register upstream server');
    } finally {
      setFormSubmitting(false);
    }
  };

  // Save Edit
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingServer) return;
    if (!validateForm(true)) return;

    setFormSubmitting(true);
    setFormGlobalError(null);
    try {
      const payload: {
        name: string;
        url: string;
        timeoutMs: number;
        enabled: boolean;
        authToken?: string | null;
      } = {
        name: formName.trim(),
        url: formUrl.trim(),
        timeoutMs: formTimeout,
        enabled: formEnabled
      };

      // Credential write-only logic:
      // If blank -> omit authToken so backend preserves existing secret
      // If "[CLEAR]" -> send null to clear stored secret
      // If non-empty -> send updated secret
      if (formAuthToken.trim() === '[CLEAR]') {
        payload.authToken = null;
      } else if (formAuthToken.trim().length > 0) {
        payload.authToken = formAuthToken.trim();
      }

      await api.updateUpstream(editingServer.id, payload);
      const name = formName.trim();
      setEditingServer(null);
      toast.success(`Updated upstream server "${name}"`);
      await fetchData();
    } catch (err: any) {
      setFormGlobalError(err.message || 'Failed to update upstream server');
    } finally {
      setFormSubmitting(false);
    }
  };

  // Confirm Delete
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

  // Filtered & Sorted Servers
  const filteredServers = useMemo(() => {
    return upstreams
      .filter(server => {
        // Status Filter
        if (statusFilter === 'connected' && (!server.enabled || server.status !== 'connected')) return false;
        if (statusFilter === 'unreachable' && (!server.enabled || server.status !== 'unreachable')) return false;
        if (statusFilter === 'disabled' && server.enabled) return false;

        // Search Query
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          const matchesName = server.name.toLowerCase().includes(q);
          const matchesSlug = server.slug.toLowerCase().includes(q);
          const matchesUrl = server.url.toLowerCase().includes(q);
          const matchesHost = extractEndpointHostname(server.url).toLowerCase().includes(q);
          if (!matchesName && !matchesSlug && !matchesUrl && !matchesHost) return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'name-asc') return a.name.localeCompare(b.name);
        if (sortBy === 'name-desc') return b.name.localeCompare(a.name);
        if (sortBy === 'status') {
          const score = (s: UpstreamServer) => (!s.enabled ? 0 : s.status === 'connected' ? 2 : 1);
          return score(b) - score(a);
        }
        if (sortBy === 'tools-desc') {
          const aCount = tools.filter(t => t.upstreamSlug === a.slug || t.name.startsWith(a.slug + '__')).length;
          const bCount = tools.filter(t => t.upstreamSlug === b.slug || t.name.startsWith(b.slug + '__')).length;
          return bCount - aCount;
        }
        if (sortBy === 'timeout-asc') return a.timeoutMs - b.timeoutMs;
        return 0;
      });
  }, [upstreams, tools, searchQuery, statusFilter, sortBy]);

  // Pagination Slice
  const totalPages = Math.max(1, Math.ceil(filteredServers.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginatedServers = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredServers.slice(start, start + pageSize);
  }, [filteredServers, currentPage, pageSize]);

  // Counts for Filter Badges
  const counts = useMemo(() => {
    return {
      all: upstreams.length,
      connected: upstreams.filter(s => s.enabled && s.status === 'connected').length,
      unreachable: upstreams.filter(s => s.enabled && s.status === 'unreachable').length,
      disabled: upstreams.filter(s => !s.enabled).length
    };
  }, [upstreams]);

  return (
    <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '0 24px 48px' }}>
      {/* 1. Page Header with Operational Explanation & Primary CTA */}
      <PageHeader
        title="Upstream MCP Servers"
        description="Internal and partner MCP servers aggregated into the Gateway's unified protocol endpoint."
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Button
              variant="outline"
              onClick={handleRefreshAll}
              disabled={refreshingAll || loading}
              isLoading={refreshingAll}
              leftIcon={<RefreshCw size={14} />}
              aria-label="Synchronize all upstream tools"
            >
              Refresh All Tools
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

      {/* Global Cluster Error Banner */}
      {error && (
        <Alert
          variant="danger"
          title="Upstream Cluster Communication Issue"
          onDismiss={() => setError(null)}
          style={{ marginBottom: '20px' }}
        >
          {error}
        </Alert>
      )}

      {/* 2. Search, Status Filter Pills & Sorting Controls */}
      <div
        className="console-card"
        style={{
          padding: '14px 18px',
          marginBottom: '20px',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '14px'
        }}
      >
        {/* Left: Search input */}
        <div style={{ position: 'relative', minWidth: '280px', flex: '1 1 300px' }}>
          <Search
            size={14}
            style={{
              position: 'absolute',
              left: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-muted)'
            }}
          />
          <input
            type="text"
            className="console-input"
            style={{ paddingLeft: '34px', paddingRight: searchQuery ? '32px' : '12px', height: '34px', fontSize: '12px' }}
            placeholder="Search by server name, slug, or hostname..."
            value={searchQuery}
            onChange={e => {
              setSearchQuery(e.target.value);
              setPage(1);
            }}
          />
          {searchQuery && (
            <button
              onClick={() => {
                setSearchQuery('');
                setPage(1);
              }}
              style={{
                position: 'absolute',
                right: '10px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                padding: '2px'
              }}
              aria-label="Clear search"
            >
              <X size={12} />
            </button>
          )}
        </div>

        {/* Center: Status Filter Pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', marginRight: '4px' }}>
            Status:
          </span>
          {(['all', 'connected', 'unreachable', 'disabled'] as const).map(st => {
            const isActive = statusFilter === st;
            const count = counts[st];
            return (
              <button
                key={st}
                onClick={() => {
                  setStatusFilter(st);
                  setPage(1);
                }}
                className={`console-btn ${isActive ? 'console-btn-primary' : 'console-btn-secondary'}`}
                style={{
                  height: '28px',
                  padding: '0 10px',
                  fontSize: '11px',
                  borderRadius: 'var(--radius-full)'
                }}
              >
                {st === 'all' ? 'All' : st.charAt(0).toUpperCase() + st.slice(1)} ({count})
              </button>
            );
          })}
        </div>

        {/* Right: Sort Selection */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <ArrowUpDown size={12} /> Sort:
          </span>
          <select
            className="console-input"
            value={sortBy}
            onChange={e => setSortBy(e.target.value as any)}
            style={{ height: '30px', fontSize: '11px', padding: '0 8px', width: 'auto' }}
          >
            <option value="name-asc">Name (A-Z)</option>
            <option value="name-desc">Name (Z-A)</option>
            <option value="status">Status (Connected first)</option>
            <option value="tools-desc">Tool Count (High to Low)</option>
            <option value="timeout-asc">Timeout (Fastest first)</option>
          </select>
        </div>
      </div>

      {/* 3. Operational Table */}
      {loading ? (
        <div className="console-card" style={{ padding: '24px' }}>
          <Skeleton width="100%" height="28px" style={{ marginBottom: '16px' }} />
          {[1, 2, 3, 4].map(i => (
            <div key={i} style={{ display: 'flex', gap: '16px', marginBottom: '14px' }}>
              <Skeleton width="25%" height="36px" />
              <Skeleton width="25%" height="36px" />
              <Skeleton width="15%" height="36px" />
              <Skeleton width="15%" height="36px" />
              <Skeleton width="20%" height="36px" />
            </div>
          ))}
        </div>
      ) : upstreams.length === 0 ? (
        <EmptyState
          icon={<Server size={28} />}
          title="No Upstream MCP Servers Registered"
          description="Register an internal or external Streamable HTTP MCP service to aggregate its tools into the gateway."
          actionLabel={isAdmin ? "Register Upstream" : undefined}
          onAction={isAdmin ? handleOpenCreate : undefined}
        />
      ) : filteredServers.length === 0 ? (
        <div className="console-card" style={{ padding: '36px 24px', textAlign: 'center' }}>
          <Filter size={24} style={{ color: 'var(--text-muted)', marginBottom: '8px' }} />
          <h4 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 6px' }}>
            No Matching Upstream Servers
          </h4>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 16px' }}>
            No registered servers match your current search "{searchQuery}" and status filter "{statusFilter}".
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setSearchQuery('');
              setStatusFilter('all');
            }}
          >
            Reset Search & Filters
          </Button>
        </div>
      ) : (
        <div className="console-card" style={{ overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="console-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ width: '24%' }}>Server & Slug</th>
                  <th style={{ width: '22%' }}>Endpoint Hostname</th>
                  <th style={{ width: '13%' }}>Category</th>
                  <th style={{ width: '14%' }}>Connection State</th>
                  <th style={{ width: '9%', textAlign: 'center' }}>Tools</th>
                  <th style={{ width: '18%', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedServers.map(server => {
                  const serverTools = tools.filter(
                    t => t.upstreamSlug === server.slug || t.name.startsWith(server.slug + '__')
                  );
                  const isTesting = testingRowId === server.id;
                  const isToggling = togglingRowId === server.id;
                  const hostname = extractEndpointHostname(server.url);
                  const category = getServerCategory(server.slug, server.name);

                  // Connection State with Text + Icon + Color (not color alone)
                  let statusText = 'Connected';
                  let statusColor = 'var(--color-success)';
                  let statusBg = 'var(--color-success-bg)';
                  let statusBorder = 'var(--color-success-border)';
                  let StatusIcon = CheckCircle2;

                  if (!server.enabled) {
                    statusText = 'Disabled';
                    statusColor = 'var(--text-muted)';
                    statusBg = 'rgba(255, 255, 255, 0.05)';
                    statusBorder = 'var(--border-subtle)';
                    StatusIcon = PauseCircle;
                  } else if (server.status === 'unreachable') {
                    statusText = 'Unreachable';
                    statusColor = 'var(--color-danger)';
                    statusBg = 'var(--color-danger-bg)';
                    statusBorder = 'var(--color-danger-border)';
                    StatusIcon = AlertTriangle;
                  }

                  return (
                    <tr
                      key={server.id}
                      style={{
                        opacity: server.enabled ? 1 : 0.65,
                        backgroundColor: server.enabled ? undefined : 'rgba(0, 0, 0, 0.15)'
                      }}
                    >
                      {/* 1. Server Name & Slug */}
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                          <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '13px' }}>
                            {server.name}
                          </span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <code style={{ fontSize: '11px', color: 'var(--accent-primary)', fontFamily: 'var(--font-mono)' }}>
                              {server.slug}
                            </code>
                            {server.hasAuthToken && (
                              <span
                                title="Write-only server-side token injected"
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '2px',
                                  fontSize: '10px',
                                  color: 'var(--text-muted)',
                                  background: 'rgba(255, 255, 255, 0.04)',
                                  padding: '1px 5px',
                                  borderRadius: '4px'
                                }}
                              >
                                <Shield size={10} style={{ color: 'var(--accent-success)' }} />
                                Token
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* 2. Endpoint Hostname (Clean & Credentials Stripped) */}
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <span
                            title={server.url}
                            style={{
                              fontFamily: 'var(--font-mono)',
                              fontSize: '11px',
                              color: 'var(--text-primary)',
                              wordBreak: 'break-all'
                            }}
                          >
                            {hostname}
                          </span>
                          <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                            Streamable HTTP • {server.timeoutMs}ms
                          </span>
                        </div>
                      </td>

                      {/* 3. Category */}
                      <td>
                        <Badge variant="neutral">
                          {category}
                        </Badge>
                      </td>

                      {/* 4. Connection State (Accessible: Icon + Text + Color) */}
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '5px',
                              padding: '2px 8px',
                              borderRadius: 'var(--radius-full)',
                              fontSize: '11px',
                              fontWeight: 600,
                              backgroundColor: statusBg,
                              borderColor: statusBorder,
                              borderWidth: '1px',
                              borderStyle: 'solid',
                              color: statusColor,
                              width: 'fit-content'
                            }}
                          >
                            <StatusIcon size={12} />
                            {statusText}
                          </span>
                          <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                            {formatCheckedTime(server.lastCheckedAt)}
                          </span>
                        </div>
                      </td>

                      {/* 5. Tool Count */}
                      <td style={{ textAlign: 'center' }}>
                        <button
                          onClick={() => handleOpenDetail(server)}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            padding: '2px 6px',
                            borderRadius: '4px'
                          }}
                          aria-label={`View ${serverTools.length} tools for ${server.name}`}
                        >
                          <Badge variant={serverTools.length > 0 ? 'accent' : 'neutral'}>
                            {serverTools.length} {serverTools.length === 1 ? 'tool' : 'tools'}
                          </Badge>
                        </button>
                      </td>

                      {/* 6. Per-Row Action Buttons */}
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                          {/* Test Connection Button with Per-Row Loading State */}
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleTestConnection(server)}
                            disabled={!server.enabled || isTesting}
                            isLoading={isTesting}
                            leftIcon={!isTesting ? <Zap size={12} /> : undefined}
                            title={!server.enabled ? "Enable server to test connection" : "Test upstream connectivity & discover tools"}
                            aria-label={`Test connection for ${server.name}`}
                          >
                            {isTesting ? 'Testing' : 'Test'}
                          </Button>

                          {/* View Tools & Details */}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleOpenDetail(server)}
                            leftIcon={<Eye size={12} />}
                            aria-label={`View details for ${server.name}`}
                          >
                            Tools
                          </Button>

                          {/* Admin: Enable / Disable Toggle */}
                          {isAdmin && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleToggleEnable(server)}
                              disabled={isToggling}
                              isLoading={isToggling}
                              title={server.enabled ? "Disable server (removes tools from gateway)" : "Enable server"}
                              aria-label={`${server.enabled ? 'Disable' : 'Enable'} ${server.name}`}
                            >
                              <Power size={13} style={{ color: server.enabled ? 'var(--color-success)' : 'var(--text-muted)' }} />
                            </Button>
                          )}

                          {/* Admin: Edit / Rotate Configuration */}
                          {isAdmin && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleOpenEdit(server)}
                              aria-label={`Configure ${server.name}`}
                            >
                              <Settings size={13} />
                            </Button>
                          )}

                          {/* Admin: Remove (Behind Confirmation) */}
                          {isAdmin && (
                            <Button
                              size="sm"
                              variant="danger"
                              onClick={() => setDeletingServer(server)}
                              aria-label={`Remove ${server.name}`}
                            >
                              <Trash2 size={13} />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          <div
            style={{
              padding: '12px 18px',
              borderTop: '1px solid var(--border-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '12px',
              color: 'var(--text-secondary)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>
                Showing <strong>{Math.min(filteredServers.length, (currentPage - 1) * pageSize + 1)}</strong> to{' '}
                <strong>{Math.min(filteredServers.length, currentPage * pageSize)}</strong> of{' '}
                <strong>{filteredServers.length}</strong> {filteredServers.length === 1 ? 'server' : 'servers'}
              </span>
              <span style={{ color: 'var(--border-default)' }}>|</span>
              <label style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                Per page:
                <select
                  className="console-input"
                  style={{ height: '26px', fontSize: '11px', padding: '0 6px', width: 'auto' }}
                  value={pageSize}
                  onChange={e => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                >
                  <option value={5}>5</option>
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                </select>
              </label>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Button
                size="sm"
                variant="outline"
                disabled={currentPage <= 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                leftIcon={<ChevronLeft size={13} />}
              >
                Previous
              </Button>
              <span style={{ padding: '0 8px', fontSize: '11px', fontWeight: 600 }}>
                {currentPage} / {totalPages}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={currentPage >= totalPages}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                rightIcon={<ChevronRight size={13} />}
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 4. Server Detail Modal: Tools Catalog, Health Profile, and Recent Failures */}
      <Modal
        isOpen={Boolean(selectedServerForDetail)}
        onClose={() => setSelectedServerForDetail(null)}
        title={selectedServerForDetail?.name || 'Server Details'}
        description={`Aggregated upstream service: slug "${selectedServerForDetail?.slug || ''}" • ${getServerCategory(selectedServerForDetail?.slug || '', selectedServerForDetail?.name || '')}`}
        maxWidth="720px"
        footer={
          <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              Gateway namespacing: <code>{selectedServerForDetail?.slug || ''}__&lt;tool_name&gt;</code>
            </span>
            <Button variant="outline" onClick={() => setSelectedServerForDetail(null)}>
              Close
            </Button>
          </div>
        }
      >
        {selectedServerForDetail && (
          <div>
            {/* Modal Navigation Tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border-subtle)', marginBottom: '16px', gap: '8px' }}>
              <button
                onClick={() => setDetailTab('tools')}
                style={{
                  padding: '8px 14px',
                  background: 'none',
                  border: 'none',
                  borderBottom: detailTab === 'tools' ? '2px solid var(--accent-primary)' : '2px solid transparent',
                  color: detailTab === 'tools' ? 'var(--text-primary)' : 'var(--text-muted)',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Exposed Tools ({tools.filter(t => t.upstreamSlug === selectedServerForDetail.slug || t.name.startsWith(selectedServerForDetail.slug + '__')).length})
              </button>
              <button
                onClick={() => setDetailTab('health')}
                style={{
                  padding: '8px 14px',
                  background: 'none',
                  border: 'none',
                  borderBottom: detailTab === 'health' ? '2px solid var(--accent-primary)' : '2px solid transparent',
                  color: detailTab === 'health' ? 'var(--text-primary)' : 'var(--text-muted)',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Health & Transport
              </button>
              {isAdmin && (
                <button
                  onClick={() => setDetailTab('logs')}
                  style={{
                    padding: '8px 14px',
                    background: 'none',
                    border: 'none',
                    borderBottom: detailTab === 'logs' ? '2px solid var(--accent-primary)' : '2px solid transparent',
                    color: detailTab === 'logs' ? 'var(--text-primary)' : 'var(--text-muted)',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Recent Call Activity
                </button>
              )}
            </div>

            {/* TAB 1: Exposed Tools & Exact Namespacing Convention */}
            {detailTab === 'tools' && (
              <div>
                {tools.filter(t => t.upstreamSlug === selectedServerForDetail.slug || t.name.startsWith(selectedServerForDetail.slug + '__')).length === 0 ? (
                  <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                    {!selectedServerForDetail.enabled
                      ? 'This upstream server is currently disabled. Its tools have been unregistered from the client routing catalog.'
                      : 'No tools discovered for this upstream. Click "Test Connection" to trigger tool discovery over Streamable HTTP.'}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '400px', overflowY: 'auto' }}>
                    {tools
                      .filter(t => t.upstreamSlug === selectedServerForDetail.slug || t.name.startsWith(selectedServerForDetail.slug + '__'))
                      .map(tool => {
                        const isExpanded = expandedTool === tool.name;
                        const declaredName = tool.originalName || (tool.name.includes('__') ? tool.name.split('__')[1] : tool.name);
                        const namespacedIdentifier = `${selectedServerForDetail.slug}__${declaredName}`;

                        return (
                          <div
                            key={tool.name}
                            style={{
                              background: 'var(--bg-canvas)',
                              border: '1px solid var(--border-subtle)',
                              borderRadius: 'var(--radius-sm)',
                              padding: '12px'
                            }}
                          >
                            <div
                              onClick={() => setExpandedTool(isExpanded ? null : tool.name)}
                              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <code style={{ color: 'var(--accent-primary)', fontWeight: 600, fontSize: '13px' }}>
                                  {tool.name}
                                </code>
                                {tool.name !== namespacedIdentifier && (
                                  <Badge variant="neutral">alias: {namespacedIdentifier}</Badge>
                                )}
                              </div>
                              <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                {isExpanded ? 'Hide Schema' : 'Input Schema'}
                              </span>
                            </div>

                            {tool.description && (
                              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '6px', marginBottom: 0 }}>
                                {tool.description}
                              </p>
                            )}

                            {isExpanded && (
                              <div style={{ marginTop: '10px' }}>
                                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px', fontWeight: 600 }}>
                                  JSON Schema Definition:
                                </div>
                                <pre
                                  style={{
                                    margin: 0,
                                    padding: '10px',
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
                              </div>
                            )}
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: Health & Transport Profile */}
            {detailTab === 'health' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', fontSize: '12px' }}>
                <div className="console-card" style={{ padding: '14px' }}>
                  <div style={{ color: 'var(--text-muted)', marginBottom: '4px' }}>Protocol & Transport</div>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Streamable HTTP (Server-Sent Events)</div>
                  <div style={{ marginTop: '8px', color: 'var(--text-muted)' }}>SSRF Security Policy</div>
                  <div style={{ color: 'var(--accent-success)', fontWeight: 500 }}>Active (Strict ClusterIP / Localhost)</div>
                </div>

                <div className="console-card" style={{ padding: '14px' }}>
                  <div style={{ color: 'var(--text-muted)', marginBottom: '4px' }}>Configured Timeout</div>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{selectedServerForDetail.timeoutMs} ms</div>
                  <div style={{ marginTop: '8px', color: 'var(--text-muted)' }}>Authentication Stored</div>
                  <div style={{ fontWeight: 500, color: selectedServerForDetail.hasAuthToken ? 'var(--accent-success)' : 'var(--text-muted)' }}>
                    {selectedServerForDetail.hasAuthToken ? 'Bearer token (write-only server-side injection)' : 'None (unauthenticated)'}
                  </div>
                </div>

                <div className="console-card" style={{ padding: '14px', gridColumn: 'span 2' }}>
                  <div style={{ color: 'var(--text-muted)', marginBottom: '4px' }}>Endpoint Target URL</div>
                  <code style={{ fontSize: '11px', color: 'var(--accent-primary)', wordBreak: 'break-all' }}>
                    {selectedServerForDetail.url}
                  </code>
                </div>
              </div>
            )}

            {/* TAB 3: Recent Failures & Execution History */}
            {detailTab === 'logs' && isAdmin && (
              <div>
                {loadingLogs ? (
                  <Skeleton width="100%" height="120px" />
                ) : serverAuditLogs.length === 0 ? (
                  <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                    No recorded tool calls for this upstream server in the audit store.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '4px' }}>
                      Last 10 Attributed Executions:
                    </div>
                    {serverAuditLogs.map(log => (
                      <div
                        key={log.id}
                        style={{
                          padding: '8px 12px',
                          background: 'var(--bg-canvas)',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: 'var(--radius-sm)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          fontSize: '11px'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span
                            style={{
                              color: log.status === 'success' ? 'var(--color-success)' : 'var(--color-danger)',
                              fontWeight: 600,
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                          >
                            {log.status === 'success' ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
                            {log.status.toUpperCase()}
                          </span>
                          <code style={{ color: 'var(--text-primary)' }}>{log.toolName}</code>
                          <span style={{ color: 'var(--text-muted)' }}>by {log.userEmail || log.userId}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ color: 'var(--text-muted)' }}>{log.durationMs}ms</span>
                          <span style={{ color: 'var(--text-muted)' }}>
                            {new Date(log.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* 5. Modal: Register New Upstream Server */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Register Upstream MCP Server"
        description="Connect an internal or partner MCP service using Streamable HTTP. Target URLs are strictly verified against SSRF security policies."
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
        {formGlobalError && (
          <Alert variant="danger" title="Registration Failed" style={{ marginBottom: '16px' }}>
            {formGlobalError}
          </Alert>
        )}

        <form onSubmit={handleSaveCreate} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <Input
              label="Server Display Name"
              required
              value={formName}
              onChange={e => setFormName(e.target.value)}
              placeholder="e.g. Warehouse Inventory"
              helperText="Human-readable title displayed on dashboard and catalogs."
            />
            {formErrors.name && (
              <div style={{ color: 'var(--color-danger)', fontSize: '11px', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <AlertCircle size={11} /> {formErrors.name}
              </div>
            )}
          </div>

          <div>
            <Input
              label="Routing Slug"
              required
              pattern="^[a-z0-9-]+$"
              value={formSlug}
              onChange={e => setFormSlug(e.target.value.toLowerCase())}
              placeholder="e.g. inventory"
              helperText="Used in gateway namespacing: <slug>__<tool_name>. Lowercase alphanumeric and hyphens only."
            />
            {formErrors.slug && (
              <div style={{ color: 'var(--color-danger)', fontSize: '11px', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <AlertCircle size={11} /> {formErrors.slug}
              </div>
            )}
          </div>

          <div>
            <Input
              label="Streamable HTTP Endpoint URL"
              type="url"
              required
              value={formUrl}
              onChange={e => setFormUrl(e.target.value)}
              placeholder="http://inventory-mcp:4002/mcp"
              leftIcon={<Globe size={14} />}
              helperText="Internal cluster and localhost URLs permitted. AWS/GCP cloud metadata (169.254.169.254) is blocked."
            />
            {formErrors.url && (
              <div style={{ color: 'var(--color-danger)', fontSize: '11px', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <AlertCircle size={11} /> {formErrors.url}
              </div>
            )}
          </div>

          <div>
            <Input
              label="Optional Upstream Bearer Token"
              type="password"
              value={formAuthToken}
              onChange={e => setFormAuthToken(e.target.value)}
              placeholder="Optional token injected strictly server-side"
              leftIcon={<Shield size={14} />}
              helperText="Bearer authentication format: injected as Authorization: Bearer <token>. Write-only: never exposed."
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', alignItems: 'flex-start' }}>
            <div>
              <Input
                label="Timeout (ms)"
                type="number"
                min={500}
                max={60000}
                value={formTimeout}
                onChange={e => setFormTimeout(Number(e.target.value))}
                helperText="Per-upstream timeout (500ms - 60,000ms)."
              />
              {formErrors.timeout && (
                <div style={{ color: 'var(--color-danger)', fontSize: '11px', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <AlertCircle size={11} /> {formErrors.timeout}
                </div>
              )}
            </div>

            <div style={{ paddingTop: '26px' }}>
              <Checkbox
                label="Enable Service Immediately"
                checked={formEnabled}
                onChange={e => setFormEnabled(e.target.checked)}
              />
            </div>
          </div>
        </form>
      </Modal>

      {/* 6. Modal: Edit / Rotate Upstream (Write-Only Secret Handling) */}
      <Modal
        isOpen={Boolean(editingServer)}
        onClose={() => setEditingServer(null)}
        title={`Configure Upstream: ${editingServer?.name || ''}`}
        description="Update service configuration or rotate credentials. Stored secrets are write-only and never preloaded or revealed."
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
        {formGlobalError && (
          <Alert variant="danger" title="Update Failed" style={{ marginBottom: '16px' }}>
            {formGlobalError}
          </Alert>
        )}

        {editingServer && (
          <form onSubmit={handleSaveEdit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <Input
                label="Server Display Name"
                required
                value={formName}
                onChange={e => setFormName(e.target.value)}
              />
              {formErrors.name && (
                <div style={{ color: 'var(--color-danger)', fontSize: '11px', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <AlertCircle size={11} /> {formErrors.name}
                </div>
              )}
            </div>

            <div>
              <Input
                label="Routing Slug (Immutable)"
                value={formSlug}
                disabled
                helperText="Server slug defines tool namespacing and cannot be changed after registration."
              />
            </div>

            <div>
              <Input
                label="Streamable HTTP Endpoint URL"
                type="url"
                required
                value={formUrl}
                onChange={e => setFormUrl(e.target.value)}
                leftIcon={<Globe size={14} />}
              />
              {formErrors.url && (
                <div style={{ color: 'var(--color-danger)', fontSize: '11px', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <AlertCircle size={11} /> {formErrors.url}
                </div>
              )}
            </div>

            <div>
              <Input
                label="Rotate Credential (Bearer Token)"
                type="password"
                value={formAuthToken}
                onChange={e => setFormAuthToken(e.target.value)}
                placeholder="Leave blank to preserve existing credential"
                leftIcon={<Shield size={14} />}
                helperText={`Current status: ${editingServer.hasAuthToken ? 'Active secret configured (write-only)' : 'No credential configured'}. Leave blank to preserve existing stored credential, or enter [CLEAR] to revoke.`}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', alignItems: 'flex-start' }}>
              <div>
                <Input
                  label="Timeout (ms)"
                  type="number"
                  min={500}
                  max={60000}
                  value={formTimeout}
                  onChange={e => setFormTimeout(Number(e.target.value))}
                />
                {formErrors.timeout && (
                  <div style={{ color: 'var(--color-danger)', fontSize: '11px', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <AlertCircle size={11} /> {formErrors.timeout}
                  </div>
                )}
              </div>

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

      {/* 7. Confirm Remove Dialog (Destructive Action Behind Confirmation) */}
      <ConfirmDialog
        isOpen={Boolean(deletingServer)}
        title={`Remove Upstream Server "${deletingServer?.name || ''}"?`}
        description="This will permanently delete the server from the Gateway routing table. Any tools provided by this server will be unregistered from client sessions immediately."
        confirmLabel="Remove Server"
        variant="danger"
        isLoading={isDeleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeletingServer(null)}
      />
    </div>
  );
};
