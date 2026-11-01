export interface DateRange { start_date: string; end_date: string; }
export interface Filters {
provider?: string[] | 'all';
practice_groups?: string[] | 'all';
location?: string[] | 'all';
date_of_service?: DateRange;
}


// Chart data shapes are placeholders; replace with your real interfaces
export type CPTClaimsPoint = any;
export type ChargesVsMedicarePoint = any;
export type PaymentsVsMedicarePoint = any;
export type StackedBarPoint = any;
export type DonutPoint = any;