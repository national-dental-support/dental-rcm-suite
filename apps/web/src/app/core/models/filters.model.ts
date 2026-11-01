export interface Filters {
  provider?: string[] | 'all';
  practice_groups?: string[] | 'all';
  location?: string[] | 'all';
  payment_received?: {
    start_date: string;
    end_date: string;
  };
}