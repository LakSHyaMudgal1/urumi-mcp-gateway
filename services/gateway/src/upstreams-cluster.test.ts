import test from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

test('Independent Upstream MCP Services Verification: WooCommerce, Inventory, and Shipping', async () => {
  // Dynamically load compiled upstream services without violating rootDir
  // @ts-ignore
  const { createWooCommerceApp } = await import('../../woocommerce-mcp/dist/server.js');
  // @ts-ignore
  const { loadWooCommerceConfig } = await import('../../woocommerce-mcp/dist/config.js');
  // @ts-ignore
  const { createInventoryApp } = await import('../../inventory-mcp/dist/server.js');
  // @ts-ignore
  const { loadInventoryConfig } = await import('../../inventory-mcp/dist/config.js');
  // @ts-ignore
  const { createShippingApp } = await import('../../shipping-mcp/dist/server.js');
  // @ts-ignore
  const { loadShippingConfig } = await import('../../shipping-mcp/dist/config.js');

  // 1. Start Upstream 1: WooCommerce MCP
  const wcAppRes: any = await createWooCommerceApp(
    loadWooCommerceConfig({
      WOOCOMMERCE_STORE_URL: 'http://store.local.test',
      WOOCOMMERCE_MOCK_FALLBACK: 'true'
    })
  );
  const wcServer = http.createServer(wcAppRes.app || wcAppRes);
  await new Promise<void>(res => wcServer.listen(0, '127.0.0.1', res));
  const wcPort = (wcServer.address() as any).port;

  // 2. Start Upstream 2: Inventory MCP
  const invAppRes: any = await createInventoryApp(loadInventoryConfig({}));
  const invServer = http.createServer(invAppRes.app || invAppRes);
  await new Promise<void>(res => invServer.listen(0, '127.0.0.1', res));
  const invPort = (invServer.address() as any).port;

  // 3. Start Upstream 3: Shipping MCP
  const shipAppRes: any = await createShippingApp(loadShippingConfig({}));
  const shipServer = http.createServer(shipAppRes.app || shipAppRes);
  await new Promise<void>(res => shipServer.listen(0, '127.0.0.1', res));
  const shipPort = (shipServer.address() as any).port;

  // Setup official MCP Clients
  const wcTransport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${wcPort}/mcp`));
  const wcClient = new Client({ name: 'gateway-wc-client', version: '1.0' }, { capabilities: {} });

  const invTransport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${invPort}/mcp`));
  const invClient = new Client({ name: 'gateway-inv-client', version: '1.0' }, { capabilities: {} });

  const shipTransport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${shipPort}/mcp`));
  const shipClient = new Client({ name: 'gateway-ship-client', version: '1.0' }, { capabilities: {} });

  try {
    // Connect all three
    await wcClient.connect(wcTransport);
    await invClient.connect(invTransport);
    await shipClient.connect(shipTransport);

    // Verify Upstream 1: WooCommerce Tools
    const wcTools = await wcClient.listTools();
    const wcNames = wcTools.tools.map(t => t.name);
    assert.strictEqual(wcNames.includes('list_products'), true);
    assert.strictEqual(wcNames.includes('list_orders'), true);
    assert.strictEqual(wcNames.includes('get_order'), true);

    const wcCall = await wcClient.callTool({ name: 'list_products', arguments: { per_page: 2 } });
    const wcData = JSON.parse((wcCall as any).content[0].text);
    assert.strictEqual(wcData.count, 2);

    // Verify Upstream 2: Inventory Tools
    const invTools = await invClient.listTools();
    const invNames = invTools.tools.map(t => t.name);
    assert.strictEqual(invNames.includes('get_stock'), true);
    assert.strictEqual(invNames.includes('search_inventory'), true);

    const invCall = await invClient.callTool({ name: 'get_stock', arguments: { sku: 'URUMI-HD-01' } });
    const invData = JSON.parse((invCall as any).content[0].text);
    assert.strictEqual(invData.found, true);
    assert.strictEqual(invData.item.available_quantity, 45);

    // Verify Upstream 3: Shipping Tools
    const shipTools = await shipClient.listTools();
    const shipNames = shipTools.tools.map(t => t.name);
    assert.strictEqual(shipNames.includes('list_shipping_methods'), true);
    assert.strictEqual(shipNames.includes('estimate_shipping'), true);

    const shipCall = await shipClient.callTool({
      name: 'estimate_shipping',
      arguments: { sku: 'URUMI-HD-01', quantity: 1, destination_country: 'US' }
    });
    const shipData = JSON.parse((shipCall as any).content[0].text);
    assert.strictEqual(shipData.sku, 'URUMI-HD-01');
    assert.strictEqual(shipData.disclaimer.includes('SAMPLE DEMO RATES ONLY'), true);

    // 4. Test Fault Isolation: Terminate Inventory Service
    invServer.close();
    await invClient.close().catch(() => {});

    // WooCommerce and Shipping MUST remain completely functional
    const wcCallAfter = await wcClient.callTool({ name: 'list_products', arguments: { per_page: 1 } });
    assert.strictEqual(JSON.parse((wcCallAfter as any).content[0].text).count, 1);

    const shipCallAfter = await shipClient.callTool({
      name: 'list_shipping_methods',
      arguments: { destination_country: 'CA' }
    });
    assert.strictEqual(JSON.parse((shipCallAfter as any).content[0].text).destination_country, 'CA');
  } finally {
    await wcClient.close().catch(() => {});
    await shipClient.close().catch(() => {});
    wcServer.close();
    shipServer.close();
  }
});
