import React, { useState, useEffect } from 'react';
import { AuditLog, PaginatedAuditLogs } from '../types/index.js';
import { api } from '../api/client.js';
import {
  PageHeader,
  Button,
  Select,
  Input,
  Badge,
  StatusBadge,
  Modal,
  Skeleton,
  EmptyState,
  Alert,
  useToast
} from './ui/index.js';
import {
  RefreshCw,
  Search,
  Filter,
  FileText,
  ChevronLeft,
  ChevronRight,
  User,
  Clock,
  Server,
  Wrench
} from 'lucide-react';

export const AuditLogsView: React.FC = () => {
  const toast = useToast();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter States
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterUpstream, setFilterUpstream] = useState<string>('');
  const [filterTool, setFilterTool] = useState<string>('');

  // Pagination States
  const [page, setPage] = useState(1);
  const pageSize = 15;

  // Selected Log Details Modal
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      setError(null);
      const offset = (page - 1) * pageSize;
      const res: PaginatedAuditLogs = await api.getAuditLogs({
        limit: pageSize,
        offset,
        status: filterStatus !== 'all' ? filterStatus : undefined,
        upstreamSlug: filterUpstream.trim() || undefined,
        toolName: filterTool.trim() || undefined
      });
      setLogs(res.logs);
      setTotal(res.total);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch audit records');
      toast.error('Failed to load audit trail');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [page, filterStatus]);

  const handleApplyFilters = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchLogs();
  };

  const handleClearFilters = () => {
    setFilterStatus('all');
    setFilterUpstream('');
    setFilterTool('');
    setPage(1);
  };

  const totalPages = Math.ceil(total / pageSize) || 1;

  return (
    <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '0 24px 48px' }}>
      {/* Page Header */}
      <PageHeader
        title="Cluster Audit Trail & Tool Invocations"
        description="Comprehensive log of all MCP tool executions with user attribution and sanitized inputs."
        actions={
          <Button
            variant="outline"
            onClick={fetchLogs}
            disabled={loading}
            isLoading={loading}
            leftIcon={<RefreshCw size={14} />}
          >
            Refresh Logs
          </Button>
        }
      />

      {/* Filter Bar */}
      <form
        onSubmit={handleApplyFilters}
        className="console-card"
        style={{
          padding: '16px 20px',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'flex-end',
          gap: '12px',
          flexWrap: 'wrap'
        }}
      >
        <div style={{ width: '160px' }}>
          <Select
            label="Outcome"
            value={filterStatus}
            onChange={e => {
              setFilterStatus(e.target.value);
              setPage(1);
            }}
            options={[
              { value: 'all', label: 'All Outcomes' },
              { value: 'success', label: 'Success' },
              { value: 'error', label: 'Error' }
            ]}
          />
        </div>

        <div style={{ width: '180px' }}>
          <Input
            label="Upstream Slug"
            value={filterUpstream}
            onChange={e => setFilterUpstream(e.target.value)}
            placeholder="e.g. woocommerce"
            leftIcon={<Server size={14} />}
          />
        </div>

        <div style={{ width: '180px' }}>
          <Input
            label="Tool Name"
            value={filterTool}
            onChange={e => setFilterTool(e.target.value)}
            placeholder="e.g. get_stock"
            leftIcon={<Wrench size={14} />}
          />
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <Button
            type="submit"
            variant="primary"
            leftIcon={<Filter size={14} />}
          >
            Filter
          </Button>

          {(filterUpstream || filterTool || filterStatus !== 'all') && (
            <Button
              type="button"
              variant="outline"
              onClick={handleClearFilters}
            >
              Clear
            </Button>
          )}
        </div>
      </form>

      {/* Error Alert */}
      {error && (
        <Alert
          variant="danger"
          title="Audit Log Query Error"
          onDismiss={() => setError(null)}
          style={{ marginBottom: '20px' }}
        >
          {error}
        </Alert>
      )}

      {/* Audit Log Table */}
      <div className="console-card" style={{ overflowX: 'auto', marginBottom: '20px', padding: 0 }}>
        {loading && logs.length === 0 ? (
          <div style={{ padding: '24px' }}>
            <Skeleton width="100%" height="240px" borderRadius="var(--radius-sm)" />
          </div>
        ) : logs.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center' }}>
            <EmptyState
              icon={<FileText size={24} />}
              title="No Audit Records Found"
              description="No tool invocations match the current filter parameters."
              actionLabel={filterUpstream || filterTool || filterStatus !== 'all' ? "Clear Filters" : undefined}
              onAction={handleClearFilters}
            />
          </div>
        ) : (
          <table className="console-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>User Attribution</th>
                <th>Upstream Server</th>
                <th>Tool</th>
                <th>Duration</th>
                <th>Outcome</th>
                <th style={{ textAlign: 'right' }}>Details</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(log => {
                const isSuccess = log.status === 'success';
                return (
                  <tr key={log.id}>
                    <td style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{log.userEmail}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{log.userId}</div>
                    </td>
                    <td>
                      <Badge variant="info">
                        {log.upstreamSlug}
                      </Badge>
                    </td>
                    <td>
                      <code style={{ color: 'var(--accent-primary)', fontWeight: 600, fontSize: '12px' }}>
                        {log.toolName}
                      </code>
                    </td>
                    <td style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                      {log.durationMs}ms
                    </td>
                    <td>
                      <StatusBadge status={isSuccess ? 'success' : 'error'} />
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setSelectedLog(log)}
                      >
                        Inspect
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination Controls */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '13px', color: 'var(--text-secondary)' }}>
        <div>
          Showing {logs.length > 0 ? (page - 1) * pageSize + 1 : 0} to {Math.min(page * pageSize, total)} of {total} records
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1 || loading}
            leftIcon={<ChevronLeft size={14} />}
          >
            Previous
          </Button>

          <span style={{ padding: '0 8px', fontSize: '12px', color: 'var(--text-muted)' }}>
            Page {page} of {totalPages}
          </span>

          <Button
            size="sm"
            variant="outline"
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages || loading}
            rightIcon={<ChevronRight size={14} />}
          >
            Next
          </Button>
        </div>
      </div>

      {/* Modal: Inspect Log Payload */}
      <Modal
        isOpen={Boolean(selectedLog)}
        onClose={() => setSelectedLog(null)}
        title="Audit Event Details"
        description={selectedLog ? `Execution ID: ${selectedLog.id}` : undefined}
        footer={
          <Button variant="primary" onClick={() => setSelectedLog(null)}>
            Close
          </Button>
        }
      >
        {selectedLog && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', fontSize: '13px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', background: 'var(--bg-canvas)', padding: '12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
              <div>
                <span style={{ color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Clock size={11} /> Timestamp
                </span>
                <div style={{ color: 'var(--text-primary)', marginTop: '2px', fontSize: '12px' }}>
                  {new Date(selectedLog.timestamp).toISOString()}
                </div>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <User size={11} /> Attribution
                </span>
                <div style={{ color: 'var(--text-primary)', fontWeight: 600, marginTop: '2px', fontSize: '12px' }}>
                  {selectedLog.userEmail}
                </div>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Server size={11} /> Upstream
                </span>
                <div style={{ marginTop: '2px' }}>
                  <Badge variant="info">{selectedLog.upstreamSlug}</Badge>
                </div>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Wrench size={11} /> Tool Invoked
                </span>
                <div style={{ marginTop: '2px' }}>
                  <code style={{ color: 'var(--accent-primary)', fontWeight: 600 }}>{selectedLog.toolName}</code>
                </div>
              </div>
            </div>

            {selectedLog.errorMessage && (
              <Alert variant="danger" title="Invocation Error">
                {selectedLog.errorMessage}
              </Alert>
            )}

            <div>
              <span style={{ color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', fontWeight: 600 }}>
                Sanitized Request Parameters
              </span>
              <pre
                style={{
                  marginTop: '6px',
                  padding: '12px',
                  background: 'rgba(0, 0, 0, 0.5)',
                  borderRadius: 'var(--radius-sm)',
                  color: '#38bdf8',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '12px',
                  overflowX: 'auto',
                  border: '1px solid var(--border-subtle)'
                }}
              >
                {JSON.stringify(selectedLog.parametersSanitized || {}, null, 2)}
              </pre>
            </div>

            <div>
              <span style={{ color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', fontWeight: 600 }}>
                Response Summary
              </span>
              <pre
                style={{
                  marginTop: '6px',
                  padding: '12px',
                  background: 'rgba(0, 0, 0, 0.5)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--accent-success)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '12px',
                  overflowX: 'auto',
                  maxHeight: '180px',
                  border: '1px solid var(--border-subtle)'
                }}
              >
                {selectedLog.responseSummary || 'Success (empty response)'}
              </pre>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
