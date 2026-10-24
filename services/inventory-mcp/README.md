# Warehouse Inventory MCP Server

An independent, internal Model Context Protocol (MCP) server providing warehouse inventory lookups and stock availability for the Urumi platform.

Built using the official Model Context Protocol TypeScript SDK (`@modelcontextprotocol/sdk`) with standard **Streamable HTTP transport**.

---

## 1. Architecture & Demo Assumptions

- **Hermetic In-Memory Sample Store**:
  - Operates on a deterministic, in-memory dataset of SKUs mapped to warehouse locations (`WH-EAST-1`, `WH-WEST-2`, `WH-CENTRAL-1`, etc.).
  - Requires zero third-party API dependencies or external network connectivity, ensuring 100% demo availability and reproducibility.
- **SKU Harmonization**:
  - The sample SKUs (`URUMI-HD-01`, `DEV-MUG-01`, `K8S-CAP-01`, `CERAMIC-01`, `DESK-MAT-01`, `KEY-CAP-01`) align with catalog products in the WooCommerce store.
- **Kubernetes Isolation**:
  - Deployed as an independent `Deployment` and `ClusterIP` Service on port `4002`.
  - There is **no Ingress resource** exposing this upstream service to external traffic. It is reachable only by the Gateway (`services/gateway`).

---

## 2. Tools Catalog

### Tool 1: `get_stock`
Retrieves current available stock, reserved stock, warehouse location, and status for a given SKU.

#### Input Schema
```json
{
  "type": "object",
  "properties": {
    "sku": {
      "type": "string",
      "description": "The Stock Keeping Unit (e.g. 'URUMI-HD-01', 'DEV-MUG-01')"
    }
  },
  "required": ["sku"]
}
```

#### Output Shapes
**Found (In Stock)**:
```json
{
  "found": true,
  "sku": "URUMI-HD-01",
  "item": {
    "sku": "URUMI-HD-01",
    "name": "Urumi Technical Hoodie",
    "available_quantity": 45,
    "reserved_quantity": 5,
    "status": "in_stock",
    "warehouse": "WH-EAST-1",
    "reorder_threshold": 10,
    "category": "Apparel",
    "last_counted": "2026-10-24T08:00:00.000Z"
  }
}
```

**Found (Out of Stock)**:
```json
{
  "found": true,
  "sku": "K8S-CAP-01",
  "item": {
    "sku": "K8S-CAP-01",
    "name": "Kubernetes Cluster Cap",
    "available_quantity": 0,
    "reserved_quantity": 0,
    "status": "out_of_stock",
    "warehouse": "WH-CENTRAL-1",
    "reorder_threshold": 15,
    "category": "Apparel",
    "last_counted": "2026-10-24T08:00:00.000Z"
  }
}
```

**Clear Not-Found Result**:
```json
{
  "found": false,
  "sku": "UNKNOWN-999",
  "message": "SKU 'UNKNOWN-999' was not found in the warehouse inventory catalog."
}
```

#### Error Behavior
- Missing or empty `sku`: Returns `Tool 'get_stock' error: Missing required argument 'sku'` with `isError: true`.

---

### Tool 2: `search_inventory`
Performs bounded multi-field searches matching SKU, product name, warehouse code, or category.

#### Input Schema
```json
{
  "type": "object",
  "properties": {
    "query": {
      "type": "string",
      "description": "Search string to match against SKU, product name, or warehouse"
    },
    "limit": {
      "type": "integer",
      "minimum": 1,
      "maximum": 50,
      "default": 10,
      "description": "Maximum number of items to return (max 50)"
    }
  }
}
```

#### Output Shape
```json
{
  "query": "mug",
  "count": 1,
  "total_matches": 1,
  "items": [
    {
      "sku": "DEV-MUG-01",
      "name": "Developer Thermal Mug",
      "available_quantity": 120,
      "reserved_quantity": 12,
      "status": "in_stock",
      "warehouse": "WH-WEST-2",
      "reorder_threshold": 25,
      "category": "Accessories",
      "last_counted": "2026-10-24T08:00:00.000Z"
    }
  ]
}
```

---

## 3. Sample Records

| SKU | Product Name | Available | Reserved | Warehouse | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `URUMI-HD-01` | Urumi Technical Hoodie | 45 | 5 | `WH-EAST-1` | `in_stock` |
| `DEV-MUG-01` | Developer Thermal Mug | 120 | 12 | `WH-WEST-2` | `in_stock` |
| `K8S-CAP-01` | Kubernetes Cluster Cap | 0 | 0 | `WH-CENTRAL-1` | `out_of_stock` |
| `CERAMIC-01` | Engineered Ceramic Cup | 50 | 2 | `WH-EAST-2` | `in_stock` |
| `DESK-MAT-01` | Ultra-wide Desk Mat | 85 | 8 | `WH-WEST-1` | `in_stock` |
| `KEY-CAP-01` | Artisan Mechanical Keycap Set | 8 | 4 | `WH-CENTRAL-2` | `low_stock` |

---

## 4. Verification

### Automated Tests
Run the test suite:
```bash
npm test -w @urumi/inventory-mcp
```
Validates:
- Health endpoints (`/healthz`, `/readyz`, `/health`)
- Streamable HTTP session handshake (`initialize`)
- `get_stock` in-stock, out-of-stock, and clear not-found responses
- `get_stock` input validation errors
- `search_inventory` query matching and bounded limits
- Interoperability with official `@modelcontextprotocol/sdk/client` `Client` and `StreamableHTTPClientTransport`
