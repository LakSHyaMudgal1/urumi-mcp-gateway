# Urumi MCP Gateway: 5–8 Minute Live Demo Script

This script provides an exact, reproducible walkthrough for evaluators demonstrating all features of the Urumi MCP Gateway platform.

---

## Demo Overview & Schedule (Total: ~7 minutes)

| Time | Segment | Core Concepts Demonstrated |
|---|---|---|
| **0:00 – 1:00** | Architecture & Kubernetes Workloads | Helm chart, 9 workloads, Ingress isolation, PVCs |
| **1:00 – 2:15** | Admin Login, Upstreams & Security | WooCommerce, Inventory, Shipping upstreams, secret masking |
| **2:15 – 3:30** | Team Management & API Key Issuance | User B (Member), single-display key UX, role permissions |
| **3:30 – 4:30** | Chat Agent & WooCommerce Product Creation | User A product creation, store catalog reflection, tool trace |
| **4:30 – 5:30** | External MCP Client & Cross-Upstream Request | Official MCP SDK client, multi-domain tool execution (Inv + Ship) |
| **5:30 – 6:30** | Security Drills: Key Revocation & Server Disable | Zero-latency revocation, disabled server tool removal |
| **6:30 – 7:30** | Failure Isolation (Dead Pod) & Redacted Audit Log | Unreachable upstream handling, caller-attributed scrubbed logs |
| **7:30 – 8:00** | Helm Local-to-VPS Production Story | `values-local.yaml` vs `values-prod.yaml`, k3s differences |

---

## Detailed Step-by-Step Walkthrough

### Part 1: Architecture & Kubernetes Setup (0:00 – 1:00)
1. **Show Cluster Resources**:
   Open a terminal and run:
   ```bash
   kubectl get pods,svc,pvc,ingress
   ```
   **Talking Points**:
   - Point out that all 9 workloads run inside the cluster: `gateway`, `dashboard`, `woocommerce-mcp`, `inventory-mcp`, `shipping-mcp`, `wordpress`, `mariadb`, and `postgres`.
   - Point out that **only** the `storefront` (`store.local.test`) and `dashboard` (`gateway.local.test`) have Ingress routes.
   - Point out that the upstream MCP servers (`woocommerce-mcp`, `inventory-mcp`, `shipping-mcp`) are internal `ClusterIP` services isolated by Kubernetes `NetworkPolicies`.
   - Show PVCs: `wordpress-pvc`, `mariadb-pvc`, and `postgres-pvc` persist all content and database tables across pod restarts.

---

### Part 2: Admin Login & Registered Upstreams (1:00 – 2:15)
1. **Open Dashboard**:
   Navigate in browser to: `http://gateway.local.test` (or `http://localhost:5173` if running local dev).
2. **Log In as Admin**:
   - Email: `admin@urumi.local`
   - Password: `AdminSecurePassword123!`
3. **Inspect Upstream Servers Tab**:
   - Show the 3 registered upstreams:
     - `woocommerce` (Status: **Connected**, Tools: 5)
     - `inventory` (Status: **Connected**, Tools: 2)
     - `shipping` (Status: **Connected**, Tools: 2)
   - Click "Edit" on WooCommerce: show that the URL is visible (`http://woocommerce-mcp:4001/mcp`), but sensitive auth tokens or passwords are never returned in plaintext to the browser.
   - Mention SSRF protection: the gateway verifies all upstream URLs against dangerous metadata (`169.254.169.254`) and disables redirects.

---

### Part 3: Team Members, Role Boundaries & API Key Issuance (2:15 – 3:30)
1. **Navigate to Team Members Tab**:
   - Show the initial admin account (`admin@urumi.local`, Role: `admin`).
   - Click "Add Member":
     - Name: `Alice Member`
     - Email: `alice@urumi.local`
     - Password: `MemberPassword123!`
     - Role: `member`
2. **Issue an API Key for Alice**:
   - In the API Keys section, click "Issue New Key" for Alice with name `Alice Laptop Key`.
   - **Show the Single-Display Modal**: The modal presents `mcp_live_xxxx_yyyy` with a prominent copy button and warning: *"Save this key now. It will never be shown again."*
   - Copy the key to clipboard.
   - Click "I have saved my key": show that the modal closes and the key row displays only the prefix `mcp_live_xxxx...` with last-used and created timestamps.
3. **Show Member Client Setup Tab**:
   - Switch to the "Client Setup" tab.
   - Show the configuration snippet for Cursor / Claude Code / MCP Inspector pointing to `http://gateway.local.test/mcp` with a placeholder `YOUR_GENERATED_API_KEY`. Real credentials are never committed or hardcoded.

---

