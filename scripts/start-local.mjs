#!/usr/bin/env node

/**
 * Urumi MCP Gateway Platform - Local Development Orchestrator
 * Starts all MCP microservices, the API gateway, and the React dashboard.
 */

import { spawn, execSync } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

function freePortIfInUse(port) {
  try {
    if (process.platform === 'win32') {
      const output = execSync(`netstat -ano | findstr LISTENING | findstr :${port}`, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore']
      });
      for (const line of output.split('\n')) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && !isNaN(Number(pid)) && Number(pid) !== process.pid) {
          try {
            execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
            console.log(`\x1b[33m[Auto-Recovery] Freed port ${port} from stale PID ${pid}\x1b[0m`);
          } catch {}
        }
      }
    }
  } catch {
    // Port is free
  }
}

// Load environment variables if .env exists
try {
  if (typeof process.loadEnvFile === 'function') {
    process.loadEnvFile(path.join(rootDir, '.env'));
  }
} catch {
  // .env is optional
}

const env = {
  ...process.env,
  PORT: process.env.PORT || '4000',
  NODE_ENV: process.env.NODE_ENV || 'development',
  DATABASE_URL: process.env.DATABASE_URL || 'sqlite://./gateway.db',
  WOOCOMMERCE_MCP_URL: process.env.WOOCOMMERCE_MCP_URL || 'http://127.0.0.1:4001/mcp',
  INVENTORY_MCP_URL: process.env.INVENTORY_MCP_URL || 'http://127.0.0.1:4002/mcp',
  SHIPPING_MCP_URL: process.env.SHIPPING_MCP_URL || 'http://127.0.0.1:4003/mcp',
  WOOCOMMERCE_PORT: process.env.WOOCOMMERCE_PORT || '4001',
  INVENTORY_PORT: process.env.INVENTORY_PORT || '4002',
  SHIPPING_PORT: process.env.SHIPPING_PORT || '4003',
  GATEWAY_URL: process.env.GATEWAY_URL || 'http://localhost:4000'
};

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m'
};

const services = [
  {
    name: 'WooCommerce MCP',
    color: colors.magenta,
    port: 4001,
    cmd: 'node',
    args: ['services/woocommerce-mcp/dist/index.js'],
    cwd: rootDir,
    env: { PORT: '4001', WOOCOMMERCE_PORT: '4001' },
    healthUrl: 'http://127.0.0.1:4001/health'
  },
  {
    name: 'Inventory MCP',
    color: colors.yellow,
    port: 4002,
    cmd: 'node',
    args: ['services/inventory-mcp/dist/index.js'],
    cwd: rootDir,
    env: { PORT: '4002', INVENTORY_PORT: '4002' },
    healthUrl: 'http://127.0.0.1:4002/health'
  },
  {
    name: 'Shipping MCP',
    color: colors.cyan,
    port: 4003,
    cmd: 'node',
    args: ['services/shipping-mcp/dist/index.js'],
    cwd: rootDir,
    env: { PORT: '4003', SHIPPING_PORT: '4003' },
    healthUrl: 'http://127.0.0.1:4003/health'
  },
  {
    name: 'Gateway Server',
    color: colors.blue,
    port: 4000,
    cmd: 'node',
    args: ['services/gateway/dist/index.js'],
    cwd: rootDir,
    env: { PORT: '4000' },
    healthUrl: 'http://127.0.0.1:4000/health'
  },
  {
    name: 'Dashboard UI',
    color: colors.green,
    port: 3000,
    cmd: 'npm',
    args: ['run', 'dev', '--workspace=@urumi/dashboard'],
    cwd: rootDir,
    env: { PORT: '3000' }
  }
];

const children = [];

function log(serviceName, color, message) {
  const lines = message.toString().split('\n');
  for (const line of lines) {
    if (line.trim().length > 0) {
      console.log(`${color}[${serviceName}]${colors.reset} ${line}`);
    }
  }
}

function waitForHealth(url, timeoutMs = 15000) {
  const start = Date.now();
  return new Promise((resolve) => {
    const check = () => {
      const req = http.get(url, (res) => {
        if (res.statusCode && res.statusCode < 400) {
          resolve(true);
        } else {
          retry();
        }
      });
      req.on('error', () => retry());
      req.setTimeout(2000, () => {
        req.destroy();
        retry();
      });
    };

    const retry = () => {
      if (Date.now() - start > timeoutMs) {
        resolve(false);
      } else {
        setTimeout(check, 300);
      }
    };

    check();
  });
}

