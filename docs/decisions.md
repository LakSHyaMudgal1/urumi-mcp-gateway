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

## ADR 004: Upstream Failure Isolation & Tool Collision Strategy

### Decision
- **Timeouts**: Every upstream call is wrapped with an `AbortController` bound to the upstream server's configured `timeoutMs` (default 10s).
- **Graceful Aggregation**: During `tools/list`, if an upstream fails or times out, healthy upstream tools are returned, and the failing server's status is updated to `unreachable` in the database.
- **Deterministic Namespacing**: Tool names preserve their native upstream names unless a collision occurs. In case of collision, the tool is namespaced as `<upstream_slug>__<tool_name>` and logged.
