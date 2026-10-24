import { ShippingMethod, EstimateShippingResult, ListShippingMethodsResult, EstimateQuote } from './types.js';

export const DEMO_DISCLAIMER = 'SAMPLE DEMO RATES ONLY. Illustrative pricing for simulation; not a legally binding carrier commitment.';

export class ShippingCalculator {
  private methods: ShippingMethod[] = [
    // Domestic Methods (US)
    {
      id: 'ground-std',
      name: 'Standard Ground Delivery',
      carrier: 'FedEx Ground',
      service_level: 'standard',
      estimated_transit_days: '3-5 business days',
      base_rate_usd: '5.99',
      per_unit_rate_usd: '1.50',
      supported_regions: ['US']
    },
    {
      id: 'air-exp',
      name: 'Express 2-Day Air',
      carrier: 'UPS 2nd Day Air',
      service_level: 'express',
      estimated_transit_days: '2 business days',
      base_rate_usd: '12.99',
      per_unit_rate_usd: '3.00',
      supported_regions: ['US']
    },
    {
      id: 'overnight',
      name: 'Priority Overnight',
      carrier: 'FedEx Priority Overnight',
      service_level: 'priority',
      estimated_transit_days: '1 business day',
      base_rate_usd: '24.99',
      per_unit_rate_usd: '5.00',
      supported_regions: ['US']
    },

    // International Methods
    {
      id: 'intl-eco',
      name: 'International Economy Tracked',
      carrier: 'DHL Global Mail',
      service_level: 'economy',
      estimated_transit_days: '7-14 business days',
      base_rate_usd: '14.99',
      per_unit_rate_usd: '4.00',
      supported_regions: ['*']
    },
    {
      id: 'intl-prio',
      name: 'International Express Priority',
      carrier: 'DHL Express Worldwide',
      service_level: 'priority',
      estimated_transit_days: '3-5 business days',
      base_rate_usd: '29.99',
      per_unit_rate_usd: '8.00',
      supported_regions: ['*']
    }
  ];

  // SKU to estimated unit weight in kg
  private weightMap: Record<string, number> = {
    'URUMI-HD-01': 0.85,
    'DEV-MUG-01': 0.42,
    'K8S-CAP-01': 0.18,
    'CERAMIC-01': 0.48,
    'DESK-MAT-01': 0.65,
    'KEY-CAP-01': 0.15
  };

  listShippingMethods(destinationCountry: string): ListShippingMethodsResult {
    const country = (destinationCountry || '').trim().toUpperCase();
    if (!country || !/^[A-Z]{2}$/.test(country)) {
      throw new Error(`Invalid destination_country: '${destinationCountry}'. Must be a 2-letter ISO 3166-1 alpha-2 code (e.g. 'US', 'CA', 'GB').`);
    }

    const available = this.methods.filter(
      m => m.supported_regions.includes('*') || m.supported_regions.includes(country)
    );

    return {
      destination_country: country,
      count: available.length,
      methods: available,
      note: 'Rates shown are baseline estimates before quantity or dimensional weight adjustments.'
    };
  }

  estimateShipping(
    sku: string,
    quantity: number,
    destinationCountry: string,
    postalCode?: string
  ): EstimateShippingResult {
    const normalizedSku = (sku || '').trim().toUpperCase();
    if (!normalizedSku) {
      throw new Error("Missing required argument 'sku'");
    }

    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty < 1) {
      throw new Error(`Invalid 'quantity': '${quantity}'. Must be a positive integer greater than or equal to 1.`);
    }

    const country = (destinationCountry || '').trim().toUpperCase();
    if (!country || !/^[A-Z]{2}$/.test(country)) {
      throw new Error(`Invalid 'destination_country': '${destinationCountry}'. Must be a 2-letter ISO 3166-1 code.`);
    }

    const unitWeight = this.weightMap[normalizedSku] || 0.5;
    const totalWeight = parseFloat((unitWeight * qty).toFixed(2));

    const applicableMethods = this.methods.filter(
      m => m.supported_regions.includes('*') || m.supported_regions.includes(country)
    );

    const quotes: EstimateQuote[] = applicableMethods.map(m => {
      const base = parseFloat(m.base_rate_usd);
      const perUnit = parseFloat(m.per_unit_rate_usd);
      const cost = (base + perUnit * (qty - 1)).toFixed(2);

      return {
        method_id: m.id,
        method_name: m.name,
        carrier: m.carrier,
        service_level: m.service_level,
        currency: 'USD',
        estimated_cost: cost,
        estimated_transit_days: m.estimated_transit_days,
        cutoff_time: '15:00 UTC (same-day dispatch)'
      };
    });

    return {
      sku: normalizedSku,
      quantity: qty,
      destination_country: country,
      postal_code: postalCode ? postalCode.trim() : undefined,
      origin_warehouse: country === 'US' ? 'WH-EAST-1 (Columbus, OH)' : 'WH-EXPORT-1 (Newark, NJ)',
      estimated_package_weight_kg: totalWeight,
      quotes,
      disclaimer: DEMO_DISCLAIMER
    };
  }
}
