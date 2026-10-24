import { z } from 'zod';

const InventoryConfigSchema = z.object({
  PORT: z.string().transform(v => parseInt(v, 10)).default('4002'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development')
});

export type InventoryConfig = z.infer<typeof InventoryConfigSchema>;

export function loadInventoryConfig(env: NodeJS.ProcessEnv = process.env): InventoryConfig {
  const result = InventoryConfigSchema.safeParse(env);
  if (!result.success) {
    const issues = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ');
    throw new Error(`Inventory MCP environment configuration error: ${issues}`);
  }
  return result.data;
}
