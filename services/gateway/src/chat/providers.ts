import {
  LLMProvider,
  LLMMessage,
  LLMToolDefinition,
  LLMToolCall
} from './types.js';

/**
 * Deterministic Mock LLM Provider for offline evaluation, zero-cost CI testing,
 * and reliable demonstration of multi-step tool calling across cluster upstreams.
 */
export class MockDeterministicProvider implements LLMProvider {
  readonly name = 'mock-deterministic';
  readonly model = 'deterministic-demo-v1';
  readonly isDemo = true;

  private parseToolPayload(raw: string | null | undefined): any {
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0 && parsed[0]?.text) {
        try {
          return JSON.parse(parsed[0].text);
        } catch {
          return parsed[0].text;
        }
      }
      return parsed;
    } catch {
      return raw;
    }
  }

  async chatCompletion({
    messages,
    tools
  }: {
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
  }> {
    // 1. Find the latest user message
    const userMessages = messages.filter(m => m.role === 'user');
    const latestUserMsg = userMessages[userMessages.length - 1]?.content || '';
    const textLower = latestUserMsg.toLowerCase();

    // 2. Collect tool execution results already in the conversation
    const toolMessages = messages.filter(m => m.role === 'tool');

    // Helper to find tool definition by substring
    const findTool = (nameSubstring: string): LLMToolDefinition | undefined => {
      return tools.find(t => t.function.name.includes(nameSubstring));
    };

    // =========================================================================
    // Scenario 1: Combined multi-upstream query (Inventory + Shipping)
    // E.g. "Check stock for SKU-HOODIE-M and estimate shipping to CA"
    // =========================================================================
    const isCombinedInventoryShipping =
      (textLower.includes('stock') || textLower.includes('inventory')) &&
      (textLower.includes('ship') || textLower.includes('shipping') || textLower.includes('rate'));

    if (isCombinedInventoryShipping) {
      const stockToolResult = toolMessages.find(m => m.name && m.name.includes('get_stock'));
      const shippingToolResult = toolMessages.find(m => m.name && m.name.includes('estimate_shipping'));

      // Step 1: Call inventory get_stock if not yet called
      if (!stockToolResult) {
        const stockTool = findTool('get_stock');
        if (stockTool) {
          const skuMatch = latestUserMsg.match(/SKU-[A-Z0-9_-]+/i) || ['SKU-HOODIE-M'];
          const sku = skuMatch[0].toUpperCase();

          return {
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: `call_stock_${Date.now()}`,
                  type: 'function',
                  function: {
                    name: stockTool.function.name,
                    arguments: JSON.stringify({ sku })
                  }
                }
              ]
            },
            finishReason: 'tool_calls'
          };
        }
      }

      // Step 2: Call shipping estimate_shipping if stock tool succeeded but shipping hasn't run
      if (stockToolResult && !shippingToolResult) {
        const shippingTool = findTool('estimate_shipping');
        if (shippingTool) {
          const countryMatch = latestUserMsg.match(/\b([A-Z]{2})\b/i);
          const country = countryMatch ? countryMatch[1].toUpperCase() : 'CA';
          const skuMatch = latestUserMsg.match(/SKU-[A-Z0-9_-]+/i) || ['SKU-HOODIE-M'];
          const sku = skuMatch[0].toUpperCase();

          return {
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: `call_ship_${Date.now()}`,
                  type: 'function',
                  function: {
                    name: shippingTool.function.name,
                    arguments: JSON.stringify({
                      sku,
                      quantity: 1,
                      destination_country: country
                    })
                  }
                }
              ]
            },
            finishReason: 'tool_calls'
          };
        }
      }

      // Step 3: Both tools executed -> synthesize final answer
      if (stockToolResult && shippingToolResult) {
        const stockData = this.parseToolPayload(stockToolResult.content);
        const shipData = this.parseToolPayload(shippingToolResult.content);

        return {
          message: {
            role: 'assistant',
            content: `I have coordinated across both Inventory and Shipping upstream services for you:\n\n` +
              `📦 **Inventory Status** (${stockData.sku || 'SKU'}):\n` +
              `- Available Quantity: ${stockData.availableQuantity ?? stockData.quantity ?? 'In stock'}\n` +
              `- Warehouse Location: ${stockData.location || 'Central Distribution Center'}\n\n` +
              `🚚 **Shipping Estimate** (${shipData.destination_country || 'Destination'}):\n` +
              `- Illustrative Rate: $${shipData.estimated_cost_usd || '15.00'}\n` +
              `- Service Level: ${shipData.service_level || 'Express Parcel (3-5 business days)'}\n\n` +
              `Both upstream MCP calls succeeded and are attributed to your user identity.`
          },
          finishReason: 'stop'
        };
      }
    }

    // =========================================================================
    // Scenario 2: WooCommerce Create Product
    // E.g. "Create a product named 'Vintage Leather Jacket' with price 89.99"
    // =========================================================================
    const isCreateProduct = textLower.includes('create') && (textLower.includes('product') || textLower.includes('item'));
    if (isCreateProduct) {
      const createProductResult = toolMessages.find(m => m.name && m.name.includes('create_product'));

      if (!createProductResult) {
        const createTool = findTool('create_product');
        if (createTool) {
          // Parse name from quotes or fallback
          const nameMatch = latestUserMsg.match(/["']([^"']+)["']/) ||
            latestUserMsg.match(/named?\s+([A-Za-z0-9\s-]+?)(?:\s+with|\s+priced|\s+at|\s*$)/i);
          const name = nameMatch ? nameMatch[1].trim() : 'Vintage Leather Jacket';

          // Parse price
          const priceMatch = latestUserMsg.match(/(?:\$|price\s+(?:of\s+)?|at\s+)(\d+(?:\.\d{1,2})?)/i);
          const price = priceMatch ? priceMatch[1] : '89.99';

          return {
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: `call_create_${Date.now()}`,
                  type: 'function',
                  function: {
                    name: createTool.function.name,
                    arguments: JSON.stringify({
                      name,
                      regular_price: price,
                      status: 'publish'
                    })
                  }
                }
              ]
            },
            finishReason: 'tool_calls'
          };
        }
      } else {
        const resData = this.parseToolPayload(createProductResult.content);

        const pId = resData.id || resData.product_id || 101;
        const pName = resData.name || 'Vintage Leather Jacket';
        const pPrice = resData.regular_price || resData.price || '89.99';

        return {
          message: {
            role: 'assistant',
            content: `The product has been created in your WooCommerce store:\n\n` +
              `- **Product ID**: ${pId}\n` +
              `- **Name**: ${pName}\n` +
              `- **Price**: $${pPrice}\n` +
              `- **Status**: Published\n\n` +
              `The product is now visible in the storefront catalog.`
          },
          finishReason: 'stop'
        };
      }
    }

    // =========================================================================
    // Scenario 2.5: Multi-Store Comparison Query
    // E.g. "Compare today's orders between store alpha and store beta"
    // =========================================================================
    const isMultiStoreCompare =
      textLower.includes('compare') &&
      (textLower.includes('store') || textLower.includes('stores')) &&
      (textLower.includes('order') || textLower.includes('today'));

    if (isMultiStoreCompare) {
      // Find all store-scoped list_orders tools
      const storeOrderTools = tools.filter(
        t => t.function.name.includes('list_orders') && (t.function.name.startsWith('store-') || t.function.name.startsWith('wc-') || t.function.name.includes('store'))
      );

      const targetTools = storeOrderTools.length >= 2
        ? storeOrderTools
        : tools.filter(t => t.function.name.includes('list_orders'));

      // Check which tools have already run
      const unrunTools = targetTools.filter(t => !toolMessages.some(m => m.name === t.function.name));

      if (unrunTools.length > 0) {
        // Execute next unrun store order tool
        const nextTool = unrunTools[0];
        return {
          message: {
            role: 'assistant',
            content: null,
            tool_calls: [
              {
                id: `call_${nextTool.function.name.replace(/[^a-zA-Z0-9_]/g, '_')}_${Date.now()}`,
                type: 'function',
                function: {
                  name: nextTool.function.name,
                  arguments: JSON.stringify({ created_today: true })
                }
              }
            ]
          },
          finishReason: 'tool_calls'
        };
      }

      // If all target tools have executed, synthesize comparison report
      if (targetTools.length > 0 && unrunTools.length === 0) {
        let report = `### Cross-Store Order Comparison (Today's Orders)\n\n`;
        for (const t of targetTools) {
          const res = toolMessages.find(m => m.name === t.function.name);
          const parsed = this.parseToolPayload(res?.content);
          const orders: any[] = Array.isArray(parsed) ? parsed : (parsed?.orders || (parsed?.id ? [parsed] : []));
          const totalRev = orders.reduce((sum: number, o: any) => sum + parseFloat(o.total || '0'), 0);
          const storeLabel = t.function.name.replace('__list_orders', '').toUpperCase();

          report += `🏪 **${storeLabel}**:\n`;
          report += `- Orders Today: **${orders.length}**\n`;
          report += `- Total Revenue: **$${totalRev.toFixed(2)}**\n`;
          if (orders.length > 0) {
            report += `- Recent Order: #${orders[0].id || orders[0].number} (${orders[0].status || 'processing'})\n`;
          } else {
            report += `- No orders received today yet.\n`;
          }
          report += `\n`;
        }

        report += `*Comparison executed concurrently across isolated store MCP upstreams via Gateway.*`;
        return {
          message: {
            role: 'assistant',
            content: report
          },
          finishReason: 'stop'
        };
      }
    }

    // =========================================================================
    // Scenario 3: WooCommerce List Today's Orders
    // E.g. "What orders came in today?" / "list today's orders"
    // =========================================================================
    const isOrdersToday = (textLower.includes('order') || textLower.includes('orders')) &&
      (textLower.includes('today') || textLower.includes('recent') || textLower.includes('came in'));
    if (isOrdersToday) {
      const ordersResult = toolMessages.find(m => m.name && m.name.includes('list_orders'));

      if (!ordersResult) {
        const listOrdersTool = findTool('list_orders');
        if (listOrdersTool) {
          return {
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: `call_orders_${Date.now()}`,
                  type: 'function',
                  function: {
                    name: listOrdersTool.function.name,
                    arguments: JSON.stringify({
                      created_today: true
                    })
                  }
                }
              ]
            },
            finishReason: 'tool_calls'
          };
        }
      } else {
        const parsed = this.parseToolPayload(ordersResult.content);
        const ordersData: any[] = Array.isArray(parsed)
          ? parsed
          : (parsed?.orders ? parsed.orders : (parsed?.id ? [parsed] : []));

        if (ordersData.length === 0) {
          return {
            message: {
              role: 'assistant',
              content: `I queried your WooCommerce store for orders received today. No new orders have come in today yet.`
            },
            finishReason: 'stop'
          };
        }

        const summaryList = ordersData.map((o: any) =>
          `- **Order #${o.id || o.number}**: ${o.status || 'processing'} | $${o.total || '0.00'} | Customer: ${o.billing?.first_name || 'Customer'} ${o.billing?.last_name || ''}`
        ).join('\n');

        return {
          message: {
            role: 'assistant',
            content: `Here are the orders received in your WooCommerce store today (${ordersData.length} total):\n\n` +
              `${summaryList}\n\n` +
              `Query executed via WooCommerce MCP upstream and audited to your user session.`
          },
          finishReason: 'stop'
        };
      }
    }

    // =========================================================================
    // Scenario 4: Direct Stock Query
    // E.g. "get stock for SKU-HOODIE-M"
    // =========================================================================
    if (textLower.includes('stock') || textLower.includes('inventory')) {
      const stockResult = toolMessages.find(m => m.name && m.name.includes('get_stock'));
      if (!stockResult) {
        const stockTool = findTool('get_stock');
        if (stockTool) {
          const skuMatch = latestUserMsg.match(/SKU-[A-Z0-9_-]+/i) || ['SKU-HOODIE-M'];
          return {
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: `call_stock_${Date.now()}`,
                  type: 'function',
                  function: {
                    name: stockTool.function.name,
                    arguments: JSON.stringify({ sku: skuMatch[0].toUpperCase() })
                  }
                }
              ]
            },
            finishReason: 'tool_calls'
          };
        }
      } else {
        const stockData = this.parseToolPayload(stockResult.content);
        const skuName = stockData?.sku || 'SKU';
        const qty = stockData?.availableQuantity ?? stockData?.quantity ?? 45;
        return {
          message: {
            role: 'assistant',
            content: `Checked stock for ${skuName}: ${qty} units available in warehouse.`
          },
          finishReason: 'stop'
        };
      }
    }

    // =========================================================================
    // Scenario 5: Direct Shipping Methods or Estimation
    // =========================================================================
    if (textLower.includes('ship') || textLower.includes('shipping')) {
      const shipResult = toolMessages.find(m => m.name && (m.name.includes('shipping') || m.name.includes('estimate')));
      if (!shipResult) {
        const shipTool = findTool('estimate_shipping') || findTool('list_shipping_methods');
        if (shipTool) {
          const countryMatch = latestUserMsg.match(/\b([A-Z]{2})\b/i);
          const country = countryMatch ? countryMatch[1].toUpperCase() : 'US';
          return {
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: `call_ship_${Date.now()}`,
                  type: 'function',
                  function: {
                    name: shipTool.function.name,
                    arguments: JSON.stringify({ destination_country: country, sku: 'SKU-HOODIE-M', quantity: 1 })
                  }
                }
              ]
            },
            finishReason: 'tool_calls'
          };
        }
      } else {
        return {
          message: {
            role: 'assistant',
            content: `Shipping inquiry complete. The gateway routed your request to the Shipping MCP upstream service successfully.`
          },
          finishReason: 'stop'
        };
      }
    }

    // =========================================================================
    // Fallback General Response
    // =========================================================================
    const toolNames = tools.map(t => t.function.name).join(', ');
    return {
      message: {
        role: 'assistant',
        content: `I am your Urumi MCP Gateway Assistant. I can orchestrate tool actions across your cluster.\n\n` +
          `Available aggregated tools on this cluster (${tools.length}):\n` +
          `${toolNames}\n\n` +
          `You can try asking me to:\n` +
          `- *"Create a product named 'Vintage Leather Jacket' with price 89.99"*\n` +
          `- *"What orders came in today?"*\n` +
          `- *"Check stock for SKU-HOODIE-M and estimate shipping to CA"*`
      },
      finishReason: 'stop'
    };
  }
}

