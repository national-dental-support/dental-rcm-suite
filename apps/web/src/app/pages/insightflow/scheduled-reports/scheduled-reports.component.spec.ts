import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA, ChangeDetectorRef } from '@angular/core';
import { of } from 'rxjs';
import { ScheduledReportsComponent } from './scheduled-reports.component';
import { ScheduledReportsService } from '../../../core/services/scheduled-reports.service';
import { RpDialogService } from '../../../shared/components/dialogs/dialog-shell/dialog.service';

describe('ScheduledReportsComponent', () => {
  let component: ScheduledReportsComponent;
  let fixture: ComponentFixture<ScheduledReportsComponent>;
  let mockService: jasmine.SpyObj<ScheduledReportsService>;
  let mockDialog: jasmine.SpyObj<RpDialogService>;

  const mockReports = [
    { id: 1, name: 'Weekly Denials', reportType: 'denial-summary', frequency: 'weekly', recipients: 'a@b.com', isActive: true },
    { id: 2, name: 'Monthly AR', reportType: 'ar-aging', frequency: 'monthly', recipients: 'c@d.com', isActive: false },
  ];

  beforeEach(async () => {
    mockService = jasmine.createSpyObj('ScheduledReportsService', [
      'list', 'create', 'update', 'delete', 'runNow',
    ]);
    mockService.list.and.returnValue(of(mockReports as any));
    mockService.create.and.returnValue(of({ id: 3 } as any));
    mockService.update.and.returnValue(of(void 0 as any));
    mockService.delete.and.returnValue(of(void 0 as any));
    mockService.runNow.and.returnValue(of(void 0 as any));

    mockDialog = jasmine.createSpyObj('RpDialogService', ['dangerConfirm']);
    mockDialog.dangerConfirm.and.returnValue(of(true));

    await TestBed.configureTestingModule({
      declarations: [ScheduledReportsComponent],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        { provide: ScheduledReportsService, useValue: mockService },
        { provide: RpDialogService, useValue: mockDialog },
        { provide: ChangeDetectorRef, useValue: { markForCheck: () => {} } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ScheduledReportsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load reports on init', () => {
    expect(mockService.list).toHaveBeenCalled();
    expect(component.reports.length).toBe(2);
    expect(component.loading).toBeFalse();
  });

  it('addReport should set editingReport with defaults', () => {
    component.addReport();
    expect(component.editingReport).toBeTruthy();
    expect(component.editingReport!.name).toBe('');
    expect(component.editingReport!.reportType).toBe('denial-summary');
    expect(component.editingReport!.frequency).toBe('weekly');
    expect(component.isNew).toBeTrue();
  });

  it('editReport should clone the report', () => {
    component.editReport(mockReports[0] as any);
    expect(component.editingReport).toBeTruthy();
    expect(component.editingReport!.id).toBe(1);
    expect(component.isNew).toBeFalse();
  });

  it('cancelEdit should clear editing state', () => {
    component.addReport();
    component.cancelEdit();
    expect(component.editingReport).toBeNull();
    expect(component.isNew).toBeFalse();
  });

  it('saveReport should not save if name is empty', () => {
    component.editingReport = { name: '', reportType: 'denial-summary', frequency: 'weekly', recipients: 'a@b.com', isActive: true };
    component.isNew = true;
    component.saveReport();
    expect(mockService.create).not.toHaveBeenCalled();
  });

  it('saveReport should not save if recipients is empty', () => {
    component.editingReport = { name: 'Test', reportType: 'denial-summary', frequency: 'weekly', recipients: '', isActive: true };
    component.isNew = true;
    component.saveReport();
    expect(mockService.create).not.toHaveBeenCalled();
  });

  it('toggleActive should call update and toggle the flag', () => {
    const report = { ...mockReports[0], isActive: true } as any;
    component.toggleActive(report);
    expect(mockService.update).toHaveBeenCalledWith(1, jasmine.objectContaining({ isActive: false }));
  });

  it('runNow should call service runNow', () => {
    component.runNow(mockReports[0] as any);
    expect(mockService.runNow).toHaveBeenCalledWith(1);
  });

  it('getTypeLabel should return the label for a report type', () => {
    expect(component.getTypeLabel('denial-summary')).toBe('Denial Summary');
    expect(component.getTypeLabel('unknown')).toBe('unknown');
  });

  it('getFreqLabel should return the label for a frequency', () => {
    expect(component.getFreqLabel('weekly')).toBe('Weekly');
    expect(component.getFreqLabel('unknown')).toBe('unknown');
  });
});
