export type ServiceLevel = 'standard' | 'express' | 'priority' | 'economy';

export interface ShippingMethod {
  id: string;
  name: string;
  carrier: string;
  service_level: ServiceLevel;
  estimated_transit_days: string;
  base_rate_usd: string;
  per_unit_rate_usd: string;
  supported_regions: string[];
}

export interface EstimateQuote {
  method_id: string;
  method_name: string;
  carrier: string;
  service_level: ServiceLevel;
  currency: 'USD';
  estimated_cost: string;
  estimated_transit_days: string;
  cutoff_time: string;
}

export interface EstimateShippingResult {
  sku: string;
  quantity: number;
  destination_country: string;
  postal_code?: string;
  origin_warehouse: string;
  estimated_package_weight_kg: number;
  quotes: EstimateQuote[];
  disclaimer: string;
}

export interface ListShippingMethodsResult {
  destination_country: string;
  count: number;
  methods: ShippingMethod[];
  note: string;
}