### Part 4: Chat Agent & Product Creation in WooCommerce (3:30 – 4:30)
1. **Open the Chat Agent Tab**:
   - Ensure logged in as Admin.
   - Submit the message:
     ```
     Create a product named 'Technical Merino Hoodie' with price 89.99
     ```
2. **Inspect the Assistant Output**:
   - The assistant emits a tool call to `woocommerce__create_product` with parameters `{"name": "Technical Merino Hoodie", "price": "89.99"}`.
   - Click "Show tool call details" in the UI to inspect the transparent trace (tool name, parameters, execution duration, and outcome).
3. **Verify Product in Storefront**:
   - Open a new tab to `http://store.local.test` (or `GET /wp-json/wc/v3/products`).
   - Show that *"Technical Merino Hoodie"* now appears in the catalog at $89.99.

---

### Part 5: External MCP Client & Cross-Upstream Query (4:30 – 5:30)
1. **Connect Official MCP Client**:
   Run an MCP client using User B's (Alice's) member key:
   ```bash
   # Query tool catalog as Alice (Member)
   curl -s -X POST http://gateway.local.test/mcp \
     -H "Authorization: Bearer <alice_member_key>" \
     -H "Content-Type: application/json" \
     -d '{"jsonrpc":"2.0","method":"tools/list","params":{},"id":1}' | jq '.result.tools[].name'
   ```
   **Highlight**: Notice that `create_product` and `update_order_status` are **hidden** from Alice's tool list! Alice only sees read-only tools (`list_products`, `list_orders`, `get_stock`, `estimate_shipping`).
2. **Demonstrate Cross-Upstream Multi-Tool Chat**:
   In the Chat tab, ask:
   ```
   Check stock for SKU-WIDGET-99 and estimate shipping to US with postal code 90210
   ```
   **Highlight**:
   - The Gateway executes two sequential tool calls across two independent upstream servers in the same turn:
     1. `inventory__get_stock` on `inventory-mcp` (Available: 42).
     2. `shipping__estimate_shipping` on `shipping-mcp` (Rate: $8.50).
   - Assistant synthesizes a coherent, multi-domain response for the user.

---

### Part 6: Key Revocation & Disabling Upstream Server (5:30 – 6:30)
1. **Immediate Key Revocation Drill**:
   - In Team Members tab, click "Revoke" next to Alice's key.
   - Re-run the curl command using Alice's revoked key:
     ```bash
     curl -s -X POST http://gateway.local.test/mcp \
       -H "Authorization: Bearer <alice_member_key>" \
       -H "Content-Type: application/json" \
       -d '{"jsonrpc":"2.0","method":"tools/list","params":{},"id":2}'
     ```
   - **Result**: Immediate HTTP 401 Unauthorized rejection (`"Unauthorized: Gateway API key has been revoked"`).
2. **Disable Upstream Server Drill**:
   - In Upstream Servers tab, click "Disable" on `Shipping Service`.
   - Refresh the tool catalog: all `shipping__*` tools immediately disappear.
   - Attempt direct execution of `shipping__estimate_shipping`: returns `{ isError: true, text: "Upstream server 'shipping' is disabled." }`.

---

### Part 7: Failure Isolation (Dead Pod) & Redacted Audit Log (6:30 – 7:30)
1. **Kill One Upstream Pod**:
   In terminal, simulate a crash:
   ```bash
   kubectl delete pod -l app=shipping-mcp --now
   ```
   - In Upstream Servers tab, trigger a refresh: Shipping is flagged as **Unreachable** after timeout.
   - Show that WooCommerce and Inventory tools remain 100% active and healthy. The failure of one server never halts the gateway or other tools.
2. **Inspect Audit Logs**:
   - Navigate to the "Audit Logs" tab (Admin only).
   - Show table rows: each action records `User` (User A vs User B), `Upstream`, `Tool Name`, `Duration (ms)`, and `Outcome`.
   - Inspect parameter and error columns: Bearer tokens, consumer secrets, and credit cards are scrubbed with `[REDACTED]`.

---

### Part 8: Helm Local-to-VPS Story & Conclusion (7:30 – 8:00)
1. **Explain Helm Architecture**:
   - Show `infra/helm/urumi-platform/Chart.yaml`.
   - Explain how the exact same chart deploys to Minikube/Kind locally and k3s on a VPS:
     - Local: `helm install urumi ./infra/helm/urumi-platform -f ./infra/helm/urumi-platform/values-local.yaml` (uses Nginx Ingress, local domains, mock fallback).
     - VPS: `helm install urumi ./infra/helm/urumi-platform -f ./infra/helm/urumi-platform/values-prod.yaml` (uses Traefik, `local-path` storageClass, Let's Encrypt TLS cert-manager, 2 gateway replicas, and live store enforcement).
2. **Wrap Up**: Conclude demonstration and open for questions.
