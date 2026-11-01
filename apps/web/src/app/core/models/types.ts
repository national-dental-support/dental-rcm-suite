export interface Location {
  location_name: string;
  location_practice_group_name: string;
}

export interface PracticeGroup {
  practice_group_name: string;
}

export interface Filters {
  aging?: string; // Aging filter options
  issue_type?: string;
  query?: string; // Generic search query
  claim_id?: string; // Claim ID query string
  payer?: string; // Filter by payer
  cpt_group?: string; // Filter by CPT group
  provider?: string[] | 'all'; // Filter by provider name
  provider_npi?: string; // Filter by provider NPI
  practice_groups?: string[] | 'all';
  location?: string[] | 'all'; // Filter by location (or 'all' to ignore)
  adjudication?: string | 'all'; // Filter by adjudication (or 'all' to ignore)
  ar_balance?: string | 'all'; // Filter by AR balance (or 'all' to ignore)
  reporting_period?: {
    start_date?: string; // Start date for reporting period (ISO string)
    end_date?: string; // End date for reporting period (ISO string)
  };
  post_date?: {
    start_date?: string; // Start date for post date (ISO string)
    end_date?: string; // End date for post date (ISO string)
  };
  date_of_service?: {
    start_date?: string; // Start date for date of service (ISO string)
    end_date?: string; // End date for date of service (ISO string)
  };
  payment_received?: {
    start_date?: string; // Start date for payment received (ISO string)
    end_date?: string; // End date for payment received (ISO string)
  };
}

// Use this one not the one inside of api/v2/claims-serice
export interface RequestObject {
  customer_id?: string | null; // The ID of the customer whose claims are being retrieved
  location_ids?: number[] | string[]; // An array of location IDs
  page: number; // The current page number for pagination (optional)
  limit?: number; // The number of records per page (optional)
  expired_days?: number;
  filters?: Filters;
  sort?: {
    // Optional sorting object
    column?: string; // Column to sort by (e.g., "patient_first_name", "date_of_service") or whatever columsn are available in the table
    direction?: 'asc' | 'desc'; // Sorting direction: "asc" for ascending or "desc" for descending
  };
  archived?: number; // Archive filter (optional) used on claims only
}
