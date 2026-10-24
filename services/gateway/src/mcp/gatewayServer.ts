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
import { APIKeyRepository, UserRepository } from '../db/repositories.js';
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
    private apiKeyRepo: APIKeyRepository,
    private userRepo?: UserRepository,
    private hmacSecret?: string
  ) {}

  /**
   * Resolves authentication from Authorization header, x-api-key, or apiKey query param.
   * Enforces that the key is valid, unrevoked, and the user account is active.
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

    return await this.apiKeyRepo.validateKey(rawKey, this.hmacSecret);
  }

  /**
   * Creates a dedicated MCP Server instance for an authenticated user session.
   * Tool listing is strictly filtered by the user's role (admin vs member).
   * Tool execution enforces permissions in code.
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

    // 1. Tool Listing: strictly filtered for user role (members see read-only tools only)
    server.setRequestHandler(ListToolsRequestSchema, async () => {
      const tools = await this.upstreamManager.getAggregatedTools(false, user);
      return { tools };
    });

    // 2. Tool Execution: runs under user identity and enforces permissions in code
    server.setRequestHandler(CallToolRequestSchema, async request => {
      const { name, arguments: args = {} } = request.params;
      const result = await this.upstreamManager.executeTool(user, name, args as Record<string, unknown>);
      return result;
    });

    return server;
  }

  /**
   * Handles incoming HTTP requests to `/mcp`.
   * Enforces revocation checks and disabled-user checks on every single request,
   * including within active persistent sessions.
   */
  async handleMcpRequest(req: Request, res: Response): Promise<void> {
    try {
      const sessionId = (req.headers['mcp-session-id'] as string) || (req.query.sessionId as string);

      // 1. Existing Session Check
      if (sessionId && this.sessions.has(sessionId)) {
        const session = this.sessions.get(sessionId)!;

        // Verify key revocation status on every request
        const key = await this.apiKeyRepo.findById(session.keyId);
        let userDisabled = false;

        // Verify user account status on every request
        if (this.userRepo) {
          const freshUser = await this.userRepo.findById(session.user.id);
          if (!freshUser || freshUser.status === 'disabled') {
            userDisabled = true;
          }
        } else if (session.user.status === 'disabled') {
          userDisabled = true;
        }

        if (!key || key.revokedAt !== null || userDisabled) {
          this.sessions.delete(sessionId);
          res.status(403).json({
            jsonrpc: '2.0',
            error: {
              code: -32000,
              message: userDisabled
                ? 'Forbidden: User account has been disabled'
                : 'Unauthorized: Gateway API key has been revoked'
            },
            id: null
          });
          return;
        }

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

      if (auth.user.status === 'disabled') {
        res.status(403).json({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: 'Forbidden: User account has been disabled by an administrator'
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
