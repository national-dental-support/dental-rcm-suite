import { Component, Inject, OnInit } from '@angular/core';
import { MatDialog, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';

import { AdminService } from '../../../core/services/admin.service';
import { UserDto, Role } from '../../../core/models/user.models';

import { AdvancedTableColumnConfig } from '../../../shared/components/advanced-table/advanced-table.models';

/** -- Confirm action dialog ------------------------------------------ */
@Component({
    selector: 'rp-confirm-action-dialog',
    template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <mat-dialog-content>
      <p>{{ data.message }}</p>
      @if (data.showReason) {
        <mat-form-field appearance="outline" style="width:100%; margin-top:8px">
          <mat-label>Reason (optional)</mat-label>
          <textarea
            matInput
            rows="3"
            [(ngModel)]="reason"
            placeholder="e.g. Resigned, Contract ended\u2026"
          ></textarea>
        </mat-form-field>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="dialogRef.close()">Cancel</button>
      <button mat-raised-button [color]="data.confirmColor || 'warn'" (click)="confirm()">
        {{ data.confirmLabel }}
      </button>
    </mat-dialog-actions>
    `,
    standalone: false
})
export class ConfirmActionDialogComponent {
  reason = '';
  constructor(
    public dialogRef: MatDialogRef<ConfirmActionDialogComponent>,
    @Inject(MAT_DIALOG_DATA)
    public data: {
      title: string;
      message: string;
      confirmLabel: string;
      confirmColor?: string;
      showReason?: boolean;
    },
  ) {}
  confirm() {
    this.dialogRef.close(this.reason || true);
  }
}

// Keep old name as alias for backward compat
export { ConfirmActionDialogComponent as OffboardDialogComponent };

@Component({
    selector: 'rp-users-list',
    templateUrl: './users-list.component.html',
    styleUrls: ['./users-list.component.scss'],
    standalone: false
})
export class UsersListComponent implements OnInit {
  loading = false;
  filterValue = '';

  /** Which tab: active users or archived */
  viewMode: 'active' | 'archived' = 'active';

  /** Advanced table inputs */
  users: UserDto[] = [];
  columns: AdvancedTableColumnConfig<UserDto>[] = [];

  readonly roleOptions: Role[] = ['Super Admin', 'Admin', 'Training Admin', 'Manager', 'User', 'AR Specialist'];

  constructor(
    private admin: AdminService,
    private router: Router,
    private dialog: MatDialog,
    private snack: MatSnackBar,
  ) {}

  ngOnInit(): void {
    this.columns = this.buildColumns();
    this.fetch();
  }

  private buildColumns(): AdvancedTableColumnConfig<UserDto>[] {
    return [
      {
        id: 'name',
        header: 'Name',
        type: 'text',
        sortable: true,
        filterable: true,
        includeInGlobalSearch: true,
        filterConfig: { supportsValueList: true },
        accessor: (u) => u.name ?? '',
      },
      {
        id: 'email',
        header: 'Email',
        type: 'text',
        sortable: true,
        filterable: true,
        includeInGlobalSearch: true,
        filterConfig: { supportsValueList: true },
        accessor: (u) => u.email ?? '',
      },
      {
        id: 'role',
        header: 'Role',
        type: 'custom',
        sortable: true,
        filterable: true,
        includeInGlobalSearch: true,
        filterConfig: { supportsValueList: true },
        accessor: (u) => u.role ?? '',
      },

      // We'll render this with an rpCell template so we can keep your exact chip styles/labels.
      {
        id: 'status',
        header: 'Status',
        type: 'custom',
        sortable: true,
        filterable: true,
        filterConfig: { supportsValueList: true },
        includeInGlobalSearch: false,
        accessor: (u) => u.archived ? 'Archived' : (u.active ? 'Active' : 'Disabled'),
      },
      {
        id: 'lastLogin',
        header: 'Last Login / Created',
        type: 'custom',
        sortable: true,
        filterable: false,
        includeInGlobalSearch: false,
        accessor: (u) => u.lastLoginAt || u.createdAt || '',
      },

      // Also custom so we can show Edit/Delete or Restore depending on viewMode.
      {
        id: 'actions',
        header: '',
        type: 'custom',
        sortable: false,
        filterable: false,
        includeInGlobalSearch: false,
        align: 'end',
        width: '320px',
      },
    ];
  }

  fetch(): void {
    this.loading = true;
    this.admin.list(this.viewMode).subscribe({
      next: (users) => {
        this.users = users ?? [];
        this.loading = false;
      },
      error: () => (this.loading = false),
    });
  }

  switchView(mode: 'active' | 'archived'): void {
  this.viewMode = mode;
  this.fetch();
  }


  add(): void {
    this.router.navigate(['/app/admin/users/add'], { queryParams: { from: 'admin' } });
  }

  edit(row: UserDto): void {
    this.router.navigate(['/app/admin/users/edit', row.id], { queryParams: { from: 'admin' } });
  }

  isActive(u: UserDto): boolean {
    return u.active === true;
  }

  toggleStatus(u: UserDto): void {
    const enable = !this.isActive(u);
    this.admin.toggleStatus(u.id, enable).subscribe({
      next: () => {
        this.snack.open(enable ? `${u.name} enabled.` : `${u.name} disabled.`, 'Dismiss', { duration: 3000 });
        this.fetch();
      },
      error: () => this.snack.open('Status change failed \u2014 please try again.', 'Dismiss', { duration: 4000 }),
    });
  }

  /** Returns { label, isLogin } for the Last Login / Created column */
  getLoginDisplay(u: UserDto): { label: string; isLogin: boolean } {
    const fmt = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    if (u.lastLoginAt) {
      return { label: fmt(u.lastLoginAt), isLogin: true };
    }
    if (u.createdAt) {
      return { label: fmt(u.createdAt), isLogin: false };
    }
    return { label: 'N/A', isLogin: false };
  }

  updateRole(u: UserDto, newRole: Role): void {
    if (newRole === u.role) return;
    this.admin.update(u.id, { role: newRole }).subscribe({
      next: () => {
        u.role = newRole;
        this.snack.open(`${u.name}'s role updated to ${newRole}.`, 'Dismiss', { duration: 3000 });
      },
      error: () => this.snack.open('Role update failed \u2014 please try again.', 'Dismiss', { duration: 4000 }),
    });
  }

  applyFilter(value: string): void {
    this.filterValue = value;
    // rp-advanced-table consumes this via [externalGlobal]
  }

  // -- Delete (archive) ----------------------------------------------
  confirmDelete(u: UserDto): void {
    const ref = this.dialog.open(ConfirmActionDialogComponent, {
      width: '440px',
      data: {
        title: 'Delete User',
        message: `Are you sure you want to delete ${u.name} (${u.email})? This will disable their access and archive the account. You can restore them later.`,
        confirmLabel: 'Delete User',
        confirmColor: 'warn',
        showReason: false,
      },
    });

    ref.afterClosed().subscribe((result) => {
      if (!result) return;

      this.admin.archive(u.id).subscribe({
        next: () => {
          this.snack.open(`${u.name} has been deleted.`, 'Dismiss', { duration: 4000 });
          this.fetch();
        },
        error: () => {
          this.snack.open('Delete failed \u2014 please try again.', 'Dismiss', { duration: 4000 });
        },
      });
    });
  }

  // -- Restore --------------------------------------------------------
  confirmRestore(u: UserDto): void {
    const ref = this.dialog.open(ConfirmActionDialogComponent, {
      width: '440px',
      data: {
        title: 'Restore User',
        message: `Restore ${u.name} (${u.email})? This will re-enable their account.`,
        confirmLabel: 'Restore User',
        confirmColor: 'primary',
        showReason: false,
      },
    });

    ref.afterClosed().subscribe((result) => {
      if (!result) return;

      this.admin.restore(u.id).subscribe({
        next: () => {
          this.snack.open(`${u.name} has been restored.`, 'Dismiss', { duration: 4000 });
          this.fetch();
        },
        error: () => {
          this.snack.open('Restore failed \u2014 please try again.', 'Dismiss', { duration: 4000 });
        },
      });
    });
  }
}
