import React, { useState, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { UpstreamServer, AuditLog } from '../types/index.js';
import { api } from '../api/client.js';
import { queryClient, queryKeys } from '../api/queryClient.js';
import { useAuth } from '../context/AuthContext.js';
import {
  PageHeader,
  Button,
  Badge,
  StatusBadge,
  Input,
  SearchInput,
  Checkbox,
  Modal,
  ConfirmDialog,
  EmptyState,
  Skeleton,
  Alert,
  Card,
  ProgressBar,
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
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  CheckCircle2,
  AlertTriangle,
  Zap,
  Power,
  Copy,
  Check,
  Clock,
  Filter
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

/**
 * Pure validation function for add and edit forms.
 * Enforces URL scheme constraints, SSRF guardrails, and character boundaries.
 */
export function validateUpstreamForm(
  isEdit: boolean,
  name: string,
  slug: string,
  url: string,
  timeout: number
): Record<string, string> {
  const errors: Record<string, string> = {};

  if (!name || !name.trim()) {
    errors.name = 'Server display name is required.';
  } else if (name.trim().length > 100) {
    errors.name = 'Server display name must not exceed 100 characters.';
  }

  if (!isEdit) {
    if (!slug || !slug.trim()) {
      errors.slug = 'Server slug is required.';
    } else if (!/^[a-z0-9-]+$/.test(slug.trim())) {
      errors.slug = 'Slug must contain only lowercase letters, numbers, and hyphens (e.g. "inventory").';
    } else if (slug.trim().length > 50) {
      errors.slug = 'Slug must not exceed 50 characters.';
    }
  }

  if (!url || !url.trim()) {
    errors.url = 'Streamable HTTP endpoint URL is required.';
  } else {
    try {
      const parsed = new URL(url.trim());
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        errors.url = 'Only HTTP and HTTPS protocols are supported.';
      } else if (parsed.hostname === '169.254.169.254' || parsed.hostname.includes('metadata.google')) {
        errors.url = 'Target rejected: Cloud metadata IPs are blocked by SSRF security policy.';
      }
    } catch {
      errors.url = 'Must be a valid URL (e.g. http://inventory-mcp:4002/mcp).';
    }
  }

  if (isNaN(timeout) || timeout < 500 || timeout > 60000) {
    errors.timeout = 'Timeout must be an integer between 500ms and 60,000ms.';
  }

  return errors;
}

/**
 * Prepares the update payload adhering to write-only secret semantics:
 * - Empty string preserves existing server-side credential.
 * - '[CLEAR]' revokes the credential (sends null).
 * - Non-empty string updates to new secret.
 */
export function prepareUpdatePayload(
  inputToken: string,
  name: string,
  url: string,
  timeout: number,
  enabled: boolean
): {
  name: string;
  url: string;
  timeoutMs: number;
  enabled: boolean;
  authToken?: string | null;
} {
  const payload: {
    name: string;
    url: string;
    timeoutMs: number;
    enabled: boolean;
    authToken?: string | null;
  } = {
    name: name.trim(),
    url: url.trim(),
    timeoutMs: timeout,
    enabled
  };

  if (inputToken.trim() === '[CLEAR]') {
    payload.authToken = null;
  } else if (inputToken.trim().length > 0) {
    payload.authToken = inputToken.trim();
  }
  return payload;
}

export const UpstreamServersView: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const toast = useToast();

  // Core Data via TanStack Query
  const {
    data: upstreams = [],
    isLoading: isUpstreamsLoading,
    isFetching: isUpstreamsFetching,
    error: upstreamsError,
    refetch: refetchUpstreams
  } = useQuery({
    queryKey: queryKeys.upstreams,
    queryFn: () => api.getUpstreams()
  });

  const {
    data: toolsData = { count: 0, tools: [] },
    isLoading: isToolsLoading,
    isFetching: isToolsFetching,
    error: toolsError,
    refetch: refetchTools
  } = useQuery({
    queryKey: queryKeys.tools,
    queryFn: () => api.getTools()
  });

  const tools = toolsData.tools || [];
  const loading = isUpstreamsLoading || isToolsLoading;
  const isFetching = isUpstreamsFetching || isToolsFetching;
  const error = (upstreamsError as any)?.message || (toolsError as any)?.message || null;
  const [refreshingAll, setRefreshingAll] = useState(false);

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
  const [copiedSchemaTool, setCopiedSchemaTool] = useState<string | null>(null);

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

  /**
   * Helper to invalidate TanStack Query caches across the app
   */
  const invalidateQueries = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.upstreams });
    queryClient.invalidateQueries({ queryKey: queryKeys.tools });
    queryClient.invalidateQueries({ queryKey: queryKeys.health });
  }, []);

  // Global Refresh All Tools & Statuses
  const handleRefreshAll = async () => {
    try {
      setRefreshingAll(true);
      const res = await api.refreshTools();
      invalidateQueries();
      toast.success(`Tools cache synchronized (${res.count} tools active)`);
    } catch (err: any) {
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
        toast.success(`Connected to ${server.name} in ${res.latencyMs}ms (${res.toolCount || 0} tools discovered)`);
      } else {
        toast.error(`Connection failed for ${server.name}: ${res.error || 'Server unreachable'}`);
      }
      invalidateQueries();
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
      invalidateQueries();
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

  // Open Create Modal
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

  // Open Edit Modal
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
    const errors = validateUpstreamForm(false, formName, formSlug, formUrl, formTimeout);
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

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
      invalidateQueries();
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
    const errors = validateUpstreamForm(true, formName, formSlug, formUrl, formTimeout);
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setFormSubmitting(true);
    setFormGlobalError(null);
    try {
      const payload = prepareUpdatePayload(
        formAuthToken,
        formName,
        formUrl,
        formTimeout,
        formEnabled
      );

      await api.updateUpstream(editingServer.id, payload);
      const name = formName.trim();
      setEditingServer(null);
      toast.success(`Updated upstream server "${name}"`);
      invalidateQueries();
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
      invalidateQueries();
    } catch (err: any) {
      toast.error(err.message || 'Failed to remove upstream server');
    } finally {
      setIsDeleting(false);
    }
  };

  // Copy Schema Helper
  const handleCopySchema = (toolName: string, schema: Record<string, unknown>) => {
    navigator.clipboard.writeText(JSON.stringify(schema, null, 2));
    setCopiedSchemaTool(toolName);
    toast.success(`Schema copied for ${toolName}`);
    setTimeout(() => {
      setCopiedSchemaTool(prev => (prev === toolName ? null : prev));
    }, 2000);
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
          const category = getServerCategory(server.slug, server.name).toLowerCase();
          const matchesName = server.name.toLowerCase().includes(q);
          const matchesSlug = server.slug.toLowerCase().includes(q);
          const matchesUrl = server.url.toLowerCase().includes(q);
          const matchesHost = extractEndpointHostname(server.url).toLowerCase().includes(q);
          const matchesCategory = category.includes(q);
          if (!matchesName && !matchesSlug && !matchesUrl && !matchesHost && !matchesCategory) return false;
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
    <div className="page-container">
      {/* 1. Page Header with Operational Explanation & Primary CTA */}
      <PageHeader
        title="Upstream MCP Servers"
        description="Internal and partner MCP servers aggregated into the Gateway's unified protocol catalog. Target URLs are protected by SSRF guardrails."
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

      {/* Hairline synchronization indicator during background refetch */}
      {isFetching && !loading && (
        <div style={{ marginBottom: '16px' }}>
          <ProgressBar
            indeterminate
            size="xs"
            variant="primary"
            aria-label="Synchronizing upstream MCP servers"
          />
        </div>
      )}

      {/* Accessible live region for filter count announcements */}
      <div role="status" aria-live="polite" style={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden' }}>
        {filteredServers.length} upstream servers displayed.
      </div>

      {/* Global Cluster Error Banner with Retry */}
      {error && (
        <Alert
          variant="danger"
          title="Upstream Cluster Communication Issue"
          style={{ marginBottom: '20px' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
            <span>{error}</span>
            <Button size="sm" variant="outline" onClick={() => { refetchUpstreams(); refetchTools(); }}>
              Retry Connection
            </Button>
          </div>
        </Alert>
      )}

      {/* 2. Search, Status Filter Pills & Sorting Controls */}
      <Card
        variant="flat"
        style={{
          padding: '14px 18px',
          marginBottom: '20px'
        }}
      >
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '14px'
          }}
        >
          {/* Left: Dedicated SearchInput */}
          <div style={{ minWidth: '280px', flex: '1 1 320px' }}>
            <SearchInput
              value={searchQuery}
              onChange={val => {
                setSearchQuery(val);
                setPage(1);
              }}
              placeholder="Search by server name, slug, hostname, or category..."
              width="100%"
            />
          </div>

          {/* Center: Status Filter Pills with Counts */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
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
                  aria-pressed={isActive}
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
              aria-label="Sort servers by"
            >
              <option value="name-asc">Name (A-Z)</option>
              <option value="name-desc">Name (Z-A)</option>
              <option value="status">Status (Connected first)</option>
              <option value="tools-desc">Tool Count (High to Low)</option>
              <option value="timeout-asc">Timeout (Fastest first)</option>
            </select>
          </div>
        </div>
      </Card>

      {/* 3. Operational Table */}
      {loading ? (
        <Card variant="flat" style={{ padding: '24px' }}>
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
        </Card>
      ) : upstreams.length === 0 ? (
        <EmptyState
          icon={<Server size={28} />}
          title="No Upstream MCP Servers Registered"
          description="Register an internal or external Streamable HTTP MCP service to aggregate its tools into the gateway."
          actionLabel={isAdmin ? 'Register Upstream' : undefined}
          onAction={isAdmin ? handleOpenCreate : undefined}
        />
      ) : filteredServers.length === 0 ? (
        <Card variant="flat" style={{ padding: '36px 24px', textAlign: 'center' }}>
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
        </Card>
      ) : (
        <Card variant="flat" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="console-table-container">
            <table className="console-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ width: '30%' }}>Server & Category</th>
                  <th className="col-priority-medium" style={{ width: '22%' }}>Endpoint Hostname</th>
                  <th style={{ width: '18%' }}>Connection State</th>
                  <th className="col-priority-low" style={{ width: '10%', textAlign: 'center' }}>Tools</th>
                  <th style={{ width: '20%', textAlign: 'right' }}>Actions</th>
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

                  // Connection State (Accessible: Icon + Text + Color)
                  let statusBadgeType = 'connected';
                  let statusLabel = 'Connected';
                  let statusSubtext = formatCheckedTime(server.lastCheckedAt);

                  if (!server.enabled) {
                    statusBadgeType = 'disabled';
                    statusLabel = 'Disabled';
                    statusSubtext = 'Offline / unrouted';
                  } else if (server.status === 'unreachable') {
                    statusBadgeType = 'unreachable';
                    statusLabel = 'Unreachable';
                    statusSubtext = formatCheckedTime(server.lastCheckedAt);
                  }

                  return (
                    <tr
                      key={server.id}
                      style={{
                        opacity: server.enabled ? 1 : 0.65,
                        backgroundColor: server.enabled ? undefined : 'rgba(0, 0, 0, 0.15)',
                        transition: 'opacity 0.18s ease, background-color 0.18s ease'
                      }}
                    >
                      {/* 1. Server Name, Slug, & Category */}
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '13px' }}>
                              {server.name}
                            </span>
                            <Badge variant="neutral" style={{ fontSize: '10px', padding: '1px 6px' }}>
                              {category}
                            </Badge>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <code style={{ fontSize: '11px', color: 'var(--color-primary)', fontFamily: 'var(--font-mono)' }}>
                              {server.slug}
                            </code>
                            {server.hasAuthToken && (
                              <span
                                title="Write-only server-side token injected"
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '3px',
                                  fontSize: '10px',
                                  color: 'var(--text-muted)',
                                  background: 'rgba(255, 255, 255, 0.05)',
                                  padding: '1px 5px',
                                  borderRadius: '4px',
                                  border: '1px solid var(--border-subtle)'
                                }}
                              >
                                <Shield size={10} style={{ color: 'var(--color-success)' }} />
                                Token
                              </span>
                            )}
                          </div>

                          {/* Mobile-only compact metadata */}
                          <div className="table-responsive-card-toggle" style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px', gap: '6px', alignItems: 'center' }}>
                            <span style={{ color: 'var(--accent-text)' }}>{serverTools.length} {serverTools.length === 1 ? 'tool' : 'tools'}</span>
                            <span>•</span>
                            <span style={{ fontFamily: 'var(--font-mono)' }}>{hostname}</span>
                          </div>
                        </div>
                      </td>

                      {/* 2. Endpoint Hostname (Clean & Credentials Stripped) */}
                      <td className="col-priority-medium">
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
                            Streamable HTTP • {server.timeoutMs}ms timeout
                          </span>
                        </div>
                      </td>

                      {/* 3. Connection State (Accessible: Icon + Text + Color) */}
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                          <StatusBadge status={statusBadgeType} label={statusLabel} />
                          <span style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Clock size={10} /> {statusSubtext}
                          </span>
                        </div>
                      </td>

                      {/* 4. Tool Count Badge */}
                      <td className="col-priority-low" style={{ textAlign: 'center' }}>
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
                          title={`Click to inspect ${serverTools.length} tools`}
                        >
                          <Badge variant={serverTools.length > 0 ? 'accent' : 'neutral'}>
                            {serverTools.length} {serverTools.length === 1 ? 'tool' : 'tools'}
                          </Badge>
                        </button>
                      </td>

                      {/* 5. Per-Row Action Buttons */}
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
                            title={!server.enabled ? 'Enable server to test connection' : 'Test upstream connectivity & discover tools'}
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
                              title={server.enabled ? 'Disable server (removes tools from gateway catalog)' : 'Enable server'}
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
                              title="Edit server configuration and credentials"
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
                              title="Remove server from gateway"
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
              color: 'var(--text-secondary)',
              flexWrap: 'wrap',
              gap: '10px'
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
                  aria-label="Items per page"
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
                aria-label="Previous page"
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
                aria-label="Next page"
              >
                Next
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* 4. Server Detail Modal: Tools Catalog, Health Profile, and Recent Failures */}
      <Modal
        isOpen={Boolean(selectedServerForDetail)}
        onClose={() => setSelectedServerForDetail(null)}
        title={selectedServerForDetail?.name || 'Server Details'}
        description={`Aggregated upstream service: slug "${selectedServerForDetail?.slug || ''}" • ${getServerCategory(selectedServerForDetail?.slug || '', selectedServerForDetail?.name || '')}`}
        maxWidth="740px"
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
                  borderBottom: detailTab === 'tools' ? '2px solid var(--color-primary)' : '2px solid transparent',
                  color: detailTab === 'tools' ? 'var(--text-primary)' : 'var(--text-muted)',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
                aria-selected={detailTab === 'tools'}
              >
                Exposed Tools ({tools.filter(t => t.upstreamSlug === selectedServerForDetail.slug || t.name.startsWith(selectedServerForDetail.slug + '__')).length})
              </button>
              <button
                onClick={() => setDetailTab('health')}
                style={{
                  padding: '8px 14px',
                  background: 'none',
                  border: 'none',
                  borderBottom: detailTab === 'health' ? '2px solid var(--color-primary)' : '2px solid transparent',
                  color: detailTab === 'health' ? 'var(--text-primary)' : 'var(--text-muted)',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
                aria-selected={detailTab === 'health'}
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
                    borderBottom: detailTab === 'logs' ? '2px solid var(--color-primary)' : '2px solid transparent',
                    color: detailTab === 'logs' ? 'var(--text-primary)' : 'var(--text-muted)',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                  aria-selected={detailTab === 'logs'}
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
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '420px', overflowY: 'auto' }}>
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
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                <code style={{ color: 'var(--color-primary)', fontWeight: 600, fontSize: '13px' }}>
                                  {tool.name}
                                </code>
                                {tool.name !== namespacedIdentifier && (
                                  <Badge variant="neutral" style={{ fontSize: '10px' }}>
                                    alias: {namespacedIdentifier}
                                  </Badge>
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
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>
                                    JSON Schema Definition:
                                  </span>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleCopySchema(tool.name, tool.inputSchema);
                                    }}
                                    leftIcon={copiedSchemaTool === tool.name ? <Check size={11} /> : <Copy size={11} />}
                                    style={{ height: '22px', fontSize: '10px', padding: '0 6px' }}
                                  >
                                    {copiedSchemaTool === tool.name ? 'Copied' : 'Copy Schema'}
                                  </Button>
                                </div>
                                <pre
                                  style={{
                                    margin: 0,
                                    padding: '10px',
                                    background: 'rgba(0, 0, 0, 0.4)',
                                    borderRadius: 'var(--radius-sm)',
                                    fontSize: '11px',
                                    color: 'var(--color-success)',
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
                <Card variant="flat" style={{ padding: '14px' }}>
                  <div style={{ color: 'var(--text-muted)', marginBottom: '4px' }}>Protocol & Transport</div>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Streamable HTTP (Server-Sent Events)</div>
                  <div style={{ marginTop: '8px', color: 'var(--text-muted)' }}>SSRF Security Policy</div>
                  <div style={{ color: 'var(--color-success)', fontWeight: 500 }}>Active (Strict ClusterIP / Localhost)</div>
                </Card>

                <Card variant="flat" style={{ padding: '14px' }}>
                  <div style={{ color: 'var(--text-muted)', marginBottom: '4px' }}>Configured Timeout</div>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{selectedServerForDetail.timeoutMs} ms</div>
                  <div style={{ marginTop: '8px', color: 'var(--text-muted)' }}>Authentication Stored</div>
                  <div style={{ fontWeight: 500, color: selectedServerForDetail.hasAuthToken ? 'var(--color-success)' : 'var(--text-muted)' }}>
                    {selectedServerForDetail.hasAuthToken ? 'Bearer token (write-only server-side injection)' : 'None (unauthenticated)'}
                  </div>
                </Card>

                <Card variant="flat" style={{ padding: '14px', gridColumn: 'span 2' }}>
                  <div style={{ color: 'var(--text-muted)', marginBottom: '4px' }}>Endpoint Target URL</div>
                  <code style={{ fontSize: '11px', color: 'var(--color-primary)', wordBreak: 'break-all' }}>
                    {selectedServerForDetail.url}
                  </code>
                </Card>
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
        <div role="status" aria-live="polite">
          {formGlobalError && (
            <Alert variant="danger" title="Registration Failed" style={{ marginBottom: '16px' }}>
              {formGlobalError}
            </Alert>
          )}
        </div>

        <form onSubmit={handleSaveCreate} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <Input
              label="Server Display Name"
              required
              value={formName}
              onChange={e => setFormName(e.target.value)}
              placeholder="e.g. Warehouse Inventory"
              helperText="Human-readable title displayed on dashboard and catalogs."
              error={formErrors.name}
            />
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
              error={formErrors.slug}
            />
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
              error={formErrors.url}
            />
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
                error={formErrors.timeout}
              />
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
        <div role="status" aria-live="polite">
          {formGlobalError && (
            <Alert variant="danger" title="Update Failed" style={{ marginBottom: '16px' }}>
              {formGlobalError}
            </Alert>
          )}
        </div>

        {editingServer && (
          <form onSubmit={handleSaveEdit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <Input
                label="Server Display Name"
                required
                value={formName}
                onChange={e => setFormName(e.target.value)}
                error={formErrors.name}
              />
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
                error={formErrors.url}
              />
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
                  error={formErrors.timeout}
                />
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
