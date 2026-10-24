# Custom WooCommerce MCP Server

A dedicated, internally isolated Model Context Protocol (MCP) server providing structured tools for interacting with a WooCommerce storefront and order catalog.

Built from first principles with the official Model Context Protocol TypeScript SDK (`@modelcontextprotocol/sdk`) using standard **Streamable HTTP transport**. This is code we own and maintain; it does not wrap or install any third-party WooCommerce MCP plugins.

---

## 1. Architecture Decisions & Threat Model

### Why the WooCommerce REST API?
1. **Application & Relational Integrity**: Direct SQL queries or mutations against WordPress MySQL/MariaDB risk corrupting post meta, transient caches, stock deduction triggers, tax calculations, and status change side effects. Calling the official WooCommerce REST API (`/wp-json/wc/v3/...`) ensures all WordPress actions, order lifecycle webhooks, stock reductions, and receipt generation hooks fire cleanly.
2. **Minimal Scoped Permissions**: Credentials provisioned for the MCP server ("Urumi MCP Gateway") are granted `read_write` permissions scoped strictly to WooCommerce products and orders. The MCP server has no access to WordPress core administrative settings, plugin installation, PHP execution, database administration, or WordPress user credentials.
3. **Defense-in-Depth Credential Security**: Credentials (`WOOCOMMERCE_CONSUMER_KEY` and `WOOCOMMERCE_CONSUMER_SECRET`) are read strictly server-side from a Kubernetes Secret (`woocommerce-api-credentials`). They are never exposed to browser clients, returned in responses, or forwarded across requests.
4. **Credential Scrubbing & Error Sanitization**: The HTTP client automatically strips any consumer keys, secrets, or Basic Auth tokens from error messages, request logs, and stack traces before returning them to callers.

### Kubernetes Internal Isolation
- **No Public Ingress**: As verified by our Helm templates and automated test suite (`infra/helm/helm-validation.test.mjs`), there is **no Ingress rule** routing traffic to `woocommerce-mcp`.
- **ClusterIP Only**: The service is deployed with `type: ClusterIP` on port `4001` (`http://woocommerce-mcp.default.svc.cluster.local:4001`). It is reachable **only from inside the cluster** by the Gateway service (`services/gateway`).
- **Readiness & Liveness Probes**: Dedicated `/readyz` and `/healthz` endpoints provide Kubernetes container lifecycle monitoring.

---

## 2. MCP Tools Catalog

The server exposes 5 canonical tools (with corresponding `woocommerce_*` prefixed aliases for convenience):
1. `list_products` (alias: `woocommerce_list_products`)
2. `create_product` (alias: `woocommerce_create_product`)
3. `list_orders` (alias: `woocommerce_list_orders`)
4. `get_order` (alias: `woocommerce_get_order`)
5. `update_order_status` (alias: `woocommerce_update_order_status`)

---

### Tool 1: `list_products`
Lists products with bounded pagination, search query matching, status, and SKU filters.

#### Input Schema
```json
{
  "type": "object",
  "properties": {
    "page": { "type": "integer", "minimum": 1, "default": 1, "description": "Page number of results to fetch" },
    "per_page": { "type": "integer", "minimum": 1, "maximum": 50, "default": 10, "description": "Number of products per page (max 50)" },
    "search": { "type": "string", "description": "Search term matching title or description" },
    "status": { "type": "string", "enum": ["any", "draft", "pending", "private", "publish"], "default": "publish", "description": "Product publication status" },
    "sku": { "type": "string", "description": "Filter by exact SKU" }
  }
}
```

#### Output Shape
Returns compact, structured JSON without unnecessary HTML bloat:
```json
{
  "count": 1,
  "products": [
    {
      "id": 101,
      "name": "Urumi Technical Hoodie",
      "slug": "urumi-technical-hoodie",
      "permalink": "http://store.local.test/product/urumi-technical-hoodie",
      "price": "49.99",
      "regular_price": "49.99",
      "sale_price": "",
      "status": "publish",
      "sku": "URUMI-HD-01",
      "manage_stock": true,
      "stock_quantity": 45,
      "stock_status": "instock"
    }
  ]
}
```

