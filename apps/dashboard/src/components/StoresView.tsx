import React, { useState, useEffect, useRef } from 'react';
import { Store, StoreQuota } from '../types/index.js';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.js';

export const StoresView: React.FC = () => {
  const { user } = useAuth();

  const [stores, setStores] = useState<Store[]>([]);
  const [quota, setQuota] = useState<StoreQuota>({ current: 0, max: 3, remaining: 3 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [deletingStore, setDeletingStore] = useState<Store | null>(null);

  // Form State
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const pollIntervalRef = useRef<any>(null);

  const fetchStores = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      setError(null);
      const data = await api.listStores();
      setStores(data.stores);
      setQuota(data.quota);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch WooCommerce stores');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchStores();

    // Auto-poll every 4 seconds to observe real-time provisioning state transitions
    pollIntervalRef.current = setInterval(() => {
      fetchStores(true);
    }, 4000);

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const cleanSlug = slug.toLowerCase().trim();
    if (!name.trim()) {
      setFormError('Store name is required');
      return;
    }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(cleanSlug)) {
      setFormError('Slug must contain only lowercase letters, numbers, and single hyphens (e.g. "store-alpha")');
      return;
    }

    try {
      setFormSubmitting(true);
      await api.createStore({ name: name.trim(), slug: cleanSlug });
      setShowCreateModal(false);
      setName('');
      setSlug('');
      await fetchStores();
    } catch (err: any) {
      setFormError(err.message || 'Store creation failed');
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingStore) return;
    try {
      setFormSubmitting(true);
      await api.deleteStore(deletingStore.id);
      setDeletingStore(null);
      await fetchStores();
    } catch (err: any) {
      setError(err.message || 'Store deletion failed');
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleRetry = async (storeId: string) => {
    try {
      await api.retryStore(storeId);
      await fetchStores(true);
    } catch (err: any) {
      setError(err.message || 'Failed to retry store provisioning');
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ready':
        return (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            background: 'rgba(34, 197, 94, 0.15)',
            color: '#4ade80',
            border: '1px solid rgba(34, 197, 94, 0.3)',
            padding: '3px 10px',
            borderRadius: '9999px',
            fontSize: '12px',
            fontWeight: 600
          }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#4ade80' }} />
            Ready
          </span>
        );
      case 'provisioning':
        return (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            background: 'rgba(234, 179, 8, 0.15)',
            color: '#facc15',
            border: '1px solid rgba(234, 179, 8, 0.3)',
            padding: '3px 10px',
            borderRadius: '9999px',
            fontSize: '12px',
            fontWeight: 600
          }}>
            <span style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: '#facc15',
              boxShadow: '0 0 8px #facc15'
            }} />
            Provisioning...
          </span>
        );
      case 'deleting':
        return (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            background: 'rgba(249, 115, 22, 0.15)',
            color: '#fb923c',
            border: '1px solid rgba(249, 115, 22, 0.3)',
            padding: '3px 10px',
            borderRadius: '9999px',
            fontSize: '12px',
            fontWeight: 600
          }}>
            Purging Resources...
          </span>
        );
      case 'failed':
      default:
        return (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            background: 'rgba(239, 68, 68, 0.15)',
            color: '#f87171',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            padding: '3px 10px',
            borderRadius: '9999px',
            fontSize: '12px',
            fontWeight: 600
          }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#f87171' }} />
            Failed
          </span>
        );
    }
  };

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Top Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: '24px',
        flexWrap: 'wrap',
        gap: '16px'
      }}>
        <div>
          <h1 style={{ fontSize: '26px', fontWeight: 700, margin: '0 0 6px 0', color: '#f8fafc' }}>
            WooCommerce Store Tenants
          </h1>
          <p style={{ margin: 0, color: '#94a3b8', fontSize: '14px' }}>
            Multi-store Kubernetes provisioning with isolated namespaces, zero-trust NetworkPolicies, and store-scoped MCP tools.
            {user && (
              <span style={{ marginLeft: '8px', color: '#64748b', fontSize: '12px' }}>
                (Tenant Owner: {user.email})
              </span>
            )}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {/* Quota Badge */}
          <div style={{
            background: '#1e293b',
            border: '1px solid #334155',
            padding: '8px 14px',
            borderRadius: '8px',
            fontSize: '13px',
            color: '#cbd5e1'
          }}>
            <span style={{ color: '#94a3b8' }}>Store Quota: </span>
            <strong style={{ color: quota.remaining > 0 ? '#38bdf8' : '#f87171' }}>
              {quota.current} / {quota.max}
            </strong>
            <span style={{ marginLeft: '6px', color: '#64748b' }}>
              ({quota.remaining} remaining)
            </span>
          </div>

          <button
            onClick={() => {
              setFormError(null);
              setShowCreateModal(true);
            }}
            disabled={quota.remaining <= 0}
            style={{
              background: quota.remaining > 0 ? '#3b82f6' : '#475569',
              color: '#ffffff',
              border: 'none',
              padding: '10px 18px',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: quota.remaining > 0 ? 'pointer' : 'not-allowed',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <span>+</span> Provision New Store
          </button>
        </div>
      </div>

      {error && (
        <div style={{
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          color: '#fca5a5',
          padding: '12px 16px',
          borderRadius: '8px',
          marginBottom: '20px',
          fontSize: '14px'
        }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#94a3b8' }}>
          Loading provisioned store environments...
        </div>
      ) : stores.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '60px 20px',
          background: '#0f172a',
          border: '1px dashed #334155',
          borderRadius: '12px'
        }}>
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>🏪</div>
          <h3 style={{ margin: '0 0 8px 0', color: '#f8fafc', fontSize: '18px' }}>No Stores Provisioned Yet</h3>
          <p style={{ margin: '0 0 20px 0', color: '#94a3b8', fontSize: '14px', maxWidth: '480px', marginInline: 'auto' }}>
            Click &ldquo;Provision New Store&rdquo; to launch an isolated WooCommerce store complete with WordPress, MariaDB, and a dedicated MCP server.
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            style={{
              background: '#3b82f6',
              color: '#ffffff',
              border: 'none',
              padding: '9px 18px',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Provision First Store
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '20px' }}>
          {stores.map((s) => (
            <div
              key={s.id}
              style={{
                background: '#0f172a',
                border: '1px solid #1e293b',
                borderRadius: '12px',
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                transition: 'border-color 0.2s',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.2)'
              }}
            >
              <div>
                {/* Store Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <h3 style={{ margin: 0, fontSize: '17px', color: '#f8fafc', fontWeight: 600 }}>
                    {s.name}
                  </h3>
                  {getStatusBadge(s.status)}
                </div>

                {/* Metadata Grid */}
                <div style={{ fontSize: '13px', color: '#94a3b8', display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                  <div>
                    <span style={{ color: '#64748b' }}>Kubernetes Namespace: </span>
                    <code style={{ background: '#1e293b', padding: '2px 6px', borderRadius: '4px', color: '#38bdf8' }}>
                      {s.namespace}
                    </code>
                  </div>
                  <div>
                    <span style={{ color: '#64748b' }}>Gateway MCP Prefix: </span>
                    <code style={{ background: '#1e293b', padding: '2px 6px', borderRadius: '4px', color: '#a78bfa' }}>
                      {s.upstreamSlug}__*
                    </code>
                  </div>
                  <div>
                    <span style={{ color: '#64748b' }}>Storefront URL: </span>
                    <a
                      href={s.storeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: '#60a5fa', textDecoration: 'none' }}
                    >
                      {s.storeUrl} ↗
                    </a>
                  </div>
                  <div>
                    <span style={{ color: '#64748b' }}>Admin Portal: </span>
                    <a
                      href={s.adminUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: '#93c5fd', textDecoration: 'none' }}
                    >
                      {s.adminUrl} ↗
                    </a>
                  </div>
                  <div>
                    <span style={{ color: '#64748b' }}>Created: </span>
                    <span>{new Date(s.createdAt).toLocaleString()}</span>
                  </div>

                  {s.failureReason && (
                    <div style={{
                      marginTop: '6px',
                      background: 'rgba(239, 68, 68, 0.1)',
                      border: '1px solid rgba(239, 68, 68, 0.25)',
                      color: '#fca5a5',
                      padding: '8px',
                      borderRadius: '6px',
                      fontSize: '12px'
                    }}>
                      <strong>Failure Reason:</strong> {s.failureReason}
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{
                display: 'flex',
                justifyContent: 'flex-end',
                alignItems: 'center',
                gap: '10px',
                borderTop: '1px solid #1e293b',
                paddingTop: '14px'
              }}>
                {s.status === 'failed' && (
                  <button
                    onClick={() => handleRetry(s.id)}
                    style={{
                      background: '#eab308',
                      color: '#000000',
                      border: 'none',
                      padding: '6px 12px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    Retry Provisioning
                  </button>
                )}

                <button
                  onClick={() => setDeletingStore(s)}
                  disabled={s.status === 'deleting'}
                  style={{
                    background: 'transparent',
                    color: '#ef4444',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    padding: '6px 14px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: s.status === 'deleting' ? 'not-allowed' : 'pointer'
                  }}
                >
                  {s.status === 'deleting' ? 'Deleting...' : 'Delete Store'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Provision Store Modal */}
      {showCreateModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.75)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px'
        }}>
          <div style={{
            background: '#0f172a',
            border: '1px solid #334155',
            borderRadius: '12px',
            width: '100%',
            maxWidth: '480px',
            padding: '24px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)'
          }}>
            <h2 style={{ margin: '0 0 16px 0', fontSize: '18px', color: '#f8fafc', fontWeight: 600 }}>
              Provision Isolated WooCommerce Store
            </h2>

            <p style={{ margin: '0 0 20px 0', color: '#94a3b8', fontSize: '13px', lineHeight: 1.5 }}>
              This allocates a dedicated Kubernetes namespace with MariaDB, WordPress, PVCs, zero-trust NetworkPolicies, and a store-scoped MCP server.
            </p>

            {formError && (
              <div style={{
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#fca5a5',
                padding: '10px 14px',
                borderRadius: '6px',
                marginBottom: '16px',
                fontSize: '13px'
              }}>
                {formError}
              </div>
            )}

            <form onSubmit={handleCreate}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', color: '#cbd5e1' }}>
                  Store Display Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Vintage Apparel Store"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (!slug) {
                      setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-'));
                    }
                  }}
                  required
                  style={{
                    width: '100%',
                    background: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    padding: '8px 12px',
                    color: '#f8fafc',
                    fontSize: '14px',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', color: '#cbd5e1' }}>
                  Store Slug (Namespace: <code style={{ color: '#38bdf8' }}>store-{slug || 'slug'}</code>)
                </label>
                <input
                  type="text"
                  placeholder="e.g. vintage-apparel"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  required
                  style={{
                    width: '100%',
                    background: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    padding: '8px 12px',
                    color: '#f8fafc',
                    fontSize: '14px',
                    boxSizing: 'border-box'
                  }}
                />
                <span style={{ fontSize: '11px', color: '#64748b', marginTop: '4px', display: 'block' }}>
                  Used for Ingress domain (<code>{slug || 'slug'}.store.local.test</code>) and MCP tools (<code>store-{slug || 'slug'}__*</code>).
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  disabled={formSubmitting}
                  style={{
                    background: '#1e293b',
                    color: '#cbd5e1',
                    border: '1px solid #334155',
                    padding: '8px 16px',
                    borderRadius: '6px',
                    fontSize: '13px',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  style={{
                    background: '#3b82f6',
                    color: '#ffffff',
                    border: 'none',
                    padding: '8px 18px',
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: formSubmitting ? 'not-allowed' : 'pointer'
                  }}
                >
                  {formSubmitting ? 'Provisioning...' : 'Start Provisioning'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingStore && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.75)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px'
        }}>
          <div style={{
            background: '#0f172a',
            border: '1px solid #ef4444',
            borderRadius: '12px',
            width: '100%',
            maxWidth: '480px',
            padding: '24px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)'
          }}>
            <h2 style={{ margin: '0 0 12px 0', fontSize: '18px', color: '#f87171', fontWeight: 600 }}>
              Permanently Purge Store &ldquo;{deletingStore.name}&rdquo;?
            </h2>

            <div style={{
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              padding: '12px',
              borderRadius: '8px',
              fontSize: '13px',
              color: '#fca5a5',
              marginBottom: '16px',
              lineHeight: 1.5
            }}>
              <strong>Data Retention Policy Warning:</strong> This operation deletes Kubernetes namespace <code>{deletingStore.namespace}</code>, completely purging all database records, PVCs, Secret credentials, and Ingress routes. The dedicated MCP server will be immediately deregistered from the Gateway.
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setDeletingStore(null)}
                disabled={formSubmitting}
                style={{
                  background: '#1e293b',
                  color: '#cbd5e1',
                  border: '1px solid #334155',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  fontSize: '13px',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={formSubmitting}
                style={{
                  background: '#ef4444',
                  color: '#ffffff',
                  border: 'none',
                  padding: '8px 18px',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: formSubmitting ? 'not-allowed' : 'pointer'
                }}
              >
                {formSubmitting ? 'Purging...' : 'Confirm Purge & Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
