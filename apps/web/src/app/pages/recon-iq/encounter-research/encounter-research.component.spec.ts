import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA, ChangeDetectorRef } from '@angular/core';
import { of, throwError, Subject } from 'rxjs';
import { EncounterResearchComponent, PatientEncounterRow, PatientEncounterClaimRow } from './encounter-research.component';
import { ReconIqWindowService } from '../../../core/services/recon-iq-window.service';
import { PdfService } from '../../../core/services/pdf.service';
import { ReconIqService } from '../../../core/services/recon-iq.service';
import { GlobalFiltersStore } from '../../../shared/components/global-filters/global-filters.store';

describe('EncounterResearchComponent', () => {
  let component: EncounterResearchComponent;
  let fixture: ComponentFixture<EncounterResearchComponent>;
  let mockReconIqService: any;
  let mockWinSvc: any;
  let mockPdfService: any;
  let appliedSubject: Subject<any>;

  const patientRows = [
    { patientName: 'John Doe', payerName: 'Aetna', paymentId: 'PAY001', doctorName: 'Dr. Smith', dateOfService: '2025-01-15', patientAccount: 'PA001' },
    { patientName: 'Jane Doe', payerName: 'BCBS', paymentId: 'PAY002', doctorName: 'Dr. Jones', dateOfService: '2025-02-20', patientAccount: 'PA002' },
  ];

  const claimRows = [
    { claimId: 'CL001', dateClaimSubmitted: '2025-01-20', eobId: 'EOB001', dateEobReceived: '2025-02-01' },
    { claimId: 'CL002', dateClaimSubmitted: '2025-01-25', eobId: '', dateEobReceived: '' },
  ];

  beforeEach(async () => {
    appliedSubject = new Subject();

    mockReconIqService = {
      getPatients: jasmine.createSpy('getPatients').and.returnValue(of({ rows: patientRows })),
      getPatientClaims: jasmine.createSpy('getPatientClaims').and.returnValue(of({
        rows: claimRows,
        pagination: { page: 1, pageSize: 25, total: 2 },
      })),
      getCms1500Html: jasmine.createSpy('getCms1500Html').and.returnValue(of('<html/>')),
    };

    mockWinSvc = {
      open: jasmine.createSpy('open'),
      updateEobPdf: jasmine.createSpy('updateEobPdf'),
    };

    mockPdfService = {
      getPdf: jasmine.createSpy('getPdf').and.returnValue(of(new Blob(['test']))),
    };

    await TestBed.configureTestingModule({
      declarations: [EncounterResearchComponent],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        { provide: ReconIqWindowService, useValue: mockWinSvc },
        { provide: PdfService, useValue: mockPdfService },
        { provide: ReconIqService, useValue: mockReconIqService },
        { provide: ChangeDetectorRef, useValue: { markForCheck: () => {}, detectChanges: () => {} } },
        { provide: GlobalFiltersStore, useValue: { applied$: appliedSubject.asObservable(), value: null } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(EncounterResearchComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should call getPatients on init', () => {
    expect(mockReconIqService.getPatients).toHaveBeenCalled();
  });

  it('should map patient rows from API response', () => {
    expect(component.patientEncounterData.length).toBe(2);
    expect(component.patientEncounterData[0].patient).toBe('John Doe');
    expect(component.patientEncounterData[0].payer).toBe('Aetna');
    expect(component.patientEncounterData[0].patientAccount).toBe('PA001');
  });

  it('should initialize showFilters to false', () => {
    expect(component.showFilters).toBeFalse();
  });

  // --- toggleFilters ---
  it('toggleFilters should toggle showFilters', () => {
    component.toggleFilters();
    expect(component.showFilters).toBeTrue();
    component.toggleFilters();
    expect(component.showFilters).toBeFalse();
  });

  // --- activeFilterCount ---
  it('activeFilterCount should return 0 with empty filters', () => {
    component.currentFilters = {} as any;
    expect(component.activeFilterCount).toBe(0);
  });

  it('activeFilterCount should count non-empty filter values', () => {
    component.currentFilters = { patient: 'John', payer: 'Aetna', doctor: '' } as any;
    expect(component.activeFilterCount).toBe(2);
  });

  // --- activeFilters getter ---
  it('activeFilters should return chips for populated filters', () => {
    component.currentFilters = { patient: 'John', payer: '', paymentId: 'PAY001' } as any;
    const chips = component.activeFilters;
    expect(chips.length).toBe(2);
    expect(chips[0].key).toBe('patient');
    expect(chips[0].label).toBe('Patient');
    expect(chips[1].key).toBe('paymentId');
  });

  it('activeFilters should return empty array for empty filters', () => {
    component.currentFilters = {} as any;
    expect(component.activeFilters.length).toBe(0);
  });

  // --- removeFilterChip ---
  it('removeFilterChip should clear the filter and reload patients', () => {
    component.currentFilters = { patient: 'John' } as any;
    mockReconIqService.getPatients.calls.reset();

    component.removeFilterChip({ key: 'patient', label: 'Patient', value: 'John' });

    expect((component.currentFilters as any).patient).toBe('');
    expect(mockReconIqService.getPatients).toHaveBeenCalled();
  });

  // --- hasEob ---
  it('hasEob should return true for non-empty eobId', () => {
    expect(component.hasEob({ eobId: 'EOB123' } as any)).toBeTrue();
  });

  it('hasEob should return false for empty/blank eobId', () => {
    expect(component.hasEob({ eobId: '' } as any)).toBeFalse();
    expect(component.hasEob({ eobId: '  ' } as any)).toBeFalse();
    expect(component.hasEob(null as any)).toBeFalse();
  });

  // --- onEncounterSearchChanged ---
  it('onEncounterSearchChanged should update encounterGlobalSearch and reload', () => {
    mockReconIqService.getPatients.calls.reset();
    component.onEncounterSearchChanged('smith');
    expect(component.encounterGlobalSearch).toBe('smith');
    expect(mockReconIqService.getPatients).toHaveBeenCalled();
  });

  // --- onFilterReset ---
  it('onFilterReset should clear currentFilters and filterValue', () => {
    component.currentFilters = { patient: 'John' } as any;
    component.filterValue = 'test';
    component.onFilterReset();
    expect(component.currentFilters).toEqual({});
    expect(component.filterValue).toBe('');
  });

  // --- onEncounterFiltersChanged ---
  it('onEncounterFiltersChanged should update patientTableFilterState', () => {
    const f = { patient: 'John', payer: '', paymentId: '', doctor: '', dateOfService: '', patientAccount: '' } as any;
    component.onEncounterFiltersChanged(f);
    expect(component.patientTableFilterState.columns).toBeDefined();
  });

  it('onEncounterFiltersChanged should update currentFilters', () => {
    const f = { patient: 'Jane' } as any;
    component.onEncounterFiltersChanged(f);
    expect(component.currentFilters).toEqual(f);
  });

  // --- onPatientRowClick ---
  it('onPatientRowClick should not throw', () => {
    expect(() => component.onPatientRowClick({})).not.toThrow();
  });

  // --- onPatientClaimAction ---
  it('onPatientClaimAction "claim" should open cms1500 window', () => {
    const row: PatientEncounterClaimRow = { rowType: 'claim', claimId: 'CL1', dateClaimSubmitted: '', eobId: 'EOB1', dateEOBReceived: '', patientAccount: 'PA1', paymentId: 'P1' };
    component.onPatientClaimAction('claim', row);
    expect(mockWinSvc.open).toHaveBeenCalledWith('cms1500', jasmine.any(String), jasmine.any(String));
  });

  it('onPatientClaimAction "eob" should open EOB window when eob exists', () => {
    const row: PatientEncounterClaimRow = { rowType: 'claim', claimId: 'CL1', dateClaimSubmitted: '', eobId: 'EOB1', dateEOBReceived: '', patientAccount: 'PA1', paymentId: 'P1' };
    component.onPatientClaimAction('eob', row);
    expect(mockWinSvc.open).toHaveBeenCalledWith('eob', jasmine.any(String), jasmine.any(String));
  });

  it('onPatientClaimAction "eob" should NOT open window when no eob', () => {
    const row: PatientEncounterClaimRow = { rowType: 'claim', claimId: 'CL1', dateClaimSubmitted: '', eobId: '', dateEOBReceived: '', patientAccount: 'PA1', paymentId: 'P1' };
    component.onPatientClaimAction('eob', row);
    expect(mockWinSvc.open).not.toHaveBeenCalled();
  });

  it('onPatientClaimAction "both" should open cms1500 and eob windows when eob exists', () => {
    const row: PatientEncounterClaimRow = { rowType: 'claim', claimId: 'CL1', dateClaimSubmitted: '', eobId: 'EOB1', dateEOBReceived: '', patientAccount: 'PA1', paymentId: 'P1' };
    component.onPatientClaimAction('both', row);
    expect(mockWinSvc.open).toHaveBeenCalledWith('cms1500', jasmine.any(String), jasmine.any(String));
    expect(mockWinSvc.open).toHaveBeenCalledWith('eob', jasmine.any(String), jasmine.any(String));
  });

  it('onPatientClaimAction "both" should NOT open when no eob', () => {
    const row: PatientEncounterClaimRow = { rowType: 'claim', claimId: 'CL1', dateClaimSubmitted: '', eobId: '', dateEOBReceived: '', patientAccount: 'PA1', paymentId: 'P1' };
    component.onPatientClaimAction('both', row);
    expect(mockWinSvc.open).not.toHaveBeenCalled();
  });

  it('onPatientClaimAction should return early when no patientAccount', () => {
    const row = { claimId: 'CL1', eobId: 'EOB1', patientAccount: '' } as any;
    component.onPatientClaimAction('claim', row);
    expect(mockWinSvc.open).not.toHaveBeenCalled();
  });

  // --- loadPatients ---
  it('loadPatients should handle API error gracefully', () => {
    mockReconIqService.getPatients.and.returnValue(throwError(() => new Error('fail')));
    component.loadPatients({ page: 1, pageSize: 25 });
    expect(component.isLoading).toBeFalse();
  });

  it('loadPatients with no results should clear patientEncounterData', () => {
    mockReconIqService.getPatients.and.returnValue(of({ rows: [] }));
    component.loadPatients({ page: 1 });
    expect(component.patientEncounterData).toEqual([]);
  });

  // --- global filters ---
  it('should reload patients when global filters change', () => {
    mockReconIqService.getPatients.calls.reset();
    appliedSubject.next({ startDate: new Date(), endDate: new Date() });
    expect(mockReconIqService.getPatients).toHaveBeenCalled();
  });

  // --- ngOnDestroy ---
  it('ngOnDestroy should complete destroy$ without error', () => {
    expect(() => component.ngOnDestroy()).not.toThrow();
  });

  // --- patientEncounter columns ---
  it('patientEncounter columns should have correct ids', () => {
    const ids = component.patientEncounter.map(c => c.id);
    expect(ids).toContain('patient');
    expect(ids).toContain('payer');
    expect(ids).toContain('paymentId');
    expect(ids).toContain('doctor');
    expect(ids).toContain('dateOfService');
    expect(ids).toContain('patientAccount');
  });

  // --- column accessors ---
  it('patient column accessor should return patient name for patient rows', () => {
    const col = component.patientEncounter.find(c => c.id === 'patient')!;
    const row: PatientEncounterRow = { rowType: 'patient', patient: 'John', payer: 'Aetna', paymentId: 'P1', doctor: 'Dr S', dateOfService: '2025-01-01', patientAccount: 'PA1' };
    expect(col.accessor(row)).toBe('John');
  });

  it('payer column accessor should return payer for patient rows', () => {
    const col = component.patientEncounter.find(c => c.id === 'payer')!;
    const row: PatientEncounterRow = { rowType: 'patient', patient: 'John', payer: 'BCBS', paymentId: 'P1', doctor: 'Dr S', dateOfService: '2025-01-01', patientAccount: 'PA1' };
    expect(col.accessor(row)).toBe('BCBS');
  });

  it('payer column accessor should return empty string for claim rows', () => {
    const col = component.patientEncounter.find(c => c.id === 'payer')!;
    const row: PatientEncounterClaimRow = { rowType: 'claim', claimId: 'CL1', dateClaimSubmitted: '2025-01-01', eobId: 'E1', dateEOBReceived: '', patientAccount: 'PA1', paymentId: 'P1' };
    expect(col.accessor(row)).toBe('');
  });

  it('doctor column accessor should return doctor for patient rows', () => {
    const col = component.patientEncounter.find(c => c.id === 'doctor')!;
    const row: PatientEncounterRow = { rowType: 'patient', patient: 'John', payer: 'BCBS', paymentId: 'P1', doctor: 'Dr Smith', dateOfService: '2025-01-01', patientAccount: 'PA1' };
    expect(col.accessor(row)).toBe('Dr Smith');
  });

  it('doctor column accessor should return empty string for claim rows', () => {
    const col = component.patientEncounter.find(c => c.id === 'doctor')!;
    const row: PatientEncounterClaimRow = { rowType: 'claim', claimId: 'CL1', dateClaimSubmitted: '', eobId: '', dateEOBReceived: '', patientAccount: '', paymentId: '' };
    expect(col.accessor(row)).toBe('');
  });

  it('dateOfService column accessor should return empty string for patient rows', () => {
    const col = component.patientEncounter.find(c => c.id === 'dateOfService')!;
    const row: PatientEncounterRow = { rowType: 'patient', patient: 'John', payer: '', paymentId: '', doctor: '', dateOfService: '2025-01-01', patientAccount: '' };
    expect(col.accessor(row)).toBe('');
  });

  it('dateOfService column accessor should return dateClaimSubmitted for claim rows', () => {
    const col = component.patientEncounter.find(c => c.id === 'dateOfService')!;
    const row: PatientEncounterClaimRow = { rowType: 'claim', claimId: 'CL1', dateClaimSubmitted: '2025-06-15', eobId: '', dateEOBReceived: '', patientAccount: '', paymentId: '' };
    expect(col.accessor(row)).toBe('2025-06-15');
  });

  it('patientAccount column accessor should return empty for claim rows', () => {
    const col = component.patientEncounter.find(c => c.id === 'patientAccount')!;
    const row: PatientEncounterClaimRow = { rowType: 'claim', claimId: 'CL1', dateClaimSubmitted: '', eobId: '', dateEOBReceived: '', patientAccount: 'PA1', paymentId: '' };
    expect(col.accessor(row)).toBe('');
  });

  it('patient column accessor should return claimId arrow for claim rows', () => {
    const col = component.patientEncounter.find(c => c.id === 'patient')!;
    const row: PatientEncounterClaimRow = { rowType: 'claim', claimId: 'CL999', dateClaimSubmitted: '', eobId: '', dateEOBReceived: '', patientAccount: '', paymentId: '' };
    expect(col.accessor(row)).toContain('CL999');
  });

  it('paymentId accessor should return eobId with dash for claim rows when no eobId', () => {
    const col = component.patientEncounter.find(c => c.id === 'paymentId')!;
    const row: PatientEncounterClaimRow = { rowType: 'claim', claimId: 'CL1', dateClaimSubmitted: '', eobId: '', dateEOBReceived: '', patientAccount: '', paymentId: '' };
    expect(col.accessor(row)).toBe('\u2014');
  });

  it('paymentId accessor returns paymentId for patient rows', () => {
    const col = component.patientEncounter.find(c => c.id === 'paymentId')!;
    const row: PatientEncounterRow = { rowType: 'patient', patient: 'John', payer: '', paymentId: 'PAY123', doctor: '', dateOfService: '', patientAccount: '' };
    expect(col.accessor(row)).toBe('PAY123');
  });

  // --- removeFilterChip ---------------------------------------------

  it('removeFilterChip should remove the chip from currentFilters', () => {
    component.currentFilters = { patient: 'John', payer: 'Aetna' } as any;
    component.removeFilterChip({ key: 'patient', label: 'John' } as any);
    expect((component.currentFilters as any).patient).toBe('');
  });

  it('removeFilterChip should handle null currentFilters', () => {
    component.currentFilters = null as any;
    expect(() => component.removeFilterChip({ key: 'patient', label: 'John' } as any)).not.toThrow();
  });

  // --- loadPatients edge cases --------------------------------------

  it('loadPatients without args should use defaults', () => {
    expect(() => component.loadPatients()).not.toThrow();
  });

  it('loadPatients with search should pass search to service', () => {
    mockReconIqService.getPatients.calls.reset();
    component.loadPatients({ search: 'John' });
    expect(mockReconIqService.getPatients).toHaveBeenCalled();
  });

  // --- activeFilterCount --------------------------------------------

  it('activeFilterCount should return 0 when no filters', () => {
    component.currentFilters = {};
    expect(component.activeFilterCount).toBe(0);
  });

  it('activeFilterCount should count non-empty filters', () => {
    component.currentFilters = { patient: 'John', payer: '' } as any;
    expect(component.activeFilterCount).toBe(1);
  });

  it('activeFilterCount should return 0 when currentFilters is null', () => {
    component.currentFilters = null as any;
    expect(component.activeFilterCount).toBe(0);
  });
});
