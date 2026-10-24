# Urumi MCP Gateway: System Design & Architecture

This document describes the architectural decisions, component responsibilities, request and data flows, MCP transport, aggregation model, security boundaries, and environment deployment patterns of the Urumi MCP Gateway platform.

---

## 1. System Overview & Component Responsibilities

The platform is organized as a modular TypeScript monorepo with strict separation of concerns:

```
urumi-mcp-gateway/
├── apps/
│   └── dashboard/                 # React 18 + TypeScript + Vite administrative UI
├── services/
│   ├── gateway/                   # Central aggregation gateway, auth, audit & chat agent
│   ├── woocommerce-mcp/           # Official Streamable HTTP MCP server for WooCommerce store
│   ├── inventory-mcp/             # Deterministic inventory MCP service (stock queries)
│   └── shipping-mcp/              # Deterministic shipping MCP service (rate quotes)
├── packages/
│   └── shared/                    # Shared types, Zod schemas, SSRF validation, security utils
└── infra/
    └── helm/urumi-platform/       # Single unified Helm chart with values-local.yaml & values-prod.yaml
```

### Component Breakdown
1. **Gateway (`services/gateway`)**:
   - **Dual MCP Protocol Engine**: Operates as an MCP client to all enabled upstream services and exposes exactly one unified, aggregated MCP endpoint (`/mcp`) to external clients.
   - **REST Administration API**: Role-based endpoints for team members, API keys, upstream registration, audit logs, and catalog discovery.
   - **Tool Aggregator & Namespacing**: Parallel failure-isolated tool discovery, metadata caching, collision detection, and namespaced tool routing.
   - **Access Control & Permissions**: Validates API keys and session tokens, enforces fine-grained permissions (`admin` vs `member`), and filters tool listings.
   - **Audit Logger**: Asynchronously records caller identity, upstream server, tool name, execution duration, and outcome status with automatic PII and secret redaction.
   - **Chat Agent Orchestrator**: Bound to the authenticated caller session; discovers permitted tools, constructs system instructions, and executes bounded multi-step tool-calling loops without ever calling upstreams directly.
2. **WooCommerce MCP Service (`services/woocommerce-mcp`)**:
   - Internal-only Streamable HTTP MCP service exposing tools: `list_products`, `create_product`, `list_orders`, `get_order`, and `update_order_status`.
   - Authenticates to the WooCommerce REST API using server-side credentials injected via Kubernetes Secrets (`WOOCOMMERCE_CONSUMER_KEY`, `WOOCOMMERCE_CONSUMER_SECRET`).
   - Features a deterministic `MockWooCommerceStore` fallback for local zero-dependency testing.
3. **Inventory MCP Service (`services/inventory-mcp`)**:
   - Independent Streamable HTTP MCP service providing `get_stock(sku)` and `search_inventory(query)` using deterministic in-memory datasets.
4. **Shipping MCP Service (`services/shipping-mcp`)**:
   - Independent Streamable HTTP MCP service providing `estimate_shipping(...)` and `list_shipping_methods(...)` with deterministic quotes.
5. **Dashboard (`apps/dashboard`)**:
   - Developer-tool UI built with React + Vite: session entry, role display, upstream management (create/edit/disable/remove), team member invitations, single-display API key issuance and revocation, client setup instructions, paginated audit log viewer, and user-attributed chat agent.
6. **Storefront & Database Infrastructure**:
   - WordPress 6.7 + WooCommerce deployed as a persistent container.
   - MariaDB 11.4 persistent store database.
   - PostgreSQL 16 persistent gateway database.
   - CLI bootstrap job automating initial WooCommerce store configuration.

---

## 2. Request & Data Flows

### 2.1 External MCP Client Flow
```
[ Cursor / Claude Code / MCP Inspector ]
                 │
                 │ 1. POST /mcp (Authorization: Bearer mcp_live_...)
                 ▼
┌──────────────────────────────────────────────┐
│ Gateway MCP Server (/mcp)                    │
│  - Validate API key (constant-time HMAC)     │
│  - Check revocation & disabled status        │
│  - Identify caller (e.g., User B, 'member')  │
└──────────────────────┬───────────────────────┘
                       │
                       │ 2. tools/list or tools/call
                       ▼
┌──────────────────────────────────────────────┐
│ Tool Router & Permission Engine              │
│  - If tools/list: return ONLY allowed tools  │
│  - If tools/call: check role permissions in  │
│    code (isToolPermittedForRole)             │
│  - Route namespaced alias to upstream        │
└──────────────────────┬───────────────────────┘
                       │
                       │ 3. Streamable HTTP POST /mcp
                       ▼
┌──────────────────────────────────────────────┐
│ Upstream Service (e.g. woocommerce-mcp)      │
│  - Execute tool (REST API or mock fallback)  │
│  - Return MCP tool result                    │
└──────────────────────┬───────────────────────┘
                       │
                       │ 4. Result returned & logged
                       ▼
┌──────────────────────────────────────────────┐
│ Gateway Audit Repository                     │
│  - Asynchronously record who/what/when/how   │
│    long/outcome with secrets redacted        │
└──────────────────────────────────────────────┘
```

