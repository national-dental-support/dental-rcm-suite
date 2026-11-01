import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { of, throwError } from 'rxjs';
import { Router } from '@angular/router';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { UsersListComponent } from './users-list.component';
import { AdminService } from '../../../core/services/admin.service';
import { UserDto } from '../../../core/models/user.models';

describe('UsersListComponent', () => {
  let component: UsersListComponent;
  let fixture: ComponentFixture<UsersListComponent>;
  let adminSpy: jasmine.SpyObj<AdminService>;
  let routerSpy: jasmine.SpyObj<Router>;
  let dialogSpy: jasmine.SpyObj<MatDialog>;
  let snackSpy: jasmine.SpyObj<MatSnackBar>;

  const mockUser: UserDto = {
    id: 'u1',
    name: 'Jane Doe',
    email: 'jane@acme.com',
    role: 'Admin' as any,
    active: true,
  };

  const mockUser2: UserDto = {
    id: 'u2',
    name: 'John Smith',
    email: 'john@acme.com',
    role: 'User' as any,
    active: false,
    archived: true,
  };

  beforeEach(async () => {
    adminSpy = jasmine.createSpyObj('AdminService', ['list', 'archive', 'restore']);
    routerSpy = jasmine.createSpyObj('Router', ['navigate']);
    dialogSpy = jasmine.createSpyObj('MatDialog', ['open']);
    snackSpy = jasmine.createSpyObj('MatSnackBar', ['open']);

    adminSpy.list.and.returnValue(of([mockUser]));

    await TestBed.configureTestingModule({
      declarations: [UsersListComponent],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        { provide: AdminService, useValue: adminSpy },
        { provide: Router, useValue: routerSpy },
        { provide: MatDialog, useValue: dialogSpy },
        { provide: MatSnackBar, useValue: snackSpy },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(UsersListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // -- ngOnInit ----------------------------------------------------

  it('should build columns on init', () => {
    expect(component.columns.length).toBe(6);
    expect(component.columns[0].id).toBe('name');
    expect(component.columns[1].id).toBe('email');
    expect(component.columns[2].id).toBe('role');
    expect(component.columns[3].id).toBe('status');
    expect(component.columns[4].id).toBe('lastLogin');
    expect(component.columns[5].id).toBe('actions');
  });

  it('should fetch users on init', () => {
    expect(adminSpy.list).toHaveBeenCalledWith('active');
    expect(component.users).toEqual([mockUser]);
  });

  it('should set loading false after fetch', () => {
    expect(component.loading).toBeFalse();
  });

  // -- fetch -------------------------------------------------------

  it('fetch should set loading false on error', fakeAsync(() => {
    adminSpy.list.and.returnValue(throwError(() => new Error('fail')));
    component.fetch();
    tick();
    expect(component.loading).toBeFalse();
  }));

  it('fetch should default to empty array if null returned', fakeAsync(() => {
    adminSpy.list.and.returnValue(of(null as any));
    component.fetch();
    tick();
    expect(component.users).toEqual([]);
  }));

  // -- switchView --------------------------------------------------

  it('should default to active view', () => {
    expect(component.viewMode).toBe('active');
  });

  it('switchView should change viewMode and refetch', fakeAsync(() => {
    adminSpy.list.and.returnValue(of([mockUser2]));
    component.switchView('archived');
    tick();
    expect(component.viewMode).toBe('archived');
    expect(adminSpy.list).toHaveBeenCalledWith('archived');
    expect(component.users).toEqual([mockUser2]);
  }));

  // -- add / edit --------------------------------------------------

  it('add should navigate to add user page', () => {
    component.add();
    expect(routerSpy.navigate).toHaveBeenCalledWith(
      ['/app/admin/users/add'],
      { queryParams: { from: 'admin' } },
    );
  });

  it('edit should navigate to edit user page', () => {
    component.edit(mockUser);
    expect(routerSpy.navigate).toHaveBeenCalledWith(
      ['/app/admin/users/edit', 'u1'],
      { queryParams: { from: 'admin' } },
    );
  });

  // -- isActive ----------------------------------------------------

  it('isActive should return true for active user', () => {
    expect(component.isActive(mockUser)).toBeTrue();
  });

  it('isActive should return false for inactive user', () => {
    expect(component.isActive(mockUser2)).toBeFalse();
  });

  // -- applyFilter -------------------------------------------------

  it('applyFilter should set filterValue', () => {
    component.applyFilter('search text');
    expect(component.filterValue).toBe('search text');
  });

  // -- confirmDelete -----------------------------------------------

  it('confirmDelete should open dialog and archive on confirm', fakeAsync(() => {
    const dialogRefSpy = jasmine.createSpyObj('MatDialogRef', ['afterClosed']);
    dialogRefSpy.afterClosed.and.returnValue(of(true));
    dialogSpy.open.and.returnValue(dialogRefSpy);
    adminSpy.archive.and.returnValue(of(void 0));
    adminSpy.list.and.returnValue(of([]));

    component.confirmDelete(mockUser);
    tick();

    expect(dialogSpy.open).toHaveBeenCalled();
    expect(adminSpy.archive).toHaveBeenCalledWith('u1');
    expect(snackSpy.open).toHaveBeenCalledWith('Jane Doe has been deleted.', 'Dismiss', { duration: 4000 });
  }));

  it('confirmDelete should not archive if dialog is cancelled', fakeAsync(() => {
    const dialogRefSpy = jasmine.createSpyObj('MatDialogRef', ['afterClosed']);
    dialogRefSpy.afterClosed.and.returnValue(of(null));
    dialogSpy.open.and.returnValue(dialogRefSpy);

    component.confirmDelete(mockUser);
    tick();

    expect(adminSpy.archive).not.toHaveBeenCalled();
  }));

  it('confirmDelete should show error snack on archive failure', fakeAsync(() => {
    const dialogRefSpy = jasmine.createSpyObj('MatDialogRef', ['afterClosed']);
    dialogRefSpy.afterClosed.and.returnValue(of(true));
    dialogSpy.open.and.returnValue(dialogRefSpy);
    adminSpy.archive.and.returnValue(throwError(() => new Error('fail')));

    component.confirmDelete(mockUser);
    tick();

    expect(snackSpy.open).toHaveBeenCalledWith('Delete failed \u2014 please try again.', 'Dismiss', { duration: 4000 });
  }));

  // -- confirmRestore ----------------------------------------------

  it('confirmRestore should open dialog and restore on confirm', fakeAsync(() => {
    const dialogRefSpy = jasmine.createSpyObj('MatDialogRef', ['afterClosed']);
    dialogRefSpy.afterClosed.and.returnValue(of(true));
    dialogSpy.open.and.returnValue(dialogRefSpy);
    adminSpy.restore.and.returnValue(of(void 0));
    adminSpy.list.and.returnValue(of([]));

    component.confirmRestore(mockUser2);
    tick();

    expect(dialogSpy.open).toHaveBeenCalled();
    expect(adminSpy.restore).toHaveBeenCalledWith('u2');
    expect(snackSpy.open).toHaveBeenCalledWith('John Smith has been restored.', 'Dismiss', { duration: 4000 });
  }));

  it('confirmRestore should not restore if dialog is cancelled', fakeAsync(() => {
    const dialogRefSpy = jasmine.createSpyObj('MatDialogRef', ['afterClosed']);
    dialogRefSpy.afterClosed.and.returnValue(of(null));
    dialogSpy.open.and.returnValue(dialogRefSpy);

    component.confirmRestore(mockUser2);
    tick();

    expect(adminSpy.restore).not.toHaveBeenCalled();
  }));

  it('confirmRestore should show error snack on restore failure', fakeAsync(() => {
    const dialogRefSpy = jasmine.createSpyObj('MatDialogRef', ['afterClosed']);
    dialogRefSpy.afterClosed.and.returnValue(of(true));
    dialogSpy.open.and.returnValue(dialogRefSpy);
    adminSpy.restore.and.returnValue(throwError(() => new Error('fail')));

    component.confirmRestore(mockUser2);
    tick();

    expect(snackSpy.open).toHaveBeenCalledWith('Restore failed \u2014 please try again.', 'Dismiss', { duration: 4000 });
  }));

  // -- Column accessors -------------------------------------------

  it('name column accessor should return user name', () => {
    const nameCol = component.columns.find(c => c.id === 'name')!;
    expect(nameCol.accessor!(mockUser)).toBe('Jane Doe');
  });

  it('email column accessor should return user email', () => {
    const emailCol = component.columns.find(c => c.id === 'email')!;
    expect(emailCol.accessor!(mockUser)).toBe('jane@acme.com');
  });

  it('role column accessor should return user role', () => {
    const roleCol = component.columns.find(c => c.id === 'role')!;
    expect(roleCol.accessor!(mockUser)).toBe('Admin');
  });

  it('name column accessor should handle null name', () => {
    const nameCol = component.columns.find(c => c.id === 'name')!;
    expect(nameCol.accessor!({ ...mockUser, name: null as any })).toBe('');
  });

  // -- confirmDelete dialog config ---------------------------------

  it('confirmDelete should pass correct dialog data', fakeAsync(() => {
    const dialogRefSpy = jasmine.createSpyObj('MatDialogRef', ['afterClosed']);
    dialogRefSpy.afterClosed.and.returnValue(of(null));
    dialogSpy.open.and.returnValue(dialogRefSpy);

    component.confirmDelete(mockUser);
    tick();

    const dialogData = dialogSpy.open.calls.mostRecent().args[1]!;
    expect(dialogData.width).toBe('440px');
    expect((dialogData.data as any).title).toBe('Delete User');
    expect((dialogData.data as any).confirmLabel).toBe('Delete User');
    expect((dialogData.data as any).confirmColor).toBe('warn');
  }));

  it('confirmRestore should pass correct dialog data', fakeAsync(() => {
    const dialogRefSpy = jasmine.createSpyObj('MatDialogRef', ['afterClosed']);
    dialogRefSpy.afterClosed.and.returnValue(of(null));
    dialogSpy.open.and.returnValue(dialogRefSpy);

    component.confirmRestore(mockUser2);
    tick();

    const dialogData = dialogSpy.open.calls.mostRecent().args[1]!;
    expect((dialogData.data as any).title).toBe('Restore User');
    expect((dialogData.data as any).confirmColor).toBe('primary');
  }));
});
