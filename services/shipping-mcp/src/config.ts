import { z } from 'zod';

const ShippingConfigSchema = z.object({
  PORT: z.string().transform(v => parseInt(v, 10)).default('4003'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development')
});

export type ShippingConfig = z.infer<typeof ShippingConfigSchema>;

export function loadShippingConfig(env: NodeJS.ProcessEnv = process.env): ShippingConfig {
  const merged = {
    ...env,
    PORT: env.SHIPPING_PORT || env.PORT || '4003'
  };
  const result = ShippingConfigSchema.safeParse(merged);
  if (!result.success) {
    const issues = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ');
    throw new Error(`Shipping MCP environment configuration error: ${issues}`);
  }
  return result.data;
}
