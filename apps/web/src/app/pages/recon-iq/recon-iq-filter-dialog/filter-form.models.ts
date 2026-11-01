import { ValidatorFn } from '@angular/forms';

export type FilterFieldType =
  | 'text'
  | 'number'
  | 'select'
  | 'date'
  | 'dateRange'
  | 'checkbox';

export type DateRangeValue = { from: Date | null; to: Date | null };

export interface FilterSelectOption<T = any> {
  label: string;
  value: T;
}

export interface FilterFieldBase {
  key: string;                 // formControlName
  label: string;               // UI label
  type: FilterFieldType;
  placeholder?: string;
  defaultValue?: any;          // used if initialFilters doesn't provide a value
  validators?: ValidatorFn[];

  // Layout
  row?: number;                // default: 0
  width?: 'sm' | 'md' | 'lg' | 'xl' | 'full'; // optional CSS hook
}

export interface TextField extends FilterFieldBase {
  type: 'text';
}

export interface NumberField extends FilterFieldBase {
  type: 'number';
  min?: number;
  max?: number;
  step?: number;
}

export interface SelectField<T = any> extends FilterFieldBase {
  type: 'select';
  options: FilterSelectOption<T>[];
}

export interface DateField extends FilterFieldBase {
  type: 'date';
}

export interface DateRangeField extends FilterFieldBase {
  type: 'dateRange';
  fromKey?: string; // optional if you want separate keys instead of {from,to}
  toKey?: string;
}

export interface CheckboxField extends FilterFieldBase {
  type: 'checkbox';
}

export type FilterField =
  | TextField
  | NumberField
  | SelectField
  | DateField
  | DateRangeField
  | CheckboxField;

export interface FilterFormConfig<TFilters extends Record<string, any> = any> {
  fields: FilterField[];

  debounceMs?: number; // default 200

  /**
   * Optional: convert raw form values to the outgoing filters shape.
   * Useful for dateRange -> {fromDate,toDate}, trimming strings, etc.
   */
  mapValue?: (raw: any, initial: TFilters | null) => TFilters;

  /**
   * Optional: treat empty strings as undefined (default true)
   */
  emptyStringToUndefined?: boolean;

  /**
   * Optional: remove null/undefined keys before emitting (default true)
   */
  stripEmptyKeys?: boolean;
}
