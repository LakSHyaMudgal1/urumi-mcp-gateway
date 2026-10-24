import React, { useState, useEffect } from 'react';
import { User, APIKeySummary } from '../types/index.js';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.js';
import {
  PageHeader,
  SectionHeader,
  Button,
  Badge,
  StatusBadge,
  Input,
  Select,
  Modal,
  ConfirmDialog,
  EmptyState,
  Skeleton,
  Alert,
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
  Trash2
} from 'lucide-react';

export const TeamManagementView: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const toast = useToast();

  const [members, setMembers] = useState<User[]>([]);
  const [keys, setKeys] = useState<APIKeySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Invite/Add Member Modal
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberRole, setNewMemberRole] = useState<'member' | 'admin'>('member');
  const [newMemberPassword, setNewMemberPassword] = useState('');
  const [memberFormSubmitting, setMemberFormSubmitting] = useState(false);
  const [memberFormError, setMemberFormError] = useState<string | null>(null);

  // Generate Key Modal
  const [showGenerateKeyModal, setShowGenerateKeyModal] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [targetUserId, setTargetUserId] = useState('');
  const [keyFormSubmitting, setKeyFormSubmitting] = useState(false);
  const [keyFormError, setKeyFormError] = useState<string | null>(null);

  // Single-Display Generated Key Banner
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Confirm Dialogs
  const [statusConfirmMember, setStatusConfirmMember] = useState<User | null>(null);
  const [deleteConfirmMember, setDeleteConfirmMember] = useState<User | null>(null);
  const [revokeConfirmKey, setRevokeConfirmKey] = useState<APIKeySummary | null>(null);
  const [actionInProgress, setActionInProgress] = useState(false);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      if (isAdmin) {
        const [usersData, keysData] = await Promise.all([
          api.getUsers(),
          api.getKeys()
        ]);
        setMembers(usersData);
        setKeys(keysData);
      } else {
        const keysData = await api.getKeys();
        setKeys(keysData);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load team data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [isAdmin]);

  const handleCreateMember = async (e: React.FormEvent) => {
    e.preventDefault();
    setMemberFormSubmitting(true);
    setMemberFormError(null);
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
      await fetchData();
    } catch (err: any) {
      setMemberFormError(err.message || 'Failed to create member');
    } finally {
      setMemberFormSubmitting(false);
    }
  };

  const handleToggleMemberStatus = async () => {
    if (!statusConfirmMember) return;
    const nextStatus = statusConfirmMember.status === 'active' ? 'disabled' : 'active';
    try {
      setActionInProgress(true);
      await api.updateUser(statusConfirmMember.id, { status: nextStatus });
      toast.success(`Access ${nextStatus === 'active' ? 'restored' : 'disabled'} for ${statusConfirmMember.name}`);
      setStatusConfirmMember(null);
      await fetchData();
    } catch (err: any) {
      setError(err.message || 'Failed to update member status');
      toast.error(err.message || 'Failed to update member status');
    } finally {
      setActionInProgress(false);
    }
  };

  const handleDeleteMember = async () => {
    if (!deleteConfirmMember) return;
    try {
      setActionInProgress(true);
      await api.deleteUser(deleteConfirmMember.id);
      toast.success(`Account and access revoked for ${deleteConfirmMember.name}`);
      setDeleteConfirmMember(null);
      await fetchData();
    } catch (err: any) {
      setError(err.message || 'Failed to delete member');
      toast.error(err.message || 'Failed to delete member');
    } finally {
      setActionInProgress(false);
    }
  };

  const handleGenerateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    setKeyFormSubmitting(true);
    setKeyFormError(null);

    try {
      const res = await api.createKey(newKeyName.trim(), isAdmin && targetUserId ? targetUserId : undefined);
      setShowGenerateKeyModal(false);
      setNewKeyName('');
      setTargetUserId('');
      setGeneratedKey(res.rawKey || null);
      setCopied(false);
      toast.success('Gateway API key issued successfully');
      await fetchData();
    } catch (err: any) {
      setKeyFormError(err.message || 'Failed to issue API key');
    } finally {
      setKeyFormSubmitting(false);
    }
  };

  const handleRevokeKey = async () => {
    if (!revokeConfirmKey) return;
    try {
      setActionInProgress(true);
      await api.revokeKey(revokeConfirmKey.id);
      toast.success(`API key "${revokeConfirmKey.name}" revoked`);
      setRevokeConfirmKey(null);
      await fetchData();
    } catch (err: any) {
      setError(err.message || 'Failed to revoke API key');
      toast.error(err.message || 'Failed to revoke API key');
    } finally {
      setActionInProgress(false);
    }
  };

  const handleCopyKey = () => {
    if (!generatedKey) return;
    navigator.clipboard.writeText(generatedKey);
    setCopied(true);
    toast.success('API key copied to clipboard');
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '0 24px 48px' }}>
      {/* Page Header */}
      <PageHeader
        title="Team Access & Gateway API Keys"
        description="Issue cryptographically secure keys for Claude Code, Cursor, and team MCP clients."
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
                  setMemberFormError(null);
                  setShowAddMemberModal(true);
                }}
                leftIcon={<UserPlus size={14} />}
              >
                Invite Team Member
              </Button>
            )}

            <Button
              variant="primary"
              onClick={() => {
                setNewKeyName('');
                setTargetUserId('');
                setKeyFormError(null);
                setShowGenerateKeyModal(true);
              }}
              leftIcon={<Key size={14} />}
            >
              Generate API Key
            </Button>
          </div>
        }
      />

      {/* Global Error Banner */}
      {error && (
        <Alert
          variant="danger"
          title="Team Configuration Notice"
          onDismiss={() => setError(null)}
          style={{ marginBottom: '20px' }}
        >
          {error}
        </Alert>
      )}

      {/* Loading Skeleton */}
      {loading && (
        <div style={{ marginBottom: '24px' }}>
          <Skeleton width="100%" height="160px" borderRadius="var(--radius-md)" />
        </div>
      )}

      {/* SINGLE-DISPLAY RAW KEY MODAL / BANNER */}
      {generatedKey && (
        <div
          role="dialog"
          aria-labelledby="new-key-title"
          className="console-card"
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
                  Gateway API Key Generated Successfully
                </h3>
                <p style={{ fontSize: '13px', color: '#fde68a', marginTop: '4px', marginBottom: 0 }}>
                  This is the <strong>only time</strong> this raw key will ever be displayed. It is hashed with HMAC-SHA256 in the database and cannot be recovered if lost.
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
              leftIcon={copied ? <Check size={14} /> : <Copy size={14} />}
              style={{
                background: copied ? 'var(--accent-success)' : 'var(--accent-primary)',
                borderColor: copied ? 'var(--accent-success)' : 'var(--accent-primary)'
              }}
            >
              {copied ? 'Copied to Clipboard!' : 'Copy Key'}
            </Button>
          </div>
        </div>
      )}

      {/* SECTION 1: Team Members (Admin Only) */}
      {isAdmin && (
        <div style={{ marginBottom: '40px' }}>
          <SectionHeader
            title={`Team Members (${members.length})`}
            description="Users with cluster access and role-based operational permissions."
          />

          <div className="console-card" style={{ overflowX: 'auto', padding: 0 }}>
            <table className="console-table">
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Role</th>
                  <th>Account Status</th>
                  <th>Registered</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {members.map(member => (
                  <tr key={member.id}>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{member.name}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{member.email}</div>
                    </td>
                    <td>
                      <Badge variant={member.role === 'admin' ? 'danger' : 'info'}>
                        {member.role.toUpperCase()}
                      </Badge>
                    </td>
                    <td>
                      <StatusBadge status={member.status === 'active' ? 'active' : 'disabled'} />
                    </td>
                    <td style={{ color: 'var(--text-secondary)' }}>
                      {new Date(member.createdAt).toLocaleDateString()}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {member.id !== user?.id && (
                        <div style={{ display: 'inline-flex', gap: '8px' }}>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setStatusConfirmMember(member)}
                            leftIcon={member.status === 'active' ? <UserX size={13} /> : <UserCheck size={13} />}
                          >
                            {member.status === 'active' ? 'Disable' : 'Enable'}
                          </Button>
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() => setDeleteConfirmMember(member)}
                            leftIcon={<Trash2 size={13} />}
                          >
                            Revoke Access
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SECTION 2: API Keys */}
      <div>
        <SectionHeader
          title={isAdmin ? `Active Team API Keys (${keys.length})` : `Your Gateway API Keys (${keys.length})`}
          description="High-entropy Bearer tokens for MCP client connection."
        />

        <div className="console-card" style={{ overflowX: 'auto', padding: 0 }}>
          {keys.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center' }}>
              <EmptyState
                icon={<KeyRound size={24} />}
                title="No API Keys Generated Yet"
                description="Click '+ Generate API Key' to issue a cryptographic token for your Claude Code or Cursor client."
                actionLabel="Generate First Key"
                onAction={() => setShowGenerateKeyModal(true)}
              />
            </div>
          ) : (
            <table className="console-table">
              <thead>
                <tr>
                  <th>Key Name</th>
                  <th>Prefix Identifier</th>
                  {isAdmin && <th>Assigned User</th>}
                  <th>Last Used</th>
                  <th>Created</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {keys.map(key => {
                  const isRevoked = key.revokedAt !== null;
                  return (
                    <tr key={key.id} style={{ opacity: isRevoked ? 0.5 : 1 }}>
                      <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                        {key.name}
                      </td>
                      <td>
                        <Badge variant="accent">
                          {key.keyPrefix}...
                        </Badge>
                      </td>
                      {isAdmin && (
                        <td style={{ color: 'var(--text-secondary)' }}>
                          {key.userEmail || key.userId}
                        </td>
                      )}
                      <td style={{ color: 'var(--text-secondary)' }}>
                        {key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleString() : 'Never'}
                      </td>
                      <td style={{ color: 'var(--text-secondary)' }}>
                        {new Date(key.createdAt).toLocaleDateString()}
                      </td>
                      <td>
                        <StatusBadge status={isRevoked ? 'revoked' : 'active'} />
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {!isRevoked && (
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() => setRevokeConfirmKey(key)}
                            leftIcon={<KeyRound size={12} />}
                          >
                            Revoke
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Modal: Invite / Add Member */}
      <Modal
        isOpen={showAddMemberModal}
        onClose={() => setShowAddMemberModal(false)}
        title="Add Team Member"
        description="Create an account with role-based access to MCP tools and gateway features."
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
              Create Member
            </Button>
          </>
        }
      >
        {memberFormError && (
          <Alert variant="danger" title="Account Creation Failed" style={{ marginBottom: '16px' }}>
            {memberFormError}
          </Alert>
        )}

        <form onSubmit={handleCreateMember} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <Input
            label="Full Name"
            required
            value={newMemberName}
            onChange={e => setNewMemberName(e.target.value)}
            placeholder="e.g. Charlie Engineer"
          />

          <Input
            label="Email Address"
            type="email"
            required
            value={newMemberEmail}
            onChange={e => setNewMemberEmail(e.target.value)}
            placeholder="charlie@company.local"
          />

          <Select
            label="Assigned Role"
            value={newMemberRole}
            onChange={e => setNewMemberRole(e.target.value as any)}
            options={[
              { value: 'member', label: 'Member (Tools & Chat Access)' },
              { value: 'admin', label: 'Admin (Full Fleet & Team Control)' }
            ]}
          />

          <Input
            label="Initial Password"
            type="password"
            required
            minLength={8}
            value={newMemberPassword}
            onChange={e => setNewMemberPassword(e.target.value)}
            placeholder="Minimum 8 characters"
            helperText="At least 8 characters with lowercase, uppercase, and numbers"
          />
        </form>
      </Modal>

      {/* Modal: Generate API Key */}
      <Modal
        isOpen={showGenerateKeyModal}
        onClose={() => setShowGenerateKeyModal(false)}
        title="Generate Gateway API Key"
        description="Issue a high-entropy Bearer token for MCP clients (Claude Code, Cursor)."
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
        {keyFormError && (
          <Alert variant="danger" title="Key Generation Failed" style={{ marginBottom: '16px' }}>
            {keyFormError}
          </Alert>
        )}

        <form onSubmit={handleGenerateKey} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <Input
            label="Key Descriptive Label"
            required
            value={newKeyName}
            onChange={e => setNewKeyName(e.target.value)}
            placeholder="e.g. Claude Code Terminal Key"
            helperText="Identifier to recognize this client integration"
          />

          {isAdmin && members.length > 0 && (
            <Select
              label="Issue For User"
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
        </form>
      </Modal>

      {/* Confirm Member Status Toggle */}
      <ConfirmDialog
        isOpen={Boolean(statusConfirmMember)}
        title={`${statusConfirmMember?.status === 'active' ? 'Disable' : 'Enable'} Account for "${statusConfirmMember?.name || ''}"?`}
        description={statusConfirmMember?.status === 'active'
          ? "This will temporarily prevent the user from logging in or using their API keys to invoke gateway tools."
          : "This will restore full portal and tool invocation privileges for this user."}
        confirmLabel={statusConfirmMember?.status === 'active' ? "Disable Access" : "Enable Access"}
        variant={statusConfirmMember?.status === 'active' ? "warning" : "primary"}
        isLoading={actionInProgress}
        onConfirm={handleToggleMemberStatus}
        onCancel={() => setStatusConfirmMember(null)}
      />

      {/* Confirm Member Delete */}
      <ConfirmDialog
        isOpen={Boolean(deleteConfirmMember)}
        title={`Permanently Delete Account "${deleteConfirmMember?.name || ''}"?`}
        description="This will permanently revoke all gateway access and delete their account. Any active API keys owned by this member will be permanently revoked."
        confirmLabel="Revoke & Delete"
        variant="danger"
        isLoading={actionInProgress}
        onConfirm={handleDeleteMember}
        onCancel={() => setDeleteConfirmMember(null)}
      />

      {/* Confirm Revoke Key */}
      <ConfirmDialog
        isOpen={Boolean(revokeConfirmKey)}
        title={`Revoke Gateway Key "${revokeConfirmKey?.name || ''}"?`}
        description="This takes effect immediately. Any Claude Code, Cursor, or MCP clients currently configured with this key will fail authentication."
        confirmLabel="Revoke Key"
        variant="danger"
        isLoading={actionInProgress}
        onConfirm={handleRevokeKey}
        onCancel={() => setRevokeConfirmKey(null)}
      />
    </div>
  );
};
