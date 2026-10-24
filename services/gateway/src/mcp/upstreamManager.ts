import http from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { UpstreamRepository, AuditRepository } from '../db/repositories.js';
import { UpstreamServer, User, ToolDefinition, sanitizeAuditData } from '@urumi/shared';

export interface ToolMappingEntry {
  aggregatedName: string;
  originalName: string;
  upstreamId: string;
  upstreamSlug: string;
  upstreamName: string;
  upstreamUrl: string;
  timeoutMs: number;
  inputSchema: Record<string, unknown>;
  description?: string;
}

export class UpstreamManager {
  private toolMapping: Map<string, ToolMappingEntry> = new Map();
  private cachedTools: any[] = [];
  private lastRefreshedAt: number = 0;
  private readonly cacheTtlMs: number = 30000; // 30 seconds cache TTL

  constructor(
    private upstreamRepo: UpstreamRepository,
    private auditRepo: AuditRepository
  ) {}

  /**
   * Discovers and aggregates tools from all enabled upstream servers.
   * If a server times out or is unreachable, it is flagged as 'unreachable'
   * without blocking other healthy upstream servers.
   */
  async getAggregatedTools(forceRefresh = false): Promise<any[]> {
    const now = Date.now();
    if (!forceRefresh && this.cachedTools.length > 0 && now - this.lastRefreshedAt < this.cacheTtlMs) {
      return this.cachedTools;
    }

    const enabledServers = await this.upstreamRepo.listEnabled();
    const newMapping = new Map<string, ToolMappingEntry>();

    // Map: originalToolName -> Array<{ server: UpstreamServer, tool: any }>
    const toolOccurrences = new Map<string, Array<{ server: UpstreamServer; tool: any }>>();

    // Fetch tool definitions from all enabled servers in parallel with failure isolation
    await Promise.all(
      enabledServers.map(async server => {
        try {
          const tools = await this.fetchToolsWithTimeout(server);
          await this.upstreamRepo.updateStatus(server.slug, 'connected');

          for (const tool of tools) {
            const list = toolOccurrences.get(tool.name) || [];
            list.push({ server, tool });
            toolOccurrences.set(tool.name, list);
          }
        } catch (err: any) {
          console.warn(`[UpstreamManager] Upstream '${server.slug}' failed tool discovery: ${err.message}`);
          await this.upstreamRepo.updateStatus(server.slug, 'unreachable');
        }
      })
    );

    const aggregatedList: any[] = [];

    // Collision Detection & Namespacing
    for (const [toolName, occurrences] of toolOccurrences.entries()) {
      const isCollision = occurrences.length > 1;

      for (const { server, tool } of occurrences) {
        const sanitizedSlug = server.slug.toLowerCase().replace(/[^a-z0-9]/g, '_');
        const namespacedName = `${sanitizedSlug}__${tool.name}`;

        // 1. Always register the fully-qualified namespaced alias
        const namespacedEntry: ToolMappingEntry = {
          aggregatedName: namespacedName,
          originalName: tool.name,
          upstreamId: server.id,
          upstreamSlug: server.slug,
          upstreamName: server.name,
          upstreamUrl: server.url,
          timeoutMs: server.timeoutMs,
          inputSchema: tool.inputSchema,
          description: tool.description
            ? `[${server.name}] ${tool.description}`
            : `Tool '${tool.name}' from ${server.name}`
        };

        newMapping.set(namespacedName, namespacedEntry);
        if (server.slug !== sanitizedSlug) {
          newMapping.set(`${server.slug}__${tool.name}`, namespacedEntry);
        }
        aggregatedList.push({
          name: namespacedName,
          description: namespacedEntry.description,
          inputSchema: tool.inputSchema
        });

        // 2. If NO collision exists, also expose the clean unnamespaced name
        if (!isCollision) {
          const cleanEntry: ToolMappingEntry = {
            aggregatedName: tool.name,
            originalName: tool.name,
            upstreamId: server.id,
            upstreamSlug: server.slug,
            upstreamName: server.name,
            upstreamUrl: server.url,
            timeoutMs: server.timeoutMs,
            inputSchema: tool.inputSchema,
            description: tool.description
          };

          newMapping.set(tool.name, cleanEntry);
          aggregatedList.push({
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema
          });
        }
      }
    }

    this.toolMapping = newMapping;
    this.cachedTools = aggregatedList;
    this.lastRefreshedAt = Date.now();

    return aggregatedList;
  }

