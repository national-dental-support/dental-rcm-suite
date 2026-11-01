export interface IBankDeposit {
  // Unique identifier used in MSSQL for unque bank deposit records
  uid: number;

  // location or sometimes refereced as "pratice" ids are indentifiers that will be used to tell
  // the application which dental practice location this deposit originated from. This will also be used to pull meta and demogrpahical data.
  location_id: string;

  // Should be a unique ID referencing a payers table? - need to think more on it (tech debt)
  payer: string;

  // The type refers to whether the payment was a Check or ETF
  payment_method?: 'CHECK' | 'ETF';

  type?: 'CHECK' | 'ETF';

  // The financial record number for check or EFT
  transaction_id: string;

  // The date the transaction was posted and confirmed
  cleared: string;

  // The date the transaction was deposited
  deposited: string;

  // The is the field reprents the number of payments that points to this deposit
  number_of_payments: number;

  number_of_payments_available: number;

  // Number of the attach payments of this deposit that cleared. This is referenced on the Payments table entity
  deposit_amount: number;

  deposited_date: string;

  // Amont of dollars posted to the PMS system
  posted_to_pms: number;

  // Amont of dollars unposted to the PMS system
  unposted: number;

  //status
  status: string;
}

export interface IPayment {
  uid: number; // Assuming unique identifier
  // Expects a string that contains the patient's first and last name
  patient: string;

  // The ID of the claim that this payment references
  claim_id: string;

  // The dental practice location id that this payment is for
  location_id: string;

  // Original submmited dollar ammount
  submitted: number;

  // The amount the payer (insurance company) has paid
  insurance_paid: number;

  status: string;

  posting_status: string;

  reference_id: number;
}
