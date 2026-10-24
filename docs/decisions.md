# Architecture Decisions & Tradeoffs (ADR)

## ADR 001: Monorepo Structure & Unified Gateway Process

### Context
The platform needs:
1. A single gateway endpoint aggregating multiple upstream MCP servers.
2. An administration REST API for managing users, API keys, upstreams, and audit records.
3. A dashboard chat agent interacting with MCP tools.
4. Three distinct upstream MCP servers (WooCommerce, Inventory, Shipping).
5. A web dashboard for management and chat.

### Decision
We use an npm workspaces monorepo structure:
- `apps/dashboard`: React + TypeScript + Vite.
- `services/gateway`: Combined Express REST API, API key authentication, MCP Streamable HTTP endpoint, upstream client aggregation, audit logging, and chat orchestration.
- `services/woocommerce-mcp`: Dedicated Streamable HTTP MCP server interfacing with the WooCommerce store.
- `services/inventory-mcp`: Dedicated deterministic in-cluster Inventory MCP server.
- `services/shipping-mcp`: Dedicated deterministic in-cluster Shipping MCP server.
- `packages/shared`: Shared types, Zod schemas, security utilities, and SSRF validation.
- `infra/helm/urumi-platform`: Helm charts and configuration.

### Rationale
- **Single Gateway Deployable**: Splitting the REST API and the aggregate MCP gateway into separate microservices would introduce distributed transaction overhead, synchronization latency for upstream state, and redundant authentication layers without operational benefit. Keeping them in a single gateway backend enables atomic key revocation, instant upstream cache invalidation, and unified audit tracking.
- **Dedicated Upstreams**: Isolating WooCommerce, Inventory, and Shipping into separate cluster microservices ensures failure isolation. If WooCommerce or Shipping is degraded or pod-crashed, healthy servers remain fully responsive, and the gateway can isolate failures gracefully.

---

## ADR 002: Transport Layer & MCP Protocol SDK

### Decision
We use the official `@modelcontextprotocol/sdk` and its `StreamableHTTPServerTransport` and `StreamableHTTPClientTransport`.

### Rationale
- The Model Context Protocol specification supports Streamable HTTP (POST for commands, GET with Server-Sent Events for streaming updates).
- Adhering to the official SDK's transport guarantees strict protocol compliance for external clients (Claude Code, Cursor, MCP Inspector) connecting to the gateway.
- Upstream servers implement `StreamableHTTPServerTransport` and the gateway communicates using `StreamableHTTPClientTransport`.

---

## ADR 003: Database Abstraction & Dual-Driver Strategy

### Decision
We implement a database repository pattern supporting:
- **PostgreSQL (`pg`)**: Primary engine for Kubernetes and production environments, backed by PersistentVolumeClaims.
- **SQLite (`node:sqlite`)**: Built-in zero-dependency driver for instant standalone unit/integration tests and local development without requiring external database daemons.

### Rationale
- Enables hermetic, rapid unit and integration testing without spinning up Docker or external database containers.
- Enforces consistent SQL schema and transactional guarantees across environments.
- Clean repository pattern abstracts queries for Users, API Keys, Upstream Servers, and Audit Logs.

---

## ADR 004: Upstream Failure Isolation, Tool Collision Strategy & Execution Lifecycle

### 1. Full Tool-Call Path Architecture

```
[External MCP Client] (e.g., Claude Code, Cursor, MCP Inspector, Chat Agent)
       │
       │ HTTP POST /mcp (Authorization: Bearer mcp_live_...)
       ▼
[Gateway Streamable HTTPServerTransport]
       │
       ├─► Authenticate Request: Query APIKeyRepository & verify SHA-256 hash
       │     └─► If invalid/revoked: Return 401 Unauthorized
       │
       ├─► Initialize Handshake (if new session):
       │     └─► Allocate unique mcp-session-id & instantiate GatewayMcpServer for user
       │
       ├─► Method: "tools/list":
       │     ├─► Check in-memory aggregated tools cache (TTL 30s)
       │     ├─► If expired: Parallel query all enabled upstreams via Promise.allSettled
       │     ├─► Sanitize tool names and apply deterministic collision namespacing
       │     └─► Return aggregated tool definitions to client
       │
       └─► Method: "tools/call":
             ├─► Resolve target tool in Gateway routing table (toolMapping)
             ├─► Verify upstream server is enabled (immediate rejection if disabled)
             ├─► Check idempotency: mutating tools (create_product) => max 1 attempt
             │                     idempotent tools (get_*, list_*) => bounded retry (max 2)
             ├─► Dispatch to upstream via StreamableHTTPClientTransport with timeout
             ├─► Apply server-side credentials (Authorization: Bearer <token>)
             ├─► Receive result or catch timeout/network error
             ├─► Redact sensitive arguments and record audit log in AuditRepository
             └─► Return CallToolResult ({ content, isError }) to caller
```