  /**
   * Fetches tool definitions from a single upstream server using Streamable HTTP.
   */
  private async fetchToolsWithTimeout(server: UpstreamServer): Promise<any[]> {
    const url = new URL(server.url);
    const headers: Record<string, string> = {
      'Accept': 'application/json, text/event-stream'
    };

    if (server.authToken) {
      headers['Authorization'] = `Bearer ${server.authToken}`;
    }

    const transport = new StreamableHTTPClientTransport(url, {
      requestInit: { headers }
    });

    const client = new Client(
      { name: 'urumi-gateway-aggregator', version: '1.0.0' },
      { capabilities: {} }
    );

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`Upstream '${server.slug}' timed out after ${server.timeoutMs}ms`)), server.timeoutMs);
    });

    try {
      await Promise.race([client.connect(transport), timeoutPromise]);
      const result = await Promise.race([client.listTools(), timeoutPromise]);
      return result.tools || [];
    } finally {
      await client.close().catch(() => {});
    }
  }

  /**
   * Determines if a tool operation is safe and idempotent (read-only query).
   */
  isIdempotent(toolName: string): boolean {
    const lower = toolName.toLowerCase();
    const readPrefixes = ['list_', 'get_', 'search_', 'check_', 'find_', 'estimate_', 'read_'];
    return readPrefixes.some(prefix => lower.includes(prefix));
  }

  /**
   * Routes a client tool call to the correct upstream server.
   * Enforces server enabled checks, per-upstream timeouts, bounded retries on idempotent calls,
   * credential stripping, and audit logging.
   */
  async executeTool(
    user: User,
    toolName: string,
    args: Record<string, unknown> = {}
  ): Promise<{ content: any[]; isError?: boolean }> {
    const startTime = Date.now();

    // 1. Ensure tools are discovered
    if (this.toolMapping.size === 0 || !this.toolMapping.has(toolName)) {
      await this.getAggregatedTools();
    }

    const mapping = this.toolMapping.get(toolName);
    if (!mapping) {
      const durationMs = Date.now() - startTime;
      const sanitizedParams = sanitizeAuditData(args) as Record<string, unknown>;
      try {
        await this.auditRepo.create({
          userId: user.id,
          userEmail: user.email,
          upstreamId: 'unknown',
          upstreamSlug: 'unknown',
          toolName,
          durationMs,
          status: 'error',
          errorMessage: `Tool '${toolName}' not found or its upstream server is currently disabled.`,
          parametersSanitized: sanitizedParams,
          responseSummary: 'Rejected: Not found'
        });
      } catch {}

      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `Tool '${toolName}' not found or its upstream server is currently disabled.`
          }
        ]
      };
    }

    // 2. Check if upstream is still enabled
    const server = await this.upstreamRepo.findById(mapping.upstreamId);
    if (!server || !server.enabled) {
      const durationMs = Date.now() - startTime;
      const sanitizedParams = sanitizeAuditData(args) as Record<string, unknown>;
      try {
        await this.auditRepo.create({
          userId: user.id,
          userEmail: user.email,
          upstreamId: mapping.upstreamId,
          upstreamSlug: mapping.upstreamSlug,
          toolName: mapping.originalName,
          durationMs,
          status: 'error',
          errorMessage: `Upstream server '${mapping.upstreamSlug}' is disabled.`,
          parametersSanitized: sanitizedParams,
          responseSummary: 'Rejected: Upstream disabled'
        });
      } catch {}

      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `Upstream server '${mapping.upstreamSlug}' is disabled.`
          }
        ]
      };
    }

    const isIdempotent = this.isIdempotent(mapping.originalName);
    let attempts = 0;
    const maxAttempts = isIdempotent ? 2 : 1; // Never retry mutations like create_product
    let lastError: Error | null = null;
    let toolResult: any = null;

    while (attempts < maxAttempts) {
      attempts++;
      try {
        toolResult = await this.invokeUpstreamTool(server, mapping.originalName, args);
        break; // Success!
      } catch (err: any) {
        lastError = err;
        if (attempts < maxAttempts && isIdempotent) {
          // Bounded backoff retry for transient network glitches on idempotent reads
          await new Promise(r => setTimeout(r, 200));
        }
      }
    }

    const durationMs = Date.now() - startTime;
    const isSuccess = !lastError && !toolResult?.isError;
    const sanitizedParams = sanitizeAuditData(args) as Record<string, unknown>;

    // 3. Record Audit Log Entry
    try {
      await this.auditRepo.create({
        userId: user.id,
        userEmail: user.email,
        upstreamId: server.id,
        upstreamSlug: server.slug,
        toolName: mapping.originalName,
        durationMs,
        status: isSuccess ? 'success' : 'error',
        errorMessage: lastError ? lastError.message : (toolResult?.isError ? 'Tool returned error status' : null),
        parametersSanitized: sanitizedParams,
        responseSummary: toolResult
          ? (typeof toolResult.content?.[0]?.text === 'string'
              ? toolResult.content[0].text.slice(0, 300)
              : 'Success')
          : null
      });
    } catch (auditErr: any) {
      console.error('[UpstreamManager] Failed to record audit log:', auditErr);
    }

    if (lastError) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `Upstream error (${server.slug}): ${lastError.message}`
          }
        ]
      };
    }

    return toolResult;
  }

  /**
   * Invokes an upstream tool via official Streamable HTTP transport.
   */
  private async invokeUpstreamTool(
    server: UpstreamServer,
    originalToolName: string,
    args: Record<string, unknown>
  ): Promise<any> {
    const url = new URL(server.url);
    const headers: Record<string, string> = {
      'Accept': 'application/json, text/event-stream'
    };

    if (server.authToken) {
      headers['Authorization'] = `Bearer ${server.authToken}`;
    }

    const transport = new StreamableHTTPClientTransport(url, {
      requestInit: { headers }
    });

    const client = new Client(
      { name: 'urumi-gateway-router', version: '1.0.0' },
      { capabilities: {} }
    );

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(
        () => reject(new Error(`Request to upstream '${server.slug}' timed out after ${server.timeoutMs}ms`)),
        server.timeoutMs
      );
    });

    try {
      await Promise.race([client.connect(transport), timeoutPromise]);
      const result = await Promise.race([
        client.callTool({
          name: originalToolName,
          arguments: args
        }),
        timeoutPromise
      ]);
      return result;
    } finally {
      await client.close().catch(() => {});
    }
  }

  /**
   * Invalidate cached tool mapping to reflect newly enabled/disabled/updated upstreams.
   */
  invalidateCache(): void {
    this.cachedTools = [];
    this.toolMapping.clear();
    this.lastRefreshedAt = 0;
  }

  getMapping(): Map<string, ToolMappingEntry> {
    return this.toolMapping;
  }
}
