export type StockStatus = 'in_stock' | 'low_stock' | 'out_of_stock';

export interface InventoryItem {
  sku: string;
  name: string;
  available_quantity: number;
  reserved_quantity: number;
  status: StockStatus;
  warehouse: string;
  reorder_threshold: number;
  category: string;
  last_counted: string;
}

export interface GetStockResult {
  found: boolean;
  sku: string;
  item?: InventoryItem;
  message?: string;
}

export interface SearchInventoryResult {
  query: string;
  count: number;
  total_matches: number;
  items: InventoryItem[];
}
