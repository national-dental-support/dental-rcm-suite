// ?? Not sure if we need this
export interface IProcedureLineItem {
  claim_id: number;
  procedure_id: number;
  carc: string;
  step: number;
  completed: boolean | number;
}

export interface IClaimsTracking {
  // Global unique id
  uid?: string;

  // not in use
  practice_835?: string;
  // not in use
  practice_837?: string;

  approved_amount_835: number;

  approved_amount_837: number;

  status: string;

  contracted_835: string;

  contracted_837: string;

  //Not in use
  date_of_service_835: Date;

  // Date the the procedures for this claim was performed
  date_of_service_837: Date;
  date_submitted: Date;

  deductible_835: number;
  deductible_837: number;

  notes: string;

  // Patient of the claim
  patient_first_name_837: string;
  patient_last_name_837: string;

  last_name_835: string;

  // Payer Name
  payer_837: string;

  // The dentist or owner of a dental location (treatment provider on myRCM claim view detail page)
  first_name_837: string;
  last_name_837: string;

  //Not in use
  policy_number?: string;
  //Not in use
  group_number?: string;
  //Not in use
  street_1?: string;
  //Not in use
  street_2?: string;
  //Not in use
  city?: string;
  //Not in use
  state?: string;
  //Not in use
  zip?: string;
  //Not in use
  gender?: string;

  //Not in use
  patient_relationship: string;
  //Not in use
  employer_information: string;
  //Not in use
  coverage_details: string;
  //Not in use
  subscriber_primary_care_provider: string;
  //Not in use
  subscriber_consent: boolean;
  //Not in use
  cpt_code_837: string;
  //Not in use
  cpt_code_description_837: string;

  // Customer's practice location that claims will point to
  location_id: number;

  // This relates to the uid of the Subscribers table (not the actual ID of the subscriber).
  // It's better to just get the subscriber's first and last name from the 837
  subscriber_id?: string;

  // Financials
  total_dollar_value: string | number;
  total_pi_reduction: string | number;
  total_contracted: string | number;
  total_deductible: string | number;
  total_copay: string | number;
  total_coinsurance: string | number;
  total_patient_responsibility: string | number;
  total_adjustments: string | number;
  total_write_off: string | number;
  total_insurance_paid: string | number;

  // Use this if not using the Subscriber from the interal record.
  subscriber_first_name?: string;
  subscriber_last_name?: string;
  subscriber_date_of_birth?: string;
  progress: number;
  archived: boolean | number;
  eft?: string;
  check_number?: string;
  initialClaimSubmissionScore?: number;
  deniedClaimScore?: number;
  residualValueScore?: number;
  finalScore?: number;

  // Not in use
  carc_score?: number;

  // Not in use
  carc?: string;

  // Not in use
  assigned_user_first_name?: string | null;

  // Not in use
  assigned_user_last_name?: string | null;

  // Not in use
  assigned_user_email?: string | null;

  // Not in use
  assigned_user_avatar_image_url?: string | null;
}
