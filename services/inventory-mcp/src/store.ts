import { InventoryItem, GetStockResult, SearchInventoryResult, StockStatus } from './types.js';

export class InventoryStore {
  private items: Map<string, InventoryItem> = new Map();

  constructor() {
    this.seedSampleData();
  }

  private seedSampleData(): void {
    const sampleItems: InventoryItem[] = [
      {
        sku: 'URUMI-HD-01',
        name: 'Urumi Technical Hoodie',
        available_quantity: 45,
        reserved_quantity: 5,
        status: 'in_stock',
        warehouse: 'WH-EAST-1',
        reorder_threshold: 10,
        category: 'Apparel',
        last_counted: '2026-10-24T08:00:00.000Z'
      },
      {
        sku: 'DEV-MUG-01',
        name: 'Developer Thermal Mug',
        available_quantity: 120,
        reserved_quantity: 12,
        status: 'in_stock',
        warehouse: 'WH-WEST-2',
        reorder_threshold: 25,
        category: 'Accessories',
        last_counted: '2026-10-24T08:00:00.000Z'
      },
      {
        sku: 'K8S-CAP-01',
        name: 'Kubernetes Cluster Cap',
        available_quantity: 0,
        reserved_quantity: 0,
        status: 'out_of_stock',
        warehouse: 'WH-CENTRAL-1',
        reorder_threshold: 15,
        category: 'Apparel',
        last_counted: '2026-10-24T08:00:00.000Z'
      },
      {
        sku: 'CERAMIC-01',
        name: 'Engineered Ceramic Cup',
        available_quantity: 50,
        reserved_quantity: 2,
        status: 'in_stock',
        warehouse: 'WH-EAST-2',
        reorder_threshold: 10,
        category: 'Accessories',
        last_counted: '2026-10-24T08:00:00.000Z'
      },
      {
        sku: 'DESK-MAT-01',
        name: 'Ultra-wide Desk Mat',
        available_quantity: 85,
        reserved_quantity: 8,
        status: 'in_stock',
        warehouse: 'WH-WEST-1',
        reorder_threshold: 20,
        category: 'Workspace',
        last_counted: '2026-10-24T08:00:00.000Z'
      },
      {
        sku: 'KEY-CAP-01',
        name: 'Artisan Mechanical Keycap Set',
        available_quantity: 8,
        reserved_quantity: 4,
        status: 'low_stock',
        warehouse: 'WH-CENTRAL-2',
        reorder_threshold: 12,
        category: 'Electronics',
        last_counted: '2026-10-24T08:00:00.000Z'
      }
    ];

    for (const item of sampleItems) {
      this.items.set(item.sku.toUpperCase(), item);
    }
  }

  getStock(sku: string): GetStockResult {
    const normalizedSku = (sku || '').trim().toUpperCase();
    if (!normalizedSku) {
      throw new Error("Missing or empty required parameter 'sku'");
    }

    const item = this.items.get(normalizedSku);
    if (!item) {
      return {
        found: false,
        sku: normalizedSku,
        message: `SKU '${normalizedSku}' was not found in the warehouse inventory catalog.`
      };
    }

    return {
      found: true,
      sku: item.sku,
      item: { ...item }
    };
  }

  searchInventory(query: string = '', limit: number = 10): SearchInventoryResult {
    const q = (query || '').trim().toLowerCase();
    const boundedLimit = Math.min(50, Math.max(1, limit || 10));

    let matched = Array.from(this.items.values());
    if (q) {
      matched = matched.filter(
        item =>
          item.sku.toLowerCase().includes(q) ||
          item.name.toLowerCase().includes(q) ||
          item.category.toLowerCase().includes(q) ||
          item.warehouse.toLowerCase().includes(q)
      );
    }

    const sliced = matched.slice(0, boundedLimit);
    return {
      query,
      count: sliced.length,
      total_matches: matched.length,
      items: sliced
    };
  }
}
