# Local Development Guide

This guide details how to set up, run, and develop the Urumi MCP Gateway platform locally.

## Prerequisites
- **Node.js**: v22+ or v24+ (Node.js 24 is recommended as it includes native `node:sqlite`).
- **npm**: v10+ or v11+.
- **Git**: v2.40+.

## Installation
From the repository root:
```bash
npm install
```
This installs and links all workspaces (`@urumi/shared`, `@urumi/gateway`, `@urumi/woocommerce-mcp`, `@urumi/inventory-mcp`, `@urumi/shipping-mcp`, `@urumi/dashboard`).

## Environment Setup
Copy the `.env.example` file to create your local `.env`:
```bash
cp .env.example .env
```
Key configuration parameters:
- `PORT=4000`: Gateway HTTP & MCP port.
- `DATABASE_URL=sqlite://./gateway.db`: Database connection string. Supports `postgres://...` for PostgreSQL or `sqlite://...` for SQLite.
- `INITIAL_ADMIN_EMAIL=admin@urumi.local`: Auto-bootstrapped admin email.
- `INITIAL_ADMIN_PASSWORD=AdminSecurePassword123!`: Auto-bootstrapped admin password.
- `WOOCOMMERCE_MCP_URL=http://woocommerce-mcp:4001/mcp`: Internal upstream endpoint.
- `INVENTORY_MCP_URL=http://inventory-mcp:4002/mcp`: Internal upstream endpoint.
- `SHIPPING_MCP_URL=http://shipping-mcp:4003/mcp`: Internal upstream endpoint.

## Running the Services

### 1. Build All Packages
```bash
npm run build
```

### 2. Run Test Suites
```bash
npm test
```
All unit tests and integration tests will execute across:
- `packages/shared`: SSRF protection, API key generation/hashing, audit sanitizer.
- `services/gateway`: Config validation, database migrations, CRUD repositories, health/ready probes.
- `services/woocommerce-mcp`: Store readiness and tool catalog.
- `services/inventory-mcp`: Warehouse inventory readiness and tool catalog.
- `services/shipping-mcp`: Carrier shipping readiness and tool catalog.

### 3. Starting Services in Development Mode
You can start the gateway backend:
```bash
npm start -w services/gateway
```
And start the upstream MCP services in separate terminal tabs:
```bash
npm start -w services/woocommerce-mcp
npm start -w services/inventory-mcp
npm start -w services/shipping-mcp
```
And start the React dashboard:
```bash
npm run dev -w apps/dashboard
```

## Health Probes
- Gateway Liveness: `http://localhost:4000/healthz`
- Gateway Readiness: `http://localhost:4000/readyz`
- Gateway Summary: `http://localhost:4000/health`
- WooCommerce MCP Health: `http://localhost:4001/health`
- Inventory MCP Health: `http://localhost:4002/health`
- Shipping MCP Health: `http://localhost:4003/health`
