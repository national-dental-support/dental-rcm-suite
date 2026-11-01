import { Component, Input } from '@angular/core';

@Component({
    selector: 'app-data-table',
    templateUrl: './data-table.component.html',
    styleUrls: ['./data-table.component.scss'],
    standalone: false
})
export class DataTableComponent {
  @Input() columns: any[] = [];
  @Input() data: any[] = [];
  @Input() expandableRows: boolean = false;
}