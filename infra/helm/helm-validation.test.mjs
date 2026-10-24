import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

const HELM_DIR = path.resolve('infra/helm/urumi-platform');
const TEMPLATES_DIR = path.join(HELM_DIR, 'templates');

test('Helm Chart.yaml and values files parse as valid YAML', () => {
  const chartYaml = fs.readFileSync(path.join(HELM_DIR, 'Chart.yaml'), 'utf8');
  const chart = YAML.parse(chartYaml);
  assert.strictEqual(chart.name, 'urumi-platform');
  assert.strictEqual(chart.version, '1.0.0');

  const valuesYaml = fs.readFileSync(path.join(HELM_DIR, 'values.yaml'), 'utf8');
  const values = YAML.parse(valuesYaml);
  assert.strictEqual(typeof values.domains.storefront, 'string');
  assert.strictEqual(typeof values.domains.dashboard, 'string');

  const localValuesYaml = fs.readFileSync(path.join(HELM_DIR, 'values-local.yaml'), 'utf8');
  const localValues = YAML.parse(localValuesYaml);
  assert.strictEqual(localValues.global.environment, 'local');
  assert.strictEqual(localValues.domains.storefront, 'store.local.test');

  const prodValuesYaml = fs.readFileSync(path.join(HELM_DIR, 'values-prod.yaml'), 'utf8');
  const prodValues = YAML.parse(prodValuesYaml);
  assert.strictEqual(prodValues.global.environment, 'production');
  assert.strictEqual(prodValues.global.storageClass, 'local-path');
});

test('All required Kubernetes templates exist and define expected workloads', () => {
  const expectedTemplates = [
    '_helpers.tpl',
    'secrets.yaml',
    'pvc.yaml',
    'deployment-mariadb.yaml',
    'deployment-postgres.yaml',
    'deployment-wordpress.yaml',
    'job-bootstrap-woocommerce.yaml',
    'deployment-woocommerce-mcp.yaml',
    'deployment-inventory-mcp.yaml',
    'deployment-shipping-mcp.yaml',
    'deployment-gateway.yaml',
    'deployment-dashboard.yaml',
    'ingress.yaml'
  ];

  for (const t of expectedTemplates) {
    const fullPath = path.join(TEMPLATES_DIR, t);
    assert.strictEqual(fs.existsSync(fullPath), true, `Template file ${t} must exist`);
  }
});

test('Workload templates include readiness probes, liveness probes, and resource constraints', () => {
  const workloads = [
    'deployment-mariadb.yaml',
    'deployment-postgres.yaml',
    'deployment-wordpress.yaml',
    'deployment-woocommerce-mcp.yaml',
    'deployment-inventory-mcp.yaml',
    'deployment-shipping-mcp.yaml',
    'deployment-gateway.yaml',
    'deployment-dashboard.yaml'
  ];

  for (const w of workloads) {
    const content = fs.readFileSync(path.join(TEMPLATES_DIR, w), 'utf8');
    assert.strictEqual(content.includes('readinessProbe:'), true, `${w} must define readinessProbe`);
    assert.strictEqual(content.includes('livenessProbe:'), true, `${w} must define livenessProbe`);
    assert.strictEqual(content.includes('resources:'), true, `${w} must define resources`);
  }
});

test('Upstream MCP services are strictly internal (ClusterIP only, no direct Ingress)', () => {
  const upstreamFiles = [
    'deployment-woocommerce-mcp.yaml',
    'deployment-inventory-mcp.yaml',
    'deployment-shipping-mcp.yaml'
  ];

  for (const f of upstreamFiles) {
    const content = fs.readFileSync(path.join(TEMPLATES_DIR, f), 'utf8');
    assert.strictEqual(content.includes('type: ClusterIP'), true, `${f} must be ClusterIP`);
  }

  const ingressContent = fs.readFileSync(path.join(TEMPLATES_DIR, 'ingress.yaml'), 'utf8');
  assert.strictEqual(ingressContent.includes('woocommerce-mcp'), false, 'Ingress must not route directly to woocommerce-mcp');
  assert.strictEqual(ingressContent.includes('inventory-mcp'), false, 'Ingress must not route directly to inventory-mcp');
  assert.strictEqual(ingressContent.includes('shipping-mcp'), false, 'Ingress must not route directly to shipping-mcp');
  assert.strictEqual(ingressContent.includes('name: wordpress'), true, 'Ingress must route storefront to wordpress');
  assert.strictEqual(ingressContent.includes('name: gateway'), true, 'Ingress must route /mcp and /api to gateway');
  assert.strictEqual(ingressContent.includes('name: dashboard'), true, 'Ingress must route / to dashboard');
});

test('Persistent storage claims exist for WordPress, MariaDB, and PostgreSQL', () => {
  const pvcContent = fs.readFileSync(path.join(TEMPLATES_DIR, 'pvc.yaml'), 'utf8');
  assert.strictEqual(pvcContent.includes('mariadb-pvc'), true, 'pvc.yaml must define mariadb-pvc');
  assert.strictEqual(pvcContent.includes('postgres-pvc'), true, 'pvc.yaml must define postgres-pvc');
  assert.strictEqual(pvcContent.includes('wordpress-pvc'), true, 'pvc.yaml must define wordpress-pvc');
});