/**
 * Standard OpenAI / OpenAI-Compatible Provider for real LLM models (OpenAI, Ollama, vLLM).
 * Ensures API keys are kept strictly server-side and never leaked in logs or error traces.
 */
export class OpenAICompatibleProvider implements LLMProvider {
  readonly name: string;
  readonly model: string;
  readonly isDemo = false;
  private apiKey: string;
  private baseURL: string;
  private timeoutMs: number;

  constructor(options: {
    name?: string;
    model: string;
    apiKey: string;
    baseURL?: string;
    timeoutMs?: number;
  }) {
    this.name = options.name || 'openai-compatible';
    this.model = options.model;
    this.apiKey = options.apiKey;
    this.baseURL = (options.baseURL || 'https://api.openai.com/v1').replace(/\/+$/, '');
    this.timeoutMs = options.timeoutMs || 30000;
  }

  async chatCompletion({
    messages,
    tools
  }: {
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
  }> {
    if (!this.apiKey && !this.baseURL.includes('localhost') && !this.baseURL.includes('127.0.0.1')) {
      throw new Error(`LLM provider '${this.name}' requires an API key. Please configure LLM_API_KEY on the server.`);
    }

    const payload: Record<string, unknown> = {
      model: this.model,
      messages: messages.map(m => {
        const msg: Record<string, unknown> = {
          role: m.role,
          content: m.content
        };
        if (m.tool_calls) msg.tool_calls = m.tool_calls;
        if (m.tool_call_id) msg.tool_call_id = m.tool_call_id;
        if (m.name) msg.name = m.name;
        return msg;
      })
    };

    if (tools.length > 0) {
      payload.tools = tools;
      payload.tool_choice = 'auto';
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {})
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        // Redact any potential echoes of the API key
        const safeError = errorText.replace(new RegExp(this.apiKey, 'g'), '[REDACTED_API_KEY]');

        if (response.status === 401) {
          throw new Error(`LLM provider authorization failed: Invalid or expired API credentials.`);
        }
        if (response.status === 429) {
          throw new Error(`LLM provider rate limit exceeded: Please wait before submitting more queries.`);
        }
        throw new Error(`LLM provider returned HTTP ${response.status}: ${safeError || 'Unknown provider error'}`);
      }

      const data = await response.json() as any;
      const choice = data.choices?.[0];
      if (!choice || !choice.message) {
        throw new Error('LLM provider returned empty choices in completion response');
      }

      return {
        message: {
          role: 'assistant',
          content: choice.message.content,
          tool_calls: choice.message.tool_calls
        },
        finishReason: choice.finish_reason
      };
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw new Error(`LLM provider request timed out after ${this.timeoutMs}ms.`);
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }
}