#### Error Behavior
- On timeout (>10s): Returns `Tool 'list_products' error: WooCommerce API request timed out after 10000ms` with `isError: true`.
- On connection error: Sanitizes any credentials and returns structured error.
- When `WOOCOMMERCE_MOCK_FALLBACK=true`: Automatically provides deterministic catalog results when the real store is starting up.

#### Example MCP Call
```json
{
  "jsonrpc": "2.0",
  "id": 10,
  "method": "tools/call",
  "params": {
    "name": "list_products",
    "arguments": {
      "search": "hoodie",
      "per_page": 5
    }
  }
}
```

---

### Tool 2: `create_product`
Creates a new product in the WooCommerce catalog with decimal-safe regular price and stock management settings.

#### Input Schema
```json
{
  "type": "object",
  "properties": {
    "name": { "type": "string", "description": "Product title/name" },
    "regular_price": { "type": "string", "description": "Decimal-safe standard regular price (e.g. '29.99')" },
    "description": { "type": "string", "description": "Full product description" },
    "short_description": { "type": "string", "description": "Short summary description" },
    "sku": { "type": "string", "description": "Stock Keeping Unit (SKU)" },
    "manage_stock": { "type": "boolean", "default": false, "description": "Whether inventory stock is managed at product level" },
    "stock_quantity": { "type": "integer", "minimum": 0, "description": "Available stock quantity" },
    "status": { "type": "string", "enum": ["draft", "pending", "private", "publish"], "default": "publish" }
  },
  "required": ["name", "regular_price"]
}
```

#### Output Shape
```json
{
  "message": "Product 'Engineered Ceramic Cup' created successfully",
  "product": {
    "id": 104,
    "name": "Engineered Ceramic Cup",
    "slug": "engineered-ceramic-cup",
    "permalink": "http://store.local.test/product/engineered-ceramic-cup",
    "price": "28.50",
    "regular_price": "28.50",
    "sale_price": "",
    "status": "publish",
    "sku": "CERAMIC-01",
    "manage_stock": true,
    "stock_quantity": 50,
    "stock_status": "instock"
  }
}
```

#### Error Behavior
- Missing `name` or empty string: Returns error `"Product 'name' is required and must be a non-empty string"`.
- Missing or malformed `regular_price` (e.g. negative, not a number): Formats decimal strings decimal-safely to 2 decimal places (`"29.99"`), or rejects malformed numbers before sending payload.
- Invalid status: Rejects values not in `['draft', 'pending', 'private', 'publish']`.
- Invalid `stock_quantity`: Rejects negative numbers or non-integers when `manage_stock` is true.

#### Example MCP Call
```json
{
  "jsonrpc": "2.0",
  "id": 11,
  "method": "tools/call",
  "params": {
    "name": "create_product",
    "arguments": {
      "name": "Engineered Ceramic Cup",
      "regular_price": "28.50",
      "sku": "CERAMIC-01",
      "manage_stock": true,
      "stock_quantity": 50
    }
  }
}
```

---

### Tool 3: `list_orders`
Lists orders with date ranges, status filters, or queries for orders received today in the store's timezone.

#### Input Schema
```json
{
  "type": "object",
  "properties": {
    "page": { "type": "integer", "minimum": 1, "default": 1, "description": "Page number of results" },
    "per_page": { "type": "integer", "minimum": 1, "maximum": 50, "default": 10, "description": "Number of orders per page" },
    "status": {
      "type": "string",
      "enum": ["any", "pending", "processing", "on-hold", "completed", "cancelled", "refunded", "failed"],
      "default": "any",
      "description": "Order status filter"
    },
    "after": { "type": "string", "description": "ISO 8601 date limit for orders placed after" },
    "before": { "type": "string", "description": "ISO 8601 date limit for orders placed before" },
    "today_only": { "type": "boolean", "description": "When true, automatically filters for orders placed today in store timezone" },
    "timezone": { "type": "string", "default": "UTC", "description": "Store timezone (e.g. 'UTC', 'America/New_York')" }
  }
}
```

