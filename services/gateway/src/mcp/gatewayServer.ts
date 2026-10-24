import { Request, Response } from 'express';
import crypto from 'node:crypto';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  isInitializeRequest
} from '@modelcontextprotocol/sdk/types.js';
import { UpstreamManager } from './upstreamManager.js';
import { APIKeyRepository } from '../db/repositories.js';
import { User } from '@urumi/shared';

interface GatewaySessionEntry {
  transport: StreamableHTTPServerTransport;
  server: Server;
  user: User;
  keyId: string;
  createdAt: number;
}

export class GatewayMcpServer {
  private sessions = new Map<string, GatewaySessionEntry>();

  constructor(
    private upstreamManager: UpstreamManager,
    private apiKeyRepo: APIKeyRepository
  ) {}

  /**
   * Resolves authentication from Authorization header or x-api-key.
   */
  async authenticateRequest(req: Request): Promise<{ user: User; keyId: string } | null> {
    const authHeader = req.headers['authorization'] || '';
    let rawKey = '';

    if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      rawKey = authHeader.replace(/^Bearer\s+/i, '').trim();
    } else if (typeof req.headers['x-api-key'] === 'string') {
      rawKey = req.headers['x-api-key'].trim();
    } else if (typeof req.query.apiKey === 'string') {
      rawKey = req.query.apiKey.trim();
    }

    if (!rawKey) {
      return null;
    }

    return await this.apiKeyRepo.validateKey(rawKey);
  }

  /**
   * Creates a dedicated MCP Server instance for an authenticated user session.
   */
  private createServerInstance(user: User): Server {
    const server = new Server(
      {
        name: 'urumi-mcp-gateway',
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

    // 1. Tool Listing
    server.setRequestHandler(ListToolsRequestSchema, async () => {
      const tools = await this.upstreamManager.getAggregatedTools();
      return { tools };
    });

    // 2. Tool Execution
    server.setRequestHandler(CallToolRequestSchema, async request => {
      const { name, arguments: args = {} } = request.params;
      const result = await this.upstreamManager.executeTool(user, name, args as Record<string, unknown>);
      return result;
    });

    return server;
  }

  /**
   * Handles incoming HTTP requests to `/mcp`.
   */
  async handleMcpRequest(req: Request, res: Response): Promise<void> {
    try {
      const sessionId = (req.headers['mcp-session-id'] as string) || (req.query.sessionId as string);

      // 1. Existing Session Check
      if (sessionId && this.sessions.has(sessionId)) {
        const session = this.sessions.get(sessionId)!;
        await session.transport.handleRequest(req, res, req.body);
        return;
      }

      // 2. New Session Initialization: Requires Gateway API Key Authentication
      const auth = await this.authenticateRequest(req);
      if (!auth) {
        res.status(401).json({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: 'Unauthorized: A valid, active Gateway API key is required (Authorization: Bearer mcp_live_...)'
          },
          id: null
        });
        return;
      }

      if (!sessionId && isInitializeRequest(req.body)) {
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => crypto.randomUUID(),
          onsessioninitialized: (newSessionId: string) => {
            this.sessions.set(newSessionId, {
              transport,
              server: mcpServer,
              user: auth.user,
              keyId: auth.keyId,
              createdAt: Date.now()
            });
          }
        });

        transport.onclose = () => {
          const sid = transport.sessionId;
          if (sid && this.sessions.has(sid)) {
            this.sessions.delete(sid);
          }
        };

        const mcpServer = this.createServerInstance(auth.user);
        await mcpServer.connect(transport);
        await transport.handleRequest(req, res, req.body);
        return;
      }

      // 3. Invalid Session
      if (sessionId) {
        res.status(404).json({
          jsonrpc: '2.0',
          error: { code: -32001, message: 'Session not found or expired' },
          id: null
        });
        return;
      }

      res.status(400).json({
        jsonrpc: '2.0',
        error: {
          code: -32600,
          message: 'Invalid request: Must send an initialize request or include a valid mcp-session-id header'
        },
        id: null
      });
    } catch (err: any) {
      console.error('[Gateway MCP] Transport error handling /mcp request:', err);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal Gateway MCP transport error' },
          id: null
        });
      }
    }
  }

  getSessionsCount(): number {
    return this.sessions.size;
  }
}
