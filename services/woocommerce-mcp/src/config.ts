import { z } from 'zod';

const WooCommerceConfigSchema = z.object({
  PORT: z.string().transform(v => parseInt(v, 10)).default('4001'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  WOOCOMMERCE_STORE_URL: z.string().url().default('http://woocommerce.default.svc.cluster.local'),
  WOOCOMMERCE_CONSUMER_KEY: z.string().default('ck_test_key'),
  WOOCOMMERCE_CONSUMER_SECRET: z.string().default('cs_test_secret'),
  WOOCOMMERCE_MOCK_FALLBACK: z.string().transform(v => v === 'true').default('true'),
  WOOCOMMERCE_TIMEZONE: z.string().default('UTC')
});

export type WooCommerceConfig = z.infer<typeof WooCommerceConfigSchema>;

export function loadWooCommerceConfig(env: NodeJS.ProcessEnv = process.env): WooCommerceConfig {
  const result = WooCommerceConfigSchema.safeParse(env);
  if (!result.success) {
    const issues = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ');
    throw new Error(`WooCommerce MCP environment configuration error: ${issues}`);
  }
  return result.data;
}
