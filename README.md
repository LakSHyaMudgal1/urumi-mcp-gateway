# Urumi MCP Gateway on Kubernetes

Enterprise Model Context Protocol (MCP) gateway platform running inside Kubernetes with an integrated WooCommerce store, deterministic inventory and shipping upstreams, user-attributed chat agent, and role-based administrative dashboard.

---

## 1. Architecture Overview

The Urumi MCP Gateway acts as a secure, aggregating reverse-proxy for internal MCP microservices. Team members access tools either interactively through the embedded dashboard chat agent or externally via official MCP clients (Claude Code, Cursor, MCP Inspector) using personal Gateway API keys.

```mermaid
flowchart TD
    subgraph ClientLayer["External & User Access"]
        Browser["Dashboard Browser UI<br/>(http://gateway.local.test)"]
        ExternalClient["External MCP Client<br/>(Cursor / Claude Code / MCP Inspector)"]
        StoreCustomer["Storefront Customer<br/>(http://store.local.test)"]
    end

    subgraph IngressLayer["Kubernetes Ingress (Port 80/443)"]
        Ingress["Ingress Controller<br/>(Nginx / Traefik)"]
    end

    subgraph PublicServices["Public-Facing Services"]
        DashboardPod["Dashboard Pod (Port 8080)<br/>React 18 + Vite Web UI"]
        WordPressPod["WordPress + WooCommerce (Port 80)<br/>Apache / PHP Storefront"]
    end

    subgraph InternalCore["Internal Core Platform (Strict NetworkIsolation)"]
        GatewayPod["Gateway Pod (Port 4000)<br/>- MCP Client & Server Engine<br/>- REST API & Role RBAC<br/>- Chat Agent Orchestrator<br/>- Redacted Audit Logger"]
        PostgresPod["PostgreSQL 16 (Port 5432)<br/>Gateway State & Hashed Keys<br/>(Persistent PVC)"]
        MariaDBPod["MariaDB 11.4 (Port 3306)<br/>Store Catalog & Orders DB<br/>(Persistent PVC)"]
    end

    subgraph UpstreamMCP["Internal-Only Upstream MCP Services (ClusterIP)"]
        WooMcpPod["WooCommerce MCP (Port 4001)<br/>REST API Client + Mock Store"]
        InvMcpPod["Inventory MCP (Port 4002)<br/>Deterministic Stock Engine"]
        ShipMcpPod["Shipping MCP (Port 4003)<br/>Deterministic Quotes Engine"]
    end

    Browser -->|HTTP / REST| Ingress
    ExternalClient -->|Streamable HTTP /mcp| Ingress
    StoreCustomer -->|HTTP Storefront| Ingress

    Ingress -->|gateway.local.test| DashboardPod
    Ingress -->|gateway.local.test/mcp| GatewayPod
    Ingress -->|gateway.local.test/api| GatewayPod
    Ingress -->|store.local.test| WordPressPod

    DashboardPod -.->|REST API & SSE Chat| GatewayPod
    GatewayPod -->|TCP 5432| PostgresPod
    GatewayPod -->|Streamable HTTP 4001| WooMcpPod
    GatewayPod -->|Streamable HTTP 4002| InvMcpPod
    GatewayPod -->|Streamable HTTP 4003| ShipMcpPod

    WooMcpPod -->|REST API Basic Auth| WordPressPod
    WordPressPod -->|TCP 3306| MariaDBPod
```

---

## 2. Core Security & Resilience Invariants

- **Internal-Only Upstreams**: `woocommerce-mcp`, `inventory-mcp`, and `shipping-mcp` are `ClusterIP` services protected by Kubernetes `NetworkPolicies`. Only the `gateway` pod can communicate with them.
- **Server-Side Credentials**: WooCommerce consumer keys and upstream bearer tokens never leave the server. External clients and browsers never see or forward upstream secrets.
- **Constant-Time Key Hashing**: Only modern HMAC-SHA256 hashes are stored in the database. Validation uses `crypto.timingSafeEqual` to eliminate timing attacks. Raw keys (`mcp_live_...`) are displayed once upon generation.
- **Zero-Latency Revocation & User Suspension**: Every request verifies revocation and active user status in database; revoking a key or disabling a user immediately cuts off active sessions with HTTP 401/403.
- **Dual-Layer Role Permissions**: Members can query products/orders and stock/rates; mutations (`create_product`, `update_order_status`) are restricted to admins. Mutation tools are hidden from member discovery and rejected in code if called directly.
- **SSRF & Redirect Defense**: Upstream registration rejects cloud metadata (`169.254.169.254`), loopbacks, and private IP literals while permitting Kubernetes cluster DNS (`*.svc.cluster.local`). The client transport disallows redirects (`redirect: 'error'`).
- **Prompt-Injection Mitigation**: Upstream tool descriptions are sanitized (control chars and prompt overrides stripped). Permissions are enforced in backend code, never by trusting model instructions.
- **Mutation Safety & Failure Isolation**: State mutations have `maxAttempts = 1` and are never retried blindly. If one upstream server is slow or crashes, it times out and is marked `unreachable` without blocking healthy upstreams.
- **Audit Sanitization**: Every tool call records who/what/when/how long/outcome. All auth headers, API keys, consumer secrets, and customer PII are scrubbed with `[REDACTED]`.