#### Output Shape (Sanitized, PII-Free)
All customer billing addresses, personal names, phone numbers, and email addresses are omitted to preserve customer privacy.
```json
{
  "count": 1,
  "orders": [
    {
      "id": 5001,
      "status": "processing",
      "currency": "USD",
      "total": "49.99",
      "total_tax": "4.00",
      "shipping_total": "0.00",
      "date_created": "2026-10-24T10:15:00.000Z",
      "date_modified": "2026-10-24T10:15:00.000Z",
      "payment_method_title": "Cash on delivery",
      "customer_id": 12,
      "items": [
        {
          "id": 1,
          "name": "Urumi Technical Hoodie",
          "product_id": 101,
          "sku": "URUMI-HD-01",
          "quantity": 1,
          "subtotal": "49.99",
          "total": "49.99"
        }
      ],
      "shipping_summary": {
        "city": "San Francisco",
        "state": "CA",
        "country": "US",
        "postcode": "94107"
      }
    }
  ]
}
```

#### Error Behavior
- Handles invalid status gracefully.
- Accurately converts the store timezone to calculate midnight when `today_only=true`.

#### Example MCP Call
```json
{
  "jsonrpc": "2.0",
  "id": 12,
  "method": "tools/call",
  "params": {
    "name": "list_orders",
    "arguments": {
      "today_only": true,
      "timezone": "America/New_York",
      "status": "processing"
    }
  }
}
```

---

### Tool 4: `get_order`
Retrieves compact, PII-safe details of a single order by numeric ID.

#### Input Schema
```json
{
  "type": "object",
  "properties": {
    "order_id": { "type": "integer", "minimum": 1, "description": "The unique numeric WooCommerce order ID" }
  },
  "required": ["order_id"]
}
```

#### Output Shape
```json
{
  "id": 5001,
  "status": "processing",
  "currency": "USD",
  "total": "49.99",
  "total_tax": "4.00",
  "shipping_total": "0.00",
  "date_created": "2026-10-24T10:15:00.000Z",
  "date_modified": "2026-10-24T10:15:00.000Z",
  "payment_method_title": "Cash on delivery",
  "customer_id": 12,
  "items": [
    {
      "id": 1,
      "name": "Urumi Technical Hoodie",
      "product_id": 101,
      "sku": "URUMI-HD-01",
      "quantity": 1,
      "subtotal": "49.99",
      "total": "49.99"
    }
  ],
  "shipping_summary": {
    "city": "San Francisco",
    "state": "CA",
    "country": "US",
    "postcode": "94107"
  }
}
```

#### Error Behavior
- Non-existent order: Returns `"Order #<id> not found"` with `isError: true`.
- Invalid ID (e.g. non-numeric, 0, or negative): Returns `"Invalid or missing 'order_id'"`.

#### Example MCP Call
```json
{
  "jsonrpc": "2.0",
  "id": 13,
  "method": "tools/call",
  "params": {
    "name": "get_order",
    "arguments": { "order_id": 5001 }
  }
}
```

---

### Tool 5: `update_order_status`
Transitions an order status (e.g. from `processing` to `completed`).

#### Input Schema
```json
{
  "type": "object",
  "properties": {
    "order_id": { "type": "integer", "minimum": 1, "description": "The unique numeric WooCommerce order ID" },
    "status": {
      "type": "string",
      "enum": ["pending", "processing", "on-hold", "completed", "cancelled", "refunded", "failed"],
      "description": "The new order status"
    }
  },
  "required": ["order_id", "status"]
}
```

#### Output Shape
```json
{
  "id": 5001,
  "status": "completed",
  "previous_status": "processing",
  "date_modified": "2026-10-24T15:20:00.000Z",
  "message": "Order #5001 status successfully updated to 'completed'"
}
```

