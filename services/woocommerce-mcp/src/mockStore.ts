import { CompactProduct, CompactOrder, OrderStatus } from './types.js';

export class MockWooCommerceStore {
  private products: CompactProduct[] = [
    {
      id: 101,
      name: 'Urumi Technical Hoodie',
      slug: 'urumi-technical-hoodie',
      permalink: 'http://store.local.test/product/urumi-technical-hoodie',
      price: '49.99',
      regular_price: '49.99',
      sale_price: '',
      status: 'publish',
      sku: 'URUMI-HD-01',
      manage_stock: true,
      stock_quantity: 45,
      stock_status: 'instock'
    },
    {
      id: 102,
      name: 'Developer Thermal Mug',
      slug: 'developer-thermal-mug',
      permalink: 'http://store.local.test/product/developer-thermal-mug',
      price: '24.50',
      regular_price: '24.50',
      sale_price: '',
      status: 'publish',
      sku: 'DEV-MUG-01',
      manage_stock: true,
      stock_quantity: 120,
      stock_status: 'instock'
    },
    {
      id: 103,
      name: 'Kubernetes Cluster Cap',
      slug: 'kubernetes-cluster-cap',
      permalink: 'http://store.local.test/product/kubernetes-cluster-cap',
      price: '19.99',
      regular_price: '19.99',
      sale_price: '',
      status: 'publish',
      sku: 'K8S-CAP-01',
      manage_stock: false,
      stock_quantity: null,
      stock_status: 'instock'
    }
  ];

  private orders: CompactOrder[] = [
    {
      id: 5001,
      status: 'processing',
      currency: 'USD',
      total: '49.99',
      total_tax: '4.00',
      shipping_total: '0.00',
      date_created: new Date().toISOString(), // Created today!
      date_modified: new Date().toISOString(),
      payment_method_title: 'Cash on delivery',
      customer_id: 12,
      items: [
        {
          id: 1,
          name: 'Urumi Technical Hoodie',
          product_id: 101,
          sku: 'URUMI-HD-01',
          quantity: 1,
          subtotal: '49.99',
          total: '49.99'
        }
      ],
      shipping_summary: {
        city: 'San Francisco',
        state: 'CA',
        country: 'US',
        postcode: '94107'
      }
    },
    {
      id: 5002,
      status: 'completed',
      currency: 'USD',
      total: '44.49',
      total_tax: '3.50',
      shipping_total: '5.00',
      date_created: new Date(Date.now() - 86400000 * 2).toISOString(), // 2 days ago
      date_modified: new Date(Date.now() - 86400000).toISOString(),
      payment_method_title: 'Cash on delivery',
      customer_id: 15,
      items: [
        {
          id: 2,
          name: 'Developer Thermal Mug',
          product_id: 102,
          sku: 'DEV-MUG-01',
          quantity: 1,
          subtotal: '24.50',
          total: '24.50'
        },
        {
          id: 3,
          name: 'Kubernetes Cluster Cap',
          product_id: 103,
          sku: 'K8S-CAP-01',
          quantity: 1,
          subtotal: '19.99',
          total: '19.99'
        }
      ],
      shipping_summary: {
        city: 'Austin',
        state: 'TX',
        country: 'US',
        postcode: '78701'
      }
    }
  ];

  listProducts(options: { page?: number; per_page?: number; search?: string; status?: string; sku?: string }): CompactProduct[] {
    let result = [...this.products];

    if (options.search) {
      const q = options.search.toLowerCase();
      result = result.filter(p => p.name.toLowerCase().includes(q) || p.slug.toLowerCase().includes(q));
    }
    if (options.status && options.status !== 'any') {
      result = result.filter(p => p.status === options.status);
    }
    if (options.sku) {
      result = result.filter(p => p.sku.toLowerCase() === options.sku!.toLowerCase());
    }

    const page = Math.max(1, options.page || 1);
    const perPage = Math.min(50, Math.max(1, options.per_page || 10));
    const start = (page - 1) * perPage;
    return result.slice(start, start + perPage);
  }

  createProduct(data: {
    name: string;
    regular_price: string;
    description?: string;
    sku?: string;
    manage_stock?: boolean;
    stock_quantity?: number;
    status?: string;
  }): CompactProduct {
    const id = 100 + this.products.length + 1;
    const slug = data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const priceStr = parseFloat(data.regular_price).toFixed(2);

    const newProd: CompactProduct = {
      id,
      name: data.name.trim(),
      slug,
      permalink: `http://store.local.test/product/${slug}`,
      price: priceStr,
      regular_price: priceStr,
      sale_price: '',
      status: data.status || 'publish',
      sku: data.sku ? data.sku.trim().toUpperCase() : `SKU-${id}`,
      manage_stock: Boolean(data.manage_stock),
      stock_quantity: data.stock_quantity !== undefined ? data.stock_quantity : null,
      stock_status: (data.stock_quantity ?? 1) > 0 ? 'instock' : 'outofstock'
    };

    this.products.unshift(newProd);
    return newProd;
  }

  listOrders(options: {
    page?: number;
    per_page?: number;
    status?: string;
    after?: string;
    before?: string;
    today_only?: boolean;
    timezone?: string;
  }): CompactOrder[] {
    let result = [...this.orders];

    if (options.status && options.status !== 'any') {
      result = result.filter(o => o.status === options.status);
    }

    if (options.today_only) {
      const tz = options.timezone || 'UTC';
      let todayStart: Date;
      try {
        const now = new Date();
        const formatter = new Intl.DateTimeFormat('en-CA', {
          timeZone: tz,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        });
        const datePart = formatter.format(now);
        todayStart = new Date(`${datePart}T00:00:00.000Z`);
      } catch {
        todayStart = new Date();
        todayStart.setUTCHours(0, 0, 0, 0);
      }
      result = result.filter(o => new Date(o.date_created) >= todayStart);
    } else {
      if (options.after) {
        const afterDate = new Date(options.after);
        result = result.filter(o => new Date(o.date_created) >= afterDate);
      }
      if (options.before) {
        const beforeDate = new Date(options.before);
        result = result.filter(o => new Date(o.date_created) <= beforeDate);
      }
    }

    const page = Math.max(1, options.page || 1);
    const perPage = Math.min(50, Math.max(1, options.per_page || 10));
    const start = (page - 1) * perPage;
    return result.slice(start, start + perPage);
  }

  getOrder(orderId: number): CompactOrder | null {
    return this.orders.find(o => o.id === orderId) || null;
  }

  updateOrderStatus(orderId: number, status: OrderStatus): { id: number; status: OrderStatus; previous_status: OrderStatus; date_modified: string } | null {
    const order = this.orders.find(o => o.id === orderId);
    if (!order) return null;

    const previous_status = order.status;
    order.status = status;
    order.date_modified = new Date().toISOString();

    return {
      id: order.id,
      status: order.status,
      previous_status,
      date_modified: order.date_modified
    };
  }
}
