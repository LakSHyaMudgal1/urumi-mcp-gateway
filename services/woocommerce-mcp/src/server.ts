import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import crypto from 'node:crypto';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { WooCommerceConfig } from './config.js';
import { WooCommerceClient } from './client.js';
import { registerWooCommerceHandlers, WOOCOMMERCE_TOOLS } from './tools.js';

interface SessionEntry {
  transport: StreamableHTTPServerTransport;
  server: Server;
  createdAt: number;
}

export function createServerInstance(client: WooCommerceClient): Server {
  const server = new Server(
    {
      name: 'woocommerce-mcp',
      version: '1.0.0'
    },
    {
      capabilities: {
        tools: {
          listChanged: true
        }
      }
    }
  );

  registerWooCommerceHandlers(server, client);
  return server;
}

export async function createWooCommerceApp(config: WooCommerceConfig): Promise<{
  app: Express;
  client: WooCommerceClient;
  sessions: Map<string, SessionEntry>;
}> {
  const app = express();
  const client = new WooCommerceClient(config);
  const sessions = new Map<string, SessionEntry>();

  app.use(cors());
  app.use(express.json());

  // 1. Official Streamable HTTP MCP Endpoint
  app.all('/mcp', async (req: Request, res: Response) => {
    try {
      const sessionId = (req.headers['mcp-session-id'] as string) || (req.query.sessionId as string);

      if (sessionId && sessions.has(sessionId)) {
        const session = sessions.get(sessionId)!;
        await session.transport.handleRequest(req, res, req.body);
        return;
      }

      if (!sessionId && isInitializeRequest(req.body)) {
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => crypto.randomUUID(),
          onsessioninitialized: (newSessionId: string) => {
            sessions.set(newSessionId, {
              transport,
              server: mcpServer,
              createdAt: Date.now()
            });
          }
        });

        transport.onclose = () => {
          const sid = transport.sessionId;
          if (sid && sessions.has(sid)) {
            sessions.delete(sid);
          }
        };

        const mcpServer = createServerInstance(client);
        await mcpServer.connect(transport);
        await transport.handleRequest(req, res, req.body);
        return;
      }

      if (sessionId) {
        res.status(404).json({
          jsonrpc: '2.0',
          error: { code: -32001, message: 'Session not found' },
          id: null
        });
        return;
      }

      res.status(400).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Bad Request: No valid session ID provided' },
        id: null
      });
    } catch (err: any) {
      console.error('[WooCommerce MCP] Request handling error:', err.message);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal MCP transport error' },
          id: null
        });
      }
    }
  });

  // 2. Kubernetes Liveness Probe
  app.get('/healthz', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok', service: 'woocommerce-mcp' });
  });

  // 3. Kubernetes Readiness Probe
  app.get('/readyz', (_req: Request, res: Response) => {
    res.status(200).json({
      status: 'ready',
      service: 'woocommerce-mcp',
      storeUrl: config.WOOCOMMERCE_STORE_URL,
      mockFallback: config.WOOCOMMERCE_MOCK_FALLBACK
    });
  });

  // 4. Health Summary
  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({
      service: 'woocommerce-mcp',
      status: 'healthy',
      uptime: process.uptime(),
      transport: 'StreamableHTTP',
      activeSessions: sessions.size,
      tools: WOOCOMMERCE_TOOLS.map(t => t.name),
      version: '1.0.0'
    });
  });

  return { app, client, sessions };
}
