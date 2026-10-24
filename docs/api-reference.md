# Urumi MCP Gateway API Reference

The Urumi MCP Gateway exposes two primary interfaces:
1. **Unified MCP Endpoint (`/mcp`)**: Stateful Streamable HTTP interface implementing the official Model Context Protocol (MCP) specification for external clients (Claude Code, Cursor, MCP Inspector) and the internal chat agent.
2. **Administration & Team REST API (`/api/*`)**: Secure REST interface for user authentication, team access management, upstream server configuration, API key lifecycle, audit trails, and chat orchestration.

---

## 1. Authentication & Security Model

### Roles
- **`admin`**: Full administrative privileges:
  - Manage upstream MCP servers (add, update, rotate credentials, disable, delete).
  - Manage team members (create, invite, assign roles, disable, revoke access).
  - Manage API keys (view all team keys, generate keys, revoke any key).
  - Inspect audit trails with advanced filtering and pagination.
  - Trigger forced tool cache refreshes.
- **`member`**: Standard team privileges:
  - Connect to the unified MCP endpoint (`/mcp`) using their issued Gateway API key.
  - Use the dashboard chat agent (`/api/chat`).
  - View enabled upstream tools (`/api/tools`).
  - View and revoke only their own API keys (`/api/keys`).
  - View sanitized enabled upstreams.

### Authentication Headers
All protected endpoints require an `Authorization` header containing either:
1. **Session JWT**: `Authorization: Bearer <jwt_token>` (obtained via `POST /api/auth/login`).
2. **Gateway API Key**: `Authorization: Bearer mcp_live_<prefix>_<secret>` (generated via `POST /api/keys`).

### API Key Security Design
- **Key Format**: `mcp_live_<8 hex chars>_<48 hex chars>` (256 bits of CSPRNG entropy).
- **Keyed Hashing**: Raw keys are never stored in the database. Instead, keys are hashed using **HMAC-SHA256** with a server-side pepper secret (`JWT_SECRET`). Even in the event of a database compromise, stored hashes cannot be reversed or brute-forced without possessing the server HMAC key.
- **Single-Display**: The raw key is returned **exactly once** in the response to `POST /api/keys`. Subsequent `GET /api/keys` list calls omit the secret.
- **Immediate Revocation**: Revoking a key sets `revoked_at = CURRENT_TIMESTAMP`. Every subsequent request (including existing active Streamable HTTP sessions) checks revocation status, guaranteeing zero-latency revocation.
- **Metadata**: Tracks `created_at`, `revoked_at`, and `last_used_at` timestamps.

---

## 2. Authentication Endpoints

### `POST /api/auth/login`
Authenticates a user via email and password, issuing a signed JWT token.
- **Rate Limit**: 20 requests / minute per IP.
- **Request Body**:
  ```json
  {
    "email": "alice@urumi.local",
    "password": "AlicePassword123!"
  }
  ```
- **Response `200 OK`**:
  ```json
  {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "usr_9f81a7b3c2d4",
      "email": "alice@urumi.local",
      "name": "Alice Dev",
      "role": "member",
      "status": "active",
      "createdAt": "2026-10-24T12:00:00.000Z"
    }
  }
  ```
- **Errors**: `401 Unauthorized` (invalid credentials), `403 Forbidden` (account disabled).

### `GET /api/auth/me`
Retrieves the profile of the currently authenticated user.
- **Headers**: `Authorization: Bearer <token>`
- **Response `200 OK`**: User profile object.

---

## 3. Team Member Management (`/api/users`)
*Requires `admin` role.*

### `GET /api/users`
Lists all team members registered on the platform.
- **Response `200 OK`**: Array of user records (`id`, `email`, `name`, `role`, `status`, `createdAt`, `updatedAt`).

### `POST /api/users`
Creates or invites a new team member.
- **Rate Limit**: 20 requests / minute.
- **Request Body**:
  ```json
  {
    "email": "bob@urumi.local",
    "name": "Bob Intern",
    "role": "member",
    "password": "InitialSecurePassword123!"
  }
  ```
