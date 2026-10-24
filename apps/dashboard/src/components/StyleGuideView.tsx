import React, { useState } from 'react';
import {
  Button,
  Input,
  Textarea,
  Select,
  Checkbox,
  Switch,
  Badge,
  StatusBadge,
  PageHeader,
  SectionHeader,
  Divider,
  Modal,
  ConfirmDialog,
  EmptyState,
  Skeleton,
  Alert,
  Tooltip,
  useToast
} from './ui/index.js';
import {
  Layers,
  Search,
  Plus,
  RefreshCw,
  ShieldCheck
} from 'lucide-react';

export const StyleGuideView: React.FC = () => {
  const toast = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [checkboxVal, setCheckboxVal] = useState(true);
  const [switchVal, setSwitchVal] = useState(false);
  const [selectVal, setSelectVal] = useState('prod');

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '0 24px 64px' }}>
      <PageHeader
        title="Urumi Design System & Style Guide"
        description="Internal component catalog and design token reference. Production-grade B2B infrastructure primitives."
        breadcrumbs={[
          { label: 'System', href: '#' },
          { label: 'Design System Tokens' }
        ]}
        badge={<Badge variant="accent">Internal v1.0</Badge>}
        actions={
          <Button
            variant="outline"
            leftIcon={<RefreshCw size={14} />}
            onClick={() => toast.info('Refreshed styleguide preview')}
          >
            Refresh Tokens
          </Button>
        }
      />

      {/* 1. BUTTONS */}
      <section style={{ marginBottom: '40px' }}>
        <SectionHeader
          title="Buttons"
          description="Variants, sizes, loading states, icon support, and accessibility rings."
        />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', marginBottom: '16px' }}>
          <Button variant="primary" leftIcon={<Plus size={14} />}>Primary Action</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Destructive</Button>
          <Button variant="link">Inline Link</Button>
          <Button variant="primary" isLoading>Processing</Button>
          <Button variant="outline" disabled>Disabled</Button>
          <Button variant="outline" isIconOnly aria-label="Quick search">
            <Search size={14} />
          </Button>
        </div>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <Button size="sm" variant="secondary">Small</Button>
          <Button size="md" variant="secondary">Medium</Button>
          <Button size="lg" variant="secondary">Large</Button>
        </div>
      </section>

      <Divider />

      {/* 2. STATUS BADGES & BADGES */}
      <section style={{ marginBottom: '40px' }}>
        <SectionHeader
          title="Status Indicators & Badges"
          description="High-contrast semantic states with dot pulses."
        />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center', marginBottom: '16px' }}>
          <StatusBadge status="connected" />
          <StatusBadge status="unreachable" />
          <StatusBadge status="disabled" />
          <StatusBadge status="provisioning" />
          <StatusBadge status="ready" />
          <StatusBadge status="failed" />
          <StatusBadge status="active" />
          <StatusBadge status="revoked" />
          <StatusBadge status="success" />
          <StatusBadge status="warning" />
          <StatusBadge status="error" />
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
          <Badge variant="neutral">Neutral Pill</Badge>
          <Badge variant="accent" withDot>Cluster Leader</Badge>
          <Badge variant="info">Streamable HTTP</Badge>
          <Badge variant="success">HMAC-SHA256</Badge>
          <Badge variant="warning">Rate-Limited</Badge>
          <Badge variant="danger">SSRF Blocked</Badge>
        </div>
      </section>

      <Divider />

      {/* 3. FORM CONTROLS */}
      <section style={{ marginBottom: '40px' }}>
        <SectionHeader
          title="Form Controls & Inputs"
          description="Accessible text fields, search boxes, textareas, selects, checkboxes, and switches."
        />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', marginBottom: '20px' }}>
          <Input
            label="Cluster Hostname"
            placeholder="mcp.urumi.local"
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            helperText="Internal VPC or Kubernetes ClusterIP"
          />

          <Input
            label="Search Endpoints"
            placeholder="Filter by slug or tool..."
            leftIcon={<Search size={14} />}
          />

          <Input
            label="Invalid Configuration"
            defaultValue="invalid://url:port"
            error="Only HTTP/HTTPS URLs are allowed under SSRF policy"
          />

          <Select
            label="Deployment Tier"
            value={selectVal}
            onChange={e => setSelectVal(e.target.value)}
            options={[
              { value: 'dev', label: 'Development (Local)' },
              { value: 'staging', label: 'Staging (Preview)' },
              { value: 'prod', label: 'Production (HA Cluster)' }
            ]}
          />
        </div>

        <div style={{ marginBottom: '20px' }}>
          <Textarea
            label="System Prompt Extension"
            placeholder="Enter instructions for the Gateway Chat orchestrator..."
            rows={3}
            helperText="Injected directly into Claude 3.5 Sonnet context"
          />
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '32px' }}>
          <Checkbox
            label="Enforce SSRF Safe-Domain Whitelist"
            description="Prevents upstream registrations targeting internal cloud metadata (169.254.169.254)."
            checked={checkboxVal}
            onChange={e => setCheckboxVal(e.target.checked)}
          />

          <Switch
            label="Debug Tool Tracing"
            description="Log full unmasked schema invocations to the cluster audit stream."
            checked={switchVal}
            onChange={setSwitchVal}
          />
        </div>
      </section>

      <Divider />

      {/* 4. ALERTS & CALLOUTS */}
      <section style={{ marginBottom: '40px' }}>
        <SectionHeader
          title="Alerts & Callouts"
          description="Informative banners for warnings, security advisories, and system notices."
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <Alert variant="info" title="Gateway Architecture Notice">
            All upstream MCP tools are namespaced automatically as <code>&lt;slug&gt;__&lt;tool_name&gt;</code> to eliminate schema collisions.
          </Alert>

          <Alert variant="warning" title="Credentials Rotation Required">
            WooCommerce upstream bearer token expires in 4 days. Rotate secret server-side without client disruption.
          </Alert>

          <Alert variant="danger" title="Upstream Connection Lost">
            Shipping MCP on port 4003 failed health probe. Automated retry loop initiated (attempt 2/5).
          </Alert>

          <Alert variant="success" title="Zero-Trust Enforced">
            Mutual TLS and HMAC authentication verified across all 3 active MCP workers.
          </Alert>
        </div>
      </section>

      <Divider />

      {/* 5. OVERLAYS, TOASTS & TOOLTIPS */}
      <section style={{ marginBottom: '40px' }}>
        <SectionHeader
          title="Overlays, Dialogs & Toasts"
          description="Backdrops, modal traps, accessible ESC key listeners, and feedback toasts."
        />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
          <Button variant="outline" onClick={() => setModalOpen(true)}>
            Open Demo Modal
          </Button>

          <Button variant="danger" onClick={() => setConfirmOpen(true)}>
            Open Confirm Dialog
          </Button>

          <Tooltip content="Cryptographic identifier verified against SQLite keystore">
            <Button variant="ghost" leftIcon={<ShieldCheck size={14} />}>
              Hover for Tooltip
            </Button>
          </Tooltip>

          <Button
            variant="secondary"
            onClick={() => toast.success('API key copied to clipboard!')}
          >
            Toast Success
          </Button>

          <Button
            variant="secondary"
            onClick={() => toast.error('Failed to connect to upstream worker')}
          >
            Toast Error
          </Button>
        </div>
      </section>

      <Divider />

      {/* 6. SKELETONS & EMPTY STATES */}
      <section>
        <SectionHeader
          title="Loading Skeletons & Empty States"
          description="Subtle pulsing placeholders and structured zero-data callouts."
        />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px', marginBottom: '24px' }}>
          <div className="console-card" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
              <Skeleton width="40px" height="40px" borderRadius="var(--radius-sm)" />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <Skeleton width="60%" height="16px" />
                <Skeleton width="40%" height="12px" />
              </div>
            </div>
            <Skeleton width="100%" height="48px" borderRadius="var(--radius-sm)" style={{ marginBottom: '12px' }} />
            <Skeleton width="80%" height="14px" />
          </div>

          <EmptyState
            icon={<Layers size={22} />}
            title="No Upstream Services Configured"
            description="Add your first MCP service worker over Streamable HTTP to aggregate tools into the unified Gateway."
            actionLabel="Register MCP Server"
            onAction={() => toast.info('Register server clicked')}
          />
        </div>
      </section>

      {/* Demo Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Sample Gateway Configuration"
        description="Inspect or update parameters for high-throughput cluster routing."
        footer={
          <>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={() => { setModalOpen(false); toast.success('Config saved'); }}>
              Apply Changes
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <Input label="Max Concurrent Tool Invocations" defaultValue="50" type="number" />
          <Input label="Worker Execution Timeout (ms)" defaultValue="15000" type="number" />
        </div>
      </Modal>

      {/* Confirm Dialog */}
      <ConfirmDialog
        isOpen={confirmOpen}
        title="Revoke Gateway API Key"
        description="Are you sure you want to revoke this key? Active Claude Code and Cursor client sessions using this key will be disconnected immediately."
        confirmLabel="Revoke API Key"
        variant="danger"
        onConfirm={() => {
          setConfirmOpen(false);
          toast.success('Key revoked successfully');
        }}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
};