### 2. Tool Aggregation & Collision Namespacing
- **Namespacing Scheme**: Every tool is deterministically namespaced as `<server-slug>__<tool-name>` (where non-alphanumeric characters in the server slug are sanitized to underscores, e.g., `warehouse-alpha` -> `warehouse_alpha`).
- **Unique vs Colliding Tools**:
  - If a tool name is declared by only one upstream (e.g. `estimate_shipping`), the gateway registers both `estimate_shipping` and `shipping_mcp__estimate_shipping`. This allows clients to use the clean natural name while still supporting explicit routing.
  - If multiple upstreams register the same tool name (e.g. `get_stock` on both `inventory_alpha` and `inventory_beta`), the gateway detects the collision, removes the ambiguous bare name from `tools/list`, and exposes only the namespaced variants: `inventory_alpha__get_stock` and `inventory_beta__get_stock`.
  - Both hyphenated and underscored server slug prefixes are mapped for caller convenience.

### 3. Fault Isolation & Retry Semantics
- **Bounded Tool Discovery**: `tools/list` executes queries across all enabled upstreams concurrently using `Promise.allSettled`. If an upstream times out or crashes:
  - Its status is marked as `unreachable` in the database.
  - An error log is recorded.
  - Healthy upstreams are aggregated and returned without delay.
- **Per-Upstream Timeouts**: Each upstream registration includes a configurable `timeoutMs` (default: 10,000ms). HTTP connections and RPC requests are aborted via `AbortController` if the upstream exceeds this threshold.
- **Idempotency & Safe Retries**:
  - Calls beginning with `get_`, `list_`, `search_`, `find_`, `read_`, `check_` are classified as idempotent. If a transient network glitch occurs, the gateway performs one bounded retry after a 200ms backoff.
  - Mutating operations such as `create_product`, `update_order`, `delete_*` are strictly non-idempotent. They are attempted at most once to prevent duplicate orders, double billing, or duplicate inventory mutations.
- **Disabled Upstream Exclusion**:
  - When an admin toggles `enabled: false` on an upstream, `invalidateCache()` purges the in-memory tool cache.
  - The disabled upstream's tools are immediately omitted from `tools/list`.
  - If an MCP client calls a stale namespaced tool name for a disabled server, the call is rejected immediately with `{ isError: true, content: [{ text: "Upstream server '...' is disabled." }] }` and recorded in the audit log.

### 4. Credential Isolation & Forwarding Prevention
- Gateway API keys authenticate the caller (`Authorization: Bearer mcp_live_...`).
- When the gateway calls upstream MCP servers, it **never** forwards the caller's gateway API key.
- Upstream credentials (e.g. WooCommerce Consumer Key/Secret, static Bearer tokens) are configured in the database or injected via Kubernetes Secrets and attached server-side by `UpstreamManager`.
- Upstream credentials are never exposed in REST API responses (masked with `********`) and never returned in MCP client responses.

---

## ADR 005: SSRF Policy, Validation & Defense-in-Depth

### 1. SSRF Validation Policy
When administrators register or update upstream URLs, `validateUpstreamUrl(url, allowedHosts)` enforces:
1. **Scheme Whitelist**: Only `http:` and `https:` protocols are accepted (`file:`, `gopher:`, `ftp:`, `data:` are rejected).
2. **Credential Stripping**: URLs containing userinfo (`http://user:pass@host/`) are rejected to prevent credential confusion.
3. **Loopback & Localhost Restrictions**: `localhost`, `127.0.0.1`, `::1`, `0.0.0.0`, and all `127.0.0.0/8` subnets are rejected.
4. **Cloud Metadata & Link-Local Protections**: `169.254.169.254`, `169.254.0.0/16`, `fe80::/10`, and `metadata.google.internal` are blocked.
5. **Private Network Address Controls**: RFC 1918 private IP literals (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`) are blocked unless explicitly configured.
6. **Permitted Kubernetes Hostnames**: In-cluster Kubernetes service names (`woocommerce-mcp`, `inventory-mcp`, `shipping-mcp`, `*.svc.cluster.local`, `*.svc`) are explicitly allowed.

### 2. Limitations & Defense-in-Depth
- **DNS Rebinding Limitation**: Application-level URL validation checks the hostname string at registration time. A malicious external DNS server could theoretically resolve a permitted public hostname to an internal IP upon subsequent lookup.
- **Kubernetes Defense-in-Depth**:
  - In production Kubernetes clusters, the platform deploys Kubernetes `NetworkPolicy` objects restricting egress from the Gateway pod exclusively to designated in-cluster MCP namespaces and allowed DNS servers.
  - The Gateway pod runs as a non-root user (`runAsNonRoot: true`, UID 10001) with a read-only root filesystem and `drop: [ALL]` Linux capabilities.