- **Response `201 Created`**: Created user object.

### `PUT /api/users/:id`
Updates a user's role, name, status, or password.
- **Request Body**:
  ```json
  {
    "role": "admin",
    "status": "disabled"
  }
  ```
- **Response `200 OK`**: Updated user object. Setting `status: "disabled"` immediately blocks logins, rejects active JWT tokens, and invalidates API keys.

### `DELETE /api/users/:id`
Permanently deletes a team member and cascades API key revocations. Administrators cannot delete their own account.
- **Response `200 OK`**: `{ "success": true, "message": "User access revoked and account deleted" }`.

---

## 4. API Key Management (`/api/keys`)

### `GET /api/keys`
Lists API keys:
- **Admin**: Returns all keys across all users, with user attribution (`userEmail`, `userName`).
- **Member**: Returns only keys owned by the authenticated member.
- **Response `200 OK`**: Array of key summaries (`id`, `userId`, `name`, `keyPrefix`, `lastUsedAt`, `createdAt`, `revokedAt`). `rawKey` is omitted.

### `POST /api/keys`
Generates a new cryptographically secure Gateway API key.
- **Rate Limit**: 30 requests / minute.
- **Request Body**:
  ```json
  {
    "name": "Production Workstation Key",
    "userId": "usr_9f81a7b3c2d4" 
  }
  ```
  *(Note: Non-admins cannot specify `userId`; it is strictly locked to their own account).*
- **Response `201 Created`**:
  ```json
  {
    "id": "key_e4b1a8c902d1",
    "userId": "usr_9f81a7b3c2d4",
    "name": "Production Workstation Key",
    "keyPrefix": "mcp_live_e4b1a8c9",
    "lastUsedAt": null,
    "createdAt": "2026-10-24T12:30:00.000Z",
    "revokedAt": null,
    "rawKey": "mcp_live_e4b1a8c9_f8a92b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e"
  }
  ```
  > [!IMPORTANT]
  > `rawKey` is displayed only once upon creation. Store it securely.

### `DELETE /api/keys/:id`
Revokes an API key. Members can only revoke keys they own; admins can revoke any key.
- **Response `200 OK`**: `{ "success": true, "message": "API key revoked immediately" }`.

---

## 5. Upstream MCP Servers (`/api/upstreams`)

### `GET /api/upstreams`
Lists upstream server registrations.
- **Admin**: Returns all servers (enabled and disabled) with masked credentials (`authToken: "********"`, `hasAuthToken: true`).
- **Member**: Returns only enabled servers.
- **Response `200 OK`**: Array of upstream records. Upstream credentials are never returned in plain text.

### `POST /api/upstreams`
*Requires `admin` role.*
Registers a new upstream MCP server. Validates URL against SSRF policy.
- **Request Body**:
  ```json
  {
    "name": "Warehouse Inventory Alpha",
    "slug": "inventory-alpha",
    "url": "http://inventory-mcp:4002/mcp",
    "authToken": "optional-bearer-token-or-secret",
    "enabled": true,
    "timeoutMs": 10000
  }
  ```
- **Response `201 Created`**: Created upstream summary with masked credentials.

### `PUT /api/upstreams/:id`
*Requires `admin` role.*
Updates upstream configuration or rotates credentials.
- **Credential Rotation**:
  - Providing a new string `authToken: "new-secret"` rotates the upstream credential without revealing the previous value.
  - Providing `authToken: null` clears the stored credential.
  - Omitting `authToken` retains the existing credential unchanged.
- **Response `200 OK`**: Updated upstream summary with masked credentials.

### `DELETE /api/upstreams/:id`
*Requires `admin` role.*
Deletes an upstream server record and invalidates the tool cache.
- **Response `200 OK`**: `{ "success": true }`.

---

## 6. Audit Logs (`/api/audit-logs`)
*Requires `admin` role.*