### 2.2 Dashboard Chat Agent Orchestration Flow
```
[ User Browser in Dashboard ]
                 │
                 │ 1. POST /api/chat (Bearer JWT Session in Authorization header)
                 ▼
┌──────────────────────────────────────────────┐
│ Chat Orchestrator                            │
│  - Extract authenticated User identity       │
│  - Fetch aggregated tools filtered by role   │
│  - Format tools as untrusted function schemas│
└──────────────────────┬───────────────────────┘
                       │
                       │ 2. Send messages + tool schemas to configured LLM
                       ▼
┌──────────────────────────────────────────────┐
│ LLM Provider (Mock, OpenAI, Ollama, Gemini)  │
│  - Emits tool_calls                          │
└──────────────────────┬───────────────────────┘
                       │
                       │ 3. Gateway executes tool on behalf of user
                       ▼
┌──────────────────────────────────────────────┐
│ UpstreamManager.executeTool(user, tool, args)│
│  - Enforces role permission in code          │
│  - Records user-attributed audit row         │
│  - Strips credentials from result            │
└──────────────────────┬───────────────────────┘
                       │
                       │ 4. Append tool result to context; repeat until final answer
                       ▼
[ Dashboard Chat UI ] (Renders assistant text + expandable tool call traces)
```

---

## 3. MCP Transport & Protocol Compliance

- **Transport Standard**: Implemented strictly using the official `@modelcontextprotocol/sdk` Streamable HTTP transport specification (`StreamableHTTPServerTransport` and `StreamableHTTPClientTransport`).
- **Endpoint**: The Gateway exposes exactly one endpoint: `ALL /mcp`.
- **Session Lifecycle**:
  - **Initialization**: Clients send a standard JSON-RPC `initialize` request with an active API key (`Authorization: Bearer mcp_live_...`). The gateway generates a secure UUID session identifier, instantiates an isolated server instance, and returns the session ID via the `mcp-session-id` header.
  - **Subsequent Calls**: Requests pass `mcp-session-id` in HTTP headers. The gateway validates that the session's API key has not been revoked and that the user account is active before dispatching the payload to the session transport.
  - **Termination**: Session cleanup occurs upon explicit close notification or connection teardown.

---

## 4. Tool Aggregation, Collision Handling & Namespacing

### The Collision Problem
When multiple independent upstream servers expose tools with identical names (e.g., `woocommerce` exposing `search_catalog` and `inventory` exposing `search_catalog`), naive aggregation creates ambiguity for clients and models.

### Resolution Strategy
1. **Deterministic Namespacing**: Every discovered tool is registered under the fully-qualified namespaced format:
   ```
   <sanitized-upstream-slug>__<original-tool-name>
   ```
   *Example*: `woocommerce__list_orders`, `inventory__get_stock`, `shipping__estimate_shipping`.
2. **Collision-Free Clean Aliases**:
   - If a tool name is uniquely offered by exactly one upstream server across the entire active registry, the gateway registers both the fully-qualified alias (`inventory__get_stock`) and the clean unnamespaced name (`get_stock`).
   - If two or more upstreams offer the same tool name, the gateway registers *only* the namespaced aliases (`server1__search` and `server2__search`), completely preventing collision and forcing explicit routing.
3. **Internal Reverse Mapping**:
   The `UpstreamManager` maintains an in-memory lookup table mapping every aggregated name back to its parent `upstreamId`, `upstreamSlug`, `originalName`, and `timeoutMs`. Clients never need to understand internal cluster topology.

---

## 5. Security & Isolation Architecture

