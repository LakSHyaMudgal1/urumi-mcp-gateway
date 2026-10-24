import { User } from '@urumi/shared';

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: LLMToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface LLMToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface LLMToolDefinition {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters: Record<string, unknown>;
  };
}

export interface ToolCallExecutionTrace {
  toolCallId: string;
  toolName: string;
  upstreamSlug: string;
  arguments: Record<string, unknown>;
  result: unknown;
  durationMs: number;
  status: 'success' | 'error';
  errorMessage?: string;
  rawSummary?: string;
}

export interface ChatTurnResult {
  reply: string;
  user: { id: string; email: string; role: string };
  toolCalls: ToolCallExecutionTrace[];
  stepCount: number;
  provider: string;
  model: string;
  isDemoMode: boolean;
  timestamp: string;
}

export interface LLMProvider {
  readonly name: string;
  readonly model: string;
  readonly isDemo: boolean;
  chatCompletion(params: {
    messages: LLMMessage[];
    tools: LLMToolDefinition[];
    maxStepsRemaining: number;
  }): Promise<{
    message: {
      role: 'assistant';
      content?: string | null;
      tool_calls?: LLMToolCall[];
    };
    finishReason?: string;
  }>;
}