---

## 3. Monorepo Structure

```
urumi-mcp-gateway/
├── apps/
│   └── dashboard/                 # React 18 + TypeScript + Vite web interface
├── services/
│   ├── gateway/                   # MCP gateway, REST admin API, auth, chat agent & audit logger
│   ├── woocommerce-mcp/           # Official Streamable HTTP MCP server for WooCommerce store
│   ├── inventory-mcp/             # Deterministic Inventory MCP service (stock queries)
│   └── shipping-mcp/              # Deterministic Shipping MCP service (rate quotes)
├── packages/
│   └── shared/                    # Shared types, Zod schemas, security utils, SSRF policy
├── infra/
│   └── helm/urumi-platform/       # Single unified Helm chart (templates, values-local & values-prod)
├── scripts/
│   ├── run-acceptance.mjs         # Automated 12-requirement acceptance runner
│   ├── build-images.sh / .ps1     # Docker build & load scripts for local clusters
│   ├── deploy-local.sh / .ps1     # Helm local deployment scripts
│   └── status.sh / .ps1           # Cluster status reporting scripts
└── docs/
    ├── system-design.md           # Architecture, data flows, transport & persistence
    ├── threat-model.md            # Comprehensive threat model, mitigations & remaining risks
    ├── acceptance-checklist.md    # Requirement-by-requirement traceability matrix
    └── demo-script.md             # 5–8 minute live evaluation demo walkthrough
```

---

## 4. Prerequisites & Local Environment Setup

### Required Tools
- **Node.js**: v22+ or v24+ (Node.js 24 recommended, includes native SQLite for zero-dependency local tests).
- **npm**: v10+
- **Docker**: Docker Desktop, Podman, or Rancher Desktop (for container image builds).
- **Kubernetes CLI (`kubectl`)**: v1.28+.
- **Helm**: v3.12+.
- **Local Cluster**: Kind, k3d, or Minikube.

### Local Installation & Build
```bash
# 1. Clone the repository
git clone <repo-url> urumi-mcp-gateway
cd urumi-mcp-gateway

# 2. Install dependencies across all workspaces
npm install

# 3. Build all TypeScript packages and dashboard
npm run build

# 4. Run all unit and integration test suites
npm test

# 5. Run the 12-requirement end-to-end acceptance suite
npm run acceptance
```

---

## 5. Local Cluster Deployment (Kind / Minikube / k3d)

### Step 1: Configure Local Hostnames
Map the local test domains in `/etc/hosts` (macOS/Linux) or `C:\Windows\System32\drivers\etc\hosts` (Windows Administrator):
```text
127.0.0.1 store.local.test gateway.local.test
```

### Step 2: Create a Local Cluster
- **Option A: Using Kind**:
  ```bash
  kind create cluster --name urumi --config - <<EOF
  kind: Cluster
  apiVersion: kind.x-k8s.io/v1alpha4
  nodes:
  - role: control-plane
    extraPortMappings:
    - containerPort: 80
      hostPort: 80
      protocol: TCP
    - containerPort: 443
      hostPort: 443
      protocol: TCP
  EOF

  # Install Nginx Ingress Controller on Kind:
  kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml
  kubectl wait --namespace ingress-nginx --for=condition=ready pod --selector=app.kubernetes.io/component=controller --timeout=180s
  ```
- **Option B: Using Minikube**:
  ```bash
  minikube start --cpus=4 --memory=6144
  minikube addons enable ingress
  minikube addons enable default-storageclass
  ```

