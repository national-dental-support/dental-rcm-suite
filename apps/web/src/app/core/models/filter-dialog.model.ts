import { ValidatorFn, AbstractControlOptions } from '@angular/forms';

export type FilterType =
  | 'text'
  | 'boolean'
  | 'select'
  | 'multiselect'
  | 'autocomplete'
  | 'date-range'
  | 'number-range'
  | 'chip-multi'
  | 'number'
  | 'checkbox';

// Shared option source
export type OptionsSource<T = any> =
  | { label: string; value: T }[]
  | (() =>
      | { label: string; value: T }[]
      | Promise<{ label: string; value: T }[]>
      | import('rxjs').Observable<{ label: string; value: T }[]>);

// [ok] Base props for all fields (add span here)
export interface FilterFieldBase<T = any> {
  key: string;
  label: string;
  type: FilterType;
  placeholder?: string;
  hint?: string;

  // NEW: allow grid spanning in your template class binding
  span?: 3 | 4 | 6 | 8 | 12; 

  disabled?: boolean;
  validator?: ValidatorFn | ValidatorFn[] | AbstractControlOptions | null;
  allowClear?: boolean; // show a "-" option on selects, if you use it
  visibleIf?: (values: Record<string, any>) => boolean;
}

// Specific variants
export type TextField = FilterFieldBase<string> & { type: 'text' };
export type BooleanField = FilterFieldBase<boolean> & { type: 'boolean' };

export interface SelectField<T = any> extends FilterFieldBase<T> {
  type: 'select' | 'multiselect' | 'autocomplete' | 'chip-multi';
  options: OptionsSource<T>;
}

export type DateRange = { start: Date | null; end: Date | null };
export type NumberRange = { min: number | null; max: number | null };

export type DateRangeField = FilterFieldBase<DateRange> & { type: 'date-range' };
export type NumberRangeField = FilterFieldBase<NumberRange> & { type: 'number-range' };

// [ok] Add these if you plan to use them (or remove from FilterType above)
export type NumberField = FilterFieldBase<number> & { type: 'number' };
export type CheckboxField = FilterFieldBase<boolean> & { type: 'checkbox' };

// Union used by your component/template
export type FilterField =
  | TextField
  | BooleanField
  | SelectField
  | DateRangeField
  | NumberRangeField
  | NumberField
  | CheckboxField;

// Dialog config/results
export interface FilterDialogConfig {
  title?: string;
  labels?: { apply?: string; cancel?: string; reset?: string };
  gridColumns?: number; // e.g., 2 or 4
  fields: FilterField[];
  initial?: Record<string, any>;
}

export interface FilterDialogResult {
  values: Record<string, any>;
}

export type FilterDialogClose = FilterDialogResult | 'reset' | undefined;