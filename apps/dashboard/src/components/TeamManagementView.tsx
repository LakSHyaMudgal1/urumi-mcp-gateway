import React, { useState, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { User, APIKeySummary } from '../types/index.js';
import { api } from '../api/client.js';
import { queryClient, queryKeys } from '../api/queryClient.js';
import { useAuth } from '../context/AuthContext.js';
import {
  PageHeader,
  SectionHeader,
  Button,
  Badge,
  StatusBadge,
  Input,
  SearchInput,
  Select,
  Card,
  Modal,
  ConfirmDialog,
  EmptyState,
  Skeleton,
  Alert,
  ProgressBar,
  useToast
} from './ui/index.js';
import {
  UserPlus,
  Key,
  KeyRound,
  Copy,
  Check,
  X,
  AlertTriangle,
  UserCheck,
  UserX,
  Trash2,
  Shield,
  User as UserIcon,
  Globe,
  Eye,
  ArrowRightLeft,
  Filter
} from 'lucide-react';

/**
 * Validates member invite/creation fields.
 */
export function validateMemberForm(name: string, email: string, password: string): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!name || !name.trim()) {
    errors.name = 'Full name is required (max 100 characters).';
  } else if (name.trim().length > 100) {
    errors.name = 'Full name must not exceed 100 characters.';
  }

  if (!email || !email.trim()) {
    errors.email = 'Email address is required.';
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    errors.email = 'Please enter a valid email address.';
  }

  if (!password) {
    errors.password = 'Initial password is required (minimum 8 characters).';
  } else if (password.length < 8) {
    errors.password = 'Password must be at least 8 characters long.';
  }

  return errors;
}

/**
 * Validates API key creation label.
 */
export function validateKeyForm(name: string): string | null {
  if (!name || !name.trim()) {
    return 'Key descriptive label is required (e.g. "Claude Code Terminal").';
  }
  if (name.trim().length > 64) {
    return 'Key name must not exceed 64 characters.';
  }
  return null;
}

/**
 * Evaluates the role permissions matrix.
 */
export function getPermissions(role: string): {
  canManageUpstreams: boolean;
  canManageUsers: boolean;
  canViewAuditLogs: boolean;
  canExecuteMutations: boolean;
  canExecuteQueries: boolean;
} {
  const isAdmin = role === 'admin';
  return {
    canManageUpstreams: isAdmin,
    canManageUsers: isAdmin,
    canViewAuditLogs: isAdmin,
    canExecuteMutations: isAdmin,
    canExecuteQueries: true
  };
}