### Step 3: Build & Load Container Images
Build the 5 production images and load them into your cluster:
```bash
# On Linux / macOS:
./scripts/build-images.sh kind   # Or 'minikube', 'k3d'

# On Windows PowerShell:
.\scripts\build-images.ps1 -ClusterType kind
```

### Step 4: Deploy with Helm
Install the unified chart using local values:
```bash
helm install urumi ./infra/helm/urumi-platform -f ./infra/helm/urumi-platform/values-local.yaml --create-namespace --namespace urumi
```

### Step 5: Verify Deployment & Bootstrap
Watch all pods reach `Running` and the bootstrap job complete:
```bash
kubectl get pods -n urumi -w
```
Expected pods:
- `mariadb-...` (1/1 Running)
- `postgres-...` (1/1 Running)
- `wordpress-...` (1/1 Running)
- `urumi-platform-wc-bootstrap-...` (Completed 0/1)
- `gateway-...` (1/1 Running)
- `woocommerce-mcp-...` (1/1 Running)
- `inventory-mcp-...` (1/1 Running)
- `shipping-mcp-...` (1/1 Running)
- `dashboard-...` (1/1 Running)

Inspect the WooCommerce bootstrap log:
```bash
kubectl logs -n urumi -l "app=wc-bootstrap"
```
The output confirms WordPress installation, Cash on Delivery activation, sample product creation, and REST API credential injection.

---

## 6. Accessing the Applications & Testing

| Service | URL | Credentials / Notes |
|---|---|---|
| **Dashboard** | `http://gateway.local.test` | Email: `admin@urumi.local`<br>Password: `AdminSecurePassword123!` |
| **Storefront** | `http://store.local.test` | Public WooCommerce catalog & Cash on Delivery checkout |
| **WordPress Admin** | `http://store.local.test/wp-admin` | Username: `admin`<br>Password: `AdminStorePassword123!` |
| **MCP Gateway** | `http://gateway.local.test/mcp` | Streamable HTTP endpoint for Claude Code / Cursor |

### Safe Test Checkout Drill
1. Open `http://store.local.test` in your browser.
2. Select a product (e.g. *Urumi Technical Hoodie*), click **Add to Cart**, and proceed to **Checkout**.
3. Fill out test billing details and select **Cash on delivery**. Click **Place Order**.
4. Log into `http://store.local.test/wp-admin` > **WooCommerce** > **Orders** to see the order in `Processing` status.

---

## 7. Configuring WooCommerce REST API Credentials as a Secret

In production, WooCommerce REST API keys should be generated and stored as a Kubernetes Secret:

```bash
# Generate consumer key/secret in WordPress Admin:
# WooCommerce > Settings > Advanced > REST API > Add Key (Permissions: Read/Write)

# Create the Kubernetes Secret:
kubectl create secret generic woocommerce-api-credentials \
  --namespace urumi \
  --from-literal=WOOCOMMERCE_CONSUMER_KEY="ck_your_generated_consumer_key" \
  --from-literal=WOOCOMMERCE_CONSUMER_SECRET="cs_your_generated_consumer_secret" \
  --dry-run=client -o yaml | kubectl apply -f -
```

`deployment-woocommerce-mcp.yaml` automatically mounts these keys via `secretKeyRef` into environment variables `WOOCOMMERCE_CONSUMER_KEY` and `WOOCOMMERCE_CONSUMER_SECRET`.

---

## 8. Team Administration & API Key Management

### Log In to Dashboard
1. Navigate to `http://gateway.local.test`.
2. Log in with `admin@urumi.local` / `AdminSecurePassword123!`.

### Add Team Members & Assign Roles
1. Go to **Team Members** tab.
2. Click **Add Member**. Specify Name, Email, Password, and Role (`admin` or `member`).
3. Members can use query tools and the chat agent; only admins can create products, update order status, or edit upstream servers.

### Issue & Revoke Gateway API Keys
1. In the **API Keys** table, click **Issue New Key** for a user.
2. The modal displays `mcp_live_<prefix>_<secret>` **exactly once** with a copy action.
3. To revoke access, click **Revoke**. Revocation takes effect immediately on the next request.

### Manage Upstream MCP Servers
1. Go to **Upstream Servers** tab.
2. View status (`Connected`, `Unreachable`, `Disabled`) and tool counts.
3. Click **Add Upstream** to register new internal MCP services. SSRF validation verifies target hostnames and blocks loopback/cloud metadata.
4. Click **Disable** to take an upstream offline. Its tools are immediately stripped from all list queries and direct calls are rejected.

