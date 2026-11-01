import { IRemedyStep } from '../remedy-steps';

export interface IProcedureDataOld {
  uid: number;
  claim_id: number;
  code: string;
  date_of_service: string;
  submitted: number;
  write_off: number;
  contracted: number;
  deductible: number;
  co_pay: number;
  co_insurance: number;
  pi_reduction: number;
  other_adj: number;
  patient_responsibility: number;
  insurance_paid: number;
  carc: string;
  remedySteps: IRemedyStep[];
}

// DEPRECARED
export interface IProcedureData {
  claim_id: number;
  code: string;
  date_of_service: Date;
  submitted: number;
  write_off: number;
  contracted: number;
  deductible: number;
  co_pay: number;
  co_insurance: number;
  pi_reduction: number;
  other_adj: number;
  patient_responsibility: number;
  insurance_paid: number;
  carc: string;
}
