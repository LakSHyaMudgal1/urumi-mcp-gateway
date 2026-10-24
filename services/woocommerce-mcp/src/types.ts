export type OrderStatus =
  | 'pending'
  | 'processing'
  | 'on-hold'
  | 'completed'
  | 'cancelled'
  | 'refunded'
  | 'failed';

export type ProductStatus = 'draft' | 'pending' | 'private' | 'publish';

export interface CompactProduct {
  id: number;
  name: string;
  slug: string;
  permalink: string;
  price: string;
  regular_price: string;
  sale_price: string;
  status: string;
  sku: string;
  manage_stock: boolean;
  stock_quantity: number | null;
  stock_status: string;
}

export interface CompactOrderItem {
  id: number;
  name: string;
  product_id: number;
  sku: string;
  quantity: number;
  subtotal: string;
  total: string;
}

export interface CompactOrder {
  id: number;
  status: OrderStatus;
  currency: string;
  total: string;
  total_tax: string;
  shipping_total: string;
  date_created: string;
  date_modified: string;
  payment_method_title: string;
  customer_id: number;
  items: CompactOrderItem[];
  shipping_summary?: {
    city: string;
    state: string;
    country: string;
    postcode: string;
  };
}
