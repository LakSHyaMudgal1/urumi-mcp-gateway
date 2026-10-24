import { UserRepository, UpstreamRepository } from './repositories.js';
import { GatewayConfig } from '../config.js';
import { validateUpstreamUrl, DEFAULT_SSRF_CONFIG } from '@urumi/shared';

export async function bootstrapDatabase(
  userRepo: UserRepository,
  upstreamRepo: UpstreamRepository,
  config: GatewayConfig
): Promise<{ adminCreated: boolean; upstreamsCreated: number }> {
  let adminCreated = false;
  let upstreamsCreated = 0;

  // 1. Bootstrap Initial Admin if no users exist
  const existingUsers = await userRepo.listAll();
  const hasAdmin = existingUsers.some(u => u.role === 'admin');

  if (!hasAdmin) {
    await userRepo.create({
      email: config.INITIAL_ADMIN_EMAIL,
      name: config.INITIAL_ADMIN_NAME,
      password: config.INITIAL_ADMIN_PASSWORD,
      role: 'admin'
    });
    adminCreated = true;
  }

  // Bootstrap Demo Member profile for testing
  const hasMember = existingUsers.some(u => u.email === 'alice@urumi.local');
  if (!hasMember) {
    await userRepo.create({
      email: 'alice@urumi.local',
      name: 'Alice Member',
      password: 'AlicePassword123!',
      role: 'member'
    });
  }

  // 2. Bootstrap Initial Required Upstreams
  const requiredUpstreams = [
    {
      name: 'WooCommerce Storefront & Orders',
      slug: 'woocommerce',
      url: config.WOOCOMMERCE_MCP_URL,
      timeoutMs: 15000
    },
    {
      name: 'Warehouse Inventory Management',
      slug: 'inventory',
      url: config.INVENTORY_MCP_URL,
      timeoutMs: 10000
    },
    {
      name: 'Shipping & Fulfillment',
      slug: 'shipping',
      url: config.SHIPPING_MCP_URL,
      timeoutMs: 10000
    }
  ];

  for (const upstream of requiredUpstreams) {
    const existing = await upstreamRepo.findBySlug(upstream.slug);
    if (!existing) {
      // Validate upstream URL against SSRF policy
      const ssrfConfig =
        config.NODE_ENV === 'production'
          ? DEFAULT_SSRF_CONFIG
          : {
              ...DEFAULT_SSRF_CONFIG,
              allowedClusterHostnames: [
                ...(DEFAULT_SSRF_CONFIG.allowedClusterHostnames || []),
                '127.0.0.1',
                'localhost'
              ]
            };
      const ssrfCheck = validateUpstreamUrl(upstream.url, ssrfConfig);
      if (!ssrfCheck.valid) {
        console.warn(`[Bootstrap Warning] Upstream ${upstream.slug} URL failed SSRF validation: ${ssrfCheck.reason}`);
      }

      await upstreamRepo.create({
        name: upstream.name,
        slug: upstream.slug,
        url: upstream.url,
        enabled: true,
        timeoutMs: upstream.timeoutMs
      });
      upstreamsCreated++;
    }
  }

  return { adminCreated, upstreamsCreated };
}
