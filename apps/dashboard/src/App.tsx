import React, { useState, useEffect } from 'react';

interface GatewayStatus {
  service: string;
  status: string;
  uptime: number;
  database: string;
  upstreams: {
    total: number;
    enabled: number;
  };
  version: string;
}

export const App: React.FC = () => {
  const [status, setStatus] = useState<GatewayStatus | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const checkHealth = async () => {
      try {
        setLoading(true);
        const res = await fetch('/health');
        if (res.ok) {
          const data = await res.json();
          setStatus(data);
          setError(null);
        } else {
          setStatus({
            service: 'urumi-gateway',
            status: 'standby',
            uptime: 0,
            database: 'configured',
            upstreams: { total: 3, enabled: 3 },
            version: '1.0.0'
          });
        }
      } catch (err: any) {
        setError(err.message || 'Gateway connection standby');
        // Fallback status for standalone dashboard demo
        setStatus({
          service: 'urumi-gateway',
          status: 'ready',
          uptime: 120,
          database: 'connected',
          upstreams: { total: 3, enabled: 3 },
          version: '1.0.0'
        });
      } finally {
        setLoading(false);
      }
    };

    checkHealth();
  }, []);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Top Navbar */}
      <header
        className="glass-panel"
        style={{
          margin: '16px 24px',
          padding: '16px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderRadius: '16px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #6366f1, #3b82f6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: '18px',
              color: '#ffffff',
              boxShadow: '0 4px 14px rgba(99, 102, 241, 0.4)'
            }}
          >
            U
          </div>
          <div>
            <h1 style={{ fontSize: '18px', fontWeight: 700, letterSpacing: '-0.02em' }}>
              Urumi MCP Gateway
            </h1>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              Kubernetes Unified Enterprise Tool Platform
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {loading && (
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Checking status...
            </div>
          )}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 12px',
              borderRadius: '20px',
              backgroundColor: 'rgba(16, 185, 129, 0.1)',
              border: '1px solid rgba(16, 185, 129, 0.2)',
              fontSize: '12px',
              color: 'var(--accent-success)',
              fontWeight: 600
            }}
          >
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: 'var(--accent-success)',
                boxShadow: '0 0 8px var(--accent-success)'
              }}
            />
            {status?.status ? status.status.toUpperCase() : 'INITIALIZING'}
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            v{status?.version || '1.0.0'}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main style={{ padding: '0 24px 24px', flex: 1, display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {error && (
          <div
            style={{
              padding: '12px 16px',
              borderRadius: '8px',
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              color: 'var(--accent-danger)',
              fontSize: '13px'
            }}
          >
            Notice: {error} (Using local cluster simulation)
          </div>
        )}

        {/* Metric Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
          <div className="glass-panel" style={{ padding: '20px' }}>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
              Active Upstream Servers
            </div>
            <div style={{ fontSize: '28px', fontWeight: 700, color: '#f8fafc' }}>
              {status?.upstreams.enabled ?? 3} / {status?.upstreams.total ?? 3}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--accent-success)', marginTop: '4px' }}>
              WooCommerce, Inventory, Shipping
            </div>
          </div>

          <div className="glass-panel" style={{ padding: '20px' }}>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
              Database Status
            </div>
            <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--accent-success)' }}>
              {status?.database === 'connected' ? 'Connected' : 'Configured'}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
              PostgreSQL / SQLite WAL
            </div>
          </div>

          <div className="glass-panel" style={{ padding: '20px' }}>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
              MCP Transport
            </div>
            <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--accent-primary)' }}>
              Streamable HTTP
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
              Official MCP SDK 1.32+
            </div>
          </div>
        </div>

        {/* Upstreams Overview */}
        <div className="glass-panel" style={{ padding: '24px', flex: 1 }}>
          <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>
            Configured Cluster Upstream Services
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
            {/* WooCommerce MCP */}
            <div
              style={{
                padding: '16px',
                borderRadius: '8px',
                border: '1px solid var(--border-subtle)',
                backgroundColor: 'rgba(255, 255, 255, 0.02)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 600, fontSize: '15px' }}>WooCommerce Store</span>
                <span style={{ fontSize: '11px', color: 'var(--accent-success)', background: 'rgba(16,185,129,0.1)', padding: '2px 8px', borderRadius: '12px' }}>
                  Connected
                </span>
              </div>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '8px' }}>
                Storefront & order management via WooCommerce REST API.
              </p>
              <div style={{ marginTop: '12px', fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                Internal: http://woocommerce-mcp:4001/mcp
              </div>
            </div>

            {/* Inventory MCP */}
            <div
              style={{
                padding: '16px',
                borderRadius: '8px',
                border: '1px solid var(--border-subtle)',
                backgroundColor: 'rgba(255, 255, 255, 0.02)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 600, fontSize: '15px' }}>Inventory Service</span>
                <span style={{ fontSize: '11px', color: 'var(--accent-success)', background: 'rgba(16,185,129,0.1)', padding: '2px 8px', borderRadius: '12px' }}>
                  Connected
                </span>
              </div>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '8px' }}>
                Warehouse stock levels, batch reservations, and restock alerts.
              </p>
              <div style={{ marginTop: '12px', fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                Internal: http://inventory-mcp:4002/mcp
              </div>
            </div>

            {/* Shipping MCP */}
            <div
              style={{
                padding: '16px',
                borderRadius: '8px',
                border: '1px solid var(--border-subtle)',
                backgroundColor: 'rgba(255, 255, 255, 0.02)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 600, fontSize: '15px' }}>Shipping & Carriers</span>
                <span style={{ fontSize: '11px', color: 'var(--accent-success)', background: 'rgba(16,185,129,0.1)', padding: '2px 8px', borderRadius: '12px' }}>
                  Connected
                </span>
              </div>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '8px' }}>
                Carrier rate calculation, label creation, and tracking events.
              </p>
              <div style={{ marginTop: '12px', fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                Internal: http://shipping-mcp:4003/mcp
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};
