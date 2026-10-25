import { QueryClient } from '@tanstack/react-query';

/**
 * Stable, centralized Query Keys for all platform resources.
 */
export const queryKeys = {
  health: ['gateway', 'health'] as const,
  upstreams: ['upstreams', 'list'] as const,
  tools: ['tools', 'list'] as const,
  stores: ['stores', 'list'] as const,
  users: ['users', 'list'] as const,
  keys: ['keys', 'list'] as const,
  auditLogs: (params: Record<string, unknown> = {}) => ['auditLogs', 'list', params] as const
};

/**
 * Enterprise QueryClient configured with non-aggressive polling,
 * smart retry boundaries, and zero toast storms.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 20_000, // 20s freshness window
      gcTime: 5 * 60_000, // 5m cache retention
      refetchOnWindowFocus: false, // Prevent disruptive refetches during operator inspection
      retry: (failureCount, error: any) => {
        // Never retry client authorization, permission, or schema validation failures
        const status = error?.status || error?.statusCode;
        if (status === 400 || status === 401 || status === 403 || status === 404) {
          return false;
        }
        // Retry transient network or 503 failures at most twice
        return failureCount < 2;
      }
    },
    mutations: {
      retry: false
    }
  }
});
