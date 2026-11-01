// global-filters.models.ts

export type LocationScope = 'enterprise' | 'group' | 'practice' | 'location';

export type LocationSelection =
  | { scope: 'enterprise' } // All
  | { scope: 'group'; groups: string[] }
  | { scope: 'practice'; practices: string[] }
  | { scope: 'location'; locations: string[] };

export type GlobalFiltersValue = {
  startDate: Date | null;
  endDate: Date | null;

  // [ok] names only
  payers: string[];
  providers: string[];

  // [ok] names only
  location: LocationSelection;

};

/** Nested org hierarchy for cascading group -> practice -> location filters. */
export interface OrgGroupOption {
  id: number;
  name: string;
  locations: OrgLocationOption[];
  practices?: OrgPracticeOption[];
}

export interface OrgPracticeOption {
  id: number;
  name: string;
  locations: OrgLocationOption[];
}

export interface OrgLocationOption {
  id: number;
  name: string;
}

export type GlobalFilterOptions = {
  // names only
  payers: string[];
  providers: string[];

  // names only (flat lists - for simple checkbox UIs)
  groups: string[];
  practices: string[];
  locations: string[];

  /** Rich nested group data for cascading filters. */
  groupsData?: OrgGroupOption[];
};

export const EMPTY_GLOBAL_FILTERS: GlobalFiltersValue = {
  startDate: null,
  endDate: null,
  payers: [],
  providers: [],
  location: { scope: 'enterprise' },
};

export const EMPTY_GLOBAL_OPTIONS: GlobalFilterOptions = {
  payers: [],
  providers: [],
  groups: [],
  practices: [],
  locations: [],
  groupsData: [],
};

// -----------------------------
// Payer-IQ models (unchanged conceptually, but also names-only)
// -----------------------------
export type PayerIqFiltersValue = {
  startDate: Date | null;
  endDate: Date | null;
  payers: string[];
  plans: string[];
  leaseNetworks: string[];
  providers: string[];
  locations: string[];
};

export type PayerIqFilterOptions = {
  payers: string[];
  plans: string[];
  leaseNetworks: string[];
  providers: string[];
};

export const EMPTY_PAYERIQ_FILTERS: PayerIqFiltersValue = {
  startDate: null,
  endDate: null,
  payers: [],
  plans: [],
  leaseNetworks: [],
  providers: [],
  locations: [],
};

export const EMPTY_PAYERIQ_OPTIONS: PayerIqFilterOptions = {
  payers: [],
  plans: [],
  leaseNetworks: [],
  providers: [],
};
