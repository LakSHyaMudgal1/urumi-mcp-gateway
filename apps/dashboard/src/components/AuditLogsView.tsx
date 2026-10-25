import React, { useState, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../api/queryClient.js';
import { AuditLog } from '../types/index.js';
import { api } from '../api/client.js';
import {
  PageHeader,
  Button,
  Select,
  Badge,
  Modal,
  Skeleton,
  EmptyState,
  Alert,
  ProgressBar,
  useToast
} from './ui/index.js';
import {
  RefreshCw,
  FileText,
  ChevronLeft,
  ChevronRight,
  User as UserIcon,
  Clock,
  Server,
  CheckCircle2,
  AlertTriangle,
  Copy,
  Check,
  Search,
  X,
  Filter,
  ChevronDown,
  ChevronUp,
  Activity
} from 'lucide-react';

/**
 * Formats relative duration from timestamp.
 */
export function formatRelativeTime(isoString: string): string {
  try {
    const diffMs = Date.now() - new Date(isoString).getTime();
    if (diffMs < 5000) return 'Just now';
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
 * Formats full timestamp respecting the user's browser locale and local timezone.
 */
export function formatExactTimestamp(isoString: string): string {
  try {
    const date = new Date(isoString);
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'short'
    }).format(date);
  } catch {
    return isoString;
  }
}

interface AuditLogsViewProps {
  onNavigate?: (tab: any) => void;
}

export const AuditLogsView: React.FC<AuditLogsViewProps> = ({ onNavigate }) => {
  const toast = useToast();

  // Server-Side Query Filters
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterUser, setFilterUser] = useState<string>('all');
  const [filterUpstream, setFilterUpstream] = useState<string>('all');
  const [filterTimeRange, setFilterTimeRange] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Pagination States
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  // Selected Log Details Modal
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [copiedId, setCopiedId] = useState(false);
  const [copiedParams, setCopiedParams] = useState(false);
  const [copiedResponse, setCopiedResponse] = useState(false);
  const [expandParams, setExpandParams] = useState(true);
  const [expandResponse, setExpandResponse] = useState(true);

  // Compute startDate based on filterTimeRange
  const computeStartDate = useCallback((range: string): string | undefined => {
    const now = Date.now();
    switch (range) {
      case '15m':
        return new Date(now - 15 * 60 * 1000).toISOString();
      case '1h':
        return new Date(now - 60 * 60 * 1000).toISOString();
      case '24h':
        return new Date(now - 24 * 60 * 60 * 1000).toISOString();
      case '7d':
        return new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
      default:
        return undefined;
    }
  }, []);

  // Fetch Available Filter Metadata via TanStack Query
  const { data: availableUsers = [] } = useQuery({
    queryKey: queryKeys.users,
    queryFn: () => api.getUsers().catch(() => [])
  });

  const { data: availableUpstreams = [] } = useQuery({
    queryKey: queryKeys.upstreams,
    queryFn: () => api.getUpstreams().catch(() => [])
  });

  // Query Params with Memoization
  const queryParams = useMemo(() => {
    const offset = (page - 1) * pageSize;
    const startDate = computeStartDate(filterTimeRange);
    return {
      limit: pageSize,
      offset,
      status: filterStatus !== 'all' ? filterStatus : undefined,
      userId: filterUser !== 'all' ? filterUser : undefined,
      upstreamSlug: filterUpstream !== 'all' ? filterUpstream : undefined,
      startDate
    };
  }, [page, pageSize, filterStatus, filterUser, filterUpstream, filterTimeRange, computeStartDate]);

  // Fetch Server-Side Paginated & Filtered Audit Logs with TanStack Query
  const {
    data: auditData,
    isLoading,
    isFetching,
    isError,
    error: queryError,
    refetch
  } = useQuery({
    queryKey: queryKeys.auditLogs(queryParams),
    queryFn: () => api.getAuditLogs(queryParams),
    placeholderData: (prev) => prev
  });

  const logs = auditData?.logs || [];
  const total = auditData?.total || 0;
  const loading = isLoading;
  const error = isError ? (queryError as any)?.message || 'Failed to fetch audit records' : null;

  // Client search filtering across visible text fields (toolName, ID, error, user email)
  const displayedLogs = useMemo(() => {
    if (!searchQuery.trim()) return logs;
    const q = searchQuery.toLowerCase().trim();
    return logs.filter(log =>
      log.toolName.toLowerCase().includes(q) ||
      log.userEmail.toLowerCase().includes(q) ||
      log.upstreamSlug.toLowerCase().includes(q) ||
      log.id.toLowerCase().includes(q) ||
      (log.errorMessage && log.errorMessage.toLowerCase().includes(q))
    );
  }, [logs, searchQuery]);

  // Operational metrics for the current visible records
  const stats = useMemo(() => {
    if (logs.length === 0) return { successCount: 0, errorCount: 0, avgDurationMs: 0, successRate: 100 };
    const successCount = logs.filter(l => l.status === 'success').length;
    const errorCount = logs.filter(l => l.status === 'error').length;
    const totalDuration = logs.reduce((acc, l) => acc + (l.durationMs || 0), 0);
    const avgDurationMs = Math.round(totalDuration / logs.length);
    const successRate = Math.round((successCount / logs.length) * 100);
    return { successCount, errorCount, avgDurationMs, successRate };
  }, [logs]);

  // Reset all filters
  const handleResetFilters = () => {
    setFilterStatus('all');
    setFilterUser('all');
    setFilterUpstream('all');
    setFilterTimeRange('all');
    setSearchQuery('');
    setPage(1);
  };

  const isFiltered = filterStatus !== 'all' || filterUser !== 'all' || filterUpstream !== 'all' || filterTimeRange !== 'all' || searchQuery.trim().length > 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // Copy helpers
  const handleCopyId = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(true);
    toast.success('Execution ID copied to clipboard');
    setTimeout(() => setCopiedId(false), 2000);
  };

  const handleCopyParams = (params: any) => {
    navigator.clipboard.writeText(JSON.stringify(params, null, 2));
    setCopiedParams(true);
    toast.success('Parameters copied to clipboard');
    setTimeout(() => setCopiedParams(false), 2000);
  };

  const handleCopyResponse = (resStr: string) => {
    navigator.clipboard.writeText(resStr);
    setCopiedResponse(true);
    toast.success('Response summary copied to clipboard');
    setTimeout(() => setCopiedResponse(false), 2000);
  };

  return (
    <div className="page-container">
      {/* 1. Page Header with Refresh Action */}
      <PageHeader
        title="Audit Logs & Tool Call Inspector"
        description="Audit trail of all MCP tool executions with authenticated user attribution, upstream routing, latency, and error tracking."
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Button
              variant="outline"
              onClick={() => refetch()}
              disabled={isFetching}
              isLoading={isFetching}
              leftIcon={<RefreshCw size={14} />}
              aria-label="Refresh audit logs"
            >
              Refresh Audit Logs
            </Button>
          </div>
        }
      />

      {/* Hairline synchronization indicator during background refetch */}
      {isFetching && !isLoading && (
        <div style={{ marginBottom: '16px' }}>
          <ProgressBar
            indeterminate
            size="xs"
            variant="primary"
            aria-label="Synchronizing audit trail logs"
          />
        </div>
      )}

      {/* Accessible live region for filter count announcements */}
      <div role="status" aria-live="polite" style={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden' }}>
        {displayedLogs.length} audit logs displayed.
      </div>

      {/* Query Error Notice with Retry */}
      {error && (
        <Alert
          variant="danger"
          title="Audit Trail Retrieval Issue"
          style={{ marginBottom: '20px' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
            <span>{error}</span>
            <Button size="sm" variant="outline" onClick={() => refetch()}>
              Retry Query
            </Button>
          </div>
        </Alert>
      )}

      {/* 2. Operational Metrics Overview Bar */}
      <div
        className="console-card"
        style={{
          padding: '14px 20px',
          marginBottom: '20px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '16px',
          backgroundColor: 'var(--bg-surface-elevated)'
        }}
      >
        <div>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
            Total Events
          </span>
          <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '2px' }}>
            {total}
          </div>
        </div>

        <div>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
            Success Rate (Window)
          </span>
          <div style={{ fontSize: '18px', fontWeight: 700, color: stats.successRate >= 95 ? 'var(--color-success)' : 'var(--color-warning)', marginTop: '2px' }}>
            {stats.successRate}%
          </div>
        </div>

        <div>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
            Avg Execution Latency
          </span>
          <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '2px', fontFamily: 'var(--font-mono)' }}>
            {stats.avgDurationMs}ms
          </div>
        </div>

        <div>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
            Recent Errors
          </span>
          <div style={{ fontSize: '18px', fontWeight: 700, color: stats.errorCount > 0 ? 'var(--color-danger)' : 'var(--text-muted)', marginTop: '2px' }}>
            {stats.errorCount} {stats.errorCount === 1 ? 'failure' : 'failures'}
          </div>
        </div>
      </div>

      {/* 3. Search and Multi-Parameter Filter Controls */}
      <div
        className="console-card"
        style={{
          padding: '16px 20px',
          marginBottom: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px'
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
          {/* Text Search Input */}
          <div style={{ position: 'relative', flex: '1 1 260px' }}>
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
              placeholder="Search by tool, user, server, or execution ID..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
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

          {/* Time Range Filter */}
          <div style={{ minWidth: '130px', flex: '1 1 150px' }}>
            <Select
              label="Time Range"
              value={filterTimeRange}
              onChange={e => {
                setFilterTimeRange(e.target.value);
                setPage(1);
              }}
              options={[
                { value: 'all', label: 'All Time' },
                { value: '15m', label: 'Past 15 Minutes' },
                { value: '1h', label: 'Past 1 Hour' },
                { value: '24h', label: 'Past 24 Hours' },
                { value: '7d', label: 'Past 7 Days' }
              ]}
            />
          </div>

          {/* Outcome Filter */}
          <div style={{ minWidth: '130px', flex: '1 1 140px' }}>
            <Select
              label="Outcome"
              value={filterStatus}
              onChange={e => {
                setFilterStatus(e.target.value);
                setPage(1);
              }}
              options={[
                { value: 'all', label: 'All Outcomes' },
                { value: 'success', label: 'Success Only' },
                { value: 'error', label: 'Errors Only' }
              ]}
            />
          </div>

          {/* Upstream Server Filter */}
          <div style={{ minWidth: '130px', flex: '1 1 150px' }}>
            <Select
              label="Upstream Server"
              value={filterUpstream}
              onChange={e => {
                setFilterUpstream(e.target.value);
                setPage(1);
              }}
              options={[
                { value: 'all', label: 'All Upstreams' },
                ...availableUpstreams.map(u => ({ value: u.slug, label: u.name }))
              ]}
            />
          </div>

          {/* User Attribution Filter */}
          <div style={{ minWidth: '140px', flex: '1 1 160px' }}>
            <Select
              label="Attributed User"
              value={filterUser}
              onChange={e => {
                setFilterUser(e.target.value);
                setPage(1);
              }}
              options={[
                { value: 'all', label: 'All Users' },
                ...availableUsers.map(u => ({ value: u.id, label: u.name }))
              ]}
            />
          </div>

          {/* Clear Filters Button */}
          {isFiltered && (
            <div style={{ paddingTop: '22px' }}>
              <Button
                variant="outline"
                size="sm"
                onClick={handleResetFilters}
                leftIcon={<X size={12} />}
              >
                Reset Filters
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* 4. Audit Log Table */}
      <div className="console-card" style={{ overflow: 'hidden', marginBottom: '20px' }}>
        {loading && logs.length === 0 ? (
          <div style={{ padding: '24px' }}>
            <Skeleton width="100%" height="32px" style={{ marginBottom: '14px' }} />
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} style={{ display: 'flex', gap: '14px', marginBottom: '12px' }}>
                <Skeleton width="18%" height="32px" />
                <Skeleton width="12%" height="32px" />
                <Skeleton width="22%" height="32px" />
                <Skeleton width="16%" height="32px" />
                <Skeleton width="18%" height="32px" />
                <Skeleton width="14%" height="32px" />
              </div>
            ))}
          </div>
        ) : total === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center' }}>
            <EmptyState
              icon={<FileText size={28} />}
              title="No Audit Records Ingested"
              description="No MCP tool calls have been executed yet. Run a prompt in the Chat Agent or connect an external client."
              actionLabel={onNavigate ? 'Open Chat Playground' : undefined}
              onAction={onNavigate ? () => onNavigate('chat') : undefined}
            />
          </div>
        ) : displayedLogs.length === 0 ? (
          <div style={{ padding: '36px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <Filter size={24} style={{ marginBottom: '8px' }} />
            <h4 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 6px' }}>
              No Matching Audit Logs
            </h4>
            <p style={{ fontSize: '12px', margin: '0 0 16px' }}>
              No tool executions match your current filter parameters.
            </p>
            <Button size="sm" variant="outline" onClick={handleResetFilters}>
              Reset Filters
            </Button>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="console-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ width: '22%' }}>Timestamp</th>
                  <th style={{ width: '16%' }}>Outcome</th>
                  <th className="col-priority-medium" style={{ width: '22%' }}>Actor</th>
                  <th className="col-priority-low" style={{ width: '14%' }}>Upstream</th>
                  <th style={{ width: '20%' }}>Tool Name</th>
                  <th style={{ width: '18%', textAlign: 'right' }}>Duration & Inspect</th>
                </tr>
              </thead>
              <tbody>
                {displayedLogs.map(log => {
                  const isSuccess = log.status === 'success';
                  const relativeTime = formatRelativeTime(log.timestamp);
                  const exactTime = formatExactTimestamp(log.timestamp);

                  return (
                    <tr
                      key={log.id}
                      onClick={() => setSelectedLog(log)}
                      style={{ cursor: 'pointer' }}
                      title="Click to view detailed execution audit log"
                    >
                      {/* Timestamp: Relative with exact timezone tooltip */}
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column' }} title={`Exact Time: ${exactTime} (ISO: ${log.timestamp})`}>
                          <span style={{ color: 'var(--text-primary)', fontWeight: 500, fontSize: '12px' }}>
                            {relativeTime}
                          </span>
                          <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>
                            {exactTime}
                          </span>
                        </div>
                      </td>

                      {/* Outcome: Text + Icon + Semantic Color */}
                      <td>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            padding: '2px 8px',
                            borderRadius: 'var(--radius-full)',
                            fontSize: '11px',
                            fontWeight: 600,
                            backgroundColor: isSuccess ? 'var(--color-success-bg)' : 'var(--color-danger-bg)',
                            borderColor: isSuccess ? 'var(--color-success-border)' : 'var(--color-danger-border)',
                            borderWidth: '1px',
                            borderStyle: 'solid',
                            color: isSuccess ? 'var(--color-success)' : 'var(--color-danger)'
                          }}
                        >
                          {isSuccess ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
                          {isSuccess ? 'Success' : 'Failed'}
                        </span>
                      </td>

                      {/* Actor: Member Email and ID */}
                      <td className="col-priority-medium">
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '12px' }}>
                            {log.userEmail}
                          </span>
                          <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                            {log.userId}
                          </span>
                        </div>
                      </td>

                      {/* Upstream Server */}
                      <td className="col-priority-low">
                        <Badge variant="info">
                          {log.upstreamSlug}
                        </Badge>
                      </td>

                      {/* Tool Name */}
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <code style={{ color: 'var(--accent-primary)', fontWeight: 600, fontSize: '12px', fontFamily: 'var(--font-mono)', wordBreak: 'break-all' }}>
                            {log.toolName}
                          </code>
                          <span className="table-responsive-card-toggle" style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                            {log.upstreamSlug} • {log.userEmail}
                          </span>
                        </div>
                      </td>

                      {/* Latency & Inspect Button */}
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '10px' }}>
                          <span
                            style={{
                              fontFamily: 'var(--font-mono)',
                              fontSize: '11px',
                              color: log.durationMs > 2000 ? 'var(--color-warning)' : 'var(--text-secondary)'
                            }}
                          >
                            {log.durationMs}ms
                          </span>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedLog(log);
                            }}
                            aria-label={`Inspect event ${log.id}`}
                          >
                            Inspect
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* 5. Pagination Footer */}
        {total > 0 && (
          <div
            style={{
              padding: '12px 20px',
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
                Showing <strong>{(page - 1) * pageSize + 1}</strong> to{' '}
                <strong>{Math.min(page * pageSize, total)}</strong> of{' '}
                <strong>{total}</strong> records
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
                  <option value={10}>10</option>
                  <option value={15}>15</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                </select>
              </label>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Button
                size="sm"
                variant="outline"
                disabled={page <= 1 || loading}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                leftIcon={<ChevronLeft size={13} />}
              >
                Previous
              </Button>
              <span style={{ padding: '0 8px', fontSize: '11px', fontWeight: 600 }}>
                {page} / {totalPages}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={page >= totalPages || loading}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                rightIcon={<ChevronRight size={13} />}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* 6. Modal: Detailed Audit Event View */}
      <Modal
        isOpen={Boolean(selectedLog)}
        onClose={() => setSelectedLog(null)}
        title="Audit Event Details"
        description="Detailed trace with user attribution, sanitized inputs, and execution outcome."
        maxWidth="680px"
        footer={
          <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              Audit security: Plaintext credentials & bearer tokens are strictly omitted.
            </span>
            <Button variant="primary" onClick={() => setSelectedLog(null)}>
              Close
            </Button>
          </div>
        }
      >
        {selectedLog && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', fontSize: '12px' }}>
            {/* Correlation ID & Copy Action */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 14px',
                background: 'var(--bg-canvas)',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-subtle)'
              }}
            >
              <div>
                <span style={{ color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase', fontWeight: 600 }}>
                  Execution / Correlation ID
                </span>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--accent-primary)', marginTop: '2px' }}>
                  {selectedLog.id}
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleCopyId(selectedLog.id)}
                leftIcon={copiedId ? <Check size={12} /> : <Copy size={12} />}
              >
                {copiedId ? 'Copied' : 'Copy ID'}
              </Button>
            </div>

            {/* Core Metadata Matrix */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '12px',
                background: 'var(--bg-canvas)',
                padding: '14px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-subtle)'
              }}
            >
              <div>
                <span style={{ color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Clock size={11} /> Timestamp (Local Timezone)
                </span>
                <div style={{ color: 'var(--text-primary)', marginTop: '3px', fontWeight: 500 }}>
                  {formatExactTimestamp(selectedLog.timestamp)}
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: '10px', marginTop: '2px' }}>
                  ISO: {selectedLog.timestamp}
                </div>
              </div>

              <div>
                <span style={{ color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Activity size={11} /> Execution Latency & Outcome
                </span>
                <div style={{ marginTop: '3px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '1px 7px',
                      borderRadius: 'var(--radius-full)',
                      fontSize: '11px',
                      fontWeight: 600,
                      backgroundColor: selectedLog.status === 'success' ? 'var(--color-success-bg)' : 'var(--color-danger-bg)',
                      color: selectedLog.status === 'success' ? 'var(--color-success)' : 'var(--color-danger)'
                    }}
                  >
                    {selectedLog.status === 'success' ? <CheckCircle2 size={11} /> : <AlertTriangle size={11} />}
                    {selectedLog.status.toUpperCase()}
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {selectedLog.durationMs}ms
                  </span>
                </div>
              </div>

              <div>
                <span style={{ color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <UserIcon size={11} /> Attributed Actor
                </span>
                <div style={{ color: 'var(--text-primary)', fontWeight: 600, marginTop: '3px' }}>
                  {selectedLog.userEmail}
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: '10px', fontFamily: 'var(--font-mono)' }}>
                  ID: {selectedLog.userId}
                </div>
              </div>

              <div>
                <span style={{ color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Server size={11} /> Target Upstream & Tool
                </span>
                <div style={{ marginTop: '3px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Badge variant="info">{selectedLog.upstreamSlug}</Badge>
                  <code style={{ color: 'var(--accent-primary)', fontWeight: 600 }}>{selectedLog.toolName}</code>
                </div>
              </div>
            </div>

            {/* Error Details Alert */}
            {selectedLog.errorMessage && (
              <Alert variant="danger" title="Tool Execution Failure Message">
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
                  {selectedLog.errorMessage}
                </div>
              </Alert>
            )}

            {/* Sanitized Request Parameters (Collapsible with Copy) */}
            <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
              <div
                onClick={() => setExpandParams(!expandParams)}
                style={{
                  padding: '8px 12px',
                  background: 'var(--bg-canvas)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  userSelect: 'none'
                }}
              >
                <span style={{ fontWeight: 600, fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                  Sanitized Request Parameters
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCopyParams(selectedLog.parametersSanitized);
                    }}
                    leftIcon={copiedParams ? <Check size={11} /> : <Copy size={11} />}
                  >
                    {copiedParams ? 'Copied' : 'Copy'}
                  </Button>
                  {expandParams ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                </div>
              </div>

              {expandParams && (
                <pre
                  style={{
                    margin: 0,
                    padding: '12px',
                    background: 'rgba(0, 0, 0, 0.5)',
                    color: '#38bdf8',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '11px',
                    overflowX: 'auto',
                    maxHeight: '180px'
                  }}
                >
                  {JSON.stringify(selectedLog.parametersSanitized || {}, null, 2)}
                </pre>
              )}
            </div>

            {/* Response Summary (Collapsible with Copy) */}
            <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
              <div
                onClick={() => setExpandResponse(!expandResponse)}
                style={{
                  padding: '8px 12px',
                  background: 'var(--bg-canvas)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  userSelect: 'none'
                }}
              >
                <span style={{ fontWeight: 600, fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                  Execution Response Summary
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCopyResponse(selectedLog.responseSummary || '');
                    }}
                    leftIcon={copiedResponse ? <Check size={11} /> : <Copy size={11} />}
                  >
                    {copiedResponse ? 'Copied' : 'Copy'}
                  </Button>
                  {expandResponse ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                </div>
              </div>

              {expandResponse && (
                <pre
                  style={{
                    margin: 0,
                    padding: '12px',
                    background: 'rgba(0, 0, 0, 0.5)',
                    color: selectedLog.status === 'success' ? 'var(--accent-success)' : 'var(--color-danger)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '11px',
                    overflowX: 'auto',
                    maxHeight: '180px'
                  }}
                >
                  {selectedLog.responseSummary || (selectedLog.status === 'success' ? 'Success (no response payload returned)' : 'Execution error')}
                </pre>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
