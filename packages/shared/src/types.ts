export type Role = 'admin' | 'member';

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  createdAt: string;
  updatedAt: string;
}

export interface APIKey {
  id: string;
  userId: string;
  name: string;
  keyPrefix: string; // First 8 chars for identification, e.g. "mcp_live_ab12cd34"
  keyHash: string;   // SHA-256 hash of secret
  createdAt: string;
  revokedAt: string | null;
}

export interface APIKeySummary {
  id: string;
  userId: string;
  name: string;
  keyPrefix: string;
  createdAt: string;
  revokedAt: string | null;
  rawKey?: string; // Only returned once on creation
}

export type UpstreamStatus = 'connected' | 'unreachable' | 'disabled';

export interface UpstreamServer {
  id: string;
  name: string;
  slug: string;
  url: string;
  authToken?: string | null;
  enabled: boolean;
  status: UpstreamStatus;
  lastCheckedAt?: string | null;
  timeoutMs: number;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  userId: string;
  userEmail: string;
  upstreamId: string;
  upstreamSlug: string;
  toolName: string;
  durationMs: number;
  status: 'success' | 'error';
  errorMessage?: string | null;
  parametersSanitized?: Record<string, unknown> | null;
  responseSummary?: string | null;
}

export interface ToolDefinition {
  name: string;             // Namespaced or resolved tool name
  originalName: string;     // Upstream tool name
  upstreamSlug: string;     // Server slug
  description?: string;
  inputSchema: Record<string, unknown>;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: string;
  toolCalls?: Array<{
    id: string;
    toolName: string;
    arguments: Record<string, unknown>;
    result?: unknown;
    error?: string;
    durationMs?: number;
  }>;
}

export interface ChatSession {
  id: string;
  userId: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}