#### Error Behavior
- Invalid status parameter (e.g. `shipped` instead of WooCommerce `completed`): Returns `"Invalid order status '<val>'. Must be one of: pending, processing, on-hold, completed, cancelled, refunded, failed"`.
- Non-existent order ID: Returns `"Order #<id> not found"`.

#### Example MCP Call
```json
{
  "jsonrpc": "2.0",
  "id": 14,
  "method": "tools/call",
  "params": {
    "name": "update_order_status",
    "arguments": {
      "order_id": 5001,
      "status": "completed"
    }
  }
}
```

---

## 3. Protocol Verification & Streamable HTTP Transport Proof

The server implements the Model Context Protocol Specification via `@modelcontextprotocol/sdk/server/streamableHttp.js`.

### Session Protocol Lifecycle:
1. **Handshake (`initialize`)**: Client sends a POST to `/mcp` with `Accept: application/json, text/event-stream`. The server initializes a new transport session, allocates a UUID `mcp-session-id`, responds with protocol capabilities, and sets the `mcp-session-id` response header.
2. **Session Persistence**: Subsequent requests include the `mcp-session-id: <UUID>` header. The server routes all JSON-RPC calls to the dedicated session transport.
3. **Session Teardown**: Closing the client or sending a teardown terminates the SSE transport.

---

## 4. Verification & Testing

### Automated Unit & Mocked HTTP Tests
Run the test suite directly:
```bash
npm test -w @urumi/woocommerce-mcp
```
The test suite validates:
- Standard HTTP JSON-RPC protocol initialization, tools listing, and tool invocation.
- Client interoperability using the official `@modelcontextprotocol/sdk/client` `Client` and `StreamableHTTPClientTransport`.
- Real HTTP mocked server (`http.createServer`) mimicking the WordPress WooCommerce REST API (`/wp-json/wc/v3/...`), testing:
  - Basic Auth generation (`Basic base64(key:secret)`).
  - Search query strings and pagination.
  - JSON response normalization to compact models.
  - Error propagation and HTTP 404/500 handling.
- Decimal-safe price handling and input validation in `create_product`.
- Timezone-aware date calculations in `list_orders`.
- Credential sanitization (ensuring consumer keys and secrets never leak in exceptions).

### Manual Verification Against a Real Store in Kubernetes
When deployed in Kubernetes with Helm:
1. Verify the bootstrap job completed and created products and orders:
   ```bash
   kubectl get pods -l job-name=bootstrap-woocommerce
   kubectl logs -l job-name=bootstrap-woocommerce
   ```
2. Port-forward the internal WooCommerce MCP service:
   ```bash
   kubectl port-forward svc/woocommerce-mcp 4001:4001
   ```
3. Execute a tool call against the real store using `curl`:
   ```bash
   # Initialize session
   curl -i -X POST http://127.0.0.1:4001/mcp \
     -H "Content-Type: application/json" \
     -H "Accept: application/json, text/event-stream" \
     -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"curl-test","version":"1.0"}}}'

   # Call list_products with session ID returned in mcp-session-id header
   curl -X POST http://127.0.0.1:4001/mcp \
     -H "Content-Type: application/json" \
     -H "Accept: application/json, text/event-stream" \
     -H "mcp-session-id: <SESSION_ID>" \
     -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"list_products","arguments":{"per_page":5}}}'
   ```

### MCP Inspector Verification & Environmental Documentation
To inspect the server using the official MCP Inspector:
```bash
npx @modelcontextprotocol/inspector http://127.0.0.1:4001/mcp
```

**Environmental Status Note**:
In this automated Windows sandbox environment, interactive browser GUI windows cannot be opened by automated agents. To guarantee full protocol compliance, our automated test suite runs the official `@modelcontextprotocol/sdk` client (`StreamableHTTPClientTransport` + `Client`) directly in `src/server.test.ts`. This performs the exact same protocol handshake, tool enumeration, and tool execution calls that the MCP Inspector executes.