export const TeamManagementView: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const toast = useToast();


  // Filters
  const [memberSearch, setMemberSearch] = useState('');
  const [keySearch, setKeySearch] = useState('');

  // Invite/Add Member Modal
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberRole, setNewMemberRole] = useState<'member' | 'admin'>('member');
  const [newMemberPassword, setNewMemberPassword] = useState('');
  const [memberFormSubmitting, setMemberFormSubmitting] = useState(false);
  const [memberFormErrors, setMemberFormErrors] = useState<Record<string, string>>({});
  const [memberGlobalError, setMemberGlobalError] = useState<string | null>(null);

  // Generate Key Modal
  const [showGenerateKeyModal, setShowGenerateKeyModal] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [targetUserId, setTargetUserId] = useState('');
  const [keyFormSubmitting, setKeyFormSubmitting] = useState(false);
  const [keyFormErrors, setKeyFormErrors] = useState<Record<string, string>>({});
  const [keyGlobalError, setKeyGlobalError] = useState<string | null>(null);

  // Single-Display Generated Key Banner/Modal
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  // Inspect Access Profile Modal
  const [inspectingMember, setInspectingMember] = useState<User | null>(null);

  // Confirm Dialogs
  const [roleChangeTarget, setRoleChangeTarget] = useState<{ member: User; nextRole: 'admin' | 'member' } | null>(null);
  const [statusConfirmMember, setStatusConfirmMember] = useState<User | null>(null);
  const [deleteConfirmMember, setDeleteConfirmMember] = useState<User | null>(null);
  const [revokeConfirmKey, setRevokeConfirmKey] = useState<APIKeySummary | null>(null);
  const [actionInProgress, setActionInProgress] = useState(false);

  // Gateway URL Coordinate
  const gatewayUrl = typeof window !== 'undefined'
    ? `${window.location.protocol}//${window.location.host}/mcp`
    : 'http://localhost:4000/mcp';

  /**
   * Helper to invalidate TanStack Query caches across the app
   */
  const invalidateQueries = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.users });
    queryClient.invalidateQueries({ queryKey: queryKeys.keys });
    queryClient.invalidateQueries({ queryKey: queryKeys.health });
  }, []);

  // TanStack Query for Members (Admin only) and API Keys
  const {
    data: members = [],
    isLoading: isMembersLoading,
    isFetching: isMembersFetching,
    error: membersError,
    refetch: refetchMembers
  } = useQuery({
    queryKey: queryKeys.users,
    queryFn: () => api.getUsers(),
    enabled: isAdmin
  });

  const {
    data: keys = [],
    isLoading: isKeysLoading,
    isFetching: isKeysFetching,
    error: keysError,
    refetch: refetchKeys
  } = useQuery({
    queryKey: queryKeys.keys,
    queryFn: () => api.getKeys()
  });

  const loading = (isAdmin && isMembersLoading) || isKeysLoading;
  const isFetching = (isAdmin && isMembersFetching) || isKeysFetching;
  const error = (membersError as any)?.message || (keysError as any)?.message || null;

  const handleRefresh = async () => {
    if (isAdmin) {
      await Promise.all([refetchMembers(), refetchKeys()]);
    } else {
      await refetchKeys();
    }
  };

  // Invite / Create Member
  const handleCreateMember = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors = validateMemberForm(newMemberName, newMemberEmail, newMemberPassword);
    setMemberFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setMemberFormSubmitting(true);
    setMemberGlobalError(null);
    try {
      await api.createUser({
        name: newMemberName.trim(),
        email: newMemberEmail.trim(),
        role: newMemberRole,
        password: newMemberPassword
      });
      setShowAddMemberModal(false);
      const name = newMemberName.trim();
      setNewMemberName('');
      setNewMemberEmail('');
      setNewMemberPassword('');
      toast.success(`Team member "${name}" created successfully`);
      invalidateQueries();
    } catch (err: any) {
      setMemberGlobalError(err.message || 'Failed to create member');
    } finally {
      setMemberFormSubmitting(false);
    }
  };

  // Change Member Role
  const handleConfirmRoleChange = async () => {
    if (!roleChangeTarget) return;
    try {
      setActionInProgress(true);
      await api.updateUser(roleChangeTarget.member.id, { role: roleChangeTarget.nextRole });
      toast.success(`Role for ${roleChangeTarget.member.name} changed to ${roleChangeTarget.nextRole.toUpperCase()}`);
      setRoleChangeTarget(null);
      invalidateQueries();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update member role');
    } finally {
      setActionInProgress(false);
    }
  };

  // Toggle Account Active/Disabled Status
  const handleToggleMemberStatus = async () => {
    if (!statusConfirmMember) return;
    const nextStatus = statusConfirmMember.status === 'active' ? 'disabled' : 'active';
    try {
      setActionInProgress(true);
      await api.updateUser(statusConfirmMember.id, { status: nextStatus });
      toast.success(`Access ${nextStatus === 'active' ? 'restored' : 'disabled'} for ${statusConfirmMember.name}`);
      setStatusConfirmMember(null);
      invalidateQueries();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update member status');
    } finally {
      setActionInProgress(false);
    }
  };

  // Delete Member Permanently
  const handleDeleteMember = async () => {
    if (!deleteConfirmMember) return;
    try {
      setActionInProgress(true);
      await api.deleteUser(deleteConfirmMember.id);
      toast.success(`Account and access revoked for ${deleteConfirmMember.name}`);
      setDeleteConfirmMember(null);
      invalidateQueries();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete member');
    } finally {
      setActionInProgress(false);
    }
  };

  // Generate Key
  const handleGenerateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    const errorMsg = validateKeyForm(newKeyName);
    if (errorMsg) {
      setKeyFormErrors({ name: errorMsg });
      return;
    }
    setKeyFormErrors({});
    setKeyFormSubmitting(true);
    setKeyGlobalError(null);

    try {
      const res = await api.createKey(newKeyName.trim(), isAdmin && targetUserId ? targetUserId : undefined);
      setShowGenerateKeyModal(false);
      setNewKeyName('');
      setTargetUserId('');
      setGeneratedKey(res.rawKey || null);
      setCopiedKey(false);
      toast.success('Gateway API key issued successfully');
      invalidateQueries();
    } catch (err: any) {
      setKeyGlobalError(err.message || 'Failed to issue API key');
    } finally {
      setKeyFormSubmitting(false);
    }
  };

  // Revoke Key Permanently
  const handleRevokeKey = async () => {
    if (!revokeConfirmKey) return;
    try {
      setActionInProgress(true);
      await api.revokeKey(revokeConfirmKey.id);
      toast.success(`API key "${revokeConfirmKey.name}" revoked`);
      setRevokeConfirmKey(null);
      invalidateQueries();
    } catch (err: any) {
      toast.error(err.message || 'Failed to revoke API key');
    } finally {
      setActionInProgress(false);
    }
  };

  // Explicit Copy Handlers
  const handleCopyKey = () => {
    if (!generatedKey) return;
    navigator.clipboard.writeText(generatedKey);
    setCopiedKey(true);
    toast.success('API key copied to clipboard');
    setTimeout(() => setCopiedKey(false), 2500);
  };

  const handleCopyGatewayUrl = () => {
    navigator.clipboard.writeText(gatewayUrl);
    setCopiedUrl(true);
    toast.success('Gateway endpoint URL copied to clipboard');
    setTimeout(() => setCopiedUrl(false), 2500);
  };

  // Filtered Members
  const filteredMembers = useMemo(() => {
    if (!memberSearch.trim()) return members;
    const q = memberSearch.toLowerCase().trim();
    return members.filter(
      m => m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q) || m.role.toLowerCase().includes(q)
    );
  }, [members, memberSearch]);

  // Filtered Keys
  const filteredKeys = useMemo(() => {
    if (!keySearch.trim()) return keys;
    const q = keySearch.toLowerCase().trim();
    return keys.filter(
      k =>
        k.name.toLowerCase().includes(q) ||
        k.keyPrefix.toLowerCase().includes(q) ||
        (k.userEmail && k.userEmail.toLowerCase().includes(q))
    );
  }, [keys, keySearch]);

  return (
    <div className="page-container">
      {/* Page Header */}
      <PageHeader
        title="Team Access & Gateway API Keys"
        description="Manage organization members, role-based permissions, and personal API keys for MCP clients."
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {isAdmin && (
              <Button
                variant="outline"
                onClick={() => {
                  setNewMemberName('');
                  setNewMemberEmail('');
                  setNewMemberRole('member');
                  setNewMemberPassword('');
                  setMemberFormErrors({});
                  setMemberGlobalError(null);
                  setShowAddMemberModal(true);
                }}
                leftIcon={<UserPlus size={14} />}
                aria-label="Invite new team member"
              >
                Invite Team Member
              </Button>
            )}

            <Button
              variant="primary"
              onClick={() => {
                setNewKeyName('');
                setTargetUserId('');
                setKeyFormErrors({});
                setKeyGlobalError(null);
                setShowGenerateKeyModal(true);
              }}
              leftIcon={<Key size={14} />}
              aria-label="Generate new API key"
            >
              Generate API Key
            </Button>
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
            aria-label="Synchronizing team members and API keys"
          />
        </div>
      )}

      {/* Accessible live region for filter count announcements */}
      <div role="status" aria-live="polite" style={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden' }}>
        {filteredMembers.length} team members and {filteredKeys.length} API keys displayed.
      </div>

      {/* Global Error Banner with Retry */}
      {error && (
        <Alert
          variant="danger"
          title="Team Configuration Issue"
          style={{ marginBottom: '20px' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
            <span>{error}</span>
            <Button size="sm" variant="outline" onClick={handleRefresh}>
              Retry Query
            </Button>
          </div>
        </Alert>
      )}

      {/* 1. GATEWAY ENDPOINT vs PERSONAL API KEY DISTINCTION CARD */}
      <Card
        variant="flat"
        style={{
          padding: '18px 22px',
          marginBottom: '28px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ flex: '1 1 360px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <Globe size={15} style={{ color: 'var(--color-primary)' }} />
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                Gateway Endpoint vs. Personal API Key
              </span>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
              MCP clients (Claude Code, Cursor, Cline) require two configuration values:
              the <strong>Gateway Endpoint URL</strong> (shared across your organization) and your <strong>Personal API Key</strong> (Bearer token for gateway authorization and audit attribution).
            </p>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              backgroundColor: 'var(--bg-canvas)',
              padding: '6px 12px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-subtle)'
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                Gateway Streamable HTTP Endpoint
              </span>
              <code style={{ fontSize: '12px', color: 'var(--color-primary)', fontFamily: 'var(--font-mono)' }}>
                {gatewayUrl}
              </code>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={handleCopyGatewayUrl}
              leftIcon={copiedUrl ? <Check size={12} /> : <Copy size={12} />}
              style={{ marginLeft: '6px' }}
              aria-label="Copy Gateway URL"
            >
              {copiedUrl ? 'Copied' : 'Copy'}
            </Button>
          </div>
        </div>
      </Card>

      {/* Loading Skeleton */}
      {loading && (
        <Card variant="flat" style={{ padding: '24px', marginBottom: '24px' }}>
          <Skeleton width="100%" height="28px" style={{ marginBottom: '16px' }} />
          {[1, 2, 3].map(i => (
            <div key={i} style={{ display: 'flex', gap: '16px', marginBottom: '12px' }}>
              <Skeleton width="30%" height="32px" />
              <Skeleton width="20%" height="32px" />
              <Skeleton width="20%" height="32px" />
              <Skeleton width="30%" height="32px" />
            </div>
          ))}
        </Card>
      )}

      {/* 2. SINGLE-DISPLAY RAW KEY BANNER / MODAL */}
      {generatedKey && (
        <Card
          variant="flat"
          role="dialog"
          aria-labelledby="new-key-title"
          style={{
            padding: '20px 24px',
            marginBottom: '28px',
            background: 'rgba(245, 158, 11, 0.08)',
            borderColor: 'rgba(245, 158, 11, 0.4)',
            boxShadow: 'var(--shadow-md)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
              <AlertTriangle size={20} style={{ color: '#fcd34d', flexShrink: 0, marginTop: '2px' }} />
              <div>
                <h3 id="new-key-title" style={{ fontSize: '15px', fontWeight: 700, color: '#fcd34d', margin: 0 }}>
                  New Gateway API Key Generated
                </h3>
                <p style={{ fontSize: '13px', color: '#fde68a', marginTop: '4px', marginBottom: 0 }}>
                  This is the <strong>only time</strong> this raw secret key will ever be displayed. It is hashed with HMAC-SHA256 in the database and cannot be recovered if lost. Store it in a secure password manager or client config file immediately.
                </p>
              </div>
            </div>

            <button
              onClick={() => setGeneratedKey(null)}
              aria-label="Dismiss key display"
              style={{
                background: 'transparent',
                border: 'none',
                color: '#fcd34d',
                cursor: 'pointer',
                padding: '4px',
                display: 'flex',
                alignItems: 'center'
              }}
            >
              <X size={18} />
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '16px', flexWrap: 'wrap' }}>
            <code
              style={{
                flex: 1,
                minWidth: '280px',
                padding: '10px 14px',
                borderRadius: 'var(--radius-sm)',
                background: 'rgba(0, 0, 0, 0.6)',
                border: '1px solid rgba(245, 158, 11, 0.3)',
                color: '#38bdf8',
                fontFamily: 'var(--font-mono)',
                fontSize: '13px',
                wordBreak: 'break-all'
              }}
            >
              {generatedKey}
            </code>

            <Button
              variant="primary"
              onClick={handleCopyKey}
              leftIcon={copiedKey ? <Check size={14} /> : <Copy size={14} />}
            >
              {copiedKey ? 'Copied to Clipboard!' : 'Copy Secret Key'}
            </Button>

            <Button
              variant="outline"
              onClick={() => setGeneratedKey(null)}
              style={{ borderColor: 'rgba(245, 158, 11, 0.3)', color: '#fde68a' }}
            >
              I have stored this safely
            </Button>
          </div>
        </Card>
      )}

      {/* 3. SECTION 1: Team Members (Admin Full Control vs Member Notice) */}
      {isAdmin ? (
        <div style={{ marginBottom: '44px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
            <SectionHeader
              title={`Team Members (${members.length})`}
              description="Organization members with cluster access, role assignments, and key attribution."
            />

            {/* Member search */}
            <div style={{ width: '240px' }}>
              <SearchInput
                value={memberSearch}
                onChange={setMemberSearch}
                placeholder="Filter members..."
                width="100%"
              />
            </div>
          </div>

          <Card variant="flat" style={{ padding: 0, overflow: 'hidden' }}>
            {members.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center' }}>
                <EmptyState
                  icon={<UserPlus size={24} />}
                  title="No Team Members"
                  description="Invite organization team members to collaborate on MCP servers."
                  actionLabel="Invite Member"
                  onAction={() => setShowAddMemberModal(true)}
                />
              </div>
            ) : filteredMembers.length === 0 ? (
              <div style={{ padding: '36px', textAlign: 'center', color: 'var(--text-muted)' }}>
                <Filter size={20} style={{ marginBottom: '8px' }} />
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>No matching members</div>
                <div style={{ fontSize: '12px' }}>No members match your filter "{memberSearch}".</div>
              </div>
            ) : (
              <div className="console-table-container">
                <table className="console-table" style={{ width: '100%' }}>
                  <thead>
                    <tr>
                      <th style={{ width: '32%' }}>Member</th>
                      <th style={{ width: '16%' }}>Role</th>
                      <th className="col-priority-medium" style={{ width: '16%' }}>Account Status</th>
                      <th className="col-priority-low" style={{ width: '12%' }}>Active Keys</th>
                      <th className="col-priority-low" style={{ width: '12%' }}>Joined Date</th>
                      <th style={{ width: '12%', textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMembers.map(member => {
                    const memberKeyCount = keys.filter(k => k.userId === member.id && !k.revokedAt).length;

                    return (
                      <tr
                        key={member.id}
                        style={{
                          opacity: member.status === 'disabled' ? 0.65 : 1,
                          transition: 'opacity 0.18s ease, background-color 0.18s ease'
                        }}
                      >
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div
                              style={{
                                width: '28px',
                                height: '28px',
                                borderRadius: '50%',
                                backgroundColor: 'var(--bg-surface-hover)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: 'var(--text-secondary)',
                                fontSize: '11px',
                                fontWeight: 600
                              }}
                            >
                              {member.name ? member.name.charAt(0).toUpperCase() : <UserIcon size={14} />}
                            </div>
                            <div>
                              <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '13px' }}>
                                {member.name} {member.id === user?.id && <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>(You)</span>}
                              </div>
                              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{member.email}</div>
                              <div className="table-responsive-card-toggle" style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
                                {memberKeyCount} {memberKeyCount === 1 ? 'key' : 'keys'} • {member.status}
                              </div>
                            </div>
                          </div>
                        </td>

                        <td>
                          <Badge variant={member.role === 'admin' ? 'danger' : 'info'}>
                            {member.role.toUpperCase()}
                          </Badge>
                        </td>

                        <td className="col-priority-medium">
                          <StatusBadge status={member.status === 'active' ? 'active' : 'disabled'} />
                        </td>

                        <td className="col-priority-low">
                          <span style={{ fontSize: '12px', color: memberKeyCount > 0 ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                            {memberKeyCount} {memberKeyCount === 1 ? 'key' : 'keys'}
                          </span>
                        </td>

                        <td className="col-priority-low" style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
                          {new Date(member.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                        </td>

                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
                            {/* Inspect Access */}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setInspectingMember(member)}
                              title="Inspect effective permissions and assigned keys"
                              aria-label={`Inspect permissions for ${member.name}`}
                            >
                              <Eye size={12} />
                            </Button>

                            {/* Role Change (admin only, cannot change own role) */}
                            {member.id !== user?.id && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() =>
                                  setRoleChangeTarget({
                                    member,
                                    nextRole: member.role === 'admin' ? 'member' : 'admin'
                                  })
                                }
                                title={`Change role to ${member.role === 'admin' ? 'Member' : 'Admin'}`}
                                aria-label={`Change role for ${member.name}`}
                              >
                                <ArrowRightLeft size={12} />
                              </Button>
                            )}

                            {/* Disable / Enable Toggle */}
                            {member.id !== user?.id && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setStatusConfirmMember(member)}
                                title={member.status === 'active' ? 'Suspend account access' : 'Restore account access'}
                                aria-label={`${member.status === 'active' ? 'Disable' : 'Enable'} ${member.name}`}
                              >
                                {member.status === 'active' ? <UserX size={12} /> : <UserCheck size={12} />}
                              </Button>
                            )}

                            {/* Revoke & Delete */}
                            {member.id !== user?.id && (
                              <Button
                                size="sm"
                                variant="danger"
                                onClick={() => setDeleteConfirmMember(member)}
                                title="Permanently delete user and revoke all their keys"
                                aria-label={`Delete ${member.name}`}
                              >
                                <Trash2 size={12} />
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
          )}
        </Card>
        </div>
      ) : (
        /* Member notice explaining admin-only team controls */
        <Card
          variant="flat"
          style={{
            padding: '14px 18px',
            marginBottom: '32px',
            backgroundColor: 'var(--bg-canvas)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Shield size={14} style={{ color: 'var(--color-primary)' }} />
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              <strong>Member Account Notice:</strong> Team member provisioning and organizational role changes are restricted to Administrators. Below are your personal API keys for MCP client access.
            </span>
          </div>
        </Card>
      )}

      {/* 4. SECTION 2: API Keys Table */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
          <SectionHeader
            title={isAdmin ? `Team API Keys (${keys.length})` : `Your Personal API Keys (${keys.length})`}
            description="Cryptographically secure Bearer tokens used by Cursor, Claude Code, and MCP clients."
          />

          {keys.length > 0 && (
            <div style={{ width: '240px' }}>
              <SearchInput
                value={keySearch}
                onChange={setKeySearch}
                placeholder="Filter keys..."
                width="100%"
              />
            </div>
          )}
        </div>

        <Card variant="flat" style={{ padding: 0, overflow: 'hidden' }}>
          {keys.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center' }}>
              <EmptyState
                icon={<KeyRound size={24} />}
                title="No API Keys Generated Yet"
                description="Generate a high-entropy key to connect Claude Code, Cursor, or external MCP clients to the gateway."
                actionLabel="Generate First Key"
                onAction={() => setShowGenerateKeyModal(true)}
              />
            </div>
          ) : filteredKeys.length === 0 ? (
            <div style={{ padding: '36px', textAlign: 'center', color: 'var(--text-muted)' }}>
              <Filter size={20} style={{ marginBottom: '8px' }} />
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>No matching API keys</div>
              <div style={{ fontSize: '12px' }}>No keys match your filter "{keySearch}".</div>
            </div>
          ) : (
            <div className="console-table-container">
              <table className="console-table" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ width: '28%' }}>Key Label</th>
                    <th style={{ width: '24%' }}>Prefix Identifier</th>
                    {isAdmin && <th className="col-priority-medium" style={{ width: '18%' }}>Assigned Member</th>}
                    <th className="col-priority-low" style={{ width: '12%' }}>Last Used</th>
                    <th className="col-priority-low" style={{ width: '12%' }}>Created</th>
                    <th style={{ width: '10%' }}>Status</th>
                    <th style={{ width: '10%', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredKeys.map(key => {
                    const isRevoked = key.revokedAt !== null;
                    return (
                      <tr
                        key={key.id}
                        style={{
                          opacity: isRevoked ? 0.5 : 1,
                          backgroundColor: isRevoked ? 'rgba(0,0,0,0.1)' : undefined,
                          transition: 'opacity 0.18s ease, background-color 0.18s ease'
                        }}
                      >
                        <td>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '13px' }}>
                            {key.name}
                          </div>
                          {isAdmin && (
                            <div className="table-responsive-card-toggle" style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
                              {key.userEmail || key.userName || key.userId}
                            </div>
                          )}
                        </td>

                        <td>
                          <code
                            style={{
                              fontFamily: 'var(--font-mono)',
                              fontSize: '11px',
                              color: isRevoked ? 'var(--text-muted)' : 'var(--color-primary)',
                              background: 'var(--bg-canvas)',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              border: '1px solid var(--border-subtle)'
                            }}
                          >
                            {key.keyPrefix}••••••••
                          </code>
                        </td>

                        {isAdmin && (
                          <td className="col-priority-medium" style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
                            {key.userEmail || key.userName || key.userId}
                          </td>
                        )}

                        <td className="col-priority-low" style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
                          {key.lastUsedAt
                            ? new Date(key.lastUsedAt).toLocaleString(undefined, {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })
                            : 'Never'}
                        </td>

                        <td className="col-priority-low" style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
                          {new Date(key.createdAt).toLocaleDateString(undefined, {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric'
                          })}
                        </td>

                        <td>
                          <StatusBadge status={isRevoked ? 'revoked' : 'active'} />
                        </td>

                        <td style={{ textAlign: 'right' }}>
                          {!isRevoked ? (
                            <Button
                              size="sm"
                              variant="danger"
                              onClick={() => setRevokeConfirmKey(key)}
                              title="Immediately revoke this key"
                              aria-label={`Revoke key ${key.name}`}
                            >
                              Revoke
                            </Button>
                          ) : (
                            <span style={{ fontSize: '11px', color: 'var(--color-danger)', fontStyle: 'italic' }}>
                              Revoked
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* 5. MODAL: Inspect Member Access Profile */}
      <Modal
        isOpen={Boolean(inspectingMember)}
        onClose={() => setInspectingMember(null)}
        title={`Access Profile: ${inspectingMember?.name || ''}`}
        description="Account permissions, role enforcement, and active key assignments."
        footer={
          <Button variant="outline" onClick={() => setInspectingMember(null)}>
            Close
          </Button>
        }
      >
        {inspectingMember && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', fontSize: '13px' }}>
            <Card variant="flat" style={{ padding: '14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>Account Status:</span>
                <div style={{ marginTop: '2px' }}>
                  <StatusBadge status={inspectingMember.status} />
                </div>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>Enforced Role:</span>
                <div style={{ marginTop: '2px' }}>
                  <Badge variant={inspectingMember.role === 'admin' ? 'danger' : 'info'}>
                    {inspectingMember.role.toUpperCase()}
                  </Badge>
                </div>
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>Email Address:</span>
                <div style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{inspectingMember.email}</div>
              </div>
            </Card>

            <div>
              <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px', fontSize: '12px' }}>
                Operational Permissions Matrix
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', background: 'var(--bg-canvas)', borderRadius: '4px' }}>
                  <span>MCP Tool Executions</span>
                  <span style={{ fontWeight: 600, color: inspectingMember.role === 'admin' ? 'var(--color-success)' : 'var(--color-primary)' }}>
                    {inspectingMember.role === 'admin' ? 'Full (Mutations & Queries)' : 'Queries Only (Read-Only Tools)'}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', background: 'var(--bg-canvas)', borderRadius: '4px' }}>
                  <span>Upstream Server Management</span>
                  <span style={{ fontWeight: 600, color: inspectingMember.role === 'admin' ? 'var(--color-success)' : 'var(--text-muted)' }}>
                    {inspectingMember.role === 'admin' ? 'Authorized (Register/Rotate/Delete)' : 'Restricted (403)'}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', background: 'var(--bg-canvas)', borderRadius: '4px' }}>
                  <span>Security Audit Logs</span>
                  <span style={{ fontWeight: 600, color: inspectingMember.role === 'admin' ? 'var(--color-success)' : 'var(--text-muted)' }}>
                    {inspectingMember.role === 'admin' ? 'Authorized (Full Query Access)' : 'Restricted (403)'}
                  </span>
                </div>
              </div>
            </div>

            <div>
              <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px', fontSize: '12px' }}>
                Active API Keys Assigned to this Member ({keys.filter(k => k.userId === inspectingMember.id && !k.revokedAt).length})
              </div>
              {keys.filter(k => k.userId === inspectingMember.id && !k.revokedAt).length === 0 ? (
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                  No active API keys currently assigned to this user.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {keys
                    .filter(k => k.userId === inspectingMember.id && !k.revokedAt)
                    .map(k => (
                      <div
                        key={k.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '6px 10px',
                          background: 'var(--bg-canvas)',
                          borderRadius: '4px',
                          fontSize: '11px'
                        }}
                      >
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{k.name}</span>
                        <code style={{ color: 'var(--color-primary)' }}>{k.keyPrefix}••••••••</code>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* 6. MODAL: Invite / Add Member */}
      <Modal
        isOpen={showAddMemberModal}
        onClose={() => setShowAddMemberModal(false)}
        title="Invite Team Member"
        description="Provision an account with role-based access to MCP tools and gateway features."
        footer={
          <>
            <Button variant="outline" onClick={() => setShowAddMemberModal(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleCreateMember}
              isLoading={memberFormSubmitting}
            >
              Provision Member
            </Button>
          </>
        }
      >
        {memberGlobalError && (
          <Alert variant="danger" title="Account Creation Failed" style={{ marginBottom: '16px' }}>
            {memberGlobalError}
          </Alert>
        )}

        <form onSubmit={handleCreateMember} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <Input
              label="Full Name"
              required
              value={newMemberName}
              onChange={e => setNewMemberName(e.target.value)}
              placeholder="e.g. Charlie Engineer"
              error={memberFormErrors.name}
            />
          </div>

          <div>
            <Input
              label="Email Address"
              type="email"
              required
              value={newMemberEmail}
              onChange={e => setNewMemberEmail(e.target.value)}
              placeholder="charlie@company.local"
              error={memberFormErrors.email}
            />
          </div>

          <Select
            label="Assigned Role"
            value={newMemberRole}
            onChange={e => setNewMemberRole(e.target.value as any)}
            options={[
              { value: 'member', label: 'Member (Read-Only Tools & Personal Keys)' },
              { value: 'admin', label: 'Admin (Full Upstream Management, User Management & Audit Logs)' }
            ]}
          />

          <div>
            <Input
              label="Initial Password"
              type="password"
              required
              minLength={8}
              value={newMemberPassword}
              onChange={e => setNewMemberPassword(e.target.value)}
              placeholder="Minimum 8 characters"
              helperText="At least 8 characters. The user can change their password after first login."
              error={memberFormErrors.password}
            />
          </div>
        </form>
      </Modal>

      {/* 7. MODAL: Generate API Key */}
      <Modal
        isOpen={showGenerateKeyModal}
        onClose={() => setShowGenerateKeyModal(false)}
        title="Generate Gateway API Key"
        description="Issue a high-entropy Bearer token for client authentication (Claude Code, Cursor, Cline)."
        footer={
          <>
            <Button variant="outline" onClick={() => setShowGenerateKeyModal(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleGenerateKey}
              isLoading={keyFormSubmitting}
            >
              Issue API Key
            </Button>
          </>
        }
      >
        {keyGlobalError && (
          <Alert variant="danger" title="Key Generation Failed" style={{ marginBottom: '16px' }}>
            {keyGlobalError}
          </Alert>
        )}

        <form onSubmit={handleGenerateKey} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <Input
              label="Key Descriptive Label"
              required
              value={newKeyName}
              onChange={e => setNewKeyName(e.target.value)}
              placeholder="e.g. Claude Code Terminal Key"
              helperText="Descriptive label to identify where this key is used (e.g. laptop, staging server)."
              error={keyFormErrors.name}
            />
          </div>

          {isAdmin && members.length > 0 && (
            <Select
              label="Issue Key For User"
              value={targetUserId}
              onChange={e => setTargetUserId(e.target.value)}
              options={[
                { value: '', label: `Myself (${user?.name})` },
                ...members
                  .filter(m => m.id !== user?.id && m.status === 'active')
                  .map(m => ({ value: m.id, label: `${m.name} (${m.email})` }))
              ]}
            />
          )}

          <div
            style={{
              padding: '10px 12px',
              backgroundColor: 'var(--bg-canvas)',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-subtle)',
              fontSize: '11px',
              color: 'var(--text-muted)'
            }}
          >
            <strong>Security Notice:</strong> The raw token will only be presented once upon creation. It is cryptographically hashed with HMAC-SHA256 in the database.
          </div>
        </form>
      </Modal>

      {/* 8. CONFIRM: Role Change */}
      <ConfirmDialog
        isOpen={Boolean(roleChangeTarget)}
        title={`Change Role for "${roleChangeTarget?.member.name || ''}" to ${roleChangeTarget?.nextRole.toUpperCase()}?`}
        description={
          roleChangeTarget?.nextRole === 'admin'
            ? 'Promoting this user to Administrator will grant them full access to register/delete upstream MCP servers, manage team accounts, and view cluster security audit logs.'
            : 'Demoting this user to Member will restrict their access to query-only tools and personal API key management. They will lose access to team management and audit logs.'
        }
        confirmLabel={`Change Role to ${roleChangeTarget?.nextRole.toUpperCase()}`}
        variant="primary"
        isLoading={actionInProgress}
        onConfirm={handleConfirmRoleChange}
        onCancel={() => setRoleChangeTarget(null)}
      />

      {/* 9. CONFIRM: Member Status Toggle */}
      <ConfirmDialog
        isOpen={Boolean(statusConfirmMember)}
        title={`${statusConfirmMember?.status === 'active' ? 'Disable' : 'Enable'} Account for "${statusConfirmMember?.name || ''}"?`}
        description={
          statusConfirmMember?.status === 'active'
            ? 'Disabling this account immediately prevents the user from logging in or using any of their active API keys. Their keys remain on record and can be re-enabled later.'
            : 'Enabling this account restores portal login access and reactivates their non-revoked API keys.'
        }
        confirmLabel={statusConfirmMember?.status === 'active' ? 'Disable Access' : 'Restore Access'}
        variant={statusConfirmMember?.status === 'active' ? 'warning' : 'primary'}
        isLoading={actionInProgress}
        onConfirm={handleToggleMemberStatus}
        onCancel={() => setStatusConfirmMember(null)}
      />

      {/* 10. CONFIRM: Member Delete */}
      <ConfirmDialog
        isOpen={Boolean(deleteConfirmMember)}
        title={`Permanently Delete Member "${deleteConfirmMember?.name || ''}"?`}
        description="This action cannot be undone. The member account will be permanently deleted and all API keys owned by this member will be permanently revoked."
        confirmLabel="Permanently Delete Account"
        variant="danger"
        isLoading={actionInProgress}
        onConfirm={handleDeleteMember}
        onCancel={() => setDeleteConfirmMember(null)}
      />

      {/* 11. CONFIRM: Revoke API Key */}
      <ConfirmDialog
        isOpen={Boolean(revokeConfirmKey)}
        title={`Revoke API Key "${revokeConfirmKey?.name || ''}"?`}
        description="Revocation takes effect immediately and cannot be undone. Any Claude Code, Cursor, or MCP clients using this key will immediately be rejected with 401 Unauthorized."
        confirmLabel="Revoke Key Immediately"
        variant="danger"
        isLoading={actionInProgress}
        onConfirm={handleRevokeKey}
        onCancel={() => setRevokeConfirmKey(null)}
      />
    </div>
  );
};
