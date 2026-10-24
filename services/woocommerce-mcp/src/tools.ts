import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { WooCommerceClient } from './client.js';
import { OrderStatus, ProductStatus } from './types.js';

export const BASE_WOOCOMMERCE_TOOLS = [
  {
    name: 'list_products',
    description: 'List products from the WooCommerce store with pagination, search, status, and SKU filters.',
    inputSchema: {
      type: 'object',
      properties: {
        page: { type: 'integer', minimum: 1, default: 1, description: 'Page number of results to fetch' },
        per_page: { type: 'integer', minimum: 1, maximum: 50, default: 10, description: 'Number of products per page' },
        search: { type: 'string', description: 'Search term matching title or description' },
        status: { type: 'string', enum: ['any', 'draft', 'pending', 'private', 'publish'], default: 'publish', description: 'Product publication status' },
        sku: { type: 'string', description: 'Filter by exact SKU' }
      }
    }
  },
  {
    name: 'create_product',
    description: 'Create a new product in the WooCommerce catalog with decimal-safe regular price and inventory settings.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Product title/name' },
        regular_price: { type: 'string', description: 'Decimal-safe standard regular price (e.g. "29.99")' },
        description: { type: 'string', description: 'Full product description' },
        short_description: { type: 'string', description: 'Short summary description' },
        sku: { type: 'string', description: 'Stock Keeping Unit (SKU)' },
        manage_stock: { type: 'boolean', default: false, description: 'Whether inventory stock is managed at product level' },
        stock_quantity: { type: 'integer', minimum: 0, description: 'Available stock quantity' },
        status: { type: 'string', enum: ['draft', 'pending', 'private', 'publish'], default: 'publish' }
      },
      required: ['name', 'regular_price']
    }
  },
  {
    name: 'list_orders',
    description: 'List orders from WooCommerce with date ranges, status filters, or queries for orders received today in store timezone.',
    inputSchema: {
      type: 'object',
      properties: {
        page: { type: 'integer', minimum: 1, default: 1, description: 'Page number of results' },
        per_page: { type: 'integer', minimum: 1, maximum: 50, default: 10, description: 'Number of orders per page' },
        status: {
          type: 'string',
          enum: ['any', 'pending', 'processing', 'on-hold', 'completed', 'cancelled', 'refunded', 'failed'],
          default: 'any',
          description: 'Order status filter'
        },
        after: { type: 'string', description: 'ISO 8601 date limit for orders placed after' },
        before: { type: 'string', description: 'ISO 8601 date limit for orders placed before' },
        today_only: { type: 'boolean', description: 'When true, automatically filters for orders placed today in store timezone' },
        timezone: { type: 'string', default: 'UTC', description: 'Store timezone identifier (e.g. "UTC", "America/New_York")' }
      }
    }
  },
  {
    name: 'get_order',
    description: 'Retrieve details of a single WooCommerce order by its numeric ID.',
    inputSchema: {
      type: 'object',
      properties: {
        order_id: { type: 'integer', minimum: 1, description: 'The unique numeric WooCommerce order ID' }
      },
      required: ['order_id']
    }
  },
  {
    name: 'update_order_status',
    description: 'Update the status of an existing WooCommerce order (e.g. from processing to completed).',
    inputSchema: {
      type: 'object',
      properties: {
        order_id: { type: 'integer', minimum: 1, description: 'The unique numeric WooCommerce order ID' },
        status: {
          type: 'string',
          enum: ['pending', 'processing', 'on-hold', 'completed', 'cancelled', 'refunded', 'failed'],
          description: 'The new order status'
        }
      },
      required: ['order_id', 'status']
    }
  }
];

export const WOOCOMMERCE_TOOLS = [
  ...BASE_WOOCOMMERCE_TOOLS,
  ...BASE_WOOCOMMERCE_TOOLS.map(t => ({
    ...t,
    name: `woocommerce_${t.name}`
  }))
];

export function registerWooCommerceHandlers(server: Server, client: WooCommerceClient): void {
  // 1. Tool Listing
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: WOOCOMMERCE_TOOLS
    };
  });

  // 2. Tool Execution
  server.setRequestHandler(CallToolRequestSchema, async request => {
    const { name, arguments: args = {} } = request.params;

    try {
      switch (name) {
        case 'list_products':
        case 'woocommerce_list_products': {
          const products = await client.listProducts(args as any);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ count: products.length, products }, null, 2)
              }
            ]
          };
        }

        case 'create_product':
        case 'woocommerce_create_product': {
          if (!args.name || typeof args.name !== 'string') {
            throw new Error("Missing required field 'name'");
          }
          if (args.regular_price === undefined || args.regular_price === null) {
            throw new Error("Missing required field 'regular_price'");
          }
          const product = await client.createProduct(args as any);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    message: `Product '${product.name}' created successfully`,
                    product
                  },
                  null,
                  2
                )
              }
            ]
          };
        }

        case 'list_orders':
        case 'woocommerce_list_orders': {
          const orders = await client.listOrders(args as any);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ count: orders.length, orders }, null, 2)
              }
            ]
          };
        }

        case 'get_order':
        case 'woocommerce_get_order': {
          const orderId = Number(args.order_id);
          if (isNaN(orderId) || orderId < 1) {
            throw new Error("Invalid or missing 'order_id'");
          }
          const order = await client.getOrder(orderId);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(order, null, 2)
              }
            ]
          };
        }

        case 'update_order_status':
        case 'woocommerce_update_order_status': {
          const orderId = Number(args.order_id);
          const status = args.status as OrderStatus;
          if (isNaN(orderId) || orderId < 1) {
            throw new Error("Invalid or missing 'order_id'");
          }
          const allowed: OrderStatus[] = [
            'pending',
            'processing',
            'on-hold',
            'completed',
            'cancelled',
            'refunded',
            'failed'
          ];
          if (!status || !allowed.includes(status)) {
            throw new Error(`Invalid status '${status}'. Must be one of: ${allowed.join(', ')}`);
          }
          const result = await client.updateOrderStatus(orderId, status);
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
