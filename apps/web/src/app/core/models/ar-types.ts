// src/app/core/models/ar-types.ts
export interface DateRange {
  start_date: string; // ISO (yyyy-mm-dd) or ''
  end_date: string;   // ISO or ''
}

export interface Filters {
  provider: string[];
  practice_groups: string[];
  location: string[];
  date_of_service: DateRange;
  payer?: string[];
}

export type SortDir = 'asc' | 'desc';

export interface Sort {
  field?: string;
  dir?: SortDir;
}

export interface ArSort {
  field?: string;
  dir?: SortDir;
}

export interface AgingDetail {
  label: string;
  value: number;
  percentage: number; // 0..100
}

/** Simple trend point (older clients / stubs may still use this) */
export interface TrendsPoint {
  date: string;    // yyyy-mm
  value: number;
}

/** Bucketed monthly row from /ar-summary.ar_trends.details */
export interface ArTrendRow {
  month: string;            // '2025-08'
  total_0_30: number;
  total_31_60: number;
  total_61_90: number;
  total_over_90: number;
}

/** Accept both shapes during transition */
export type TrendsDetails = TrendsPoint[] | ArTrendRow[];

export interface LocationsAndGroups {
  locations: string[];
  practiceGroups: string[];
}// src/app/core/models/ar-types.ts

export interface TableColumn {
  key: string;
  label?: string;
  type?: 'text' | 'number' | 'currency';
}

export interface TableBlock {
  columns: TableColumn[];
  rows: Array<Record<string, any>>;
}

export interface ArData {
  arBalance: string | number | null;
  last12MonthsARBalance: string | number | null;
  priorYearARBalance: string | number | null;
  averageDaysInAR: number | null;
  last12MonthsDaysInAR: number | null;
  priorYearAverageDaysInAR: number | null;
  agingData: { total: number; details: AgingDetail[] } | null;
  trendsData: { details: TrendsDetails } | null;
  providers: string[];

  // Optional table blocks
  breakdown?: {
    columns: { key: string; label?: string; type?: 'text' | 'number' | 'currency' }[];
    rows: any[];
  } | null;

  distribution?: {
    columns: { key: string; label?: string; type?: 'text' | 'number' | 'currency' }[];
    rows: any[];
  } | null;
}

export interface ArDaysByPracticeRow {
  operations: string;
  currentYear: number | null;
  previousYear: number | null;
}

export interface ArDaysByPracticeRes {
  rows: ArDaysByPracticeRow[];
}