function spawnService(service) {
  return new Promise((resolve) => {
    if (service.port) {
      freePortIfInUse(service.port);
    }
    console.log(`${service.color}▶ Starting ${service.name}...${colors.reset}`);
    const serviceEnv = {
      ...env,
      ...(service.env || {}),
      FORCE_COLOR: '1'
    };
    const proc = spawn(service.cmd, service.args, {
      cwd: service.cwd,
      env: serviceEnv,
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    children.push({ name: service.name, proc });

    proc.stdout.on('data', (data) => log(service.name, service.color, data));
    proc.stderr.on('data', (data) => log(service.name, colors.red, data));

    proc.on('close', (code) => {
      if (code !== 0 && code !== null) {
        console.error(`${colors.red}✖ [${service.name}] Process exited with code ${code}${colors.reset}`);
      }
    });

    resolve(proc);
  });
}

function shutdown() {
  console.log(`\n${colors.yellow}Shutting down all Urumi Platform services...${colors.reset}`);
  for (const { name, proc } of children) {
    try {
      if (process.platform === 'win32' && proc.pid) {
        spawn('taskkill', ['/pid', String(proc.pid), '/f', '/t'], { stdio: 'ignore' });
      } else {
        proc.kill('SIGTERM');
      }
    } catch {
      // Process might already be dead
    }
  }
  setTimeout(() => process.exit(0), 1000);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

async function main() {
  console.log(`${colors.bright}${colors.cyan}================================================================${colors.reset}`);
  console.log(`${colors.bright}  Urumi MCP Gateway Platform - Local Multi-Service Launcher     ${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}================================================================${colors.reset}\n`);

  // 1. Start Upstream MCP services first
  for (const svc of services.slice(0, 3)) {
    await spawnService(svc);
  }

  // Wait for all three upstreams to become healthy
  console.log(`\n${colors.dim}Waiting for MCP Upstreams to initialize...${colors.reset}`);
  await Promise.all([
    waitForHealth('http://127.0.0.1:4001/health'),
    waitForHealth('http://127.0.0.1:4002/health'),
    waitForHealth('http://127.0.0.1:4003/health')
  ]);
  console.log(`${colors.green}✓ All 3 MCP Upstreams are healthy.${colors.reset}\n`);

  // 2. Start Gateway
  const gatewaySvc = services[3];
  await spawnService(gatewaySvc);
  await waitForHealth('http://127.0.0.1:4000/health');
  console.log(`${colors.green}✓ Gateway Server is healthy.${colors.reset}\n`);

  // 3. Start Dashboard UI
  const dashboardSvc = services[4];
  await spawnService(dashboardSvc);

  console.log(`\n${colors.bright}${colors.green}================================================================${colors.reset}`);
  console.log(`${colors.bright}${colors.green}  ★ URUMI MCP GATEWAY PLATFORM IS RUNNING!                     ${colors.reset}`);
  console.log(`${colors.bright}${colors.green}================================================================${colors.reset}`);
  console.log(`
  ${colors.bright}Access Points:${colors.reset}
  - ${colors.green}Dashboard UI:${colors.reset}         http://localhost:3000
  - ${colors.blue}Gateway REST / SSE:${colors.reset}   http://localhost:4000
  - ${colors.blue}MCP Streamable HTTP:${colors.reset}  http://localhost:4000/mcp
  - ${colors.magenta}WooCommerce MCP:${colors.reset}      http://localhost:4001/mcp
  - ${colors.yellow}Inventory MCP:${colors.reset}        http://localhost:4002/mcp
  - ${colors.cyan}Shipping MCP:${colors.reset}         http://localhost:4003/mcp

  ${colors.bright}Default Credentials:${colors.reset}
  - ${colors.white}Email:${colors.reset}    admin@urumi.local
  - ${colors.white}Password:${colors.reset} AdminSecurePassword123!

  ${colors.dim}Press Ctrl+C to stop all services.${colors.reset}
  `);
}

main().catch((err) => {
  console.error('Startup failed:', err);
  shutdown();
});
