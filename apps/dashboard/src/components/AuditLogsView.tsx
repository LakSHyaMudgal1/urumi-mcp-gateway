import React, { useState, useEffect } from 'react';
import { AuditLog, PaginatedAuditLogs } from '../types/index.js';
import { api } from '../api/client.js';

export const AuditLogsView: React.FC = () => {
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

  const totalPages = Math.ceil(total / pageSize) || 1;

  return (
    <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '0 24px 48px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)' }}>
            Cluster Audit Trail & Tool Invocations
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Comprehensive log of all MCP tool executions with user attribution and sanitized inputs.
          </p>
        </div>

        <button
          onClick={fetchLogs}
          disabled={loading}
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
          {loading ? 'Refreshing...' : '↻ Refresh Logs'}
        </button>
      </div>

      {/* Filter Bar */}
      <form
        onSubmit={handleApplyFilters}
        className="glass-panel"
        style={{
          padding: '16px 20px',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          flexWrap: 'wrap'
        }}
      >
        <div>
          <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
            Status
          </label>
          <select
            value={filterStatus}
            onChange={e => {
              setFilterStatus(e.target.value);
              setPage(1);
            }}
            style={{
              padding: '6px 10px',
              borderRadius: '6px',
              background: 'rgba(15, 23, 42, 0.6)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-primary)',
              fontSize: '13px'
            }}
          >
            <option value="all">All Outcomes</option>
            <option value="success">Success</option>
            <option value="error">Error</option>
          </select>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
            Upstream Slug
          </label>
          <input
            type="text"
            value={filterUpstream}
            onChange={e => setFilterUpstream(e.target.value)}
            placeholder="e.g. woocommerce"
            style={{
              padding: '6px 10px',
              borderRadius: '6px',
              background: 'rgba(15, 23, 42, 0.6)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-primary)',
              fontSize: '13px',
              width: '140px'
            }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
            Tool Name
          </label>
          <input
            type="text"
            value={filterTool}
            onChange={e => setFilterTool(e.target.value)}
            placeholder="e.g. get_stock"
            style={{
              padding: '6px 10px',
              borderRadius: '6px',
              background: 'rgba(15, 23, 42, 0.6)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-primary)',
              fontSize: '13px',
              width: '140px'
            }}
          />
        </div>

        <button
          type="submit"
          style={{
            marginTop: '18px',
            padding: '7px 16px',
            borderRadius: '6px',
            background: 'var(--accent-primary)',
            border: 'none',
            color: '#ffffff',
            fontWeight: 600,
            fontSize: '13px',
            cursor: 'pointer'
          }}
        >
          Filter
        </button>

        {(filterUpstream || filterTool || filterStatus !== 'all') && (
          <button
            type="button"
            onClick={() => {
              setFilterStatus('all');
              setFilterUpstream('');
              setFilterTool('');
              setPage(1);
            }}
            style={{
              marginTop: '18px',
              padding: '7px 12px',
              borderRadius: '6px',
              background: 'transparent',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-secondary)',
              fontSize: '13px',
              cursor: 'pointer'
            }}
          >
            Clear
          </button>
        )}
      </form>

      {/* Error Alert */}
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

      {/* Audit Log Table */}
      <div className="glass-panel" style={{ overflowX: 'auto', marginBottom: '20px' }}>
        {loading && logs.length === 0 ? (
          <div style={{ padding: '50px', textAlign: 'center', color: 'var(--text-muted)' }}>
            Loading audit records...
          </div>
        ) : logs.length === 0 ? (
          <div style={{ padding: '50px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            No audit records found matching the active filter criteria.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>Timestamp</th>
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>User Attribution</th>
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>Upstream Server</th>
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>Tool</th>
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>Duration</th>
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>Outcome</th>
                <th style={{ padding: '12px 16px', fontWeight: 600, textAlign: 'right' }}>Details</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(log => {
                const isSuccess = log.status === 'success';
                return (
                  <tr
                    key={log.id}
                    style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)', transition: 'background 0.1s ease' }}
                  >
                    <td style={{ padding: '12px 16px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{log.userEmail}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{log.userId}</div>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <code style={{ fontSize: '12px', color: '#38bdf8', background: 'rgba(56, 189, 248, 0.1)', padding: '2px 6px', borderRadius: '4px' }}>
                        {log.upstreamSlug}
                      </code>
                    </td>
                    <td style={{ padding: '12px 16px', fontWeight: 600, color: '#a5b4fc' }}>
                      {log.toolName}
                    </td>
                    <td style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                      {log.durationMs}ms
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 600,
                          padding: '2px 8px',
                          borderRadius: '4px',
                          background: isSuccess ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                          color: isSuccess ? 'var(--accent-success)' : 'var(--accent-danger)'
                        }}
                      >
                        {isSuccess ? 'Success' : 'Error'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <button
                        onClick={() => setSelectedLog(log)}
                        style={{
                          padding: '4px 10px',
                          fontSize: '11px',
                          borderRadius: '4px',
                          background: 'rgba(255, 255, 255, 0.05)',
                          border: '1px solid var(--border-subtle)',
                          color: 'var(--text-primary)',
                          cursor: 'pointer'
                        }}
                      >
                        Inspect
                      </button>
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
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1 || loading}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid var(--border-subtle)',
              color: page <= 1 ? 'var(--text-muted)' : 'var(--text-primary)',
              cursor: page <= 1 ? 'not-allowed' : 'pointer'
            }}
          >
            ← Previous
          </button>

          <span style={{ padding: '0 8px' }}>
            Page {page} of {totalPages}
          </span>

          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages || loading}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid var(--border-subtle)',
              color: page >= totalPages ? 'var(--text-muted)' : 'var(--text-primary)',
              cursor: page >= totalPages ? 'not-allowed' : 'pointer'
            }}
          >
            Next →
          </button>
        </div>
      </div>

      {/* Modal: Inspect Log Payload */}
      {selectedLog && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0, 0, 0, 0.75)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '16px' }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: '640px', maxHeight: '85vh', overflowY: 'auto', padding: '28px', borderRadius: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Audit Event Details
                </h3>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>ID: {selectedLog.id}</p>
              </div>
              <button
                onClick={() => setSelectedLog(null)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', fontSize: '20px', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', fontSize: '13px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <span style={{ color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase' }}>Timestamp</span>
                  <div style={{ color: 'var(--text-primary)' }}>{new Date(selectedLog.timestamp).toISOString()}</div>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase' }}>User Attribution</span>
                  <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{selectedLog.userEmail}</div>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase' }}>Upstream Target</span>
                  <div><code>{selectedLog.upstreamSlug}</code></div>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase' }}>Tool Invoked</span>
                  <div><strong style={{ color: '#a5b4fc' }}>{selectedLog.toolName}</strong></div>
                </div>
              </div>

              {selectedLog.errorMessage && (
                <div>
                  <span style={{ color: 'var(--accent-danger)', fontSize: '11px', textTransform: 'uppercase', fontWeight: 600 }}>Error Summary</span>
                  <div style={{ padding: '8px 12px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.25)', color: '#fca5a5', borderRadius: '6px', marginTop: '4px' }}>
                    {selectedLog.errorMessage}
                  </div>
                </div>
              )}

              <div>
                <span style={{ color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase' }}>Sanitized Request Parameters</span>
                <pre style={{ marginTop: '4px', padding: '12px', background: 'rgba(0, 0, 0, 0.5)', borderRadius: '6px', color: '#38bdf8', fontFamily: 'var(--font-mono)', fontSize: '12px', overflowX: 'auto' }}>
                  {JSON.stringify(selectedLog.parametersSanitized || {}, null, 2)}
                </pre>
              </div>

              <div>
                <span style={{ color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase' }}>Response Summary</span>
                <pre style={{ marginTop: '4px', padding: '12px', background: 'rgba(0, 0, 0, 0.5)', borderRadius: '6px', color: '#34d399', fontFamily: 'var(--font-mono)', fontSize: '12px', overflowX: 'auto', maxHeight: '180px' }}>
                  {selectedLog.responseSummary || 'Success (empty response)'}
                </pre>
              </div>
            </div>

            <div style={{ marginTop: '20px', textAlign: 'right' }}>
              <button
                onClick={() => setSelectedLog(null)}
                style={{ padding: '8px 18px', borderRadius: '6px', background: 'var(--accent-primary)', border: 'none', color: '#ffffff', fontWeight: 600, cursor: 'pointer' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
