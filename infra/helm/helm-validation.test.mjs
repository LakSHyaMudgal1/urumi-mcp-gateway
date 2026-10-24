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
    'serviceaccount.yaml',
    'networkpolicies.yaml',
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

test('Least-privilege ServiceAccount disables token automount and is attached to workloads', () => {
  const saContent = fs.readFileSync(path.join(TEMPLATES_DIR, 'serviceaccount.yaml'), 'utf8');
  assert.strictEqual(saContent.includes('name: urumi-workload-sa'), true, 'serviceaccount.yaml must define urumi-workload-sa');
  assert.strictEqual(saContent.includes('automountServiceAccountToken: false'), true, 'serviceaccount.yaml must disable automountServiceAccountToken');

  const appWorkloads = [
    'deployment-gateway.yaml',
    'deployment-woocommerce-mcp.yaml',
    'deployment-inventory-mcp.yaml',
    'deployment-shipping-mcp.yaml',
    'deployment-dashboard.yaml'
  ];
  for (const w of appWorkloads) {
    const content = fs.readFileSync(path.join(TEMPLATES_DIR, w), 'utf8');
    assert.strictEqual(content.includes('serviceAccountName: urumi-workload-sa'), true, `${w} must attach urumi-workload-sa`);
  }
});

test('NetworkPolicies strictly isolate MCP upstreams and databases to authorized callers', () => {
  const npContent = fs.readFileSync(path.join(TEMPLATES_DIR, 'networkpolicies.yaml'), 'utf8');
  assert.strictEqual(npContent.includes('name: default-deny-all'), true, 'Must define default deny ingress');
  assert.strictEqual(npContent.includes('name: allow-woocommerce-mcp'), true, 'Must define allow-woocommerce-mcp');
  assert.strictEqual(npContent.includes('name: allow-inventory-mcp'), true, 'Must define allow-inventory-mcp');
  assert.strictEqual(npContent.includes('name: allow-shipping-mcp'), true, 'Must define allow-shipping-mcp');
  assert.strictEqual(npContent.includes('name: allow-mariadb'), true, 'Must define allow-mariadb');
  assert.strictEqual(npContent.includes('name: allow-postgres'), true, 'Must define allow-postgres');
});

test('Multi-store provisioner RBAC is strictly scoped and least-privilege', () => {
  const rbacContent = fs.readFileSync(path.join(TEMPLATES_DIR, 'multistore-rbac.yaml'), 'utf8');
  assert.strictEqual(rbacContent.includes('name: urumi-store-provisioner'), true, 'Must define dedicated store provisioner ServiceAccount');
  assert.strictEqual(rbacContent.includes('name: urumi-store-provisioner-role'), true, 'Must define scoped ClusterRole');
  assert.strictEqual(rbacContent.includes('"namespaces"'), true, 'Must allow store namespace management');
  assert.strictEqual(rbacContent.includes('"networkpolicies"'), true, 'Must allow networkpolicies management in store namespaces');
  assert.strictEqual(rbacContent.includes('"resourcequotas"'), true, 'Must allow resourcequotas management in store namespaces');
  assert.strictEqual(rbacContent.includes('"limitranges"'), true, 'Must allow limitranges management in store namespaces');

  // Verify non-escalation: Must NOT grant cluster-admin or node access
  assert.strictEqual(rbacContent.includes('cluster-admin'), false, 'Must NOT grant unrestricted cluster-admin');
  assert.strictEqual(rbacContent.includes('nodes'), false, 'Must NOT grant node access');
  assert.strictEqual(rbacContent.includes('clusterroles'), false, 'Must NOT grant cluster role mutation');
});

