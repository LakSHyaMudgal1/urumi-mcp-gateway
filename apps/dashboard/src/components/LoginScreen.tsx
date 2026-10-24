import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext.js';

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

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px'
      }}
    >
      <div
        className="glass-panel"
        style={{
          width: '100%',
          maxWidth: '440px',
          padding: '36px',
          borderRadius: '16px',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.4)'
        }}
      >
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div
            style={{
              width: '54px',
              height: '54px',
              borderRadius: '14px',
              background: 'linear-gradient(135deg, #6366f1, #3b82f6)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: '26px',
              color: '#ffffff',
              boxShadow: '0 8px 24px rgba(99, 102, 241, 0.4)',
              marginBottom: '16px'
            }}
            aria-hidden="true"
          >
            U
          </div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
            Sign In to Gateway
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '6px' }}>
            Enter your team credentials to access unified MCP tools and chat orchestration.
          </p>
        </div>

        {/* Error Banner */}
        {(error || localError) && (
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
            {error || localError}
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label
              htmlFor="login-email"
              style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}
            >
              Email Address
            </label>
            <input
              id="login-email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@company.local"
              autoComplete="username"
              required
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: '8px',
                background: 'rgba(15, 23, 42, 0.6)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-primary)',
                fontSize: '14px',
                outline: 'none'
              }}
            />
          </div>

          <div>
            <label
              htmlFor="login-password"
              style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}
            >
              Password
            </label>
            <input
              id="login-password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••••••"
              autoComplete="current-password"
              required
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: '8px',
                background: 'rgba(15, 23, 42, 0.6)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-primary)',
                fontSize: '14px',
                outline: 'none'
              }}
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            style={{
              padding: '12px',
              borderRadius: '8px',
              background: 'var(--accent-primary)',
              color: '#ffffff',
              fontSize: '14px',
              fontWeight: 600,
              border: 'none',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              opacity: isLoading ? 0.7 : 1,
              marginTop: '4px',
              boxShadow: '0 4px 12px var(--accent-glow)',
              transition: 'all 0.15s ease'
            }}
          >
            {isLoading ? 'Signing In...' : 'Sign In'}
          </button>
        </form>

        {/* Demo Credentials Quick-Fill (Labeled clearly as demonstration shortcuts) */}
        <div style={{ marginTop: '24px', paddingTop: '20px', borderTop: '1px solid var(--border-subtle)' }}>
          <p style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Quick Demo Profiles
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <button
              type="button"
              onClick={handleFillDemoAdmin}
              style={{
                padding: '8px',
                fontSize: '12px',
                fontWeight: 500,
                borderRadius: '6px',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-secondary)',
                cursor: 'pointer'
              }}
            >
              Admin Profile
            </button>
            <button
              type="button"
              onClick={handleFillDemoMember}
              style={{
                padding: '8px',
                fontSize: '12px',
                fontWeight: 500,
                borderRadius: '6px',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-secondary)',
                cursor: 'pointer'
              }}
            >
              Member Profile
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