### 5.1 Authentication & Credential Storage
- **API Keys**: Generated with 256 bits of cryptographic entropy (`mcp_live_<prefix8>_<secret48>`). Stored as modern HMAC-SHA256 hashes (`key_hash`). The raw secret is returned exactly once on creation and is never retained in memory or disk.
- **Constant-Time Verification**: All API key validations evaluate `crypto.timingSafeEqual` against the computed hash to eliminate timing side-channels.
- **Revocation**: Revoking a key immediately marks `revoked_at = CURRENT_TIMESTAMP`. Subsequent MCP requests query this state on the next request and fail immediately.
- **Upstream Credentials**: Managed purely server-side. Upstream tokens and WooCommerce consumer keys/secrets never leave the server process and are masked in all REST API responses.

### 5.2 Server-Side Request Forgery (SSRF) Protection
- `validateUpstreamUrl()` verifies every upstream URL against strict network boundaries:
  - Allowed schemes: `http:`, `https:` only.
  - Reject userinfo credentials (`http://user:pass@host/`).
  - Block loopback (`127.0.0.0/8`, `localhost`, `::1`), link-local/cloud metadata (`169.254.0.0/16`, `169.254.169.254`, `metadata.google.internal`), and private IP literals.
  - Permit configured Kubernetes internal service discovery (`*.svc.cluster.local`, `woocommerce-mcp`, `inventory-mcp`, `shipping-mcp`).
  - Client transport explicitly disables redirect-following (`redirect: 'error'`) to prevent redirect-based SSRF bypass.

### 5.3 Kubernetes Network Isolation
- **Default Deny**: `NetworkPolicy` defaults to denying all ingress within the namespace.
- **Gateway Exclusivity**: `woocommerce-mcp`, `inventory-mcp`, and `shipping-mcp` accept traffic **only** from pods labeled `app: gateway`.
- **Database Isolation**: PostgreSQL accepts traffic only from `gateway`. MariaDB accepts traffic only from `wordpress` and the bootstrap job.

---

## 6. Timeouts, Failure Isolation & Mutation Safety

1. **Failure Isolation**: Upstream tool discovery and routing execute in parallel with isolated per-upstream timeouts (`server.timeoutMs`). If `shipping-mcp` is dead or hangs, it times out and is marked `unreachable` without blocking healthy queries to `woocommerce-mcp` or `inventory-mcp`.
2. **Non-Idempotent Mutation Protection**:
   - `isIdempotent()` identifies read-only tools (`list_*`, `get_*`, `search_*`, `check_*`, `estimate_*`).
   - Read-only operations allow up to 2 attempts with bounded backoff for transient network glitches.
   - State-mutating operations (`create_product`, `update_order_status`) have `maxAttempts = 1` and are **never retried blindly**, preventing duplicate orders, double billing, or corrupted inventory counts.

---

## 7. Database & Persistence Architecture

- **PostgreSQL 16**: Production storage for gateway state (users, hashed API keys, upstream registrations, and audit logs). Supported by an abstraction layer (`DatabaseAdapter`) with an embedded SQLite implementation for local zero-dependency testing.
- **MariaDB 11.4**: Dedicated store database for WordPress and WooCommerce.
- **Persistence (PVCs)**:
  - `postgres-pvc`: Mounted at `/var/lib/postgresql/data` (gateway users, keys, and audit logs persist across pod restarts).
  - `mariadb-pvc`: Mounted at `/var/lib/mysql` (WooCommerce store catalog and order database persist across pod restarts).
  - `wordpress-pvc`: Mounted at `/var/www/html/wp-content` (WordPress plugins, media, and themes persist across pod restarts).

---

## 8. Local (Kind/k3d/Minikube) vs Production (k3s/VPS) Differences

| Concern | Local Development / Kind / k3d | Production / k3s / Cloud VPS |
|---|---|---|
| **Values File** | `infra/helm/urumi-platform/values-local.yaml` | `infra/helm/urumi-platform/values-prod.yaml` |
| **Ingress Controller** | Nginx Ingress (`className: "nginx"`) | Traefik (`className: "traefik"` default in k3s) |
| **Hostnames / Domains** | `store.local.test`, `gateway.local.test` via `/etc/hosts` | Public FQDNs (`store.yourdomain.com`, `gateway.yourdomain.com`) |
| **TLS / SSL** | Disabled or self-signed test certs | Automated Let's Encrypt certificates via `cert-manager` |
| **StorageClass** | Cluster default or `standard` | `local-path` (k3s default) or cloud provisioner (gp3, csi) |
| **Gateway Replicas** | 1 replica | 2 replicas for High Availability |
| **WooCommerce Upstream** | `mockFallback: true` (allows demo without live store) | `mockFallback: false` (strictly enforces live store connectivity) |
| **Secrets Management** | Base values or local `.env` | ExternalSecrets / HashiCorp Vault / SealedSecrets |
