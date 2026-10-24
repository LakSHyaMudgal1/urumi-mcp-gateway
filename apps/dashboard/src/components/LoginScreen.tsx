import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext.js';
import { Button } from './ui/Button.js';
import { Input } from './ui/Input.js';
import { Layers, Mail, Lock, AlertCircle, ShieldCheck, UserCheck, ArrowRight } from 'lucide-react';

export const LoginScreen: React.FC = () => {
  const { login, error, clearError, isLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    clearError();

    if (!email.trim() || !password) {
      setLocalError('Please enter both email and password.');
      return;
    }

    try {
      await login(email.trim(), password);
    } catch {
      // Error is tracked in AuthContext
    }
  };

  const handleFillDemoAdmin = () => {
    setEmail('admin@urumi.local');
    setPassword('AdminSecurePassword123!');
    setLocalError(null);
    clearError();
  };

  const handleFillDemoMember = () => {
    setEmail('alice@urumi.local');
    setPassword('AlicePassword123!');
    setLocalError(null);
    clearError();
  };

  const displayError = error || localError;

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        backgroundColor: 'var(--bg-canvas)'
      }}
    >
      <div
        className="console-card"
        style={{
          width: '100%',
          maxWidth: '400px',
          padding: '32px',
          boxShadow: 'var(--shadow-lg)',
          backgroundColor: 'var(--bg-surface)'
        }}
      >
        {/* Brand Header */}
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--accent-subtle)',
              border: '1px solid var(--accent-border)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--accent-text)',
              marginBottom: '16px'
            }}
            aria-hidden="true"
          >
            <Layers size={22} />
          </div>
          <h1
            style={{
              fontSize: '18px',
              fontWeight: 600,
              letterSpacing: '-0.02em',
              color: 'var(--text-primary)'
            }}
          >
            Sign In to Console
          </h1>
          <p
            style={{
              fontSize: '13px',
              color: 'var(--text-secondary)',
              marginTop: '4px',
              lineHeight: 1.4
            }}
          >
            Enter your credentials to manage MCP upstreams, tool routing, and cluster audit logs.
          </p>
        </div>

        {/* Error Alert */}
        {displayError && (
          <div
            role="alert"
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '10px',
              padding: '10px 12px',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'var(--color-danger-bg)',
              border: '1px solid var(--color-danger-border)',
              color: 'var(--color-danger-text)',
              fontSize: '12px',
              marginBottom: '20px',
              lineHeight: 1.4
            }}
          >
            <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
            <span>{displayError}</span>
          </div>
        )}

        {/* Sign In Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <Input
            id="login-email"
            type="email"
            label="Work Email"
            placeholder="name@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            icon={<Mail size={15} />}
            autoComplete="email"
            required
            autoFocus
          />

          <Input
            id="login-password"
            type="password"
            label="Password"
            placeholder="••••••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            icon={<Lock size={15} />}
            autoComplete="current-password"
            required
          />

          <Button
            type="submit"
            variant="primary"
            size="md"
            isLoading={isLoading}
            style={{ width: '100%', marginTop: '6px' }}
          >
            <span>{isLoading ? 'Authenticating...' : 'Sign In'}</span>
            {!isLoading && <ArrowRight size={14} />}
          </Button>
        </form>

        {/* Quick Demo Profiles (Developer Shortcuts) */}
        <div
          style={{
            marginTop: '28px',
            paddingTop: '20px',
            borderTop: '1px solid var(--border-subtle)'
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '10px'
            }}
          >
            <span
              style={{
                fontSize: '11px',
                fontWeight: 500,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: 'var(--text-muted)'
              }}
            >
              Demo Profiles
            </span>
            <span style={{ fontSize: '11px', color: 'var(--text-disabled)' }}>
              Click to autofill
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleFillDemoAdmin}
              icon={<ShieldCheck size={13} style={{ color: 'var(--accent-text)' }} />}
              style={{ justifyContent: 'flex-start' }}
            >
              Admin
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleFillDemoMember}
              icon={<UserCheck size={13} style={{ color: 'var(--text-muted)' }} />}
              style={{ justifyContent: 'flex-start' }}
            >
              Member
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
