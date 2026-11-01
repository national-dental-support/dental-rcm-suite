export interface IMonthlyAgingReport {
  uid: number;
  customer_id: string;
  report_Id: number;
  practice_name: string;
  days30: number;
  days60: number;
  days90: number;
  days120_Plus: number;
}
