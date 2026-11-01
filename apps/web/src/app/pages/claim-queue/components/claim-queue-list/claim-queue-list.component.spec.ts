import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA, ChangeDetectorRef } from '@angular/core';
import { of, throwError, Subject } from 'rxjs';
import { Router, ActivatedRoute } from '@angular/router';
import { ClaimQueueListComponent } from './claim-queue-list.component';
import { ClaimService } from '../../services/claim.service';
import { DenialIqContextService } from '../../services/denialIqRole.service';
import { RpDialogService } from '../../../../shared/components/dialogs/dialog-shell/dialog.service';
import { SocketService } from '../../../../core/services/socket.service';
import { MatSnackBar } from '@angular/material/snack-bar';

describe('ClaimQueueListComponent', () => {
  let component: ClaimQueueListComponent;
  let fixture: ComponentFixture<ClaimQueueListComponent>;
  let mockClaimService: jasmine.SpyObj<ClaimService>;
  let mockRouter: jasmine.SpyObj<Router>;
  let mockSnack: jasmine.SpyObj<MatSnackBar>;
  let mockDialog: any;

  const emptyPage = { data: [], totalCount: 0, page: 0, pageSize: 25 };

  beforeEach(async () => {
    mockClaimService = jasmine.createSpyObj('ClaimService', [
      'getArMyQueue', 'getArAllClaims', 'getArEscalations', 'getArUnassigned', 'getArPendingQueue',
      'getManagerEscalations', 'getManagerAllClaims', 'getManagerUnassigned',
      'bulkAssign', 'bulkEscalate', 'bulkClose', 'autoAssign',
      'assignClaim', 'escalateClaim', 'unassignClaim', 'bulkReassign', 'getAssignableUsers',
    ]);
    mockClaimService.getArMyQueue.and.returnValue(of(emptyPage));
    mockClaimService.getArAllClaims.and.returnValue(of(emptyPage));
    mockClaimService.getArEscalations.and.returnValue(of(emptyPage));
    mockClaimService.getArUnassigned.and.returnValue(of(emptyPage));
    mockClaimService.getArPendingQueue.and.returnValue(of(emptyPage));
    mockClaimService.getManagerEscalations.and.returnValue(of(emptyPage));
    mockClaimService.getManagerAllClaims.and.returnValue(of(emptyPage));
    mockClaimService.getManagerUnassigned.and.returnValue(of(emptyPage));
    mockClaimService.assignClaim.and.returnValue(of({}));
    mockClaimService.escalateClaim.and.returnValue(of({}));
    mockClaimService.unassignClaim.and.returnValue(of({}));
    mockClaimService.bulkReassign.and.returnValue(of({}));
    mockClaimService.getAssignableUsers.and.returnValue(of([]));

    mockRouter = jasmine.createSpyObj('Router', ['navigate']);
    mockSnack = jasmine.createSpyObj('MatSnackBar', ['open']);
    mockDialog = {
      confirm: jasmine.createSpy('confirm').and.returnValue(of(false)),
      dangerConfirm: jasmine.createSpy('dangerConfirm').and.returnValue(of(false)),
      openTemplate: jasmine.createSpy('openTemplate').and.returnValue(of(true)),
    };

    await TestBed.configureTestingModule({
      declarations: [ClaimQueueListComponent],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        { provide: ClaimService, useValue: mockClaimService },
        { provide: Router, useValue: mockRouter },
        {
          provide: ActivatedRoute,
          useValue: {
            data: of({ queueType: 'ar-specialist' }),
            queryParamMap: of({ get: () => null }),
            snapshot: { queryParamMap: { get: () => null } },
            params: of({}),
          },
        },
        { provide: DenialIqContextService, useValue: { setRole: jasmine.createSpy('setRole'), role$: of('ar-specialist') } },
        { provide: ChangeDetectorRef, useValue: { markForCheck: () => {} } },
        { provide: RpDialogService, useValue: mockDialog },
        { provide: SocketService, useValue: { onClaimUpdated: () => of() } },
        { provide: MatSnackBar, useValue: mockSnack },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ClaimQueueListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should set queueType from route data', () => {
    expect(component.queueType).toBe('ar-specialist');
  });

  it('should set default activeTab to my for ar-specialist', () => {
    expect(component.activeTab).toBe('my');
  });

  it('should fetch ar-specialist my queue on init', () => {
    expect(mockClaimService.getArMyQueue).toHaveBeenCalled();
  });

  it('pageTitle should return Escalations for ar-specialist', () => {
    expect(component.pageTitle).toBe('Escalations');
  });

  it('pageTitle should return My Queue for manager', () => {
    component.queueType = 'manager';
    expect(component.pageTitle).toBe('My Queue');
  });

  // -- criticalSlaCount --
  it('criticalSlaCount uses _criticalCountFromApi when defined', () => {
    (component as any)._criticalCountFromApi = 7;
    expect(component.criticalSlaCount).toBe(7);
  });

  it('criticalSlaCount falls back to client-side count when api value undefined', () => {
    (component as any)._criticalCountFromApi = undefined;
    (component as any).rowsRaw$.next([
      { SlaStatus: 'OVERDUE' },
      { SlaStatus: 'URGENT' },
      { SlaStatus: 'OK' },
    ]);
    expect(component.criticalSlaCount).toBe(2);
  });

  it('criticalSlaCount returns 0 when no critical rows and no api count', () => {
    (component as any)._criticalCountFromApi = undefined;
    (component as any).rowsRaw$.next([{ SlaStatus: 'OK' }]);
    expect(component.criticalSlaCount).toBe(0);
  });

  // -- filterOptions getter --
  it('filterOptions returns distinct payer values', () => {
    (component as any).rowsRaw$.next([
      { payer: 'Aetna', assignedTo: 'Alice', providerName: 'Dr A', issueCode: 'CO-1', location: 'Main', status: 'Open', escalationReason: null },
      { payer: 'BCBS', assignedTo: null, providerName: null, issueCode: null, location: null, status: null, escalationReason: null },
      { payer: 'Aetna', assignedTo: 'Bob', providerName: 'Dr B', issueCode: 'CO-2', location: 'East', status: 'Closed', escalationReason: 'Late' },
    ]);
    const opts = component.filterOptions;
    expect(opts.payer).toEqual(['Aetna', 'BCBS']);
    expect(opts.assignedTo).toEqual(['Alice', 'Bob']);
    expect(opts.billingProvider).toEqual(['Dr A', 'Dr B']);
  });

  // -- reviewSlaCritical --
  it('reviewSlaCritical when not on all tab should switch to all tab', () => {
    spyOn(component, 'setTab');
    component.activeTab = 'my';
    component.reviewSlaCritical();
    expect(component.slaAlertDismissed).toBeTrue();
    expect(component.setTab).toHaveBeenCalledWith('all', { slaStatus: 'critical' });
  });

  it('reviewSlaCritical when already on all tab should apply filter directly', () => {
    spyOn(component, 'setTab');
    component.activeTab = 'all';
    component.reviewSlaCritical();
    expect(component.setTab).not.toHaveBeenCalled();
    expect(component.currentFilters.slaStatus).toBe('critical');
  });

  // -- setTab --
  it('setTab should change activeTab and refresh', () => {
    mockClaimService.getArAllClaims.calls.reset();
    component.setTab('all');
    expect(component.activeTab).toBe('all');
    expect(mockClaimService.getArAllClaims).toHaveBeenCalled();
  });

  it('setTab should not refresh if same tab', () => {
    mockClaimService.getArMyQueue.calls.reset();
    component.setTab('my');
    expect(mockClaimService.getArMyQueue).not.toHaveBeenCalled();
  });

  it('setTab should reset page and selection', () => {
    component.currentPage = 5;
    component.selectedClaimIds = new Set(['CL1']);
    component.setTab('all');
    expect(component.currentPage).toBe(0);
    expect(component.selectedClaimIds.size).toBe(0);
  });

  it('setTab should rebuild columns', () => {
    component.setTab('all');
    const assignedCol = component.columns.find(c => c.id === 'assignedTo');
    expect(assignedCol).toBeTruthy();
  });

  it('setTab to escalated should not have assignedTo column', () => {
    component.setTab('escalated');
    const assignedCol = component.columns.find(c => c.id === 'assignedTo');
    expect(assignedCol).toBeFalsy();
  });

  it('setTab with postSwitchFilter applies filter after switch', () => {
    component.setTab('all', { payer: 'Aetna' });
    // After the data loads (emptyPage sync), the postSwitchFilter should be applied
    expect(component.currentFilters.payer).toBe('Aetna');
  });

  it('setTab with same tab and postSwitchFilter still refreshes', () => {
    component.activeTab = 'all';
    mockClaimService.getArAllClaims.calls.reset();
    component.setTab('all', { payer: 'Aetna' });
    expect(mockClaimService.getArAllClaims).toHaveBeenCalled();
  });

  // -- toggleFilters --
  it('toggleFilters should toggle showFilters', () => {
    expect(component.showFilters).toBeFalse();
    component.toggleFilters();
    expect(component.showFilters).toBeTrue();
    component.toggleFilters();
    expect(component.showFilters).toBeFalse();
  });

  // -- applyFilter --
  it('applyFilter should set search in currentFilters', () => {
    component.applyFilter('test search');
    expect(component.currentFilters.search).toBe('test search');
    expect(component.filterValue).toBe('test search');
  });

  it('applyFilter should clear search for empty string', () => {
    component.applyFilter('');
    expect(component.currentFilters.search).toBeUndefined();
  });

  it('applyFilter should clear search for whitespace-only string', () => {
    component.applyFilter('   ');
    expect(component.currentFilters.search).toBeUndefined();
  });

  // -- onFiltersChange --
  it('onFiltersChange should merge filters', () => {
    component.currentFilters = { search: 'test' };
    component.onFiltersChange({ payer: 'Aetna' });
    expect(component.currentFilters.search).toBe('test');
    expect(component.currentFilters.payer).toBe('Aetna');
  });

  // -- onFilterReset --
  it('onFilterReset should keep only search filter', () => {
    component.filterValue = 'test';
    component.currentFilters = { search: 'test', payer: 'Aetna', aging: '30' };
    component.onFilterReset();
    expect(component.currentFilters.payer).toBeUndefined();
    expect(component.currentFilters.search).toBe('test');
  });

  it('onFilterReset should clear search if filterValue is empty', () => {
    component.filterValue = '';
    component.currentFilters = { payer: 'Aetna' };
    component.onFilterReset();
    expect(component.currentFilters.search).toBeUndefined();
  });

  // -- clearOne / onClearFilterKey --
  it('clearOne should remove specific filter key', () => {
    component.currentFilters = { search: 'test', payer: 'Aetna' };
    component.clearOne('payer');
    expect(component.currentFilters.payer).toBeUndefined();
    expect(component.currentFilters.search).toBe('test');
  });

  it('onClearFilterKey should remove specific filter key and reset page', () => {
    component.currentPage = 3;
    component.currentFilters = { search: 'test', payer: 'Aetna' };
    component.onClearFilterKey('payer');
    expect(component.currentFilters.payer).toBeUndefined();
    expect(component.currentPage).toBe(0);
  });

  // -- clearAllFilters --
  it('clearAllFilters should reset all filters', () => {
    component.currentFilters = { search: 'test', payer: 'Aetna' };
    component.filterValue = 'test';
    component.clearAllFilters();
    expect(component.filterValue).toBe('');
    expect(component.currentFilters).toEqual({});
  });

  // -- view / onAction --
  it('view should navigate to claim detail', () => {
    component.view({ id: 'CL123' } as any);
    expect(mockRouter.navigate).toHaveBeenCalledWith(['../', 'CL123'], jasmine.any(Object));
  });

  it('onAction with view should call view', () => {
    spyOn(component, 'view');
    component.onAction({ actionId: 'view', row: { id: 'CL1' } });
    expect(component.view).toHaveBeenCalledWith({ id: 'CL1' } as any);
  });

  it('onAction with assign-me should call assignToMe', () => {
    mockClaimService.assignClaim.and.returnValue(of({}));
    component.onAction({ actionId: 'assign-me', row: { id: 'CL1' } });
    expect(mockClaimService.assignClaim).toHaveBeenCalledWith('CL1');
  });

  it('onAction with escalate should call escalateRow', () => {
    mockClaimService.escalateClaim.and.returnValue(of({}));
    component.onAction({ actionId: 'escalate', row: { id: 'CL1' } });
    expect(mockClaimService.escalateClaim).toHaveBeenCalledWith('CL1');
  });

  it('onAction with unassign should call unassignRow', () => {
    mockClaimService.unassignClaim.and.returnValue(of({}));
    component.onAction({ actionId: 'unassign', row: { id: 'CL1' } });
    expect(mockClaimService.unassignClaim).toHaveBeenCalledWith('CL1');
  });

  it('onAction with unknown action should not throw', () => {
    expect(() => component.onAction({ actionId: 'unknown', row: {} })).not.toThrow();
  });

  // -- assignToMe / escalateRow / unassignRow error paths --
  it('assignToMe should handle error', () => {
    mockClaimService.assignClaim.and.returnValue(throwError(() => new Error('fail')));
    expect(() => component.assignToMe('CL1')).not.toThrow();
  });

  it('escalateRow should handle error', () => {
    mockClaimService.escalateClaim.and.returnValue(throwError(() => new Error('fail')));
    expect(() => component.escalateRow('CL1')).not.toThrow();
  });

  it('unassignRow should handle error', () => {
    mockClaimService.unassignClaim.and.returnValue(throwError(() => new Error('fail')));
    expect(() => component.unassignRow('CL1')).not.toThrow();
  });

  // -- Selection --
  it('onMultiSelectionChange should update selectedClaimIds', () => {
    const ids = new Set(['CL1', 'CL2']);
    component.onMultiSelectionChange(ids);
    expect(component.selectedClaimIds.size).toBe(2);
  });

  it('clearSelection should empty selectedClaimIds', () => {
    component.selectedClaimIds = new Set(['CL1']);
    component.clearSelection();
    expect(component.selectedClaimIds.size).toBe(0);
  });

  // -- specialistUsers / managerUsers --
  it('specialistUsers returns only AR Specialist users', () => {
    component.assignableUsers = [
      { id: 1, name: 'Alice', role: 'AR Specialist' },
      { id: 2, name: 'Bob', role: 'Manager' },
    ];
    expect(component.specialistUsers.length).toBe(1);
    expect(component.specialistUsers[0].name).toBe('Alice');
  });

  it('managerUsers returns Manager and Super Admin users', () => {
    component.assignableUsers = [
      { id: 1, name: 'Alice', role: 'AR Specialist' },
      { id: 2, name: 'Bob', role: 'Manager' },
      { id: 3, name: 'Carol', role: 'Super Admin' },
    ];
    expect(component.managerUsers.length).toBe(2);
  });

  // -- Pagination --
  it('onPageChanged should update page and refresh', () => {
    mockClaimService.getArMyQueue.calls.reset();
    component.onPageChanged({ pageIndex: 2, pageSize: 50 });
    expect(component.currentPage).toBe(2);
    expect(component.currentPageSize).toBe(50);
    expect(mockClaimService.getArMyQueue).toHaveBeenCalled();
  });

  // -- bulkAssign --
  it('bulkAssign should call service when dialog confirmed', () => {
    mockDialog.confirm.and.returnValue(of(true));
    mockClaimService.bulkAssign.and.returnValue(of({ count: 2 } as any));
    mockClaimService.getArMyQueue.and.returnValue(of(emptyPage));
    component.selectedClaimIds = new Set(['CL1', 'CL2']);
    component.bulkAssign();
    expect(mockClaimService.bulkAssign).toHaveBeenCalledWith(['CL1', 'CL2']);
  });

  it('bulkAssign should not call service when dialog cancelled', () => {
    mockDialog.confirm.and.returnValue(of(false));
    component.selectedClaimIds = new Set(['CL1']);
    component.bulkAssign();
    expect(mockClaimService.bulkAssign).not.toHaveBeenCalled();
  });

  it('bulkAssign should handle error', () => {
    mockDialog.confirm.and.returnValue(of(true));
    mockClaimService.bulkAssign.and.returnValue(throwError(() => new Error('fail')));
    component.selectedClaimIds = new Set(['CL1']);
    component.bulkAssign();
    expect(component.bulkLoading).toBeFalse();
  });

  // -- bulkEscalate --
  it('bulkEscalate should call service when confirmed', () => {
    mockDialog.confirm.and.returnValue(of(true));
    mockClaimService.bulkEscalate.and.returnValue(of({ count: 1 } as any));
    mockClaimService.getArMyQueue.and.returnValue(of(emptyPage));
    component.selectedClaimIds = new Set(['CL1']);
    component.bulkEscalate();
    expect(mockClaimService.bulkEscalate).toHaveBeenCalledWith(['CL1']);
  });

  it('bulkEscalate should handle error', () => {
    mockDialog.confirm.and.returnValue(of(true));
    mockClaimService.bulkEscalate.and.returnValue(throwError(() => new Error('fail')));
    component.selectedClaimIds = new Set(['CL1']);
    component.bulkEscalate();
    expect(component.bulkLoading).toBeFalse();
  });

  // -- bulkClose --
  it('bulkClose should call service when confirmed with reason', () => {
    mockDialog.openTemplate = jasmine.createSpy('openTemplate').and.callFake(() => {
      component.closeReason = 'Closed';
      return of({ action: 'primary' });
    });
    mockClaimService.bulkClose.and.returnValue(of({ closed: 1, skipped: 0 } as any));
    mockClaimService.getArMyQueue.and.returnValue(of(emptyPage));
    component.selectedClaimIds = new Set(['CL1']);
    component.bulkClose();
    expect(mockClaimService.bulkClose).toHaveBeenCalledWith(['CL1'], 'Closed');
  });

  it('bulkClose shows skipped message when skipped > 0', () => {
    mockDialog.openTemplate = jasmine.createSpy('openTemplate').and.callFake(() => {
      component.closeReason = 'Resolved';
      return of({ action: 'primary' });
    });
    mockClaimService.bulkClose.and.returnValue(of({ closed: 2, skipped: 1 } as any));
    mockClaimService.getArMyQueue.and.returnValue(of(emptyPage));
    component.selectedClaimIds = new Set(['CL1', 'CL2', 'CL3']);
    component.bulkClose();
    expect(mockSnack.open).toHaveBeenCalledWith('2 closed, 1 already closed', 'OK', jasmine.any(Object));
  });

  it('bulkClose shows count message when no skipped', () => {
    mockDialog.openTemplate = jasmine.createSpy('openTemplate').and.callFake(() => {
      component.closeReason = 'Done';
      return of({ action: 'primary' });
    });
    mockClaimService.bulkClose.and.returnValue(of({ closed: 3, skipped: 0 } as any));
    mockClaimService.getArMyQueue.and.returnValue(of(emptyPage));
    component.selectedClaimIds = new Set(['CL1', 'CL2', 'CL3']);
    component.bulkClose();
    expect(mockSnack.open).toHaveBeenCalledWith('3 claim(s) closed', 'OK', jasmine.any(Object));
  });

  it('bulkClose should not call service when dialog action is not primary', () => {
    mockDialog.openTemplate = jasmine.createSpy('openTemplate').and.returnValue(of({ action: 'cancel' }));
    component.selectedClaimIds = new Set(['CL1']);
    component.bulkClose();
    expect(mockClaimService.bulkClose).not.toHaveBeenCalled();
  });

  it('bulkClose should not call service when closeReason is empty', () => {
    mockDialog.openTemplate = jasmine.createSpy('openTemplate').and.callFake(() => {
      component.closeReason = '';
      return of({ action: 'primary' });
    });
    component.selectedClaimIds = new Set(['CL1']);
    component.bulkClose();
    expect(mockClaimService.bulkClose).not.toHaveBeenCalled();
  });

  it('bulkClose should handle error', () => {
    mockDialog.openTemplate = jasmine.createSpy('openTemplate').and.callFake(() => {
      component.closeReason = 'Closed';
      return of({ action: 'primary' });
    });
    mockClaimService.bulkClose.and.returnValue(throwError(() => new Error('fail')));
    component.selectedClaimIds = new Set(['CL1']);
    component.bulkClose();
    expect(component.bulkLoading).toBeFalse();
  });

  // -- bulkUnassign --
  it('bulkUnassign should call unassignClaim for each selected id when confirmed', async () => {
    mockDialog.confirm.and.returnValue(of(true));
    mockClaimService.unassignClaim.and.returnValue(of({}));
    mockClaimService.getArMyQueue.and.returnValue(of(emptyPage));
    component.selectedClaimIds = new Set(['CL1', 'CL2']);
    component.bulkUnassign();
    // Allow dynamic import to resolve
    await new Promise(r => setTimeout(r, 10));
    expect(mockClaimService.unassignClaim).toHaveBeenCalled();
  });

  it('bulkUnassign should not call service when cancelled', () => {
    mockDialog.confirm.and.returnValue(of(false));
    component.selectedClaimIds = new Set(['CL1']);
    component.bulkUnassign();
    expect(mockClaimService.unassignClaim).not.toHaveBeenCalled();
  });

  // -- bulkAssignTo --
  it('bulkAssignTo opens dialog directly when assignableUsers already loaded', () => {
    component.assignableUsers = [{ id: 1, name: 'Alice', role: 'AR Specialist' }];
    component.selectedClaimIds = new Set(['CL1']);
    mockDialog.openTemplate = jasmine.createSpy('openTemplate').and.callFake(() => {
      component.assignTargetUserId = 1;
      return of({ action: 'primary' });
    });
    mockClaimService.bulkReassign.and.returnValue(of({}));
    mockClaimService.getArMyQueue.and.returnValue(of(emptyPage));
    component.bulkAssignTo();
    expect(mockDialog.openTemplate).toHaveBeenCalled();
    expect(mockClaimService.bulkReassign).toHaveBeenCalledWith(['CL1'], 1);
  });

  it('bulkAssignTo fetches assignable users when not loaded', () => {
    component.assignableUsers = [];
    component.selectedClaimIds = new Set(['CL1']);
    mockClaimService.getAssignableUsers.and.returnValue(of([{ id: 1, name: 'Alice', role: 'AR Specialist' }]));
    mockDialog.openTemplate = jasmine.createSpy('openTemplate').and.returnValue(of({ action: 'cancel' }));
    component.bulkAssignTo();
    expect(mockClaimService.getAssignableUsers).toHaveBeenCalled();
  });

  it('bulkAssignTo handles getAssignableUsers error and still opens dialog', () => {
    component.assignableUsers = [];
    component.selectedClaimIds = new Set(['CL1']);
    mockClaimService.getAssignableUsers.and.returnValue(throwError(() => new Error('fail')));
    mockDialog.openTemplate = jasmine.createSpy('openTemplate').and.returnValue(of({ action: 'cancel' }));
    component.bulkAssignTo();
    expect(mockDialog.openTemplate).toHaveBeenCalled();
  });

  it('bulkAssignTo does not reassign if action is not primary', () => {
    component.assignableUsers = [{ id: 1, name: 'Alice', role: 'AR Specialist' }];
    component.selectedClaimIds = new Set(['CL1']);
    mockDialog.openTemplate = jasmine.createSpy('openTemplate').and.returnValue(of({ action: 'cancel' }));
    component.bulkAssignTo();
    expect(mockClaimService.bulkReassign).not.toHaveBeenCalled();
  });

  it('bulkAssignTo does not reassign if no userId selected', () => {
    component.assignableUsers = [{ id: 1, name: 'Alice', role: 'AR Specialist' }];
    component.selectedClaimIds = new Set(['CL1']);
    component.assignTargetUserId = null;
    mockDialog.openTemplate = jasmine.createSpy('openTemplate').and.callFake(() => {
      // don't set assignTargetUserId
      return of({ action: 'primary' });
    });
    component.bulkAssignTo();
    expect(mockClaimService.bulkReassign).not.toHaveBeenCalled();
  });

  it('bulkAssignTo handles reassign error', () => {
    component.assignableUsers = [{ id: 1, name: 'Alice', role: 'AR Specialist' }];
    component.selectedClaimIds = new Set(['CL1']);
    mockDialog.openTemplate = jasmine.createSpy('openTemplate').and.callFake(() => {
      component.assignTargetUserId = 1;
      return of({ action: 'primary' });
    });
    mockClaimService.bulkReassign.and.returnValue(throwError(() => new Error('fail')));
    component.bulkAssignTo();
    expect(component.bulkLoading).toBeFalse();
  });

  it('bulkAssignTo optimistic update when targetUser found', () => {
    component.assignableUsers = [{ id: 1, name: 'Alice', role: 'AR Specialist' }];
    component.selectedClaimIds = new Set(['CL1']);
    (component as any).rowsRaw$.next([{ id: 'CL1', assignedTo: 'Bob' }]);

    let capturedRows: any[] | null = null;
    const rowsSub = (component as any).rowsRaw$.subscribe((r: any[]) => { capturedRows = r; });

    mockDialog.openTemplate = jasmine.createSpy('openTemplate').and.callFake(() => {
      component.assignTargetUserId = 1;
      return of({ action: 'primary' });
    });
    // Return a never-resolving observable for refresh to prevent it from overwriting rowsRaw$
    const neverResolve = new Subject<any>();
    mockClaimService.bulkReassign.and.returnValue(of({}));
    mockClaimService.getArMyQueue.and.returnValue(neverResolve.asObservable());
    component.bulkAssignTo();

    // After bulkReassign next fires but before refresh resolves, rowsRaw$ should have optimistic update
    expect(capturedRows?.find((r: any) => r.id === 'CL1')?.assignedTo).toBe('Alice');
    rowsSub.unsubscribe();
  });

  // -- autoAssign --
  it('autoAssign should call service when confirmed', () => {
    mockDialog.confirm.and.returnValue(of(true));
    mockClaimService.autoAssign.and.returnValue(of({ assigned: 5 } as any));
    mockClaimService.getArMyQueue.and.returnValue(of(emptyPage));
    component.autoAssign();
    expect(mockClaimService.autoAssign).toHaveBeenCalled();
  });

  it('autoAssign should handle error', () => {
    mockDialog.confirm.and.returnValue(of(true));
    mockClaimService.autoAssign.and.returnValue(throwError(() => new Error('fail')));
    component.autoAssign();
    expect(component.bulkLoading).toBeFalse();
  });

  it('autoAssign should not call service when cancelled', () => {
    mockDialog.confirm.and.returnValue(of(false));
    component.autoAssign();
    expect(mockClaimService.autoAssign).not.toHaveBeenCalled();
  });

  // -- buildColumns --
  it('ar-specialist columns should include priority column', () => {
    component.queueType = 'ar-specialist';
    component.activeTab = 'my';
    const cols = (component as any).buildColumns();
    const priorityCol = cols.find((c: any) => c.id === 'priority');
    expect(priorityCol).toBeTruthy();
  });

  it('manager columns should not include priority column', () => {
    component.queueType = 'manager';
    component.activeTab = 'escalated';
    const cols = (component as any).buildColumns();
    const priorityCol = cols.find((c: any) => c.id === 'priority');
    expect(priorityCol).toBeFalsy();
    const patientCol = cols.find((c: any) => c.id === 'patient');
    expect(patientCol).toBeTruthy();
  });

  it('all tab columns should include assignedTo', () => {
    component.queueType = 'ar-specialist';
    component.activeTab = 'all';
    const cols = (component as any).buildColumns();
    expect(cols.find((c: any) => c.id === 'assignedTo')).toBeTruthy();
  });

  it('non-all tab columns should not include assignedTo', () => {
    component.queueType = 'ar-specialist';
    component.activeTab = 'my';
    const cols = (component as any).buildColumns();
    expect(cols.find((c: any) => c.id === 'assignedTo')).toBeFalsy();
  });

  it('column accessors return correct values from row', () => {
    component.queueType = 'ar-specialist';
    component.activeTab = 'all';
    const cols = (component as any).buildColumns();

    const row: any = {
      priority: 5, issueCode: 'CO-45', issueDescription: 'Adj',
      patient: 'John', accountNumber: 'ACC1', payer: 'Aetna',
      submittedDate: '2025-01-01', dateOfService: '2024-12-01',
      charged: 100, insBalance: 50, agingDays: 30, progress: 60,
      status: 'Open', SlaStatus: 'OK', assignedTo: 'Alice',
    };

    const getCol = (id: string) => cols.find((c: any) => c.id === id);
    expect(getCol('priority').accessor(row)).toBe(5);
    expect(getCol('code').accessor(row)).toBe('CO-45');
    expect(getCol('code').tooltip(row)).toBe('Adj');
    expect(getCol('patient').accessor(row)).toBe('John');
    expect(getCol('accountNumber').accessor(row)).toBe('ACC1');
    expect(getCol('payer').accessor(row)).toBe('Aetna');
    expect(getCol('submitted').accessor(row)).toBe('2025-01-01');
    expect(getCol('dateOfService').accessor(row)).toBe('2024-12-01');
    expect(getCol('charged').accessor(row)).toBe(100);
    expect(getCol('insBalance').accessor(row)).toBe(50);
    expect(getCol('aging').accessor(row)).toBe(30);
    expect(getCol('progress').accessor(row)).toBe(60);
    expect(getCol('claimStatusBadge').accessor(row)).toBe('Open');
    expect(getCol('slaStatusBadge').accessor(row)).toBe('OK');
    expect(getCol('assignedTo').accessor(row)).toBe('Alice');
  });

  it('column accessors return defaults for missing values', () => {
    component.queueType = 'ar-specialist';
    component.activeTab = 'all';
    const cols = (component as any).buildColumns();
    const getCol = (id: string) => cols.find((c: any) => c.id === id);

    const emptyRow: any = {};
    expect(getCol('priority').accessor(emptyRow)).toBe('');
    expect(getCol('code').accessor(emptyRow)).toBe('');
    expect(getCol('patient').accessor(emptyRow)).toBe('');
    expect(getCol('assignedTo').accessor(emptyRow)).toBe('Unassigned');
  });

  it('sortAccessors handle finite and non-finite values', () => {
    component.queueType = 'ar-specialist';
    component.activeTab = 'all';
    const cols = (component as any).buildColumns();
    const priorityCol = cols.find((c: any) => c.id === 'priority');

    expect(priorityCol.sortAccessor({ priority: 5 })).toBe(5);
    expect(priorityCol.sortAccessor({ priority: 'High' })).toBe('high');
    expect(priorityCol.sortAccessor({})).toBe('');

    const submittedCol = cols.find((c: any) => c.id === 'submitted');
    expect(submittedCol.sortAccessor({ submittedDate: '2025-01-01' })).toEqual(new Date('2025-01-01'));
    expect(submittedCol.sortAccessor({})).toBeNull();
  });

  // -- column accessors - all remaining columns with/without values ----------

  it('column accessors return defaults for ALL missing fields', () => {
    component.queueType = 'ar-specialist';
    component.activeTab = 'all';
    const cols = (component as any).buildColumns();
    const getCol = (id: string) => cols.find((c: any) => c.id === id);

    const emptyRow: any = {};
    expect(getCol('accountNumber').accessor(emptyRow)).toBe('');
    expect(getCol('payer').accessor(emptyRow)).toBe('');
    expect(getCol('submitted').accessor(emptyRow)).toBeNull();
    expect(getCol('dateOfService').accessor(emptyRow)).toBeNull();
    expect(getCol('charged').accessor(emptyRow)).toBe(0);
    expect(getCol('insBalance').accessor(emptyRow)).toBe(0);
    expect(getCol('aging').accessor(emptyRow)).toBe(0);
    expect(getCol('progress').accessor(emptyRow)).toBe(0);
    expect(getCol('claimStatusBadge').accessor(emptyRow)).toBe('');
    expect(getCol('slaStatusBadge').accessor(emptyRow)).toBe('');
  });

  it('column sortAccessors return numeric defaults for missing fields', () => {
    component.queueType = 'ar-specialist';
    component.activeTab = 'all';
    const cols = (component as any).buildColumns();
    const getCol = (id: string) => cols.find((c: any) => c.id === id);

    const emptyRow: any = {};
    expect(getCol('code').sortAccessor(emptyRow)).toBe('');
    expect(getCol('patient').sortAccessor(emptyRow)).toBe('');
    expect(getCol('accountNumber').sortAccessor(emptyRow)).toBe('');
    expect(getCol('payer').sortAccessor(emptyRow)).toBe('');
    expect(getCol('charged').sortAccessor(emptyRow)).toBe(0);
    expect(getCol('insBalance').sortAccessor(emptyRow)).toBe(0);
    expect(getCol('aging').sortAccessor(emptyRow)).toBe(0);
    expect(getCol('progress').sortAccessor(emptyRow)).toBe(0);
    expect(getCol('claimStatusBadge').sortAccessor(emptyRow)).toBe('');
    expect(getCol('slaStatusBadge').sortAccessor(emptyRow)).toBe('');
  });

  it('column sortAccessors return correct values when fields are present', () => {
    component.queueType = 'ar-specialist';
    component.activeTab = 'all';
    const cols = (component as any).buildColumns();
    const getCol = (id: string) => cols.find((c: any) => c.id === id);

    const row: any = {
      issueCode: 'CO-45', patient: 'Alice', accountNumber: 'A001',
      payer: 'Aetna', charged: 500, insBalance: 250,
      agingDays: 30, progress: 60, status: 'Open', SlaStatus: 'OK',
      submittedDate: '2025-01-01', dateOfService: '2025-01-15',
    };
    expect(getCol('code').sortAccessor(row)).toBe('co-45');
    expect(getCol('patient').sortAccessor(row)).toBe('alice');
    expect(getCol('accountNumber').sortAccessor(row)).toBe('a001');
    expect(getCol('payer').sortAccessor(row)).toBe('aetna');
    expect(getCol('charged').sortAccessor(row)).toBe(500);
    expect(getCol('insBalance').sortAccessor(row)).toBe(250);
    expect(getCol('aging').sortAccessor(row)).toBe(30);
    expect(getCol('progress').sortAccessor(row)).toBe(60);
    expect(getCol('claimStatusBadge').sortAccessor(row)).toBe('open');
    expect(getCol('slaStatusBadge').sortAccessor(row)).toBe('ok');
    expect(getCol('dateOfService').sortAccessor(row)).toEqual(new Date('2025-01-15'));
  });

  // -- applyClientFilters --
  it('applyClientFilters should return empty for null rows', () => {
    const result = (component as any).applyClientFilters(null, {});
    expect(result).toEqual([]);
  });

  it('applyClientFilters should return all rows when no filters', () => {
    const rows = [{ patient: 'John', id: 'CL1' }, { patient: 'Jane', id: 'CL2' }];
    const result = (component as any).applyClientFilters(rows, {});
    expect(result.length).toBe(2);
  });

  it('applyClientFilters should filter by search term', () => {
    const rows = [
      { patient: 'John Smith', payer: 'Aetna', issueCode: 'CO-45', id: 'CL1' },
      { patient: 'Jane Doe', payer: 'BCBS', issueCode: 'CO-16', id: 'CL2' },
    ];
    const result = (component as any).applyClientFilters(rows, { search: 'john' });
    expect(result.length).toBe(1);
    expect(result[0].patient).toBe('John Smith');
  });

  it('applyClientFilters searches by payer in term', () => {
    const rows = [
      { patient: 'John', payer: 'Aetna', issueCode: 'CO-45', id: 'CL1' },
      { patient: 'Jane', payer: 'BCBS', issueCode: 'CO-16', id: 'CL2' },
    ];
    const result = (component as any).applyClientFilters(rows, { search: 'aetna' });
    expect(result.length).toBe(1);
  });

  it('applyClientFilters searches by issueCode in term', () => {
    const rows = [
      { patient: 'John', payer: 'A', issueCode: 'CO-45', id: 'CL1' },
      { patient: 'Jane', payer: 'B', issueCode: 'CO-16', id: 'CL2' },
    ];
    const result = (component as any).applyClientFilters(rows, { search: 'CO-45' });
    expect(result.length).toBe(1);
  });

  it('applyClientFilters searches by assignedTo in term', () => {
    const rows = [
      { patient: 'John', payer: 'A', issueCode: '', id: 'CL1', assignedTo: 'Alice' },
      { patient: 'Jane', payer: 'B', issueCode: '', id: 'CL2', assignedTo: 'Bob' },
    ];
    const result = (component as any).applyClientFilters(rows, { search: 'alice' });
    expect(result.length).toBe(1);
  });

  it('applyClientFilters searches by providerName in term', () => {
    const rows = [
      { patient: 'John', payer: 'A', issueCode: '', id: 'CL1', providerName: 'Dr Smith' },
    ];
    const result = (component as any).applyClientFilters(rows, { search: 'smith' });
    expect(result.length).toBe(1);
  });

  it('applyClientFilters searches by location in term', () => {
    const rows = [
      { patient: 'John', payer: 'A', issueCode: '', id: 'CL1', location: 'Main Office' },
    ];
    const result = (component as any).applyClientFilters(rows, { search: 'main' });
    expect(result.length).toBe(1);
  });

  it('applyClientFilters searches by status in term', () => {
    const rows = [
      { patient: 'John', payer: 'A', issueCode: '', id: 'CL1', status: 'Escalated' },
    ];
    const result = (component as any).applyClientFilters(rows, { search: 'escalated' });
    expect(result.length).toBe(1);
  });

  it('applyClientFilters searches by escalationReason in term', () => {
    const rows = [
      { patient: 'John', payer: 'A', issueCode: '', id: 'CL1', escalationReason: 'payer dispute' },
    ];
    const result = (component as any).applyClientFilters(rows, { search: 'payer dispute' });
    expect(result.length).toBe(1);
  });

  it('applyClientFilters should filter by patient name', () => {
    const rows = [{ patient: 'John Smith', payer: 'Aetna', issueCode: 'CO-45', id: 'CL1' }];
    const result = (component as any).applyClientFilters(rows, { patient: 'John' });
    expect(result.length).toBe(1);
  });

  it('applyClientFilters should filter by claimId', () => {
    const rows = [
      { patient: 'John', id: 'CL123', payer: 'A', issueCode: 'X' },
      { patient: 'Jane', id: 'CL456', payer: 'B', issueCode: 'Y' },
    ];
    const result = (component as any).applyClientFilters(rows, { claimId: '123' });
    expect(result.length).toBe(1);
  });

  it('applyClientFilters should filter by payer', () => {
    const rows = [
      { patient: 'John', payer: 'Aetna', issueCode: '', id: 'CL1' },
      { patient: 'Jane', payer: 'BCBS', issueCode: '', id: 'CL2' },
    ];
    const result = (component as any).applyClientFilters(rows, { payer: 'Aetna' });
    expect(result.length).toBe(1);
  });

  it('applyClientFilters should filter by issueCode', () => {
    const rows = [
      { patient: 'John', issueCode: 'CO-45', id: 'CL1' },
      { patient: 'Jane', issueCode: 'CO-16', id: 'CL2' },
    ];
    const result = (component as any).applyClientFilters(rows, { issueCode: 'CO-45' });
    expect(result.length).toBe(1);
  });

  it('applyClientFilters should filter by priority', () => {
    const rows = [
      { patient: 'John', priority: 'High', id: 'CL1' },
      { patient: 'Jane', priority: 'Low', id: 'CL2' },
    ];
    const result = (component as any).applyClientFilters(rows, { priority: 'High' });
    expect(result.length).toBe(1);
  });

  it('applyClientFilters passes through when priority is null', () => {
    const rows = [
      { patient: 'John', priority: null, id: 'CL1' },
    ];
    const result = (component as any).applyClientFilters(rows, { priority: 'High' });
    // null priority does not fail the filter (skips the check)
    expect(result.length).toBe(1);
  });

  it('applyClientFilters should filter by date range', () => {
    const rows = [
      { patient: 'John', submittedDate: '2025-06-15', id: 'CL1' },
      { patient: 'Jane', submittedDate: '2025-01-01', id: 'CL2' },
    ];
    const result = (component as any).applyClientFilters(rows, {
      submittedFrom: new Date('2025-06-01'),
      submittedTo: new Date('2025-06-30'),
    });
    expect(result.length).toBe(1);
  });

  it('applyClientFilters filters by submittedFrom only', () => {
    const rows = [
      { patient: 'John', submittedDate: '2025-06-15', id: 'CL1' },
      { patient: 'Jane', submittedDate: '2025-01-01', id: 'CL2' },
    ];
    const result = (component as any).applyClientFilters(rows, { submittedFrom: new Date('2025-06-01') });
    expect(result.length).toBe(1);
    expect(result[0].id).toBe('CL1');
  });

  it('applyClientFilters filters by submittedTo only', () => {
    const rows = [
      { patient: 'John', submittedDate: '2025-06-15', id: 'CL1' },
      { patient: 'Jane', submittedDate: '2025-01-01', id: 'CL2' },
    ];
    const result = (component as any).applyClientFilters(rows, { submittedTo: new Date('2025-03-01') });
    expect(result.length).toBe(1);
    expect(result[0].id).toBe('CL2');
  });

  it('applyClientFilters should filter by charged range', () => {
    const rows = [
      { patient: 'John', charged: 100, id: 'CL1' },
      { patient: 'Jane', charged: 500, id: 'CL2' },
    ];
    const result = (component as any).applyClientFilters(rows, { minCharged: 200 });
    expect(result.length).toBe(1);
    const result2 = (component as any).applyClientFilters(rows, { maxCharged: 200 });
    expect(result2.length).toBe(1);
  });

  it('applyClientFilters should filter by insBalance range', () => {
    const rows = [
      { patient: 'John', insBalance: 50, id: 'CL1' },
      { patient: 'Jane', insBalance: 200, id: 'CL2' },
    ];
    const result = (component as any).applyClientFilters(rows, { minInsBalance: 100 });
    expect(result.length).toBe(1);
    const result2 = (component as any).applyClientFilters(rows, { maxInsBalance: 100 });
    expect(result2.length).toBe(1);
  });

  it('applyClientFilters should filter by aging range', () => {
    const rows = [
      { patient: 'John', agingDays: 10, id: 'CL1' },
      { patient: 'Jane', agingDays: 50, id: 'CL2' },
    ];
    const result = (component as any).applyClientFilters(rows, { minAging: 30 });
    expect(result.length).toBe(1);
    const result2 = (component as any).applyClientFilters(rows, { maxAging: 30 });
    expect(result2.length).toBe(1);
  });

  it('applyClientFilters should filter by progress range', () => {
    const rows = [
      { patient: 'John', progress: 25, id: 'CL1' },
      { patient: 'Jane', progress: 75, id: 'CL2' },
    ];
    const result = (component as any).applyClientFilters(rows, { minProgress: 50 });
    expect(result.length).toBe(1);
    const result2 = (component as any).applyClientFilters(rows, { maxProgress: 50 });
    expect(result2.length).toBe(1);
  });

  it('applyClientFilters should filter by slaStatus critical', () => {
    const rows = [
      { patient: 'John', SlaStatus: 'OVERDUE', id: 'CL1' },
      { patient: 'Jane', SlaStatus: 'URGENT', id: 'CL2' },
      { patient: 'Bob', SlaStatus: 'OK', id: 'CL3' },
    ];
    const result = (component as any).applyClientFilters(rows, { slaStatus: 'critical' });
    expect(result.length).toBe(2);
  });

  it('applyClientFilters should filter by specific slaStatus', () => {
    const rows = [
      { patient: 'John', SlaStatus: 'OVERDUE', id: 'CL1' },
      { patient: 'Jane', SlaStatus: 'OK', id: 'CL2' },
    ];
    const result = (component as any).applyClientFilters(rows, { slaStatus: 'OVERDUE' });
    expect(result.length).toBe(1);
  });

  it('applyClientFilters should filter by assignedTo (unassigned)', () => {
    const rows = [
      { patient: 'John', id: 'CL1', assignedTo: null },
      { patient: 'Jane', id: 'CL2', assignedTo: 'Alice' },
      { patient: 'Bob', id: 'CL3', assignedTo: 'Unassigned' },
    ];
    const result = (component as any).applyClientFilters(rows, { assignedTo: 'unassigned' });
    expect(result.length).toBe(2); // null and 'Unassigned' both pass
  });

  it('applyClientFilters should filter by assignedTo (specific user)', () => {
    const rows = [
      { patient: 'John', id: 'CL1', assignedTo: 'Alice Johnson' },
      { patient: 'Jane', id: 'CL2', assignedTo: 'Bob Smith' },
    ];
    const result = (component as any).applyClientFilters(rows, { assignedTo: 'alice' });
    expect(result.length).toBe(1);
  });

  it('applyClientFilters should filter by billingProvider', () => {
    const rows = [
      { patient: 'John', id: 'CL1', providerName: 'Dr Smith' },
      { patient: 'Jane', id: 'CL2', providerName: 'Dr Jones' },
    ];
    const result = (component as any).applyClientFilters(rows, { billingProvider: 'Smith' });
    expect(result.length).toBe(1);
  });

  it('applyClientFilters should filter by placeOfService', () => {
    const rows = [
      { patient: 'John', id: 'CL1', location: 'Main Office' },
      { patient: 'Jane', id: 'CL2', location: 'East Branch' },
    ];
    const result = (component as any).applyClientFilters(rows, { placeOfService: 'main' });
    expect(result.length).toBe(1);
  });

  it('applyClientFilters should filter by claimStatus', () => {
    const rows = [
      { patient: 'John', id: 'CL1', claimStatus: 'Open' },
      { patient: 'Jane', id: 'CL2', claimStatus: 'Closed' },
      { patient: 'Bob', id: 'CL3', status: 'Pending' },
    ];
    const result = (component as any).applyClientFilters(rows, { claimStatus: 'open' });
    expect(result.length).toBe(1);
  });

  it('applyClientFilters should filter by denialReason', () => {
    const rows = [
      { patient: 'John', id: 'CL1', issueCode: 'CO-45' },
      { patient: 'Jane', id: 'CL2', issueCode: 'PR-27' },
    ];
    const result = (component as any).applyClientFilters(rows, { denialReason: 'co-45' });
    expect(result.length).toBe(1);
  });

  it('applyClientFilters should filter by escalationReason', () => {
    const rows = [
      { patient: 'John', id: 'CL1', escalationReason: 'payer dispute' },
      { patient: 'Jane', id: 'CL2', escalationReason: 'timely filing' },
    ];
    const result = (component as any).applyClientFilters(rows, { escalationReason: 'payer' });
    expect(result.length).toBe(1);
  });

  // -- claimStatusClass --
  it('claimStatusClass returns open for open status', () => {
    expect(component.claimStatusClass('open')).toBe('status-chip status-diq-open');
    expect(component.claimStatusClass('Open')).toBe('status-chip status-diq-open');
  });

  it('claimStatusClass returns inprogress for in progress status', () => {
    expect(component.claimStatusClass('inprogress')).toBe('status-chip status-diq-inprogress');
    expect(component.claimStatusClass('In Progress')).toBe('status-chip status-diq-inprogress');
  });

  it('claimStatusClass returns escalated', () => {
    expect(component.claimStatusClass('escalated')).toBe('status-chip status-diq-escalated');
  });

  it('claimStatusClass returns pending', () => {
    expect(component.claimStatusClass('pending')).toBe('status-chip status-diq-pending');
  });

  it('claimStatusClass returns closed', () => {
    expect(component.claimStatusClass('closed')).toBe('status-chip status-diq-closed');
  });

  it('claimStatusClass returns adjudicated', () => {
    expect(component.claimStatusClass('adjudicated')).toBe('status-chip status-diq-adjudicated');
  });

  it('claimStatusClass returns open for unknown status', () => {
    expect(component.claimStatusClass('unknown')).toBe('status-chip status-diq-open');
    expect(component.claimStatusClass('')).toBe('status-chip status-diq-open');
    expect(component.claimStatusClass(null as any)).toBe('status-chip status-diq-open');
  });

  // -- fetchRows routing --
  it('fetchRows should use manager escalations for manager + escalated tab', () => {
    component.queueType = 'manager';
    component.activeTab = 'escalated';
    mockClaimService.getManagerEscalations.calls.reset();
    (component as any).refresh();
    expect(mockClaimService.getManagerEscalations).toHaveBeenCalled();
  });

  it('fetchRows should use manager all claims for manager + all tab', () => {
    component.queueType = 'manager';
    component.activeTab = 'all';
    mockClaimService.getManagerAllClaims.calls.reset();
    (component as any).refresh();
    expect(mockClaimService.getManagerAllClaims).toHaveBeenCalled();
  });

  it('fetchRows should use manager unassigned for manager + unassigned tab', () => {
    component.queueType = 'manager';
    component.activeTab = 'unassigned';
    mockClaimService.getManagerUnassigned.calls.reset();
    (component as any).refresh();
    expect(mockClaimService.getManagerUnassigned).toHaveBeenCalled();
  });

  it('fetchRows should use manager escalations for manager + my tab (fallback)', () => {
    component.queueType = 'manager';
    component.activeTab = 'my';
    mockClaimService.getManagerEscalations.calls.reset();
    (component as any).refresh();
    expect(mockClaimService.getManagerEscalations).toHaveBeenCalled();
  });

  it('fetchRows should use manager escalations for manager + pending tab (fallback)', () => {
    component.queueType = 'manager';
    component.activeTab = 'pending';
    mockClaimService.getManagerEscalations.calls.reset();
    (component as any).refresh();
    expect(mockClaimService.getManagerEscalations).toHaveBeenCalled();
  });

  it('fetchRows should use ar my queue for ar-specialist + my tab', () => {
    component.queueType = 'ar-specialist';
    component.activeTab = 'my';
    mockClaimService.getArMyQueue.calls.reset();
    (component as any).refresh();
    expect(mockClaimService.getArMyQueue).toHaveBeenCalled();
  });

  it('fetchRows should use ar pending queue for ar-specialist + pending tab', () => {
    component.queueType = 'ar-specialist';
    component.activeTab = 'pending';
    mockClaimService.getArPendingQueue.calls.reset();
    (component as any).refresh();
    expect(mockClaimService.getArPendingQueue).toHaveBeenCalled();
  });

  it('fetchRows should use ar escalations for ar-specialist + escalated tab', () => {
    component.queueType = 'ar-specialist';
    component.activeTab = 'escalated';
    mockClaimService.getArEscalations.calls.reset();
    (component as any).refresh();
    expect(mockClaimService.getArEscalations).toHaveBeenCalled();
  });

  it('fetchRows should use ar unassigned for ar-specialist + unassigned tab', () => {
    component.queueType = 'ar-specialist';
    component.activeTab = 'unassigned';
    mockClaimService.getArUnassigned.calls.reset();
    (component as any).refresh();
    expect(mockClaimService.getArUnassigned).toHaveBeenCalled();
  });

  it('fetchRows should use ar all claims for ar-specialist + all tab', () => {
    component.queueType = 'ar-specialist';
    component.activeTab = 'all';
    mockClaimService.getArAllClaims.calls.reset();
    (component as any).refresh();
    expect(mockClaimService.getArAllClaims).toHaveBeenCalled();
  });

  // -- refresh error handling --
  it('refresh should handle error by setting empty rows', () => {
    mockClaimService.getArMyQueue.and.returnValue(throwError(() => new Error('fail')));
    (component as any).refresh();
    expect(component.totalCount).toBe(0);
  });

  // -- refresh with data --
  it('refresh should populate rows and totalCount', () => {
    const page = { data: [{ id: 'CL1', patient: 'John' }], totalCount: 50, page: 0, pageSize: 25 };
    mockClaimService.getArMyQueue.and.returnValue(of(page));
    (component as any).refresh();
    expect(component.totalCount).toBe(50);
  });

  it('tabSwitch$ stores criticalCount from api response', () => {
    const page = { data: [], totalCount: 5, page: 0, pageSize: 25, criticalCount: 3 };
    mockClaimService.getArAllClaims.and.returnValue(of(page as any));
    component.setTab('all'); // triggers tabSwitch$
    expect((component as any)._criticalCountFromApi).toBe(3);
    expect(component.criticalSlaCount).toBe(3);
  });

  it('tabSwitch$ resets criticalCount on error', () => {
    (component as any)._criticalCountFromApi = 5;
    mockClaimService.getArAllClaims.and.returnValue(throwError(() => new Error('fail')));
    component.setTab('all'); // triggers tabSwitch$
    expect((component as any)._criticalCountFromApi).toBeUndefined();
  });

  // -- ngOnDestroy --
  it('ngOnDestroy should complete destroy$', () => {
    expect(() => component.ngOnDestroy()).not.toThrow();
  });

  // -- criticalSlaCount - when _criticalCountFromApi is defined -------------

  it('criticalSlaCount should use _criticalCountFromApi when defined', () => {
    (component as any)._criticalCountFromApi = 7;
    expect(component.criticalSlaCount).toBe(7);
  });

  it('criticalSlaCount should count from rows when _criticalCountFromApi is undefined', () => {
    (component as any)._criticalCountFromApi = undefined;
    const rows = [
      { id: 'CL1', SlaStatus: 'OVERDUE' },
      { id: 'CL2', SlaStatus: 'NORMAL' },
      { id: 'CL3', SlaStatus: 'URGENT' },
    ] as any;
    (component as any).rowsRaw$.next(rows);
    expect(component.criticalSlaCount).toBe(2);
  });

  // -- pageTitle - manager branch -----------------------------------------

  it('pageTitle should return "My Queue" for manager queueType', () => {
    component.queueType = 'manager';
    expect(component.pageTitle).toBe('My Queue');
  });

  it('pageTitle should return "Escalations" for ar-specialist queueType', () => {
    component.queueType = 'ar-specialist';
    expect(component.pageTitle).toBe('Escalations');
  });

  // -- view() - navigates to claim detail ------------------------------------

  it('view should navigate to claim detail', () => {
    const row = { id: 'CL123', patient: 'John Doe' } as any;
    component.view(row);
    expect(mockRouter.navigate).toHaveBeenCalledWith(['../', 'CL123'], jasmine.objectContaining({ state: { patient: 'John Doe' } }));
  });

  // -- bulkClose - dialog interaction branches --------------------------------
  // NOTE: bulkClose() resets this.closeReason='' before opening dialog.
  // Use Subject so we can set closeReason between reset and dialog resolve.

  describe('bulkClose', () => {
    beforeEach(() => {
      component.selectedClaimIds = new Set(['CL1', 'CL2']);
      mockClaimService.bulkClose = jasmine.createSpy('bulkClose').and.returnValue(of({ closed: 2, skipped: 0 }));
    });

    it('should not call bulkClose when dialog returns non-primary', () => {
      mockDialog.openTemplate.and.returnValue(of({ action: 'cancel' }));
      component.bulkClose();
      expect(mockClaimService.bulkClose).not.toHaveBeenCalled();
    });

    it('should call bulkClose when dialog returns primary and closeReason is set', () => {
      const dlg = new Subject<any>();
      mockDialog.openTemplate.and.returnValue(dlg.asObservable());
      component.bulkClose();
      component.closeReason = 'Approved';
      dlg.next({ action: 'primary' });
      dlg.complete();
      expect(mockClaimService.bulkClose).toHaveBeenCalledWith(['CL1', 'CL2'], 'Approved');
    });

    it('should show success message with skipped count', () => {
      const dlg = new Subject<any>();
      mockDialog.openTemplate.and.returnValue(dlg.asObservable());
      mockClaimService.bulkClose.and.returnValue(of({ closed: 1, skipped: 1 }));
      component.bulkClose();
      component.closeReason = 'Done';
      dlg.next({ action: 'primary' });
      dlg.complete();
      expect(mockSnack.open).toHaveBeenCalledWith('1 closed, 1 already closed', 'OK', jasmine.anything());
    });

    it('should show success message without skipped when skipped is 0', () => {
      const dlg = new Subject<any>();
      mockDialog.openTemplate.and.returnValue(dlg.asObservable());
      mockClaimService.bulkClose.and.returnValue(of({ closed: 2, skipped: 0 }));
      component.bulkClose();
      component.closeReason = 'Done';
      dlg.next({ action: 'primary' });
      dlg.complete();
      expect(mockSnack.open).toHaveBeenCalledWith('2 claim(s) closed', 'OK', jasmine.anything());
    });
  });

  // -- bulkUnassign - forkJoin branches --------------------------------------

  describe('bulkUnassign', () => {
    beforeEach(() => {
      component.selectedClaimIds = new Set(['CL1', 'CL2']);
      mockClaimService.unassignClaim.and.returnValue(of({}));
    });

    it('should not unassign when dialog is rejected', () => {
      mockDialog.confirm.and.returnValue(of(false));
      component.bulkUnassign();
      expect(mockClaimService.unassignClaim).not.toHaveBeenCalled();
    });

    it('should unassign all selected claims when dialog is confirmed', async () => {
      mockDialog.confirm.and.returnValue(of(true));
      component.bulkUnassign();
      // wait for the dynamic import of rxjs forkJoin
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(mockClaimService.unassignClaim).toHaveBeenCalledTimes(2);
    });
  });

  // -- bulkAssignTo - with assignableUsers already loaded -------------------

  describe('bulkAssignTo with users already loaded', () => {
    beforeEach(() => {
      component.selectedClaimIds = new Set(['CL1', 'CL2']);
      component.assignableUsers = [{ id: 1, name: 'Alice' }] as any;
      mockDialog.openTemplate.and.returnValue(of({ action: 'primary' }));
      component.assignTargetUserId = 1;
      // ngOnInit pre-loads assignable users, so reset the spy to measure
      // only what bulkAssignTo() itself does.
      mockClaimService.getAssignableUsers.calls.reset();
    });

    it('should call bulkReassign when targetUser found', () => {
      mockDialog.openTemplate.and.returnValue(of(null));
      component.bulkAssignTo();
      // Dialog returns null -> no primary action, so no reassign
      expect(mockClaimService.bulkReassign).not.toHaveBeenCalled();
    });

    it('should open dialog directly when assignableUsers are already loaded', () => {
      component.bulkAssignTo();
      expect(mockDialog.openTemplate).toHaveBeenCalled();
      expect(mockClaimService.getAssignableUsers).not.toHaveBeenCalled();
    });

    it('should load users if not pre-loaded', () => {
      component.assignableUsers = [];
      mockClaimService.getAssignableUsers.and.returnValue(of([{ id: 'user1', name: 'Alice' }] as any));
      mockDialog.openTemplate.and.returnValue(of(null));
      component.bulkAssignTo();
      expect(mockClaimService.getAssignableUsers).toHaveBeenCalled();
    });
  });

  // -- refresh - res.data null (uses ?? []) ---------------------------------

  it('refresh should use [] when res.data is null', () => {
    mockClaimService.getArMyQueue.and.returnValue(of({ data: null, totalCount: 0, page: 0, pageSize: 25 } as any));
    (component as any).refresh();
    expect((component as any).rowsRaw$.value).toEqual([]);
  });

  // -- column accessor null branches -----------------------------------------

  describe('column accessor null branches', () => {
    it('code column accessor returns empty string when issueCode is null', () => {
      const col = component.columns.find(c => c.id === 'code')!;
      expect(col.accessor!({ issueCode: null } as any)).toBe('');
    });

    it('patient column accessor returns empty string when patient is null', () => {
      const col = component.columns.find(c => c.id === 'patient')!;
      expect(col.accessor!({ patient: null } as any)).toBe('');
    });

    it('accountNumber column accessor returns empty string when null', () => {
      const col = component.columns.find(c => c.id === 'accountNumber')!;
      expect(col.accessor!({ accountNumber: null } as any)).toBe('');
    });

    it('payer column accessor returns empty string when null', () => {
      const col = component.columns.find(c => c.id === 'payer')!;
      expect(col.accessor!({ payer: null } as any)).toBe('');
    });

    it('submitted column accessor returns null when submittedDate is null', () => {
      const col = component.columns.find(c => c.id === 'submitted')!;
      expect(col.accessor!({ submittedDate: null } as any)).toBeNull();
    });

    it('dateOfService column accessor returns null when dateOfService is null', () => {
      const col = component.columns.find(c => c.id === 'dateOfService')!;
      expect(col.accessor!({ dateOfService: null } as any)).toBeNull();
    });

    it('charged column accessor returns 0 when charged is null', () => {
      const col = component.columns.find(c => c.id === 'charged')!;
      expect(col.accessor!({ charged: null } as any)).toBe(0);
    });

    it('priority column accessor returns empty string for ar-specialist when priority is null', () => {
      // priority column only exists for ar-specialist
      component.queueType = 'ar-specialist';
      const col = component.columns.find(c => c.id === 'priority')!;
      if (col) {
        expect(col.accessor!({ priority: null } as any)).toBe('');
      }
    });
  });

  // -- fetchRows default switch case -----------------------------------------

  it('fetchRows should use ar my queue for unknown ar-specialist tab (default)', () => {
    component.queueType = 'ar-specialist';
    component.activeTab = 'unknown-tab' as any;
    mockClaimService.getArMyQueue.calls.reset();
    (component as any).refresh();
    expect(mockClaimService.getArMyQueue).toHaveBeenCalled();
  });
});

// -- Manager route variant --
describe('ClaimQueueListComponent (manager)', () => {
  let component: ClaimQueueListComponent;
  let fixture: ComponentFixture<ClaimQueueListComponent>;
  let mockClaimService: jasmine.SpyObj<ClaimService>;

  const emptyPage = { data: [], totalCount: 0, page: 0, pageSize: 25 };

  beforeEach(async () => {
    mockClaimService = jasmine.createSpyObj('ClaimService', [
      'getArMyQueue', 'getArAllClaims', 'getArEscalations', 'getArUnassigned', 'getArPendingQueue',
      'getManagerEscalations', 'getManagerAllClaims', 'getManagerUnassigned',
      'bulkAssign', 'bulkEscalate', 'bulkClose', 'autoAssign',
      'assignClaim', 'escalateClaim', 'unassignClaim', 'bulkReassign', 'getAssignableUsers',
    ]);
    // Every queue fetch must return an observable: fetchRows() pipes the result
    // straight through, so an unstubbed spy returns undefined and breaks ngOnInit.
    [
      'getArMyQueue', 'getArAllClaims', 'getArEscalations', 'getArUnassigned', 'getArPendingQueue',
      'getManagerEscalations', 'getManagerAllClaims', 'getManagerUnassigned',
    ].forEach(m => (mockClaimService as any)[m].and.returnValue(of(emptyPage)));
    mockClaimService.getAssignableUsers.and.returnValue(of([]));

    await TestBed.configureTestingModule({
      declarations: [ClaimQueueListComponent],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        { provide: ClaimService, useValue: mockClaimService },
        { provide: Router, useValue: jasmine.createSpyObj('Router', ['navigate']) },
        {
          provide: ActivatedRoute,
          useValue: {
            data: of({ queueType: 'manager' }),
            queryParamMap: of({ get: () => null }),
            snapshot: { queryParamMap: { get: () => null } },
            params: of({}),
          },
        },
        { provide: DenialIqContextService, useValue: { setRole: () => {}, role$: of('manager') } },
        { provide: ChangeDetectorRef, useValue: { markForCheck: () => {} } },
        { provide: RpDialogService, useValue: { confirm: () => of(false), dangerConfirm: () => of(false) } },
        { provide: SocketService, useValue: { onClaimUpdated: () => of() } },
        { provide: MatSnackBar, useValue: { open: jasmine.createSpy('open') } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ClaimQueueListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should set queueType to manager from route data', () => {
    expect(component.queueType).toBe('manager');
  });

  it('should set default activeTab to escalated for manager', () => {
    expect(component.activeTab).toBe('escalated');
  });

  it('should fetch manager escalations on init', () => {
    expect(mockClaimService.getManagerEscalations).toHaveBeenCalled();
  });

  it('buildColumns for manager should not include priority column', () => {
    const priorityCol = component.columns.find(c => c.id === 'priority');
    expect(priorityCol).toBeFalsy();
  });
});

// -- Tab query param variant --
describe('ClaimQueueListComponent (tab query param)', () => {
  let component: ClaimQueueListComponent;
  let fixture: ComponentFixture<ClaimQueueListComponent>;
  let mockClaimService: jasmine.SpyObj<ClaimService>;

  const emptyPage = { data: [], totalCount: 0, page: 0, pageSize: 25 };

  beforeEach(async () => {
    mockClaimService = jasmine.createSpyObj('ClaimService', [
      'getArMyQueue', 'getArAllClaims', 'getArEscalations', 'getArUnassigned', 'getArPendingQueue',
      'getManagerEscalations', 'getManagerAllClaims', 'getManagerUnassigned',
      'bulkAssign', 'bulkEscalate', 'bulkClose', 'autoAssign',
      'assignClaim', 'escalateClaim', 'unassignClaim', 'bulkReassign', 'getAssignableUsers',
    ]);
    // Stub every queue fetch: fetchRows() pipes the result straight through.
    [
      'getArMyQueue', 'getArAllClaims', 'getArEscalations', 'getArUnassigned', 'getArPendingQueue',
      'getManagerEscalations', 'getManagerAllClaims', 'getManagerUnassigned',
    ].forEach(m => (mockClaimService as any)[m]?.and.returnValue(of(emptyPage)));
    mockClaimService.getAssignableUsers?.and.returnValue(of([]));

    await TestBed.configureTestingModule({
      declarations: [ClaimQueueListComponent],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        { provide: ClaimService, useValue: mockClaimService },
        { provide: Router, useValue: jasmine.createSpyObj('Router', ['navigate']) },
        {
          provide: ActivatedRoute,
          useValue: {
            data: of({ queueType: 'ar-specialist' }),
            queryParamMap: of({ get: (key: string) => key === 'tab' ? 'all' : null }),
            snapshot: { queryParamMap: { get: (key: string) => key === 'tab' ? 'all' : null } },
            params: of({}),
          },
        },
        { provide: DenialIqContextService, useValue: { setRole: () => {}, role$: of('ar-specialist') } },
        { provide: ChangeDetectorRef, useValue: { markForCheck: () => {} } },
        { provide: RpDialogService, useValue: { confirm: () => of(false), dangerConfirm: () => of(false) } },
        { provide: SocketService, useValue: { onClaimUpdated: () => of() } },
        { provide: MatSnackBar, useValue: { open: jasmine.createSpy('open') } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ClaimQueueListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should use tab query param when provided', () => {
    expect(component.activeTab).toBe('all');
  });
});
