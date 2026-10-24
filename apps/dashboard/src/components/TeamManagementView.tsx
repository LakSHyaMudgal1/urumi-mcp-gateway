import React, { useState, useEffect } from 'react';
import { User, APIKeySummary } from '../types/index.js';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.js';

export const TeamManagementView: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

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

  // Single-Display Generated Key Banner/Modal
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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
      setNewMemberName('');
      setNewMemberEmail('');
      setNewMemberPassword('');
      await fetchData();
    } catch (err: any) {
      setMemberFormError(err.message || 'Failed to create member');
    } finally {
      setMemberFormSubmitting(false);
    }
  };

  const handleToggleMemberStatus = async (member: User) => {
    const nextStatus = member.status === 'active' ? 'disabled' : 'active';
    const actionLabel = nextStatus === 'disabled' ? 'disable' : 'enable';

    if (!window.confirm(`Are you sure you want to ${actionLabel} access for ${member.name}?`)) {
      return;
    }

    try {
      await api.updateUser(member.id, { status: nextStatus });
      await fetchData();
    } catch (err: any) {
      setError(err.message || 'Failed to update member status');
    }
  };

  const handleDeleteMember = async (member: User) => {
    if (!window.confirm(`Are you sure you want to permanently revoke access and delete account for ${member.name}?`)) {
      return;
    }

    try {
      await api.deleteUser(member.id);
      await fetchData();
    } catch (err: any) {
      setError(err.message || 'Failed to delete member');
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
      await fetchData();
    } catch (err: any) {
      setKeyFormError(err.message || 'Failed to issue API key');
    } finally {
      setKeyFormSubmitting(false);
    }
  };

  const handleRevokeKey = async (key: APIKeySummary) => {
    if (!window.confirm(`Are you sure you want to revoke API key "${key.name}"? This action takes effect immediately.`)) {
      return;
    }

    try {
      await api.revokeKey(key.id);
      await fetchData();
    } catch (err: any) {
      setError(err.message || 'Failed to revoke API key');
    }
  };

  const handleCopyKey = () => {
    if (!generatedKey) return;
    navigator.clipboard.writeText(generatedKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '0 24px 48px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)' }}>
            Team Access & Gateway API Keys
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Issue cryptographically secure keys for Claude Code, Cursor, and team MCP clients.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          {isAdmin && (
            <button
              onClick={() => {
                setNewMemberName('');
                setNewMemberEmail('');
                setNewMemberRole('member');
                setNewMemberPassword('');
                setMemberFormError(null);
                setShowAddMemberModal(true);
              }}
              style={{
                padding: '8px 16px',
                fontSize: '13px',
                fontWeight: 600,
                borderRadius: '8px',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-primary)',
                cursor: 'pointer'
              }}
            >
              + Invite Team Member
            </button>
          )}

          <button
            onClick={() => {
              setNewKeyName('');
              setTargetUserId('');
              setKeyFormError(null);
              setShowGenerateKeyModal(true);
            }}
            style={{
              padding: '8px 16px',
              fontSize: '13px',
              fontWeight: 600,
              borderRadius: '8px',
              background: 'var(--accent-primary)',
              border: 'none',
              color: '#ffffff',
              cursor: 'pointer',
              boxShadow: '0 2px 8px var(--accent-glow)'
            }}
          >
            + Generate API Key
          </button>
        </div>
      </div>

      {/* Global Error Banner */}
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

      {/* Loading State Indicator */}
      {loading && (
        <div
          role="status"
          style={{
            padding: '24px',
            textAlign: 'center',
            color: 'var(--text-secondary)',
            background: 'var(--bg-card)',
            borderRadius: '12px',
            border: '1px solid var(--border-subtle)',
            marginBottom: '24px'
          }}
        >
          Loading team members and API keys...
        </div>
      )}

      {/* SINGLE-DISPLAY RAW KEY MODAL / BANNER */}
      {generatedKey && (
        <div
          role="dialog"
          aria-labelledby="new-key-title"
          className="glass-panel"
          style={{
            padding: '24px',
            marginBottom: '28px',
            background: 'rgba(245, 158, 11, 0.08)',
            border: '1px solid rgba(245, 158, 11, 0.4)',
            borderRadius: '12px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '18px' }}>⚠️</span>
                <h3 id="new-key-title" style={{ fontSize: '16px', fontWeight: 700, color: '#fcd34d' }}>
                  Gateway API Key Generated Successfully
                </h3>
              </div>
              <p style={{ fontSize: '13px', color: '#fde68a', marginTop: '6px' }}>
                This is the <strong>only time</strong> this raw key will ever be displayed. It is hashed with HMAC-SHA256 in the database and cannot be recovered if lost.
              </p>
            </div>

            <button
              onClick={() => setGeneratedKey(null)}
              aria-label="Dismiss key display"
              style={{ background: 'transparent', border: 'none', color: '#fcd34d', fontSize: '18px', cursor: 'pointer' }}
            >
              ✕
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '16px', flexWrap: 'wrap' }}>
            <code
              style={{
                flex: 1,
                minWidth: '280px',
                padding: '12px 16px',
                borderRadius: '8px',
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

            <button
              onClick={handleCopyKey}
              style={{
                padding: '12px 20px',
                borderRadius: '8px',
                background: copied ? 'var(--accent-success)' : 'var(--accent-primary)',
                border: 'none',
                color: '#ffffff',
                fontWeight: 600,
                fontSize: '13px',
                cursor: 'pointer',
                transition: 'background 0.2s ease'
              }}
            >
              {copied ? '✓ Copied to Clipboard!' : 'Copy Key'}
            </button>
          </div>
        </div>
      )}

      {/* SECTION 1: Team Members (Admin Only) */}
      {isAdmin && (
        <div style={{ marginBottom: '40px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '14px' }}>
            Team Members ({members.length})
          </h3>

          <div className="glass-panel" style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>
                  <th style={{ padding: '12px 16px', fontWeight: 600 }}>Member</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600 }}>Role</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600 }}>Account Status</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600 }}>Registered</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {members.map(member => (
                  <tr key={member.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{member.name}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{member.email}</div>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          background: member.role === 'admin' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(59, 130, 246, 0.15)',
                          color: member.role === 'admin' ? '#f87171' : '#60a5fa'
                        }}
                      >
                        {member.role}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 600,
                          padding: '2px 8px',
                          borderRadius: '4px',
                          background: member.status === 'active' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                          color: member.status === 'active' ? 'var(--accent-success)' : 'var(--accent-danger)'
                        }}
                      >
                        {member.status === 'active' ? '● Active' : '● Disabled'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>
                      {new Date(member.createdAt).toLocaleDateString()}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      {member.id !== user?.id && (
                        <div style={{ display: 'inline-flex', gap: '8px' }}>
                          <button
                            onClick={() => handleToggleMemberStatus(member)}
                            style={{
                              padding: '5px 10px',
                              fontSize: '11px',
                              borderRadius: '4px',
                              background: 'rgba(255, 255, 255, 0.05)',
                              border: '1px solid var(--border-subtle)',
                              color: member.status === 'active' ? '#fbbf24' : 'var(--accent-success)',
                              cursor: 'pointer'
                            }}
                          >
                            {member.status === 'active' ? 'Disable' : 'Enable'}
                          </button>
                          <button
                            onClick={() => handleDeleteMember(member)}
                            style={{
                              padding: '5px 10px',
                              fontSize: '11px',
                              borderRadius: '4px',
                              background: 'rgba(239, 68, 68, 0.1)',
                              border: '1px solid rgba(239, 68, 68, 0.25)',
                              color: '#f87171',
                              cursor: 'pointer'
                            }}
                          >
                            Revoke Access
                          </button>
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
        <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '14px' }}>
          {isAdmin ? 'Active Team API Keys' : 'Your Gateway API Keys'} ({keys.length})
        </h3>

        <div className="glass-panel" style={{ overflowX: 'auto' }}>
          {keys.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
              No API keys generated yet. Click "+ Generate API Key" to issue a key.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>
                  <th style={{ padding: '12px 16px', fontWeight: 600 }}>Key Name</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600 }}>Prefix Identifier</th>
                  {isAdmin && <th style={{ padding: '12px 16px', fontWeight: 600 }}>Assigned User</th>}
                  <th style={{ padding: '12px 16px', fontWeight: 600 }}>Last Used</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600 }}>Created</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600 }}>Status</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {keys.map(key => {
                  const isRevoked = key.revokedAt !== null;
                  return (
                    <tr key={key.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)', opacity: isRevoked ? 0.5 : 1 }}>
                      <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {key.name}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <code style={{ fontSize: '12px', color: 'var(--accent-primary)', background: 'rgba(99, 102, 241, 0.1)', padding: '2px 6px', borderRadius: '4px' }}>
                          {key.keyPrefix}...
                        </code>
                      </td>
                      {isAdmin && (
                        <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>
                          {key.userEmail || key.userId}
                        </td>
                      )}
                      <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>
                        {key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleString() : 'Never'}
                      </td>
                      <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>
                        {new Date(key.createdAt).toLocaleDateString()}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 600,
                            padding: '2px 8px',
                            borderRadius: '4px',
                            background: isRevoked ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                            color: isRevoked ? 'var(--accent-danger)' : 'var(--accent-success)'
                          }}
                        >
                          {isRevoked ? 'Revoked' : 'Active'}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        {!isRevoked && (
                          <button
                            onClick={() => handleRevokeKey(key)}
                            style={{
                              padding: '5px 10px',
                              fontSize: '11px',
                              borderRadius: '4px',
                              background: 'rgba(239, 68, 68, 0.1)',
                              border: '1px solid rgba(239, 68, 68, 0.25)',
                              color: '#f87171',
                              cursor: 'pointer'
                            }}
                          >
                            Revoke
                          </button>
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
      {showAddMemberModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0, 0, 0, 0.75)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '16px' }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: '440px', padding: '28px', borderRadius: '16px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
              Add Team Member
            </h3>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              Create an account with role-based access to MCP tools and gateway features.
            </p>

            {memberFormError && (
              <div role="alert" style={{ padding: '10px', borderRadius: '6px', background: 'rgba(239, 68, 68, 0.15)', color: '#fca5a5', fontSize: '12px', marginBottom: '16px' }}>
                {memberFormError}
              </div>
            )}

            <form onSubmit={handleCreateMember} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  value={newMemberName}
                  onChange={e => setNewMemberName(e.target.value)}
                  placeholder="e.g. Charlie Engineer"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', background: 'rgba(15, 23, 42, 0.6)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', fontSize: '13px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  value={newMemberEmail}
                  onChange={e => setNewMemberEmail(e.target.value)}
                  placeholder="charlie@company.local"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', background: 'rgba(15, 23, 42, 0.6)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', fontSize: '13px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  Assigned Role
                </label>
                <select
                  value={newMemberRole}
                  onChange={e => setNewMemberRole(e.target.value as any)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', background: 'rgba(15, 23, 42, 0.6)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', fontSize: '13px' }}
                >
                  <option value="member">Member (Tools & Chat Access)</option>
                  <option value="admin">Admin (Full Fleet & Team Control)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  Initial Password
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={newMemberPassword}
                  onChange={e => setNewMemberPassword(e.target.value)}
                  placeholder="Minimum 8 characters"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', background: 'rgba(15, 23, 42, 0.6)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', fontSize: '13px' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px' }}>
                <button
                  type="button"
                  onClick={() => setShowAddMemberModal(false)}
                  style={{ padding: '8px 16px', borderRadius: '6px', background: 'transparent', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={memberFormSubmitting}
                  style={{ padding: '8px 18px', borderRadius: '6px', background: 'var(--accent-primary)', border: 'none', color: '#ffffff', fontWeight: 600, cursor: 'pointer' }}
                >
                  {memberFormSubmitting ? 'Creating...' : 'Create Member'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Generate API Key */}
      {showGenerateKeyModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0, 0, 0, 0.75)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '16px' }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: '440px', padding: '28px', borderRadius: '16px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
              Generate Gateway API Key
            </h3>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              Issue a high-entropy key for MCP clients (Claude Code, Cursor).
            </p>

            {keyFormError && (
              <div role="alert" style={{ padding: '10px', borderRadius: '6px', background: 'rgba(239, 68, 68, 0.15)', color: '#fca5a5', fontSize: '12px', marginBottom: '16px' }}>
                {keyFormError}
              </div>
            )}

            <form onSubmit={handleGenerateKey} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  Key Descriptive Label
                </label>
                <input
                  type="text"
                  required
                  value={newKeyName}
                  onChange={e => setNewKeyName(e.target.value)}
                  placeholder="e.g. Claude Code Terminal Key"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', background: 'rgba(15, 23, 42, 0.6)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', fontSize: '13px' }}
                />
              </div>

              {isAdmin && members.length > 0 && (
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    Issue For User
                  </label>
                  <select
                    value={targetUserId}
                    onChange={e => setTargetUserId(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', background: 'rgba(15, 23, 42, 0.6)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', fontSize: '13px' }}
                  >
                    <option value="">Myself ({user?.name})</option>
                    {members.filter(m => m.id !== user?.id && m.status === 'active').map(m => (
                      <option key={m.id} value={m.id}>{m.name} ({m.email})</option>
                    ))}
                  </select>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px' }}>
                <button
                  type="button"
                  onClick={() => setShowGenerateKeyModal(false)}
                  style={{ padding: '8px 16px', borderRadius: '6px', background: 'transparent', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={keyFormSubmitting}
                  style={{ padding: '8px 18px', borderRadius: '6px', background: 'var(--accent-primary)', border: 'none', color: '#ffffff', fontWeight: 600, cursor: 'pointer' }}
                >
                  {keyFormSubmitting ? 'Issuing...' : 'Issue API Key'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
