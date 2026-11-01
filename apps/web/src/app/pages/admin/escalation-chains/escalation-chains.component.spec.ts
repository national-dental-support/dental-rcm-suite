import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { of, throwError } from 'rxjs';
import { EscalationChainsAdminComponent } from './escalation-chains.component';
import { EscalationChainsService, EscalationChain } from '../../../core/services/escalation-chains.service';
import { RpDialogService } from '../../../shared/components/dialogs/dialog-shell/dialog.service';

const MOCK_CHAIN: EscalationChain = {
  id: 1,
  name: 'Default Chain',
  description: 'Test',
  isActive: true,
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
  levels: [
    { id: 1, chainId: 1, levelOrder: 1, targetRole: 'AR Specialist', slaHours: 48, notifyAtPct: 75, description: null },
    { id: 2, chainId: 1, levelOrder: 2, targetRole: 'Manager', slaHours: 24, notifyAtPct: 75, description: 'Escalate' },
  ],
};

describe('EscalationChainsAdminComponent', () => {
  let component: EscalationChainsAdminComponent;
  let fixture: ComponentFixture<EscalationChainsAdminComponent>;
  let svc: any;
  let dialog: any;

  beforeEach(async () => {
    svc = {
      listChains: jasmine.createSpy('listChains').and.returnValue(of([MOCK_CHAIN])),
      createChain: jasmine.createSpy('createChain').and.returnValue(of(null)),
      updateChain: jasmine.createSpy('updateChain').and.returnValue(of(null)),
      deleteChain: jasmine.createSpy('deleteChain').and.returnValue(of(null)),
      getSlaStatus: jasmine.createSpy('getSlaStatus').and.returnValue(of({
        data: [{ claimId: 'CL1', patientName: 'Doe', assignedTo: 'user', status: 'breached' }],
        summary: { breached: 1, warning: 0, ok: 0, total: 1 },
      })),
      triggerAutoEscalate: jasmine.createSpy('triggerAutoEscalate').and.returnValue(of({ escalated: 2 })),
    };

    dialog = {
      confirm: jasmine.createSpy('confirm').and.returnValue(of(true)),
      dangerConfirm: jasmine.createSpy('dangerConfirm').and.returnValue(of(true)),
    };

    await TestBed.configureTestingModule({
      declarations: [EscalationChainsAdminComponent],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        { provide: EscalationChainsService, useValue: svc },
        { provide: RpDialogService, useValue: dialog },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(EscalationChainsAdminComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load chains on init', () => {
    expect(svc.listChains).toHaveBeenCalled();
    expect(component.chains.length).toBe(1);
    expect(component.loading).toBeFalse();
  });

  it('should set loading false on listChains error', () => {
    svc.listChains.and.returnValue(throwError(() => new Error('fail')));
    component.loadChains();
    expect(component.loading).toBeFalse();
  });

  // -- addChain ------------------------------------------------------

  it('should initialize new chain with one level', () => {
    component.addChain();
    expect(component.isNew).toBeTrue();
    expect(component.editingChain).toBeTruthy();
    expect(component.editingChain!.name).toBe('');
    expect(component.editLevels.length).toBe(1);
  });

  // -- editChain -----------------------------------------------------

  it('should populate editingChain from existing chain', () => {
    component.editChain(MOCK_CHAIN);
    expect(component.isNew).toBeFalse();
    expect(component.editingChain!.name).toBe('Default Chain');
    expect(component.editLevels.length).toBe(2);
  });

  // -- cancelEdit ----------------------------------------------------

  it('should clear editing state', () => {
    component.addChain();
    component.cancelEdit();
    expect(component.editingChain).toBeNull();
    expect(component.editLevels.length).toBe(0);
  });

  // -- addLevel / removeLevel ----------------------------------------

  it('should add a level', () => {
    component.addChain();
    const before = component.editLevels.length;
    component.addLevel();
    expect(component.editLevels.length).toBe(before + 1);
  });

  it('should remove a level', () => {
    component.addChain();
    component.addLevel();
    const before = component.editLevels.length;
    component.removeLevel(0);
    expect(component.editLevels.length).toBe(before - 1);
  });

  // -- moveLevel -----------------------------------------------------

  it('should swap levels when moving down', () => {
    component.editChain(MOCK_CHAIN);
    const first = component.editLevels[0];
    const second = component.editLevels[1];
    component.moveLevel(0, 1);
    expect(component.editLevels[0]).toBe(second);
    expect(component.editLevels[1]).toBe(first);
  });

  it('should not swap when moving up from index 0', () => {
    component.editChain(MOCK_CHAIN);
    const first = component.editLevels[0];
    component.moveLevel(0, -1);
    expect(component.editLevels[0]).toBe(first);
  });

  it('should not swap when moving down from last index', () => {
    component.editChain(MOCK_CHAIN);
    const last = component.editLevels[component.editLevels.length - 1];
    component.moveLevel(component.editLevels.length - 1, 1);
    expect(component.editLevels[component.editLevels.length - 1]).toBe(last);
  });

  // -- saveChain (new) -----------------------------------------------

  it('should call createChain when saving new chain', () => {
    component.addChain();
    component.editingChain!.name = 'New Chain';
    component.saveChain();
    expect(svc.createChain).toHaveBeenCalled();
    expect(component.editingChain).toBeNull();
  });

  it('should call updateChain when saving existing chain', () => {
    component.editChain(MOCK_CHAIN);
    component.saveChain();
    expect(svc.updateChain).toHaveBeenCalledWith(1, jasmine.any(Object));
    expect(component.editingChain).toBeNull();
  });

  it('should do nothing when saveChain called without editingChain', () => {
    component.editingChain = null;
    component.saveChain();
    expect(svc.createChain).not.toHaveBeenCalled();
    expect(svc.updateChain).not.toHaveBeenCalled();
  });

  it('should set saving false on save error', () => {
    svc.createChain.and.returnValue(throwError(() => new Error('fail')));
    component.addChain();
    component.editingChain!.name = 'Fail Chain';
    component.saveChain();
    expect(component.saving).toBeFalse();
  });

  // -- deleteChain ---------------------------------------------------

  it('should delete chain when confirmed', () => {
    component.deleteChain(MOCK_CHAIN);
    expect(dialog.dangerConfirm).toHaveBeenCalled();
    expect(svc.deleteChain).toHaveBeenCalledWith(1);
  });

  it('should not delete chain when not confirmed', () => {
    dialog.dangerConfirm.and.returnValue(of(false));
    component.deleteChain(MOCK_CHAIN);
    expect(svc.deleteChain).not.toHaveBeenCalled();
  });

  // -- toggleActive --------------------------------------------------

  it('should toggle chain active status', () => {
    component.toggleActive(MOCK_CHAIN);
    expect(svc.updateChain).toHaveBeenCalledWith(1, jasmine.objectContaining({ isActive: false }));
  });

  // -- SLA tab -------------------------------------------------------

  it('should switch to SLA tab and load SLA data', () => {
    component.switchTab('sla');
    expect(component.activeTab).toBe('sla');
    expect(svc.getSlaStatus).toHaveBeenCalled();
    expect(component.slaRows.length).toBe(1);
  });

  it('should not reload SLA if already loaded', () => {
    component.switchTab('sla');
    svc.getSlaStatus.calls.reset();
    component.switchTab('sla');
    expect(svc.getSlaStatus).not.toHaveBeenCalled();
  });

  it('should switch back to chains tab', () => {
    component.switchTab('sla');
    component.switchTab('chains');
    expect(component.activeTab).toBe('chains');
  });

  it('should set slaLoading false on SLA error', () => {
    svc.getSlaStatus.and.returnValue(throwError(() => new Error('fail')));
    component.loadSla();
    expect(component.slaLoading).toBeFalse();
  });

  // -- triggerEscalation ---------------------------------------------

  it('should trigger auto-escalation when confirmed', () => {
    component.triggerEscalation();
    expect(dialog.confirm).toHaveBeenCalled();
    expect(svc.triggerAutoEscalate).toHaveBeenCalled();
    expect(component.escalating).toBeFalse();
  });

  it('should not trigger escalation when not confirmed', () => {
    dialog.confirm.and.returnValue(of(false));
    component.triggerEscalation();
    expect(svc.triggerAutoEscalate).not.toHaveBeenCalled();
  });

  it('should set escalating false on triggerAutoEscalate error', () => {
    svc.triggerAutoEscalate.and.returnValue(throwError(() => new Error('fail')));
    component.triggerEscalation();
    expect(component.escalating).toBeFalse();
  });

  // -- slaStatusClass ------------------------------------------------

  it('should return sla-breached for breached', () => {
    expect(component.slaStatusClass('breached')).toBe('sla-breached');
  });

  it('should return sla-warning for warning', () => {
    expect(component.slaStatusClass('warning')).toBe('sla-warning');
  });

  it('should return sla-ok for ok', () => {
    expect(component.slaStatusClass('ok')).toBe('sla-ok');
  });

  it('should return sla-ok for unknown status', () => {
    expect(component.slaStatusClass('whatever')).toBe('sla-ok');
  });

  // -- formatHours ---------------------------------------------------

  it('should format hours < 24 as hours', () => {
    expect(component.formatHours(12)).toBe('12h');
  });

  it('should format 24 hours as 1d', () => {
    expect(component.formatHours(24)).toBe('1d');
  });

  it('should format 30 hours as 1d 6h', () => {
    expect(component.formatHours(30)).toBe('1d 6h');
  });

  it('should format 48 hours as 2d', () => {
    expect(component.formatHours(48)).toBe('2d');
  });

  // -- trackBy -------------------------------------------------------

  it('trackByIndex should return the index', () => {
    expect(component.trackByIndex(5)).toBe(5);
  });

  it('trackById should return item id', () => {
    expect(component.trackById(0, { id: 42 })).toBe(42);
  });

  // -- availableRoles ------------------------------------------------

  it('should have available roles', () => {
    expect(component.availableRoles.length).toBeGreaterThan(0);
    expect(component.availableRoles).toContain('Manager');
  });
});
