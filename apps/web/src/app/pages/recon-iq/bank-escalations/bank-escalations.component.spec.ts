import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { of, throwError } from 'rxjs';

import { BankEscalationsComponent } from './bank-escalations.component';
import { ReconIqService } from '../../../core/services/recon-iq.service';

const MOCK_STATS = { total: 10, open: 5, investigating: 3, resolved: 2 };
const MOCK_ROWS_RESPONSE = { rows: [{ id: 1, issueType: 'amount_mismatch', priority: 'high', status: 'open' } as any], total: 1, page: 1, pageSize: 25, totalPages: 1 };

describe('BankEscalationsComponent', () => {
  let component: BankEscalationsComponent;
  let fixture: ComponentFixture<BankEscalationsComponent>;
  let serviceSpy: jasmine.SpyObj<ReconIqService>;

  beforeEach(async () => {
    serviceSpy = jasmine.createSpyObj('ReconIqService', [
      'getBankEscalationStats',
      'getBankEscalations',
      'createBankEscalation',
      'updateBankEscalation',
    ]);

    serviceSpy.getBankEscalationStats.and.returnValue(of(MOCK_STATS));
    serviceSpy.getBankEscalations.and.returnValue(of(MOCK_ROWS_RESPONSE));
    serviceSpy.createBankEscalation.and.returnValue(of({ id: 99 }));
    serviceSpy.updateBankEscalation.and.returnValue(of({ message: 'ok' }));

    await TestBed.configureTestingModule({
      declarations: [BankEscalationsComponent],
      providers: [{ provide: ReconIqService, useValue: serviceSpy }],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(BankEscalationsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // --- load() / ngOnInit ---

  it('should call getBankEscalationStats on init and populate stats', () => {
    expect(serviceSpy.getBankEscalationStats).toHaveBeenCalled();
    expect(component.stats).toEqual(MOCK_STATS);
  });

  it('should call getBankEscalations on init and populate rows', () => {
    expect(serviceSpy.getBankEscalations).toHaveBeenCalled();
    expect(component.rows.length).toBe(1);
    expect(component.rows[0].id).toBe(1);
  });

  it('should set loading to false after loadRows succeeds', () => {
    expect(component.loading).toBeFalse();
  });

  it('should not throw when getBankEscalationStats returns an error', () => {
    serviceSpy.getBankEscalationStats.and.returnValue(throwError(() => new Error('stats fail')));
    expect(() => component.loadStats()).not.toThrow();
  });

  it('should not throw when getBankEscalations returns an error', () => {
    serviceSpy.getBankEscalations.and.returnValue(throwError(() => new Error('rows fail')));
    expect(() => component.loadRows()).not.toThrow();
  });

  it('loadRows error path sets loading to false', () => {
    serviceSpy.getBankEscalations.and.returnValue(throwError(() => new Error('fail')));
    component.loadRows();
    expect(component.loading).toBeFalse();
  });

  // --- priorityClass ---

  it('priorityClass("critical") returns badge with badge--critical', () => {
    expect(component.priorityClass('critical')).toBe('badge badge--critical');
  });

  it('priorityClass("high") returns badge with badge--high', () => {
    expect(component.priorityClass('high')).toBe('badge badge--high');
  });

  it('priorityClass("medium") returns badge with badge--medium', () => {
    expect(component.priorityClass('medium')).toBe('badge badge--medium');
  });

  it('priorityClass("low") returns badge with badge--low', () => {
    expect(component.priorityClass('low')).toBe('badge badge--low');
  });

  it('priorityClass with unknown value returns badge with empty suffix', () => {
    expect(component.priorityClass('unknown')).toBe('badge ');
  });

  // --- statusClass ---

  it('statusClass("open") returns badge with badge--open', () => {
    expect(component.statusClass('open')).toBe('badge badge--open');
  });

  it('statusClass("investigating") returns badge with badge--investigating', () => {
    expect(component.statusClass('investigating')).toBe('badge badge--investigating');
  });

  it('statusClass("resolved") returns badge with badge--resolved', () => {
    expect(component.statusClass('resolved')).toBe('badge badge--resolved');
  });

  it('statusClass("dismissed") returns badge with badge--dismissed', () => {
    expect(component.statusClass('dismissed')).toBe('badge badge--dismissed');
  });

  it('statusClass with unknown value returns badge with empty suffix', () => {
    expect(component.statusClass('unknown')).toBe('badge ');
  });

  // --- openNewForm / cancelNew ---

  it('openNewForm() sets showNewForm to true', () => {
    component.openNewForm();
    expect(component.showNewForm).toBeTrue();
  });

  it('openNewForm() resets form fields', () => {
    component.newIssueType = 'duplicate';
    component.newDescription = 'some desc';
    component.openNewForm();
    expect(component.newIssueType).toBe('');
    expect(component.newDescription).toBe('');
    expect(component.newPriority).toBe('medium');
    expect(component.newDepositId).toBe('');
  });

  it('cancelNew() sets showNewForm to false', () => {
    component.showNewForm = true;
    component.cancelNew();
    expect(component.showNewForm).toBeFalse();
  });

  // --- submitNew ---

  it('submitNew() does nothing when newIssueType is empty', () => {
    component.newIssueType = '';
    component.submitNew();
    expect(serviceSpy.createBankEscalation).not.toHaveBeenCalled();
  });

  it('submitNew() calls createBankEscalation with correct payload', () => {
    component.newIssueType = 'duplicate';
    component.newDescription = 'test';
    component.newPriority = 'high';
    component.newDepositId = 'DEP-001';
    component.submitNew();

    expect(serviceSpy.createBankEscalation).toHaveBeenCalledWith({
      issueType: 'duplicate',
      description: 'test',
      priority: 'high',
      bankDepositId: 'DEP-001',
    });
  });

  it('submitNew() closes form and reloads on success', () => {
    serviceSpy.createBankEscalation.and.returnValue(of({ id: 42 }));
    component.newIssueType = 'other';
    component.showNewForm = true;
    component.submitNew();

    expect(component.showNewForm).toBeFalse();
    expect(component.submitting).toBeFalse();
    // stats and rows both reloaded
    expect(serviceSpy.getBankEscalationStats.calls.count()).toBeGreaterThan(1);
    expect(serviceSpy.getBankEscalations.calls.count()).toBeGreaterThan(1);
  });

  it('submitNew() sets submitting false on error', () => {
    serviceSpy.createBankEscalation.and.returnValue(throwError(() => new Error('create fail')));
    component.newIssueType = 'other';
    component.submitNew();
    expect(component.submitting).toBeFalse();
  });

  // --- setStatus ---

  it('setStatus() calls updateBankEscalation with given status', () => {
    const row: any = { id: 5, issueType: 'duplicate', priority: 'high', status: 'open' };
    component.setStatus(row, 'investigating');
    expect(serviceSpy.updateBankEscalation).toHaveBeenCalledWith(5, { status: 'investigating' });
  });

  it('setStatus() reloads stats and rows on success', () => {
    const row: any = { id: 5, issueType: 'duplicate', priority: 'high', status: 'open' };
    serviceSpy.updateBankEscalation.and.returnValue(of({ message: 'ok' }));
    component.setStatus(row, 'resolved');
    expect(serviceSpy.getBankEscalationStats.calls.count()).toBeGreaterThan(1);
    expect(serviceSpy.getBankEscalations.calls.count()).toBeGreaterThan(1);
  });

  // --- setPriority ---

  it('setPriority() calls updateBankEscalation with given priority', () => {
    const row: any = { id: 7, issueType: 'missing_deposit', priority: 'low', status: 'open' };
    component.setPriority(row, 'critical');
    expect(serviceSpy.updateBankEscalation).toHaveBeenCalledWith(7, { priority: 'critical' });
  });

  it('setPriority() reloads rows on success', () => {
    const row: any = { id: 7, issueType: 'missing_deposit', priority: 'low', status: 'open' };
    serviceSpy.updateBankEscalation.and.returnValue(of({ message: 'ok' }));
    component.setPriority(row, 'high');
    expect(serviceSpy.getBankEscalations.calls.count()).toBeGreaterThan(1);
  });

  // --- applyFilters / clearFilters ---

  it('applyFilters() calls loadRows with page 1', () => {
    const callsBefore = serviceSpy.getBankEscalations.calls.count();
    component.applyFilters();
    expect(serviceSpy.getBankEscalations.calls.count()).toBeGreaterThan(callsBefore);
  });

  it('clearFilters() resets filter fields and reloads', () => {
    component.filterStatus = 'open';
    component.filterPriority = 'high';
    component.clearFilters();
    expect(component.filterStatus).toBe('');
    expect(component.filterPriority).toBe('');
    expect(serviceSpy.getBankEscalations.calls.count()).toBeGreaterThan(1);
  });
});
