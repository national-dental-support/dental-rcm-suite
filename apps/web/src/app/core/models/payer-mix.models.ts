export interface ISubRow {
  name: string;
  numberOfCollections: number;
  grossProduction: number;
  insuranceCollections: number;
  patientCollections: number;
  grossCollections: number;
  collectionRate: number;
  prodcutionAdjustment: number; // note: "prodcution" typo preserved from React
  collectionAdjustment: number;
  refund: number;
  insuranceBilled: number;
}

export interface IRow {
  id: string | number;
  name: string;
  data: ISubRow[];
}

export type OneOrAll = 'all' | string[];

export interface DateRangeISO { start_date: string; end_date: string; }
export interface Filters {
  provider?: OneOrAll;
  practice_groups?: OneOrAll;
  location?: OneOrAll;
  payer?: OneOrAll;
  payment_received?: DateRangeISO;
}

export interface CollectionPoint {
  monthLabel: string;                 // e.g. "Jan 2025"
  insuranceCollection: number;        // bar
  patientCollection: number;          // bar
  insuranceTrend?: number;            // line
  patientTrend?: number;              // optional line
}

export interface Totals {
  total: string;       // "$3.14M"
  prior_year: string;  // "$4.05M"
  all_time: string;    // "$X.XXM"
}

export interface PayerMixData {
  collectionTrends: CollectionPoint[];
  totalInsuranceCollections: Totals;
  totalPatientCollections: Totals;
  providers: string[];
  practiceGroups: string[];
  locations: string[];
}

export interface PayerChange {
  insuranceId: number | null;
  insuranceName: string | null;
  currentPeriodCharges: number;
  lastPeriodCharges: number;
  chargeDelta: number;
  chargeDeltaPct: number | null;
}

export interface ProcedureChange {
  procedureCode: string;
  currentPeriodCharges: number;
  lastPeriodCharges: number;
  chargeDelta: number;
  chargeDeltaPct: number | null;
}

export interface PayerCollectionDetail {
  insuranceName: string | null;
  totalCollections: number;
  insuranceCollections: number;
  patientCollections: number;
  insurancePercentage: number | null;
  patientPercentage: number | null;
  claim: number;
}