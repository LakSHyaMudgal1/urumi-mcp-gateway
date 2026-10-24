# Shipping & Fulfillment MCP Server

An independent, internal Model Context Protocol (MCP) server providing shipping method discovery and illustrative cost estimations for the Urumi platform.

Built using the official Model Context Protocol TypeScript SDK (`@modelcontextprotocol/sdk`) with standard **Streamable HTTP transport**.

---

## 1. Architecture & Demo Assumptions

- **Deterministic Rate Engine**:
  - Uses an internal deterministic rate matrix keyed by destination region (Domestic US vs International ISO-3166-1 alpha-2 codes).
  - Calculates package dimensional weights based on known SKU profiles (`URUMI-HD-01`, `DEV-MUG-01`, `K8S-CAP-01`, `CERAMIC-01`, `DESK-MAT-01`, `KEY-CAP-01`).
  - Requires zero third-party carrier credentials or live network availability.
- **Prominent Simulation Disclaimer**:
  - Every quote returned includes an explicit notice:
    > `SAMPLE DEMO RATES ONLY. Illustrative pricing for simulation; not a legally binding carrier commitment.`
- **Kubernetes Isolation**:
  - Deployed as an independent `Deployment` and `ClusterIP` Service on port `4003`.
  - There is **no Ingress resource** exposing this upstream service to external traffic. It is reachable only by the Gateway (`services/gateway`).

---

## 2. Tools Catalog

### Tool 1: `list_shipping_methods`
Discovers available carrier methods, service levels, and estimated transit day ranges for a target destination country.

#### Input Schema
```json
{
  "type": "object",
  "properties": {
    "destination_country": {
      "type": "string",
      "description": "Two-letter ISO 3166-1 alpha-2 destination country code (e.g. 'US', 'CA', 'GB', 'DE')"
    }
  },
  "required": ["destination_country"]
}
```

#### Output Shape (Domestic US)
```json
{
  "destination_country": "US",
  "count": 3,
  "methods": [
    {
      "id": "ground-std",
      "name": "Standard Ground Delivery",
      "carrier": "FedEx Ground",
      "service_level": "standard",
      "estimated_transit_days": "3-5 business days",
      "base_rate_usd": "5.99",
      "per_unit_rate_usd": "1.50",
      "supported_regions": ["US"]
    },
    {
      "id": "air-exp",
      "name": "Express 2-Day Air",
      "carrier": "UPS 2nd Day Air",
      "service_level": "express",
      "estimated_transit_days": "2 business days",
      "base_rate_usd": "12.99",
      "per_unit_rate_usd": "3.00",
      "supported_regions": ["US"]
    },
    {
      "id": "overnight",
      "name": "Priority Overnight",
      "carrier": "FedEx Priority Overnight",
      "service_level": "priority",
      "estimated_transit_days": "1 business day",
      "base_rate_usd": "24.99",
      "per_unit_rate_usd": "5.00",
      "supported_regions": ["US"]
    }
  ],
  "note": "Rates shown are baseline estimates before quantity or dimensional weight adjustments."
}
```

#### Error Behavior
- Missing or malformed country code (e.g. not a 2-letter ISO code): Returns `Tool 'list_shipping_methods' error: Invalid destination_country: '...'. Must be a 2-letter ISO 3166-1 alpha-2 code` with `isError: true`.

---

### Tool 2: `estimate_shipping`
Calculates an illustrative shipping quote based on SKU, quantity, and destination.

#### Input Schema
```json
{
  "type": "object",
  "properties": {
    "sku": {
      "type": "string",
      "description": "Stock Keeping Unit of the item being shipped (e.g. 'URUMI-HD-01')"
    },
    "quantity": {
      "type": "integer",
      "minimum": 1,
      "default": 1,
      "description": "Quantity of items to be shipped"
    },
    "destination_country": {
      "type": "string",
      "description": "Two-letter ISO 3166-1 alpha-2 country code (e.g. 'US', 'GB')"
    },
    "postal_code": {
      "type": "string",
      "description": "Optional destination postal or zip code for routing verification"
    }
  },
  "required": ["sku", "quantity", "destination_country"]
}
```

#### Output Shape
```json
{
  "sku": "URUMI-HD-01",
  "quantity": 2,
  "destination_country": "US",
  "postal_code": "94107",
  "origin_warehouse": "WH-EAST-1 (Columbus, OH)",
  "estimated_package_weight_kg": 1.7,
  "quotes": [
    {
      "method_id": "ground-std",
      "method_name": "Standard Ground Delivery",
      "carrier": "FedEx Ground",
      "service_level": "standard",
      "currency": "USD",
      "estimated_cost": "7.49",
      "estimated_transit_days": "3-5 business days",
      "cutoff_time": "15:00 UTC (same-day dispatch)"
    },
    {
      "method_id": "air-exp",
      "method_name": "Express 2-Day Air",
      "carrier": "UPS 2nd Day Air",
      "service_level": "express",
      "currency": "USD",
      "estimated_cost": "15.99",
      "estimated_transit_days": "2 business days",
      "cutoff_time": "15:00 UTC (same-day dispatch)"
    },
    {
      "method_id": "overnight",
      "method_name": "Priority Overnight",
      "carrier": "FedEx Priority Overnight",
      "service_level": "priority",
      "currency": "USD",
      "estimated_cost": "29.99",
      "estimated_transit_days": "1 business day",
      "cutoff_time": "15:00 UTC (same-day dispatch)"
    }
  ],
  "disclaimer": "SAMPLE DEMO RATES ONLY. Illustrative pricing for simulation; not a legally binding carrier commitment."
}
```

#### Error Behavior
- Missing `sku`: Returns `"Missing required argument 'sku'"`.
- Invalid `quantity` (e.g. `<= 0` or non-integer): Returns `"Invalid 'quantity': '<val>'. Must be a positive integer greater than or equal to 1"`.
- Invalid country code: Returns descriptive validation error.

---

## 3. Sample Carrier Rate Matrix

| Method ID | Method Name | Carrier | Region | Base Rate | Incremental Rate / Unit |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `ground-std` | Standard Ground Delivery | FedEx Ground | Domestic (`US`) | $5.99 | +$1.50 |
| `air-exp` | Express 2-Day Air | UPS 2nd Day Air | Domestic (`US`) | $12.99 | +$3.00 |
| `overnight` | Priority Overnight | FedEx Priority Overnight | Domestic (`US`) | $24.99 | +$5.00 |
| `intl-eco` | International Economy Tracked | DHL Global Mail | International (`*`) | $14.99 | +$4.00 |
| `intl-prio` | International Express Priority | DHL Express Worldwide | International (`*`) | $29.99 | +$8.00 |

---

## 4. Verification

### Automated Tests
Run the test suite:
```bash
npm test -w @urumi/shipping-mcp
```
Validates:
- Health endpoints (`/healthz`, `/readyz`, `/health`)
- Streamable HTTP session handshake (`initialize`)
- `list_shipping_methods` domestic and international routing
- `list_shipping_methods` country code validation
- `estimate_shipping` quote calculations, weight estimation, and disclaimer injection
- `estimate_shipping` input validation errors (quantity, SKU, country)
- Interoperability with official `@modelcontextprotocol/sdk/client` `Client` and `StreamableHTTPClientTransport`
