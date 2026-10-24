import {
  User,
  UpstreamServer,
  ToolDefinition,
  APIKeySummary,
  PaginatedAuditLogs
} from '../types/index.js';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: any
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

class ApiClient {
  private token: string | null = null;
  private onUnauthorizedCallback?: () => void;

  constructor() {
    // Restore session from sessionStorage if available
    try {
      this.token = sessionStorage.getItem('urumi_auth_token');
    } catch {
      this.token = null;
    }
  }

  setToken(token: string | null) {
    this.token = token;
    try {
      if (token) {
        sessionStorage.setItem('urumi_auth_token', token);
      } else {
        sessionStorage.removeItem('urumi_auth_token');
      }
    } catch {}
  }

  getToken(): string | null {
    return this.token;
  }

  onUnauthorized(cb: () => void) {
    this.onUnauthorizedCallback = cb;
  }

  private async request<T = any>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const headers: Record<string, string> = {
      'Accept': 'application/json',
      ...(options.headers as Record<string, string> || {})
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    if (options.body && typeof options.body === 'string') {
      headers['Content-Type'] = 'application/json';
    }

    let res: Response;
    try {
      res = await fetch(endpoint, {
        ...options,
        headers
      });
    } catch (err: any) {
      throw new ApiError(0, `Network error: Unable to reach Gateway backend (${err.message})`);
    }

    if (res.status === 401) {
      this.setToken(null);
      if (this.onUnauthorizedCallback) {
        this.onUnauthorizedCallback();
      }
      const data = await res.json().catch(() => ({}));
      throw new ApiError(401, data.error || 'Session expired or invalid credentials');
    }

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const msg = data.error || data.reason || `Request failed with status ${res.status}`;
      throw new ApiError(res.status, msg, data.issues);
    }

    return (await res.json()) as T;
  }

  // Health
  async getHealth(): Promise<{ status: string; uptime: number; database: string; upstreams: { total: number; enabled: number } }> {
    return this.request('/health');
  }

  // Auth
  async login(email: string, password: string): Promise<{ token: string; user: User }> {
    const data = await this.request<{ token: string; user: User }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    this.setToken(data.token);
    return data;
  }

  async getMe(): Promise<User> {
    return this.request<User>('/api/auth/me');
  }

  // Upstreams
  async getUpstreams(): Promise<UpstreamServer[]> {
    return this.request<UpstreamServer[]>('/api/upstreams');
  }

  async createUpstream(input: {
    name: string;
    slug: string;
    url: string;
    authToken?: string | null;
    enabled?: boolean;
    timeoutMs?: number;
  }): Promise<UpstreamServer> {
    return this.request<UpstreamServer>('/api/upstreams', {
      method: 'POST',
      body: JSON.stringify(input)
    });
  }

  async updateUpstream(
    id: string,
    updates: {
      name?: string;
      url?: string;
      authToken?: string | null;
      enabled?: boolean;
      timeoutMs?: number;
    }
  ): Promise<UpstreamServer> {
    return this.request<UpstreamServer>(`/api/upstreams/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates)
    });
  }

  async deleteUpstream(id: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`/api/upstreams/${id}`, {
      method: 'DELETE'
    });
  }

  // Tools
  async getTools(): Promise<{ count: number; tools: ToolDefinition[] }> {
    return this.request<{ count: number; tools: ToolDefinition[] }>('/api/tools');
  }

  async refreshTools(): Promise<{ message: string; count: number; tools: ToolDefinition[] }> {
    return this.request<{ message: string; count: number; tools: ToolDefinition[] }>('/api/tools/refresh', {
      method: 'POST'
    });
  }

  // Team Members
  async getUsers(): Promise<User[]> {
    return this.request<User[]>('/api/users');
  }

  async createUser(input: {
    name: string;
    email: string;
    role: 'admin' | 'member';
    password: string;
  }): Promise<User> {
    return this.request<User>('/api/users', {
      method: 'POST',
      body: JSON.stringify(input)
    });
  }

  async updateUser(
    id: string,
    updates: {
      name?: string;
      role?: 'admin' | 'member';
      status?: 'active' | 'disabled';
      password?: string;
    }
  ): Promise<User> {
    return this.request<User>(`/api/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates)
    });
  }

  async deleteUser(id: string): Promise<{ success: boolean; message: string }> {
    return this.request<{ success: boolean; message: string }>(`/api/users/${id}`, {
      method: 'DELETE'
    });
  }

  // API Keys
  async getKeys(): Promise<APIKeySummary[]> {
    return this.request<APIKeySummary[]>('/api/keys');
  }

  async createKey(name: string, userId?: string): Promise<APIKeySummary> {
    return this.request<APIKeySummary>('/api/keys', {
      method: 'POST',
      body: JSON.stringify({ name, userId })
    });
  }

  async revokeKey(id: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`/api/keys/${id}`, {
      method: 'DELETE'
    });
  }

  // Audit Logs
  async getAuditLogs(params: {
    limit?: number;
    offset?: number;
    userId?: string;
    upstreamSlug?: string;
    toolName?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<PaginatedAuditLogs> {
    const q = new URLSearchParams();
    if (params.limit) q.set('limit', String(params.limit));
    if (params.offset !== undefined) q.set('offset', String(params.offset));
    if (params.userId) q.set('userId', params.userId);
    if (params.upstreamSlug) q.set('upstreamSlug', params.upstreamSlug);
    if (params.toolName) q.set('toolName', params.toolName);
    if (params.status && params.status !== 'all') q.set('status', params.status);
    if (params.startDate) q.set('startDate', params.startDate);
    if (params.endDate) q.set('endDate', params.endDate);

    return this.request<PaginatedAuditLogs>(`/api/audit-logs?${q.toString()}`);
  }

  // Chat Agent
  async sendChatMessage(
    message: string,
    history: Array<{ role: 'user' | 'assistant'; content: string }> = []
  ): Promise<{
    reply: string;
    user: { id: string; email: string; role: string };
    toolCalls: Array<{
      toolCallId?: string;
      toolName: string;
      upstreamSlug?: string;
      arguments: Record<string, unknown>;
      result: any;
      durationMs?: number;
      status?: 'success' | 'error';
      errorMessage?: string;
    }>;
    stepCount?: number;
    provider?: string;
    model?: string;
    isDemoMode?: boolean;
    timestamp: string;
  }> {
    return this.request('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ message, history })
    });
  }
}

export const api = new ApiClient();
