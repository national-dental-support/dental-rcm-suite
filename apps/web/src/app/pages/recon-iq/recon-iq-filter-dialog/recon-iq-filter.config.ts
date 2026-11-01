import { FilterFormConfig } from './filter-form.models';

export type ReconIqFilters = {
  bankName?: string;
  accountNumber?: string;
};

export type EncountResearchFilters = {
    patient?: string;
    payer?: string;
    paymentId?: string;
    doctor?: string;
    dateOfService?: string;
    patientAccount?: string;
    practiceId?: string;
}

export type PayRecFilters = {
  eobId?: string;
  date?: string;

  // optional but useful (wire to backend if supported)
  amount?: string;
  locationTaxId?: string;
};

export type MatchingFilters = {
  paymentId?: string;
  eobId?: string;
  payer?: string;
  value?: string;
  date?: string;
  type?: string;
  amount?: string;
}


export const RECON_IQ_FILTER_CONFIG: FilterFormConfig<ReconIqFilters> = {
  debounceMs: 200,
  emptyStringToUndefined: true,
  stripEmptyKeys: true,
  fields: [
    { key: 'bankName', label: 'Bank', type: 'text', row: 0, width: 'md', defaultValue: '' },
    { key: 'accountNumber', label: 'Account Number', type: 'text', row: 0, width: 'md', defaultValue: '' },
  ],
};

export const ENCOUNTER_RESEARCH_CONFIG: FilterFormConfig<EncountResearchFilters> = {
  debounceMs: 200,
  emptyStringToUndefined: true,
  stripEmptyKeys: true,
  fields: [
    { key: 'patient', label: 'patient', type: 'text', row: 0, width: 'md', defaultValue: '' },
    { key: 'payer', label: 'Payer', type: 'text', row: 0, width: 'md', defaultValue: '' },
    { key: 'paymentId', label: 'Payment ID', type: 'text', row: 0, width: 'md', defaultValue: '' },
    { key: 'doctor', label: 'Doctor', type: 'text', row: 0, width: 'md', defaultValue: '' },
    { key: 'dateOfService', label: 'Date of Service', type: 'text', row: 0, width: 'md', defaultValue: '' },
    { key: 'patientAccount', label: 'Patient Account', type: 'text', row: 0, width: 'md', defaultValue: '' },
  ],
};

export const MATCHING_CONFIG: FilterFormConfig<MatchingFilters> = {
  debounceMs: 200,
  emptyStringToUndefined: true,
  stripEmptyKeys: true,
  fields: [
    { key: 'paymentId', label: 'Payment ID', type: 'text', row: 0, width: 'md', defaultValue: '' },
    { key: 'eobId',     label: 'EOB/ERA ID', type: 'text', row: 0, width: 'md', defaultValue: '' }, // [ok] add
    { key: 'value',     label: 'Reference ID', type: 'text', row: 0, width: 'md', defaultValue: '' },
    { key: 'date',      label: 'Date', type: 'text', row: 0, width: 'md', defaultValue: '' },
    { key: 'payer',     label: 'Payer', type: 'text', row: 0, width: 'md', defaultValue: '' },
    { key: 'type',      label: 'Type', type: 'text', row: 0, width: 'md', defaultValue: '' },
    { key: 'amount',    label: 'Amount', type: 'text', row: 0, width: 'md', defaultValue: '' },
  ],
};

export const PAY_REC_FILTER_CONFIG: FilterFormConfig<PayRecFilters> = {
  debounceMs: 250,
  emptyStringToUndefined: false,
  stripEmptyKeys: false,
  fields: [
   
{ key: 'eobId', label: 'EOB ID', type: 'text', row: 0, width: 'md', defaultValue: '' },
{ key: 'date', label: 'Date', type: 'text', row: 0, width: 'md', defaultValue: '' },
{ key: 'amount', label: 'Amount', type: 'number', row: 0, width: 'md', defaultValue: '' },
{ key: 'location', label: 'Location', type: 'text', row: 0, width: 'md', defaultValue: '' }
  ],
};
