import test from 'node:test';
import assert from 'node:assert';
import { validateUpstreamUrl } from './ssrf.js';

test('SSRF Validator allows configured in-cluster services', () => {
  const allowed = [
    'http://woocommerce-mcp:4001/mcp',
    'http://inventory-mcp:4002/mcp',
    'http://shipping-mcp:4003/mcp',
    'http://inventory-mcp.default.svc.cluster.local:4002/mcp'
  ];

  for (const url of allowed) {
    const res = validateUpstreamUrl(url);
    assert.strictEqual(res.valid, true, `Expected ${url} to be valid, got: ${res.reason}`);
  }
});

test('SSRF Validator blocks localhost, 127.0.0.1, and loopback aliases', () => {
  const blocked = [
    'http://localhost:4001/mcp',
    'http://127.0.0.1:4001/mcp',
    'http://subdomain.localhost:4001/mcp',
    'http://0.0.0.0:8000/mcp'
  ];

  for (const url of blocked) {
    const res = validateUpstreamUrl(url);
    assert.strictEqual(res.valid, false, `Expected ${url} to be blocked`);
  }
});

test('SSRF Validator blocks cloud metadata and link-local addresses', () => {
  const metadataUrls = [
    'http://169.254.169.254/latest/meta-data/',
    'http://metadata.google.internal/computeMetadata/v1/',
    'http://169.254.1.1/secret'
  ];

  for (const url of metadataUrls) {
    const res = validateUpstreamUrl(url);
    assert.strictEqual(res.valid, false, `Expected ${url} to be blocked`);
  }
});

test('SSRF Validator blocks unsafe schemes and credentials in URL', () => {
  const invalidUrls = [
    'gopher://inventory-mcp:4002/',
    'file:///etc/passwd',
    'ftp://upstream/mcp',
    'http://admin:secret@inventory-mcp:4002/mcp'
  ];

  for (const url of invalidUrls) {
    const res = validateUpstreamUrl(url);
    assert.strictEqual(res.valid, false, `Expected ${url} to be blocked`);
  }
});
