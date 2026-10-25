import { ToolDefinition, ChatToolCallTrace } from '../../types/index.js';

export interface ClassifiedError {
  origin: 'gateway' | 'model' | 'upstream';
  title: string;
  message: string;
  canRetry: boolean;
}

/**
 * Classifies whether an error originated from Gateway, Model Provider, or Upstream Server.
 */
export function classifyChatError(err: any, toolCalls?: ChatToolCallTrace[]): ClassifiedError {
  const errMsg = typeof err === 'string' ? err : err?.message || 'Unknown chat error';
  const errLower = errMsg.toLowerCase();

  // 1. Check if tool calls encountered an upstream error
  const failedTool = toolCalls?.find(tc => tc.status === 'error');
  if (failedTool) {
    const upstream = failedTool.upstreamSlug || 'upstream';
    return {
      origin: 'upstream',
      title: `Upstream Failure (${upstream})`,
      message: failedTool.errorMessage || `Tool '${failedTool.toolName}' failed during upstream execution.`,
      canRetry: true
    };
  }

  // 2. Gateway Authorization / Rate Limit / Schema errors
  if (errLower.includes('unauthorized') || errLower.includes('jwt') || errLower.includes('forbidden') || err?.status === 401 || err?.status === 403) {
    return {
      origin: 'gateway',
      title: 'Gateway Authorization Error',
      message: errMsg,
      canRetry: false
    };
  }

  if (errLower.includes('rate limit') || errLower.includes('too many requests') || err?.status === 429) {
    return {
      origin: 'gateway',
      title: 'Gateway Rate Limit Exceeded',
      message: 'Too many chat requests sent in a short window. Please wait before retrying.',
      canRetry: true
    };
  }

  if (errLower.includes('validation') || err?.status === 400) {
    return {
      origin: 'gateway',
      title: 'Gateway Validation Error',
      message: errMsg,
      canRetry: false
    };
  }

  // 3. Model / LLM Provider errors
  if (
    errLower.includes('provider') ||
    errLower.includes('llm') ||
    errLower.includes('openai') ||
    errLower.includes('gemini') ||
    errLower.includes('ollama') ||
    errLower.includes('token') ||
    errLower.includes('model')
  ) {
    return {
      origin: 'model',
      title: 'Model Provider Error',
      message: errMsg,
      canRetry: true
    };
  }

  // Fallback to Gateway Infrastructure error
  return {
    origin: 'gateway',
    title: 'Gateway Orchestration Error',
    message: errMsg,
    canRetry: true
  };
}

/**
 * Safely generates a compact, human-readable summary from tool results without exposing sensitive data.
 */
export function getSafeToolSummary(tc: ChatToolCallTrace): string {
  if (tc.status === 'error') {
    return tc.errorMessage || 'Execution encountered an error';
  }

  if (tc.rawSummary && tc.rawSummary !== 'Execution succeeded') {
    return tc.rawSummary;
  }

  const res = tc.result;
  if (!res) return 'Executed successfully (no output returned)';

  // Handle MCP text content structure
  let data: any = res;
  if (res.content && Array.isArray(res.content) && res.content[0]?.text) {
    try {
      data = JSON.parse(res.content[0].text);
    } catch {
      data = res.content[0].text;
    }
  }

  if (typeof data === 'string') {
    return data.length > 80 ? `${data.slice(0, 77)}...` : data;
  }

  if (Array.isArray(data)) {
    return `Returned ${data.length} item${data.length === 1 ? '' : 's'}`;
  }

  if (typeof data === 'object' && data !== null) {
    if (data.count !== undefined) {
      return `Returned ${data.count} record${data.count === 1 ? '' : 's'}`;
    }
    if (data.orders && Array.isArray(data.orders)) {
      return `Returned ${data.orders.length} order${data.orders.length === 1 ? '' : 's'}`;
    }
    if (data.products && Array.isArray(data.products)) {
      return `Returned ${data.products.length} product${data.products.length === 1 ? '' : 's'}`;
    }
    if (data.availableQuantity !== undefined) {
      return `Available stock: ${data.availableQuantity} unit${data.availableQuantity === 1 ? '' : 's'}`;
    }
    if (data.quantity !== undefined) {
      return `Available stock: ${data.quantity} unit${data.quantity === 1 ? '' : 's'}`;
    }
    if (data.estimated_cost_usd !== undefined) {
      return `Estimated shipping: $${data.estimated_cost_usd}`;
    }
    if (data.id || data.product_id) {
      return `Entity created/found with ID #${data.id || data.product_id}`;
    }
    if (data.message) {
      return String(data.message);
    }
  }

  return 'Execution succeeded with structured data';
}

export interface StarterPrompt {
  id: string;
  label: string;
  prompt: string;
  requiredToolSubstrings: string[];
  icon: 'product' | 'order' | 'inventory' | 'shipping' | 'compare';
}

const CATALOG_PROMPT_TEMPLATES: StarterPrompt[] = [
  {
    id: 'orders_today',
    label: 'What orders came in today?',
    prompt: 'What orders came in today?',
    requiredToolSubstrings: ['list_orders', 'orders'],
    icon: 'order'
  },
  {
    id: 'create_product',
    label: "Create Product ($89.99)",
    prompt: "Create a product named 'Vintage Leather Jacket' with price 89.99",
    requiredToolSubstrings: ['create_product'],
    icon: 'product'
  },
  {
    id: 'stock_shipping',
    label: 'Stock + Shipping (CA)',
    prompt: 'Check stock for SKU-HOODIE-M and estimate shipping to CA',
    requiredToolSubstrings: ['get_stock', 'estimate_shipping'],
    icon: 'inventory'
  },
  {
    id: 'check_stock',
    label: 'Check Hoodie Stock',
    prompt: 'What is the current warehouse stock for SKU-HOODIE-M?',
    requiredToolSubstrings: ['get_stock'],
    icon: 'inventory'
  },
  {
    id: 'shipping_options',
    label: 'Shipping Carriers to US',
    prompt: 'What shipping methods and delivery estimates are available for destination US?',
    requiredToolSubstrings: ['shipping', 'shipping_methods'],
    icon: 'shipping'
  },
  {
    id: 'compare_stores',
    label: 'Compare Store Orders',
    prompt: "Compare today's orders between store alpha and store beta",
    requiredToolSubstrings: ['list_orders'],
    icon: 'compare'
  }
];

/**
 * Dynamically filters available starter prompts by verifying underlying tool capabilities
 * actually exist in the gateway's discovered catalog.
 */
export function deriveStarterPrompts(availableTools: ToolDefinition[]): StarterPrompt[] {
  if (!availableTools || availableTools.length === 0) {
    return [];
  }

  const toolNames = availableTools.map(t => t.name.toLowerCase());

  return CATALOG_PROMPT_TEMPLATES.filter(template => {
    // Check that every required capability has at least one matching tool
    return template.requiredToolSubstrings.every(req =>
      toolNames.some(name => name.includes(req.toLowerCase()))
    );
  }).slice(0, 4); // Limit to top 4 most relevant prompts
}

/**
 * Checks if the scrollable element is near the bottom within a given pixel threshold.
 */
export function isScrolledNearBottom(element: HTMLElement | null, threshold = 120): boolean {
  if (!element) return true;
  const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
  return distanceFromBottom <= threshold;
}
