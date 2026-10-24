# End-to-End Acceptance & Demo Guide

This guide describes the 9 acceptance verification flows specified for the Urumi MCP Gateway on Kubernetes platform.

## Acceptance Criteria Checklist

### 1. Storefront Checkout Verification
- **Action**: Open the WooCommerce storefront, add an item to cart, complete test checkout (Cash on Delivery / offline test payment).
- **Verification**: Order appears in the WooCommerce administration dashboard with status `processing` or `on-hold`.

### 2. Dashboard Chat Tool Call: Product Creation
- **Action**: Log in as User A on the dashboard chat interface. Instruct the chat agent: *"Create a new product named 'Urumi Technical Hoodie' priced at $49.99 with SKU 'URUMI-HD-01'"*.
- **Verification**: The agent routes the tool call through the gateway to `woocommerce_create_product`. The product immediately appears on the WooCommerce storefront.

### 3. Dashboard Chat Tool Call: Query Orders
- **Action**: Place an order for the newly created product. In dashboard chat, ask: *"Which orders came in today?"*.
- **Verification**: The agent executes `woocommerce_list_orders` through the gateway and returns the matching order ID and details.

### 4. External MCP Client Connectivity
- **Action**: Connect Claude Code, Cursor, or MCP Inspector using the gateway MCP endpoint `http://gateway.local.test/mcp` and User B's raw API key (`Authorization: Bearer mcp_live_...`).
- **Verification**: The external client successfully lists aggregated tools and executes `woocommerce_list_orders`.

### 5. Multi-Server Cross-Tool Workflow
- **Action**: Ask the chat agent or execute an MCP query that checks a WooCommerce product SKU, then checks stock for that SKU in `inventory-mcp`, and estimates shipping cost in `shipping-mcp`.
- **Verification**: Gateway coordinates across multiple distinct upstream servers without cross-contamination.

### 6. Immediate API Key Revocation
- **Action**: In the dashboard, an admin or User B clicks **Revoke** on User B's key.
- **Verification**: The very next request made by User B with that key receives an immediate `401 Unauthorized`.

### 7. Upstream Server Toggle (Disable/Enable)
- **Action**: In the dashboard, toggle the `shipping` upstream to **Disabled**.
- **Verification**: Tools from `shipping` immediately disappear from `tools/list` on both the dashboard chat and external MCP clients.

### 8. Upstream Outage & Fault Isolation
- **Action**: Terminate or kill the `shipping-mcp` pod/process.
- **Verification**: Queries to `woocommerce` and `inventory` continue executing without interruption. The dashboard marks `shipping` as `Unreachable`.

### 9. User-Attributed Audit Logging
- **Action**: Inspect the Audit Log table in the dashboard.
- **Verification**: All tool calls are recorded with the calling user's email, upstream server, tool name, duration in milliseconds, status, and recursively sanitized parameters (no credentials or tokens leaked).
