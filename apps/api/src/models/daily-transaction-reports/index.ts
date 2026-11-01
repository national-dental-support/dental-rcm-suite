export interface IDailyTransactionReport {
  uid: number;
  customer_id: string;
  report_id: number; // Auto-incrementing primary key
  total_charges: number; // Total charges for the day
  payments: number; // Payments made for the day
  adjustments: number; // Adjustments for the day
  refunds: number; // Refunds for the day
  starting_ar: number; // Starting Accounts Receivable
  end_ar: number;
}