---

## 9. Connecting External MCP Clients

External MCP clients connect exclusively to the central gateway URL (`http://gateway.local.test/mcp`) using an issued Gateway API key. Upstream servers are never called directly.

### Cursor Configuration (`~/.cursor/mcp.json`)
```json
{
  "mcpServers": {
    "urumi-gateway": {
      "url": "http://gateway.local.test/mcp",
      "headers": {
        "Authorization": "Bearer mcp_live_YOUR_GENERATED_API_KEY"
      }
    }
  }
}
```

### Claude Code Configuration (`~/.claude/mcp.json`)
```json
{
  "mcpServers": {
    "urumi-gateway": {
      "url": "http://gateway.local.test/mcp",
      "headers": {
        "Authorization": "Bearer mcp_live_YOUR_GENERATED_API_KEY"
      }
    }
  }
}
```

### Official MCP Inspector
```bash
npx @modelcontextprotocol/inspector http://gateway.local.test/mcp --header "Authorization: Bearer mcp_live_YOUR_GENERATED_API_KEY"
```

---

## 10. Using the Dashboard Chat Agent

1. In the dashboard, navigate to the **Chat Agent** tab.
2. The agent runs strictly under the identity and permissions of your logged-in session.
3. Try sample commands:
   - *“What products are currently in our store?”* (Invokes `woocommerce__list_products`).
   - *“Check stock for SKU-WIDGET-99 and estimate shipping to US postal code 90210”* (Invokes `inventory__get_stock` and `shipping__estimate_shipping` sequentially in one turn).
   - If logged in as Admin: *“Create a product named 'Technical Merino Hoodie' with price 89.99”* (Invokes `woocommerce__create_product`).
   - If logged in as Member: attempting to create a product will report that the tool is restricted to administrators.
4. Expand **Show tool call details** to inspect the transparent execution trace (tool name, parameters, execution duration, and outcome).

---

## 11. Production k3s Deployment (`values-prod.yaml`)

The platform deploys to a production k3s cluster or cloud VPS using the exact same Helm chart by specifying `values-prod.yaml`:

```bash
helm upgrade --install urumi ./infra/helm/urumi-platform \
  -f ./infra/helm/urumi-platform/values-prod.yaml \
  --set domains.storefront="store.yourdomain.com" \
  --set domains.dashboard="gateway.yourdomain.com" \
  --namespace urumi --create-namespace
```

### Key Differences in Production:
- **DNS**: Public FQDNs (`store.yourdomain.com`, `gateway.yourdomain.com`) routed to your VPS public IP.
- **Ingress & TLS**: Uses Traefik (k3s default) and `cert-manager` with Let's Encrypt for automatic TLS certificate renewal (`cert-manager.io/cluster-issuer: "letsencrypt-prod"`).
- **StorageClass**: Uses k3s default `local-path` provisioner for persistent volumes.
- **High Availability**: Gateway, WooCommerce MCP, Inventory MCP, and Shipping MCP scale to `replicaCount: 2`.
- **Live Store Enforcement**: `woocommerceMcp.mockFallback` is set to `false`, requiring a live connection to WordPress.

---

## 12. Troubleshooting & Operations

### Useful Commands
```bash
# View running workloads
kubectl get pods,svc,pvc,ingress -n urumi

# Tail Gateway logs
kubectl logs -n urumi -l "app=gateway" -c gateway -f

# Tail WooCommerce MCP service logs
kubectl logs -n urumi -l "app=woocommerce-mcp" -f

# Check Ingress routing
kubectl describe ingress -n urumi

# Inspect PVC status and volume bindings
kubectl get pvc -n urumi
```

### Upgrade and Rollback
```bash
# Upgrade Helm release with updated values or images
helm upgrade urumi ./infra/helm/urumi-platform -f ./infra/helm/urumi-platform/values-local.yaml -n urumi

# Rollback to previous release revision if needed
helm rollback urumi 1 -n urumi
```

### Complete Teardown & Cleanup
```bash
# Uninstall Helm chart and delete workloads
helm uninstall urumi -n urumi

# Delete PVCs (if wiping persistent data)
kubectl delete pvc --all -n urumi

# Delete Kind cluster (if applicable)
kind delete cluster --name urumi
```
