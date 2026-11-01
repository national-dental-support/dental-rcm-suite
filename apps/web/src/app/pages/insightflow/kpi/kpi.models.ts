export type Rag = 'red' | 'amber' | 'green';

export interface KpiThresholds {
  min: number;     // usually 80 or 0
  redMax: number;  // end of red zone
  amberMax: number;// end of amber zone
  max: number;     // 100
}

export interface KpiItem {
  slug: string;          // "gross-expected-collection"
  title: string;         // "Gross Expected Collection %"
  value: number;         // 98.1
  unit?: string;         // "%"
  thresholds: KpiThresholds;
  benchmark?: string;    // "97-99%"
  calcHint?: string;     // "Total Gross Charges - Total Adjustments + Total Payments"
  rag: Rag;              // derived from value vs thresholds
}

export interface KpiTrendPoint {
  label: string; // "Q1 '24"
  value: number; // 95.2
}

export interface KpiDetail {
  item: KpiItem;
  trendQuarterly: KpiTrendPoint[];
  interpretationHigh: string[];
  interpretationLow: string[];
  definition: string;
  improvements: string[];
  contributingFactors?: string[]; // NEW - matches Figma "Contributing factors"
}


export interface KpiFilters {
  practice: string | 'All';
  location: string | 'All';
  provider?: string | null;
  payer?: string[];
  timeframe: 'Past 12 months' | 'Past month' | 'Past quarter' | 'YTD' | 'Custom';
  rag: 'All' | Rag;
  from?: string; // ISO (for Custom)
  to?: string;   // ISO (for Custom)
}