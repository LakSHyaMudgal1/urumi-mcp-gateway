import { z } from 'zod';

const EnvironmentSchema = z.object({
  PORT: z.string().transform(v => parseInt(v, 10)).default('4000'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().default('sqlite://./gateway.db'),
  JWT_SECRET: z.string().min(16).default('urumi-gateway-super-secret-jwt-key-32-chars-long'),
  
  // Initial Admin Bootstrap
  INITIAL_ADMIN_EMAIL: z.string().email().default('admin@urumi.local'),
  INITIAL_ADMIN_PASSWORD: z.string().min(8).default('AdminSecurePassword123!'),
  INITIAL_ADMIN_NAME: z.string().default('Platform Administrator'),

  // Upstream initial definitions
  WOOCOMMERCE_MCP_URL: z.string().url().default('http://woocommerce-mcp:4001/mcp'),
  INVENTORY_MCP_URL: z.string().url().default('http://inventory-mcp:4002/mcp'),
  SHIPPING_MCP_URL: z.string().url().default('http://shipping-mcp:4003/mcp'),

  // Optional LLM Settings
  LLM_PROVIDER: z.enum(['demo', 'mock', 'ollama', 'openai', 'gemini']).default('demo'),
  LLM_API_KEY: z.string().optional(),
  LLM_MODEL: z.string().default('gpt-4o-mini'),
  LLM_BASE_URL: z.string().url().optional(),
  LLM_MAX_STEPS: z.string().transform(v => parseInt(v, 10)).default('5')
});

import crypto from 'node:crypto';

export type GatewayConfig = z.infer<typeof EnvironmentSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): GatewayConfig {
  const isProd = env.NODE_ENV === 'production';
  let adminPassword = env.INITIAL_ADMIN_PASSWORD;

  if (isProd && (!adminPassword || adminPassword === 'AdminSecurePassword123!')) {
    // Never ship a default production password: generate cryptographically secure password
    adminPassword = `Adm_${crypto.randomBytes(16).toString('hex')}!`;
    console.warn('[SECURITY NOTICE] Production initial admin password generated automatically from CSPRNG.');
  }

  const merged = {
    ...env,
    ...(adminPassword ? { INITIAL_ADMIN_PASSWORD: adminPassword } : {})
  };

  const result = EnvironmentSchema.safeParse(merged);
  if (!result.success) {
    const issues = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ');
    throw new Error(`Environment configuration error: ${issues}`);
  }
  return result.data;
}

export const config = loadConfig();
