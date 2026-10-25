import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Store } from '../types/index.js';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.js';
import { queryClient, queryKeys } from '../api/queryClient.js';
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
  ProgressBar,
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
  Calendar,
  RefreshCw
} from 'lucide-react';

export const StoresView: React.FC = () => {
  const { user } = useAuth();
  const toast = useToast();

  // Modals & Confirmation Dialogs
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [deletingStore, setDeletingStore] = useState<Store | null>(null);
  const [retryingStoreId, setRetryingStoreId] = useState<string | null>(null);

  // Form State (preserved on failure)
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  // TanStack Query with Smart Non-Aggressive Polling
  // Only polls faster (6s) if there is at least one tenant currently provisioning or deleting
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    isRefetching
  } = useQuery({
    queryKey: queryKeys.stores,
    queryFn: () => api.listStores(),
    refetchInterval: (query) => {
      const stores = query.state.data?.stores || [];
      const isPendingState = stores.some(s => s.status === 'provisioning' || s.status === 'deleting');
      return isPendingState ? 6000 : false;
    }
  });

  const stores = data?.stores || [];
  const quota = data?.quota || { current: 0, max: 3, remaining: 3 };

  // Create Store Mutation
  const createMutation = useMutation({
    mutationFn: (input: { name: string; slug: string }) => api.createStore(input),
    onSuccess: (newStore) => {
      setShowCreateModal(false);
      setName('');
      setSlug('');
      setFormError(null);
      toast.success(`Provisioning initiated for "${newStore.name}"`);
      queryClient.invalidateQueries({ queryKey: queryKeys.stores });
      queryClient.invalidateQueries({ queryKey: queryKeys.tools });
    },
    onError: (err: any) => {
      // Preserve visible inputs on failed submission
      setFormError(err.message || 'Store creation failed. Please check your slug and cluster quota.');
    }
  });

  // Delete Store Mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteStore(id),
    onSuccess: (_, id) => {
      const storeName = deletingStore?.name || id;
      setDeletingStore(null);
      toast.success(`Purge initiated for store "${storeName}"`);
      queryClient.invalidateQueries({ queryKey: queryKeys.stores });
      queryClient.invalidateQueries({ queryKey: queryKeys.tools });
    },
    onError: (err: any) => {
      toast.error(err.message || 'Store deletion failed. Upstream namespace could not be purged.');
    }
  });

  // Retry Provisioning Mutation
  const retryMutation = useMutation({
    mutationFn: (id: string) => api.retryStore(id),
    onMutate: (id) => setRetryingStoreId(id),
    onSuccess: () => {
      toast.info('Retrying store provisioning pipeline');
      queryClient.invalidateQueries({ queryKey: queryKeys.stores });
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to retry store provisioning pipeline');
    },
    onSettled: () => setRetryingStoreId(null)
  });

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const cleanSlug = slug.toLowerCase().trim();
    if (!name.trim()) {
      setFormError('Store display name is required');
      return;
    }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(cleanSlug)) {
      setFormError('Slug must contain only lowercase alphanumeric characters and single hyphens (e.g. "store-alpha")');
      return;
    }

    createMutation.mutate({ name: name.trim(), slug: cleanSlug });
  };

  const handleConfirmDelete = () => {
    if (!deletingStore) return;
    deleteMutation.mutate(deletingStore.id);
  };

  return (
    <div className="page-container">
      {/* Top Header */}
      <PageHeader
        title="WooCommerce Store Tenants"
        description={`Multi-store Kubernetes provisioning with isolated namespaces, network policies, and store-scoped MCP tools.${user ? ` (Owner: ${user.email})` : ''}`}
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            {/* Quota Badge */}
            <Badge variant={quota.remaining > 0 ? 'accent' : 'danger'}>
              Store Quota: {quota.current} / {quota.max} ({quota.remaining} remaining)
            </Badge>

            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              isLoading={isRefetching}
              leftIcon={<RefreshCw size={13} />}
              title="Refresh store tenants list"
            >
              Refresh
            </Button>

            <Button
              variant="primary"
              onClick={() => {
                setFormError(null);
                setShowCreateModal(true);
              }}
              disabled={quota.remaining <= 0}
              leftIcon={<Plus size={14} />}
            >
              Deploy Store
            </Button>
          </div>
        }
      />

      {/* Recoverable Network / Server Error Banner */}
      {isError && (
        <Alert
          variant="danger"
          title="Failed to Load Store Tenants"
          style={{ marginBottom: '20px' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
            <span>{(error as any)?.message || 'Unable to connect to gateway cluster API. Please verify network connectivity.'}</span>
            <Button size="sm" variant="outline" onClick={() => refetch()} leftIcon={<RotateCcw size={12} />}>
              Retry Query
            </Button>
          </div>
        </Alert>
      )}

      {/* Skeletons on Initial Load (Preserves visual layout without jarring blank spinners) */}
      {isLoading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: '18px' }}>
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
        /* Empty Workspace State */
        <EmptyState
          icon={<StoreIcon size={26} />}
          title="No Stores Provisioned Yet"
          description="Provision an isolated WooCommerce tenant with MariaDB, WordPress, and a dedicated MCP server in a private namespace."
          actionLabel="Deploy Store"
          onAction={() => {
            setFormError(null);
            setShowCreateModal(true);
          }}
        />
      ) : (
        /* Store Cards Grid */
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: '18px' }}>
          {stores.map((s) => (
            <div
              key={s.id}
              className="console-card"
              style={{
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: '16px',
                opacity: s.status === 'deleting' ? 0.65 : 1,
                transition: 'opacity 0.18s ease, border-color 0.15s ease'
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

                  {s.status === 'provisioning' && (
                    <div style={{ marginTop: '8px' }}>
                      <ProgressBar
                        label="Allocating Kubernetes namespace & MCP service..."
                        indeterminate
                        variant="warning"
                        size="sm"
                      />
                    </div>
                  )}

                  {s.status === 'deleting' && (
                    <div style={{ marginTop: '8px' }}>
                      <ProgressBar
                        label="Purging namespace, PVCs & tools..."
                        indeterminate
                        variant="danger"
                        size="sm"
                      />
                    </div>
                  )}

                  {s.failureReason && (
                    <div style={{ marginTop: '6px' }}>
                      <Alert variant="danger" title="Provisioning Failure">
                        {s.failureReason}
                      </Alert>
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons with Double-Submit Prevention */}
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
                    onClick={() => retryMutation.mutate(s.id)}
                    isLoading={retryingStoreId === s.id}
                    disabled={retryingStoreId === s.id}
                    leftIcon={<RotateCcw size={12} />}
                  >
                    Retry Provisioning
                  </Button>
                )}

                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => setDeletingStore(s)}
                  disabled={s.status === 'deleting' || deleteMutation.isPending}
                  leftIcon={<Trash2 size={12} />}
                >
                  {s.status === 'deleting' ? 'Deleting...' : 'Delete Store'}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Provision Store Modal with Input Preservation on Failure */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => {
          if (!createMutation.isPending) {
            setShowCreateModal(false);
          }
        }}
        title="Provision Isolated WooCommerce Store"
        description="Allocates a dedicated Kubernetes namespace with MariaDB, WordPress, PVCs, zero-trust NetworkPolicies, and a store-scoped MCP server."
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => setShowCreateModal(false)}
              disabled={createMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleCreateSubmit}
              isLoading={createMutation.isPending}
              disabled={createMutation.isPending}
            >
              Start Provisioning
            </Button>
          </>
        }
      >
        {/* Accessible Live Region for Error Announcement */}
        <div role="status" aria-live="polite">
          {formError && (
            <Alert variant="danger" title="Validation Error" style={{ marginBottom: '16px' }}>
              {formError}
            </Alert>
          )}
        </div>

        <form onSubmit={handleCreateSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
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
            disabled={createMutation.isPending}
            required
          />

          <Input
            label="Store Slug (used for namespace and MCP tools)"
            placeholder="e.g. vintage-apparel"
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
            disabled={createMutation.isPending}
            required
            helperText={`Ingress domain: ${slug || 'slug'}.store.local.test • Tools: store-${slug || 'slug'}__*`}
          />
        </form>
      </Modal>

      {/* Delete Confirmation Modal with Safe Cancellation */}
      <ConfirmDialog
        isOpen={Boolean(deletingStore)}
        title={`Permanently Purge Store "${deletingStore?.name || ''}"?`}
        description={`This operation deletes Kubernetes namespace "${deletingStore?.namespace || ''}", purging all MariaDB records, PVCs, Secret credentials, and Ingress routes. The dedicated MCP server will be immediately deregistered.`}
        confirmLabel="Confirm Purge & Delete"
        variant="danger"
        isLoading={deleteMutation.isPending}
        onConfirm={handleConfirmDelete}
        onCancel={() => {
          if (!deleteMutation.isPending) {
            setDeletingStore(null);
          }
        }}
      />
    </div>
  );
};
