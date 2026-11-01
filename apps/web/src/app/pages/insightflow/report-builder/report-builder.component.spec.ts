import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA, ChangeDetectorRef } from '@angular/core';
import { of } from 'rxjs';
import { ReportBuilderComponent } from './report-builder.component';
import { ReportBuilderService } from '../../../core/services/report-builder.service';

describe('ReportBuilderComponent', () => {
  let component: ReportBuilderComponent;
  let fixture: ComponentFixture<ReportBuilderComponent>;
  let mockService: jasmine.SpyObj<ReportBuilderService>;

  beforeEach(async () => {
    mockService = jasmine.createSpyObj('ReportBuilderService', [
      'getSchema', 'listSaved', 'runReport', 'saveReport', 'deleteSaved',
    ]);
    mockService.getSchema.and.returnValue(of({
      dimensions: [{ key: 'payer', label: 'Payer' }, { key: 'provider', label: 'Provider' }],
      measures: [{ key: 'chargeAmt', label: 'Charge Amount' }, { key: 'claimCount', label: 'Claim Count' }],
    } as any));
    mockService.listSaved.and.returnValue(of([
      { id: 1, name: 'Report 1', description: '', dimensions: '["payer"]', measures: '["chargeAmt"]', isShared: true },
    ] as any));
    mockService.runReport.and.returnValue(of({ rows: [{ payer: 'Aetna', chargeAmt: 5000 }], rowCount: 1, dimensions: ['payer'], measures: ['chargeAmt'] }));
    mockService.saveReport.and.returnValue(of({ id: 2 } as any));
    mockService.deleteSaved.and.returnValue(of(void 0 as any));

    await TestBed.configureTestingModule({
      declarations: [ReportBuilderComponent],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        { provide: ReportBuilderService, useValue: mockService },
        { provide: ChangeDetectorRef, useValue: { markForCheck: () => {} } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ReportBuilderComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load schema on init', () => {
    expect(mockService.getSchema).toHaveBeenCalled();
    expect(component.schema).toBeTruthy();
    expect(component.loading).toBeFalse();
  });

  it('should load saved reports on init', () => {
    expect(mockService.listSaved).toHaveBeenCalled();
    expect(component.savedReports.length).toBe(1);
  });

  it('toggleDim should add dimension if not present', () => {
    component.toggleDim('payer');
    expect(component.selectedDims).toContain('payer');
  });

  it('toggleDim should remove dimension if present', () => {
    component.selectedDims = ['payer'];
    component.toggleDim('payer');
    expect(component.selectedDims).not.toContain('payer');
  });

  it('toggleMeasure should add measure if not present', () => {
    component.toggleMeasure('chargeAmt');
    expect(component.selectedMeasures).toContain('chargeAmt');
  });

  it('toggleMeasure should remove measure if present', () => {
    component.selectedMeasures = ['chargeAmt'];
    component.toggleMeasure('chargeAmt');
    expect(component.selectedMeasures).not.toContain('chargeAmt');
  });

  it('isDimSelected should return true when dim is selected', () => {
    component.selectedDims = ['payer'];
    expect(component.isDimSelected('payer')).toBeTrue();
    expect(component.isDimSelected('provider')).toBeFalse();
  });

  it('isMeasureSelected should return true when measure is selected', () => {
    component.selectedMeasures = ['chargeAmt'];
    expect(component.isMeasureSelected('chargeAmt')).toBeTrue();
  });

  it('canRun should return false when no dims or measures selected', () => {
    component.selectedDims = [];
    component.selectedMeasures = [];
    expect(component.canRun()).toBeFalse();
  });

  it('canRun should return true when both dims and measures selected', () => {
    component.selectedDims = ['payer'];
    component.selectedMeasures = ['chargeAmt'];
    expect(component.canRun()).toBeTrue();
  });

  it('runReport should call service and populate result', () => {
    component.selectedDims = ['payer'];
    component.selectedMeasures = ['chargeAmt'];
    component.runReport();
    expect(mockService.runReport).toHaveBeenCalledWith(['payer'], ['chargeAmt'], 90);
    expect(component.result).toBeTruthy();
    expect(component.running).toBeFalse();
  });

  it('runReport should do nothing if canRun is false', () => {
    component.selectedDims = [];
    component.selectedMeasures = [];
    component.runReport();
    expect(mockService.runReport).not.toHaveBeenCalled();
  });

  it('loadSaved should parse dimensions/measures and run report', () => {
    const saved = { id: 1, name: 'R1', description: '', dimensions: '["payer"]', measures: '["chargeAmt"]', isShared: true } as any;
    component.loadSaved(saved);
    expect(component.selectedDims).toEqual(['payer']);
    expect(component.selectedMeasures).toEqual(['chargeAmt']);
    expect(mockService.runReport).toHaveBeenCalled();
  });

  it('deleteSaved should remove report from list', () => {
    component.deleteSaved(1);
    expect(mockService.deleteSaved).toHaveBeenCalledWith(1);
    expect(component.savedReports.length).toBe(0);
  });

  it('resultColumns should return keys from first row', () => {
    component.result = { rows: [{ payer: 'Aetna', chargeAmt: 5000 }], rowCount: 1, dimensions: ['payer'], measures: ['chargeAmt'] };
    expect(component.resultColumns).toEqual(['payer', 'chargeAmt']);
  });

  it('resultColumns should return empty array when no result', () => {
    component.result = null;
    expect(component.resultColumns).toEqual([]);
  });
});
