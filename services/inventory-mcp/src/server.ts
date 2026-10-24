import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import crypto from 'node:crypto';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { InventoryConfig } from './config.js';
import { InventoryStore } from './store.js';
import { registerInventoryHandlers, INVENTORY_TOOLS } from './tools.js';

interface SessionEntry {
  transport: StreamableHTTPServerTransport;
  server: Server;
  createdAt: number;
}

export function createInventoryServerInstance(store: InventoryStore): Server {
  const server = new Server(
    {
      name: 'inventory-mcp',
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

  registerInventoryHandlers(server, store);
  return server;
}

export async function createInventoryApp(config: InventoryConfig): Promise<{
  app: Express;
  store: InventoryStore;
  sessions: Map<string, SessionEntry>;
}> {
  const app = express();
  const store = new InventoryStore();
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

        const mcpServer = createInventoryServerInstance(store);
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
        error: {
          code: -32600,
          message: 'Invalid request: Must send an initialization request or provide a valid mcp-session-id header'
        },
        id: null
      });
    } catch (err: any) {
      console.error('[Inventory MCP] Error handling /mcp request:', err);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal MCP transport error' },
          id: null
        });
      }
    }
  });

  // 2. Liveness Probe
  app.get('/healthz', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok', service: 'inventory-mcp' });
  });

  // 3. Readiness Probe
  app.get('/readyz', (_req: Request, res: Response) => {
    res.status(200).json({
      status: 'ready',
      service: 'inventory-mcp',
      database: 'in-memory-sample-store',
      toolCount: INVENTORY_TOOLS.length
    });
  });

  // 4. Health Summary
  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({
      service: 'inventory-mcp',
      status: 'healthy',
      uptime: process.uptime(),
      tools: INVENTORY_TOOLS.map(t => t.name),
      version: '1.0.0'
    });
  });

  return { app, store, sessions };
}
