# Urumi MCP Gateway on Kubernetes

Enterprise Model Context Protocol (MCP) gateway platform running inside Kubernetes with a WooCommerce storefront, persistent databases, and internal-only upstream MCP services.

## Overview

The Urumi MCP Gateway provides an aggregated, secure, and authenticated access point to enterprise MCP tools. Team members can use all enabled upstream tools through a single Streamable HTTP gateway endpoint and via an embedded dashboard chat agent.

### Core Security Invariants
- **Upstream Isolation**: Upstream MCP servers (`woocommerce-mcp`, `inventory-mcp`, `shipping-mcp`) are internal cluster services (`ClusterIP`) unreachable from the public internet.
- **Credential Confidentiality**: Upstream credentials are injected strictly server-side by the gateway. Upstream tokens and keys are never forwarded to or visible from the browser.
- **Cryptographic Key Management**: Only SHA-256 hashes of API keys are stored in the database. Raw keys (`mcp_live_...`) are shown only once upon generation. Revocation takes effect immediately on the very next request.
- **SSRF Protection**: Upstream URL registration strictly blocks loopback addresses (`127.0.0.1`, `localhost`), link-local metadata endpoints (`169.254.169.254`, `metadata.google.internal`), unsafe protocols (`file:`, `gopher:`), and redirect bypasses while explicitly permitting in-cluster Kubernetes DNS (`*.svc.cluster.local`, `woocommerce-mcp`, `inventory-mcp`, `shipping-mcp`).
- **Comprehensive Audit Trail**: Every tool call records authenticated user attribution, upstream target, tool name, timestamp, duration, status, and recursively sanitized parameters.

---

## Monorepo Layout

```
urumi-mcp-gateway/
├── apps/
│   └── dashboard/              # React + TypeScript + Vite web UI
├── services/
│   ├── gateway/                # Combined REST admin API, Streamable HTTP MCP gateway,
│   │                           # auth, database migrations, audit logger, and chat orchestration
│   ├── woocommerce-mcp/        # Streamable HTTP MCP server for WooCommerce store
│   ├── inventory-mcp/          # Deterministic demo Inventory MCP server
│   └── shipping-mcp/           # Deterministic demo Shipping MCP server
├── packages/
│   └── shared/                 # Shared types, Zod schemas, security & SSRF protection
├── infra/
│   └── helm/
│       └── urumi-platform/     # Production & local Helm charts, PVCs, and Ingress
├── docs/
│   ├── decisions.md            # Architecture Decision Records (ADRs)
│   └── threat-model.md         # Comprehensive security and threat model
├── .env.example                # Configuration template with placeholders only
├── package.json                # npm workspaces root configuration
└── tsconfig.json               # Root TypeScript configuration
```

---

## Local Development & Setup

### 1. Prerequisites
- **Node.js**: v22+ or v24+ (Node.js 24 recommended, includes native `node:sqlite` for testing)
- **npm**: v10+

### 2. Installation
Install all dependencies across the monorepo workspaces:
```bash
npm install
```

### 3. Build All Packages
```bash
npm run build
```

### 4. Run Test Suites
Run unit and integration test suites across all packages:
```bash
npm run test
```

Or test specific packages:
```bash
npm test -w packages/shared
npm test -w services/gateway
npm test -w services/woocommerce-mcp
npm test -w services/inventory-mcp
npm test -w services/shipping-mcp
```

### 5. Running the Gateway Locally
Copy the example environment:
```bash
cp .env.example .env
```

Start the gateway in development mode:
```bash
npm start -w services/gateway
```
The gateway automatically:
1. Runs SQL migrations (creating `users`, `api_keys`, `upstream_servers`, `audit_logs`).
2. Bootstraps the initial admin user from `INITIAL_ADMIN_EMAIL` and `INITIAL_ADMIN_PASSWORD`.
3. Registers the default internal upstreams (`woocommerce`, `inventory`, `shipping`).
4. Serves liveness (`/healthz`), readiness (`/readyz`), and detailed health checks (`/health`).

---

## Health Probe Specification

Every HTTP service provides standard Kubernetes probes:
- `GET /healthz`: Liveness probe. Returns `200 OK` if the process is responsive.
- `GET /readyz`: Readiness probe. Returns `200 OK` if critical dependencies are healthy. If the database or upstream store is disconnected, returns `503 Service Unavailable`.
- `GET /health`: Comprehensive JSON payload containing service uptime, version, and dependency status.

---

## Implementation Status

- [x] **Phase 1: Foundations, Security, Database & Monorepo Structure**
  - Monorepo structure configured with npm workspaces.
  - Core domain types, Zod validation schemas, and SSRF validator in `@urumi/shared`.
  - Cryptographic API key generation (prefix + secret) and constant-time SHA-256 verification.
  - Database abstraction supporting PostgreSQL and zero-dependency SQLite.
  - SQL migrations for users, roles, hashed API keys, upstream configs, and audit logs.
  - Idempotent bootstrap seed process for admin user and default upstreams.
  - Health probes (`/healthz`, `/readyz`, `/health`) on Gateway and all 3 upstream services.
  - Automated unit and integration test suites passing.
  - Architecture ADRs (`docs/decisions.md`) and Threat Model (`docs/threat-model.md`).

- [ ] **Phase 2: Upstream MCP Servers Implementation**
  - Streamable HTTP server endpoints for WooCommerce, Inventory, and Shipping MCP servers.
  - WooCommerce REST API integration with fallback test store fixture.
  - Deterministic tools for Inventory (stock checks, reservations, restock) and Shipping (rates, shipments, tracking).

- [ ] **Phase 3: Gateway Core & MCP Aggregation**
  - Tool aggregation with collision namespacing (`<slug>__<tool>`).
  - Timeout management and upstream circuit breaking/failure isolation.
  - Unified `/mcp` Streamable HTTP endpoint with Bearer API key authentication.
  - REST administration API for servers, team members, API keys, and audit logs.

- [ ] **Phase 4: Chat Agent & Dashboard UI**
  - Tool execution loop for chat agent with configurable LLM providers (Ollama / OpenAI / demo fallback).
  - Full React dashboard with server management, key generation modal, audit viewer, and interactive chat.

- [ ] **Phase 5: Kubernetes & Helm Charts**
  - Production-ready Dockerfiles.
  - Complete Helm chart in `infra/helm/urumi-platform` with PVCs, Secrets, Probes, and Ingress.
  - `values-local.yaml` and `values-prod.yaml`.

- [ ] **Phase 6: End-to-End Acceptance Verification & Demo Walkthrough**
  - Execution of the 9 mandatory acceptance criteria flows.