### `GET /api/audit-logs`
Retrieves a paginated and filtered list of tool execution audit events.
- **Query Parameters**:
  - `limit`: Number of records (1-200, default: 50).
  - `offset`: Offset index (default: 0).
  - `userId`: Filter by specific user ID.
  - `upstreamSlug`: Filter by upstream server slug (e.g. `woocommerce`, `inventory`).
  - `toolName`: Filter by tool name (e.g. `get_stock`, `create_product`).
  - `status`: Filter by `'success'` or `'error'`.
  - `startDate`: ISO 8601 start timestamp filter.
  - `endDate`: ISO 8601 end timestamp filter.
- **Response `200 OK`**:
  ```json
  {
    "total": 142,
    "limit": 50,
    "offset": 0,
    "logs": [
      {
        "id": "aud_7c2b1e4f90a1",
        "timestamp": "2026-10-24T12:45:00.000Z",
        "userId": "usr_9f81a7b3c2d4",
        "userEmail": "alice@urumi.local",
        "upstreamId": "srv_3f8a9b2c1d0e",
        "upstreamSlug": "inventory",
        "toolName": "get_stock",
        "durationMs": 48,
        "status": "success",
        "errorMessage": null,
        "parametersSanitized": {
          "sku": "HOODIE-BLU-M"
        },
        "responseSummary": "{\"stock\":42,\"sku\":\"HOODIE-BLU-M\"}"
      }
    ]
  }
  ```

---

## 7. Tool Catalog (`/api/tools`)

### `GET /api/tools`
Lists all aggregated tools from currently enabled upstream servers.
- **Headers**: `Authorization: Bearer <token>`
- **Response `200 OK`**:
  ```json
  {
    "count": 6,
    "tools": [
      {
        "name": "get_stock",
        "originalName": "get_stock",
        "upstreamSlug": "inventory",
        "description": "Check stock quantity for an item by SKU",
        "inputSchema": {
          "type": "object",
          "properties": { "sku": { "type": "string" } },
          "required": ["sku"]
        }
      }
    ]
  }
  ```

### `POST /api/tools/refresh`
*Requires `admin` role.*
Forces immediate cache invalidation and rediscovery across all enabled upstream servers.
- **Response `200 OK`**: `{ "message": "Tools refreshed", "count": 6, "tools": [...] }`.

---

## 8. Dashboard Chat Agent (`/api/chat`)

### `POST /api/chat`
Interacts with the Gateway assistant to discover tools or execute operations on behalf of the authenticated user.
- **Headers**: `Authorization: Bearer <token>`
- **Request Body**:
  ```json
  {
    "message": "Please get stock for SKU-HOODIE-M",
    "history": []
  }
  ```
- **Response `200 OK`**:
  ```json
  {
    "reply": "Checked stock for SKU-HOODIE-M: {\"sku\":\"HOODIE-BLU-M\",\"stock\":42}",
    "user": {
      "id": "usr_9f81a7b3c2d4",
      "email": "alice@urumi.local",
      "role": "member"
    },
    "toolCalls": [
      {
        "toolName": "inventory__get_stock",
        "arguments": { "sku": "HOODIE-BLU-M" },
        "result": { "content": [{ "type": "text", "text": "{\"stock\":42}" }] }
      }
    ],
    "timestamp": "2026-10-24T12:45:00.000Z"
  }
  ```
  *(Note: All tool calls dispatched through the chat agent are attributed to the authenticated user in the audit logs).*

---

## 9. Unified MCP Protocol Endpoint (`/mcp`)

- **Protocol**: Model Context Protocol (MCP) Streamable HTTP.
- **Path**: `ALL /mcp`
- **Authentication**: `Authorization: Bearer mcp_live_<prefix>_<secret>`
- **Session Tracking**: On session initialization (`initialize`), the server responds with a unique `mcp-session-id` header. Subsequent JSON-RPC requests (`tools/list`, `tools/call`) must provide this header or query parameter `?sessionId=...`.
- **Fault Tolerance**: Upstream failures during `tools/list` are isolated using `Promise.allSettled`. Idempotent read tools are retried once on transient errors; mutating operations (`create_product`) are never retried.
