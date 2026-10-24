import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { ShippingCalculator } from './calculator.js';

export const BASE_SHIPPING_TOOLS = [
  {
    name: 'list_shipping_methods',
    description: 'Retrieve available shipping carriers, methods, and delivery day ranges for a target destination country.',
    inputSchema: {
      type: 'object',
      properties: {
        destination_country: {
          type: 'string',
          description: 'Two-letter ISO 3166-1 alpha-2 destination country code (e.g. "US", "CA", "GB", "DE")'
        }
      },
      required: ['destination_country']
    }
  },
  {
    name: 'estimate_shipping',
    description: 'Calculate deterministic illustrative shipping quotes and delivery estimates based on SKU, quantity, and destination. Clearly labeled as sample demo data.',
    inputSchema: {
      type: 'object',
      properties: {
        sku: {
          type: 'string',
          description: 'Stock Keeping Unit of the item being shipped (e.g. "URUMI-HD-01")'
        },
        quantity: {
          type: 'integer',
          minimum: 1,
          default: 1,
          description: 'Quantity of items to be shipped'
        },
        destination_country: {
          type: 'string',
          description: 'Two-letter ISO 3166-1 alpha-2 country code (e.g. "US", "GB")'
        },
        postal_code: {
          type: 'string',
          description: 'Optional destination postal or zip code for routing verification'
        }
      },
      required: ['sku', 'quantity', 'destination_country']
    }
  }
];

export const SHIPPING_TOOLS = [
  ...BASE_SHIPPING_TOOLS,
  ...BASE_SHIPPING_TOOLS.map(t => ({
    ...t,
    name: `shipping_${t.name}`
  }))
];

export function registerShippingHandlers(server: Server, calculator: ShippingCalculator): void {
  // 1. Tool Listing
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: SHIPPING_TOOLS
    };
  });

  // 2. Tool Execution
  server.setRequestHandler(CallToolRequestSchema, async request => {
    const { name, arguments: args = {} } = request.params;

    try {
      switch (name) {
        case 'list_shipping_methods':
        case 'shipping_list_shipping_methods': {
          const country = String(args.destination_country || '');
          if (!country.trim()) {
            throw new Error("Missing required argument 'destination_country'");
          }
          const result = calculator.listShippingMethods(country);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result, null, 2)
              }
            ]
          };
        }

        case 'estimate_shipping':
        case 'shipping_estimate_shipping': {
          const sku = String(args.sku || '');
          const quantity = args.quantity !== undefined ? Number(args.quantity) : 1;
          const destinationCountry = String(args.destination_country || '');
          const postalCode = args.postal_code ? String(args.postal_code) : undefined;

          if (!sku.trim()) {
            throw new Error("Missing required argument 'sku'");
          }
          if (isNaN(quantity) || quantity < 1) {
            throw new Error("Invalid 'quantity': must be a positive integer greater than or equal to 1");
          }
          if (!destinationCountry.trim()) {
            throw new Error("Missing required argument 'destination_country'");
          }

          const result = calculator.estimateShipping(sku, quantity, destinationCountry, postalCode);
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
