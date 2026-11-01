import { Injectable } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Observable } from 'rxjs';
import { FilterDialogComponent } from './filter-dialog.component';
import { FilterDialogConfig, FilterDialogClose } from '../../../core/models/filter-dialog.model';

@Injectable({ providedIn: 'root' })
export class FilterDialogService {
  constructor(private dialog: MatDialog) {}

 open(config: FilterDialogConfig): Observable<FilterDialogClose> {
  const ref = this.dialog.open(
    FilterDialogComponent,
    {
      width: '720px',
      data: config,
      autoFocus: false,
      restoreFocus: false,
      enterAnimationDuration: '100ms',
      exitAnimationDuration: '80ms',
    }
  );
  return ref.afterClosed();
}
}
