import React, { useState, useEffect, useRef } from 'react';
import { Store, StoreQuota } from '../types/index.js';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.js';
import {
  PageHeader,
  Button,
  Badge,
  StatusBadge,
  Input,
  Modal,
  ConfirmDialog,
  EmptyState,
  Skeleton,
  Alert,
  useToast
} from './ui/index.js';
import {
  Plus,
  Store as StoreIcon,
  ExternalLink,
  Trash2,
  RotateCcw,
  Boxes,
  ShieldCheck,
  Calendar
} from 'lucide-react';

export const StoresView: React.FC = () => {
  const { user } = useAuth();
  const toast = useToast();

  const [stores, setStores] = useState<Store[]>([]);
  const [quota, setQuota] = useState<StoreQuota>({ current: 0, max: 3, remaining: 3 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modals & Confirmation
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
      const storeName = name.trim();
      setName('');
      setSlug('');
      toast.success(`Provisioning initiated for "${storeName}"`);
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
      toast.success(`Purge initiated for store "${deletingStore.name}"`);
      setDeletingStore(null);
      await fetchStores();
    } catch (err: any) {
      setError(err.message || 'Store deletion failed');
      toast.error('Store deletion failed');
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleRetry = async (storeId: string) => {
    try {
      await api.retryStore(storeId);
      toast.info('Retrying store provisioning pipeline');
      await fetchStores(true);
    } catch (err: any) {
      setError(err.message || 'Failed to retry store provisioning');
      toast.error('Failed to retry store provisioning');
    }
  };

  return (
    <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '0 24px 48px' }}>
      {/* Top Header */}
      <PageHeader
        title="WooCommerce Store Tenants"
        description={`Multi-store Kubernetes provisioning with isolated namespaces, zero-trust NetworkPolicies, and store-scoped MCP tools.${user ? ` (Tenant Owner: ${user.email})` : ''}`}
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {/* Quota Badge */}
            <Badge variant={quota.remaining > 0 ? 'accent' : 'danger'}>
              Store Quota: {quota.current} / {quota.max} ({quota.remaining} remaining)
            </Badge>

            <Button
              variant="primary"
              onClick={() => {
                setFormError(null);
                setShowCreateModal(true);
              }}
              disabled={quota.remaining <= 0}
              leftIcon={<Plus size={14} />}
            >
              Provision New Store
            </Button>
          </div>
        }
      />

      {error && (
        <Alert
          variant="danger"
          title="Tenant Cluster Error"
          onDismiss={() => setError(null)}
          style={{ marginBottom: '20px' }}
        >
          {error}
        </Alert>
      )}

      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '20px' }}>
          {[1, 2].map(i => (
            <div key={i} className="console-card" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px' }}>
                <Skeleton width="180px" height="20px" />
                <Skeleton width="90px" height="20px" borderRadius="12px" />
              </div>
              <Skeleton width="100%" height="16px" style={{ marginBottom: '8px' }} />
              <Skeleton width="80%" height="16px" style={{ marginBottom: '16px' }} />
              <Skeleton width="100%" height="40px" borderRadius="var(--radius-sm)" />
            </div>
          ))}
        </div>
      ) : stores.length === 0 ? (
        <EmptyState
          icon={<StoreIcon size={26} />}
          title="No Stores Provisioned Yet"
          description="Provision an isolated WooCommerce tenant with MariaDB, WordPress, and a dedicated MCP server in a private namespace."
          actionLabel="Provision First Store"
          onAction={() => setShowCreateModal(true)}
        />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '20px' }}>
          {stores.map((s) => (
            <div
              key={s.id}
              className="console-card"
              style={{
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: '16px'
              }}
            >
              <div>
                {/* Store Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <h3 style={{ margin: 0, fontSize: '15px', color: 'var(--text-primary)', fontWeight: 600 }}>
                    {s.name}
                  </h3>
                  <StatusBadge status={s.status === 'ready' ? 'ready' : (s.status === 'provisioning' ? 'provisioning' : (s.status === 'deleting' ? 'disabled' : 'failed'))} />
                </div>

                {/* Metadata Details */}
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Boxes size={13} style={{ color: 'var(--text-muted)' }} />
                    <span style={{ color: 'var(--text-muted)' }}>Namespace:</span>
                    <Badge variant="accent">{s.namespace}</Badge>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <ShieldCheck size={13} style={{ color: 'var(--text-muted)' }} />
                    <span style={{ color: 'var(--text-muted)' }}>MCP Prefix:</span>
                    <code style={{ color: 'var(--accent-primary)', fontSize: '11px' }}>{s.upstreamSlug}__*</code>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Storefront:</span>
                    <a
                      href={s.storeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: 'var(--accent-primary)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                    >
                      {s.storeUrl} <ExternalLink size={11} />
                    </a>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Admin Portal:</span>
                    <a
                      href={s.adminUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: '#38bdf8', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                    >
                      {s.adminUrl} <ExternalLink size={11} />
                    </a>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', fontSize: '11px' }}>
                    <Calendar size={12} />
                    <span>Created: {new Date(s.createdAt).toLocaleString()}</span>
                  </div>

                  {s.failureReason && (
                    <div style={{ marginTop: '6px' }}>
                      <Alert variant="danger" title="Provisioning Failure">
                        {s.failureReason}
                      </Alert>
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  alignItems: 'center',
                  gap: '8px',
                  borderTop: '1px solid var(--border-subtle)',
                  paddingTop: '12px'
                }}
              >
                {s.status === 'failed' && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleRetry(s.id)}
                    leftIcon={<RotateCcw size={12} />}
                  >
                    Retry
                  </Button>
                )}

                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => setDeletingStore(s)}
                  disabled={s.status === 'deleting'}
                  leftIcon={<Trash2 size={12} />}
                >
                  {s.status === 'deleting' ? 'Deleting...' : 'Delete Store'}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Provision Store Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Provision Isolated WooCommerce Store"
        description="Allocates a dedicated Kubernetes namespace with MariaDB, WordPress, PVCs, zero-trust NetworkPolicies, and a store-scoped MCP server."
        footer={
          <>
            <Button variant="outline" onClick={() => setShowCreateModal(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleCreate}
              isLoading={formSubmitting}
            >
              Start Provisioning
            </Button>
          </>
        }
      >
        {formError && (
          <Alert variant="danger" title="Validation Error" style={{ marginBottom: '16px' }}>
            {formError}
          </Alert>
        )}

        <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <Input
            label="Store Display Name"
            placeholder="e.g. Vintage Apparel Store"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (!slug) {
                setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-'));
              }
            }}
            required
          />

          <Input
            label="Store Slug (used for namespace and MCP tools)"
            placeholder="e.g. vintage-apparel"
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
            required
            helperText={`Ingress domain: ${slug || 'slug'}.store.local.test • Tools: store-${slug || 'slug'}__*`}
          />
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <ConfirmDialog
        isOpen={Boolean(deletingStore)}
        title={`Permanently Purge Store "${deletingStore?.name || ''}"?`}
        description={`This operation deletes Kubernetes namespace "${deletingStore?.namespace || ''}", purging all MariaDB records, PVCs, Secret credentials, and Ingress routes. The dedicated MCP server will be immediately deregistered.`}
        confirmLabel="Confirm Purge & Delete"
        variant="danger"
        isLoading={formSubmitting}
        onConfirm={handleDelete}
        onCancel={() => setDeletingStore(null)}
      />
    </div>
  );
};
