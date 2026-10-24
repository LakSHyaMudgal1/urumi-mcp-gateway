import { WooCommerceConfig } from './config.js';
import { CompactProduct, CompactOrder, OrderStatus, ProductStatus } from './types.js';
import { MockWooCommerceStore } from './mockStore.js';

export class WooCommerceClient {
  private mockStore: MockWooCommerceStore;
  private authHeader: string;
  private baseUrl: string;
  private mockFallback: boolean;

  constructor(private config: WooCommerceConfig) {
    this.mockStore = new MockWooCommerceStore();
    this.baseUrl = config.WOOCOMMERCE_STORE_URL.replace(/\/+$/, '');
    this.mockFallback = config.WOOCOMMERCE_MOCK_FALLBACK;

    // HTTP Basic Auth header encoded with consumer credentials
    const credentials = Buffer.from(
      `${config.WOOCOMMERCE_CONSUMER_KEY}:${config.WOOCOMMERCE_CONSUMER_SECRET}`
    ).toString('base64');
    this.authHeader = `Basic ${credentials}`;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}/wp-json/wc/v3/${endpoint.replace(/^\/+/, '')}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'Authorization': this.authHeader,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          ...(options.headers || {})
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        let message = `WooCommerce API error (${response.status})`;
        try {
          const parsed = JSON.parse(errorText);
          if (parsed.message) message = parsed.message;
        } catch {
          // Keep standard message
        }
        throw new Error(message);
      }

      return await response.json() as T;
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw new Error(`WooCommerce API request timed out after 10000ms`);
      }
      throw this.sanitizeError(err);
    } finally {
      clearTimeout(timeout);
    }
  }

  private sanitizeError(err: any): Error {
    const raw = String(err?.message || err || 'WooCommerce API connection failed');
    let sanitized = raw;
    if (this.config.WOOCOMMERCE_CONSUMER_KEY) {
      sanitized = sanitized.split(this.config.WOOCOMMERCE_CONSUMER_KEY).join('[REDACTED_KEY]');
    }
    if (this.config.WOOCOMMERCE_CONSUMER_SECRET) {
      sanitized = sanitized.split(this.config.WOOCOMMERCE_CONSUMER_SECRET).join('[REDACTED_SECRET]');
    }
    sanitized = sanitized.replace(/Basic\s+[A-Za-z0-9+/=]+/gi, 'Basic [REDACTED_AUTH]');
    return new Error(sanitized);
  }

  async listProducts(params: {
    page?: number;
    per_page?: number;
    search?: string;
    status?: ProductStatus | 'any';
    sku?: string;
  }): Promise<CompactProduct[]> {
    try {
      const query = new URLSearchParams();
      if (params.page) query.set('page', String(params.page));
      if (params.per_page) query.set('per_page', String(params.per_page));
      if (params.search) query.set('search', params.search);
      if (params.status && params.status !== 'any') query.set('status', params.status);
      if (params.sku) query.set('sku', params.sku);

      const raw = await this.request<any[]>(`products?${query.toString()}`);
      return raw.map(p => this.compactProduct(p));
    } catch (err: any) {
      if (this.mockFallback) {
        return this.mockStore.listProducts(params);
      }
      throw err;
    }
  }

  async createProduct(data: {
    name: string;
    regular_price: string;
    description?: string;
    short_description?: string;
    sku?: string;
    manage_stock?: boolean;
    stock_quantity?: number;
    status?: ProductStatus;
  }): Promise<CompactProduct> {
    if (!data.name || typeof data.name !== 'string' || !data.name.trim()) {
      throw new Error("Product 'name' is required and must be a non-empty string");
    }

    const cleanPriceStr = String(data.regular_price ?? '').replace(/^\$/, '').trim();
    if (!cleanPriceStr) {
      throw new Error("Product 'regular_price' is required (e.g. '29.99')");
    }
    const parsedPrice = Number(cleanPriceStr);
    if (isNaN(parsedPrice) || !isFinite(parsedPrice) || parsedPrice < 0) {
      throw new Error(`Invalid 'regular_price' value '${data.regular_price}'. Must be a non-negative decimal string or number.`);
    }
    const safePrice = parsedPrice.toFixed(2);

    if (data.status) {
      const allowedStatuses: ProductStatus[] = ['draft', 'pending', 'private', 'publish'];
      if (!allowedStatuses.includes(data.status)) {
        throw new Error(`Invalid product status '${data.status}'. Must be one of: ${allowedStatuses.join(', ')}`);
      }
    }

    if (data.manage_stock && data.stock_quantity !== undefined && data.stock_quantity !== null) {
      const qty = Number(data.stock_quantity);
      if (!Number.isInteger(qty) || qty < 0) {
        throw new Error(`Invalid 'stock_quantity' (${data.stock_quantity}). Must be a non-negative integer when manage_stock is true.`);
      }
    }

    try {
      const payload: Record<string, unknown> = {
        name: data.name.trim(),
        regular_price: safePrice,
        status: data.status || 'publish'
      };
      if (data.description) payload.description = data.description;
      if (data.short_description) payload.short_description = data.short_description;
      if (data.sku) payload.sku = data.sku.trim();
      if (data.manage_stock !== undefined) {
        payload.manage_stock = data.manage_stock;
        if (data.stock_quantity !== undefined && data.stock_quantity !== null) {
          payload.stock_quantity = Number(data.stock_quantity);
        }
      }

      const raw = await this.request<any>('products', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      return this.compactProduct(raw);
    } catch (err: any) {
      if (this.mockFallback) {
        return this.mockStore.createProduct({
          ...data,
          regular_price: safePrice
        });
      }
      throw err;
    }
  }

  async listOrders(params: {
    page?: number;
    per_page?: number;
    status?: OrderStatus | 'any';
    after?: string;
    before?: string;
    today_only?: boolean;
    timezone?: string;
  }): Promise<CompactOrder[]> {
    try {
      const query = new URLSearchParams();
      if (params.page) query.set('page', String(params.page));
      if (params.per_page) query.set('per_page', String(params.per_page));
      if (params.status && params.status !== 'any') query.set('status', params.status);

      if (params.today_only) {
        const tz = params.timezone || this.config.WOOCOMMERCE_TIMEZONE || 'UTC';
        query.set('after', this.calculateStartOfToday(tz));
      } else {
        if (params.after) query.set('after', params.after);
        if (params.before) query.set('before', params.before);
      }

      const raw = await this.request<any[]>(`orders?${query.toString()}`);
      return raw.map(o => this.compactOrder(o));
    } catch (err: any) {
      if (this.mockFallback) {
        return this.mockStore.listOrders(params);
      }
      throw err;
    }
  }

  calculateStartOfToday(timezone: string = 'UTC'): string {
    try {
      const now = new Date();
      const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
      const datePart = formatter.format(now); // "YYYY-MM-DD"
      const dummyDate = new Date(`${datePart}T00:00:00Z`);
      const offsetMinutes = this.getTimezoneOffsetMinutes(timezone, dummyDate);
      const midnightUtcMs = dummyDate.getTime() + (offsetMinutes * 60 * 1000);
      return new Date(midnightUtcMs).toISOString();
    } catch {
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      return today.toISOString();
    }
  }

  private getTimezoneOffsetMinutes(timeZone: string, date: Date): number {
    try {
      const utcDate = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));
      const tzDate = new Date(date.toLocaleString('en-US', { timeZone }));
      return (utcDate.getTime() - tzDate.getTime()) / 60000;
    } catch {
      return 0;
    }
  }

  async getOrder(orderId: number): Promise<CompactOrder> {
    try {
      const raw = await this.request<any>(`orders/${orderId}`);
      return this.compactOrder(raw);
    } catch (err: any) {
      if (this.mockFallback) {
        const found = this.mockStore.getOrder(orderId);
        if (!found) {
          throw new Error(`Order #${orderId} not found`);
        }
        return found;
      }
      throw err;
    }
  }

  async updateOrderStatus(orderId: number, status: OrderStatus): Promise<{
    id: number;
    status: OrderStatus;
    previous_status?: OrderStatus;
    date_modified: string;
    message: string;
  }> {
    if (!orderId || isNaN(orderId) || orderId < 1) {
      throw new Error(`Invalid order ID: '${orderId}'. Must be a positive integer.`);
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
      throw new Error(`Invalid order status '${status}'. Must be one of: ${allowed.join(', ')}`);
    }

    try {
      const raw = await this.request<any>(`orders/${orderId}`, {
        method: 'PUT',
        body: JSON.stringify({ status })
      });
      return {
        id: raw.id,
        status: raw.status as OrderStatus,
        date_modified: raw.date_modified || new Date().toISOString(),
        message: `Order #${orderId} status successfully updated to '${status}'`
      };
    } catch (err: any) {
      if (this.mockFallback) {
        const res = this.mockStore.updateOrderStatus(orderId, status);
        if (!res) {
          throw new Error(`Order #${orderId} not found`);
        }
        return {
          ...res,
          message: `Order #${orderId} status successfully updated to '${status}'`
        };
      }
      throw err;
    }
  }

  private compactProduct(p: any): CompactProduct {
    return {
      id: p.id,
      name: p.name,
      slug: p.slug,
      permalink: p.permalink,
      price: p.price || '',
      regular_price: p.regular_price || '',
      sale_price: p.sale_price || '',
      status: p.status,
      sku: p.sku || '',
      manage_stock: Boolean(p.manage_stock),
      stock_quantity: p.stock_quantity !== null && p.stock_quantity !== undefined ? p.stock_quantity : null,
      stock_status: p.stock_status || 'instock'
    };
  }

  private compactOrder(o: any): CompactOrder {
    return {
      id: o.id,
      status: o.status as OrderStatus,
      currency: o.currency || 'USD',
      total: o.total || '0.00',
      total_tax: o.total_tax || '0.00',
      shipping_total: o.shipping_total || '0.00',
      date_created: o.date_created || '',
      date_modified: o.date_modified || '',
      payment_method_title: o.payment_method_title || '',
      customer_id: o.customer_id || 0,
      items: (o.line_items || []).map((item: any) => ({
        id: item.id,
        name: item.name,
        product_id: item.product_id,
        sku: item.sku || '',
        quantity: item.quantity,
        subtotal: item.subtotal || '',
        total: item.total || ''
      })),
      shipping_summary: o.shipping ? {
        city: o.shipping.city || '',
        state: o.shipping.state || '',
        country: o.shipping.country || '',
        postcode: o.shipping.postcode || ''
      } : undefined
    };
  }
}
