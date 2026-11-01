// advanced-table.models.ts
export type AdvancedColumnType =
  | 'text'
  | 'number'
  | 'currency'
  | 'date'
  | 'percent'
  | 'chip'
  | 'boolean'
  | 'custom'
  | 'action';

export type TextFilterOperator =
  | 'contains'
  | 'notContains'
  | 'equals'
  | 'notEquals'
  | 'startsWith'
  | 'endsWith';

export type NumberFilterOperator =
  | 'equals'
  | 'notEquals'
  | 'greaterThan'
  | 'greaterThanOrEqual'
  | 'lessThan'
  | 'lessThanOrEqual'
  | 'between';

export type DateFilterOperator =
  | 'contains' // for display string
  | 'on'
  | 'before'
  | 'after'
  | 'between';

export type BooleanFilterOperator =
  | 'isTrue'
  | 'isFalse';

export type FilterOperator =
  | TextFilterOperator
  | NumberFilterOperator
  | DateFilterOperator
  | BooleanFilterOperator;

// One node in a grouped filter tree (same as your current interface)
export interface GroupFilterNode {
  label: string;
  value?: string;
  children?: GroupFilterNode[];
  /** UI-only: whether this group is expanded in the filter dialog */
  expanded?: boolean;
}

// Per-column filter state
export interface ColumnFilterState {
  operator?: FilterOperator | null;
  value?: string | null;
  value2?: string | null;
  selectedValues?: string[];
}

export type ColumnGroupedValues = { [key: string]: GroupFilterNode[] };
// Whole-table filter state
export interface TableFilterState {
  global: string;
  columns: { [columnId: string]: ColumnFilterState };
}

// Column-specific filter config
export interface ColumnFilterConfig<T = any> {
  operators?: FilterOperator[];
  supportsValueList?: boolean;
  supportsGroupValues?: boolean;

  groupedValues?: GroupFilterNode[];
  buildGroupedValues?: (
    rows: T[],
    column: AdvancedTableColumnConfig<T>
  ) => GroupFilterNode[];

  buildValueList?: (rows: T[], column: AdvancedTableColumnConfig<T>) => string[];

  compareFn?: (params: {
    row: T;
    column: AdvancedTableColumnConfig<T>;
    state: ColumnFilterState;
    rawValue: any;
    displayValue: string;
  }) => boolean;
}

export type RowVm<T> = {
  row: T;
  level: number;
  parent?: T;
  isChild: boolean;
  key: any;        // stable identity for expansion + trackBy
};

// Column config
export interface    AdvancedTableColumnConfig<T = any> {
  id: string;
  header: string;
  type: AdvancedColumnType;

  propertyPath?: string;
  accessor?: (row: T) => any;

  sortable?: boolean;
  sortAccessor?: (row: T) => string | number | Date | boolean | null | undefined;

  filterable?: boolean;
  globalSearch?: boolean;

  width?: string;

   /**
   * Should this column be included in global search?
   * Default: true if unset, but we expose it so you can turn it off (e.g. actions column).
   */
  includeInGlobalSearch?: boolean;

  align?: 'start' | 'center' | 'end';

  displayFormatter?: (value: any, row: T) => string;

  chipConfig?: {
    getColor?: (value: any, row: T) => 'primary' | 'accent' | 'warn' | string;
    getLabel?: (value: any, row: T) => string;
    chipClass?: string | string[];
  };

  filterConfig?: ColumnFilterConfig<T>;

  /** Optional display transformation for cell text */
  displayFn?: (rawValue: any, row: T) => string;

  /** Optional tooltip text for data cells. Receives the row; return empty string to suppress. */
  tooltip?: (row: T) => string;

  isActionColumn?: boolean;

  buttonLabel?: string; 
  actionId?: string;
  actionVisible?: (row: T) => boolean;
  /** optional styling hooks */
  buttonClass?: string | string[];             // extra CSS class(es)
  buttonColor?: 'primary' | 'accent' | 'warn'; // mat color
  buttonVariant?: 'stroked' | 'flat' | 'raised' | 'icon';
}
