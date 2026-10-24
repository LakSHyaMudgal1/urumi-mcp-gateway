export type Role = 'admin' | 'member';
export type UserStatus = 'active' | 'disabled';

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  status: UserStatus;
  createdAt: string;
}

export type UpstreamStatus = 'connected' | 'unreachable' | 'disabled';

export interface UpstreamServer {
  id: string;
  name: string;
  slug: string;
  url: string;
  hasAuthToken: boolean;
  authToken?: string | null;
  enabled: boolean;
  status: UpstreamStatus;
  lastCheckedAt?: string | null;
  timeoutMs: number;
  createdAt: string;
  updatedAt: string;
}

export interface ToolDefinition {
  name: string;
  originalName: string;
  upstreamSlug: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

export interface APIKeySummary {
  id: string;
  userId: string;
  name: string;
  keyPrefix: string;
  lastUsedAt: string | null;
  createdAt: string;
  revokedAt: string | null;
  rawKey?: string; // Only present once on creation
  userEmail?: string;
  userName?: string;
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

export interface PaginatedAuditLogs {
  total: number;
  limit: number;
  offset: number;
  logs: AuditLog[];
}

export interface ChatToolCallTrace {
  toolName: string;
  arguments: Record<string, unknown>;
  result?: any;
  error?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  toolCalls?: ChatToolCallTrace[];
}
