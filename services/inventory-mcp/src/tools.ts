import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { InventoryStore } from './store.js';

export const BASE_INVENTORY_TOOLS = [
  {
    name: 'get_stock',
    description: 'Retrieve current available warehouse stock, status, and location for a given SKU. Returns a structured not-found response if the SKU does not exist.',
    inputSchema: {
      type: 'object',
      properties: {
        sku: {
          type: 'string',
          description: 'The Stock Keeping Unit (e.g. "URUMI-HD-01", "DEV-MUG-01")'
        }
      },
      required: ['sku']
    }
  },
  {
    name: 'search_inventory',
    description: 'Search warehouse inventory records by SKU, product name, warehouse code, or category with bounded limit.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search string to match against SKU, product name, or warehouse'
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 50,
          default: 10,
          description: 'Maximum number of items to return (max 50)'
        }
      }
    }
  }
];

export const INVENTORY_TOOLS = [
  ...BASE_INVENTORY_TOOLS,
  ...BASE_INVENTORY_TOOLS.map(t => ({
    ...t,
    name: `inventory_${t.name}`
  }))
];

export function registerInventoryHandlers(server: Server, store: InventoryStore): void {
  // 1. Tool Listing
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: INVENTORY_TOOLS
    };
  });

  // 2. Tool Execution
  server.setRequestHandler(CallToolRequestSchema, async request => {
    const { name, arguments: args = {} } = request.params;

    try {
      switch (name) {
        case 'get_stock':
        case 'inventory_get_stock': {
          const sku = String(args.sku || '');
          if (!sku.trim()) {
            throw new Error("Missing required argument 'sku'");
          }
          const result = store.getStock(sku);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result, null, 2)
              }
            ]
          };
        }

        case 'search_inventory':
        case 'inventory_search_inventory': {
          const query = String(args.query || '');
          const limit = args.limit !== undefined ? Number(args.limit) : 10;
          if (isNaN(limit) || limit < 1) {
            throw new Error("Invalid 'limit': must be a positive integer between 1 and 50");
          }
          const result = store.searchInventory(query, limit);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result, null, 2)
              }
            ]
          };
        }

        default:
          return {
            isError: true,
            content: [{ type: 'text', text: `Unknown tool: ${name}` }]
          };
      }
    } catch (err: any) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Tool '${name}' error: ${err.message}` }]
      };
    }
  });
}
