// src/app/shared/components/advanced-table/advanced-table-cell.directive.ts
import { Directive, Input, TemplateRef } from '@angular/core';
import { AdvancedTableColumnConfig } from './advanced-table.models';

export interface AdvancedTableCellContext<T = any> {
  $implicit: T;
  row: T;
  column: AdvancedTableColumnConfig<T>;
  value: any;
}

@Directive({
    selector: 'ng-template[rpCell]',
    standalone: false
})
export class AdvancedTableCellDirective<T = any> {
  @Input('rpCell') columnId!: string;

  constructor(public template: TemplateRef<AdvancedTableCellContext<T>>) {}
}
