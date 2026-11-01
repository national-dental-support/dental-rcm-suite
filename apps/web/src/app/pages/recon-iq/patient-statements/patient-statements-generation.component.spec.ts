import { ComponentFixture, TestBed, fakeAsync, tick, discardPeriodicTasks } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA, ChangeDetectorRef } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { of, throwError } from 'rxjs';
import { PatientStatementsGenerationComponent } from './patient-statements-generation.component';
import { ReconIqService, PatientBalancesResponse } from '../../../core/services/recon-iq.service';

const mockRow = {
  patientId: 1,
  patientAccount: 'ACC001',
  patientName: 'Jane Doe',
  balanceDue: 250,
  currentCharges: 300,
  previousBalance: 50,
  insurancePaid: 100,
  adjustments: 0,
  patientResponsibility: 250,
  aging0_30: 250,
  aging31_60: 0,
  aging61_90: 0,
  aging90Plus: 0,
  lastStatementDate: null,
  location: 'Main Office',
};

const mockResponse: PatientBalancesResponse = {
  message: 'ok',
  asOf: '2026-04-25',
  filters: {},
  pagination: { page: 1, pageSize: 25, totalRows: 1, totalPages: 1 },
  rows: [mockRow],
};

describe('PatientStatementsGenerationComponent', () => {
  let component: PatientStatementsGenerationComponent;
  let fixture: ComponentFixture<PatientStatementsGenerationComponent>;
  let reconIqSpy: jasmine.SpyObj<ReconIqService>;

  beforeEach(async () => {
    reconIqSpy = jasmine.createSpyObj('ReconIqService', [
      'getPatientBalances',
      'generateStatementBatch',
      'getStatementPdfUrl',
      'getRecentBatches',
      'getBatchStatus',
    ]);
    reconIqSpy.getPatientBalances.and.returnValue(of(mockResponse));
    reconIqSpy.generateStatementBatch.and.returnValue(of({ batchId: 'B001', queued: 1 }));
    reconIqSpy.getStatementPdfUrl.and.returnValue('http://api/patient-statements/1/pdf');
    reconIqSpy.getRecentBatches.and.returnValue(of({ batches: [] }));
    reconIqSpy.getBatchStatus.and.returnValue(of({ batchId: 'B001', status: 'queued', totalPatients: 1, completedCount: 0, errorCount: 0, requestedBy: '', startedAt: null, completedAt: null, downloadUrl: null, createdAt: new Date().toISOString() }));

    await TestBed.configureTestingModule({
      declarations: [PatientStatementsGenerationComponent],
      imports: [
        ReactiveFormsModule,
        NoopAnimationsModule,
        MatFormFieldModule,
        MatInputModule,
        MatSelectModule,
        MatDatepickerModule,
        MatNativeDateModule,
      ],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        { provide: ReconIqService, useValue: reconIqSpy },
        { provide: ChangeDetectorRef, useValue: { markForCheck: () => {} } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PatientStatementsGenerationComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should call getPatientBalances on init', () => {
    expect(reconIqSpy.getPatientBalances).toHaveBeenCalled();
  });

  it('should populate dataSource after successful load', () => {
    expect(component.dataSource.data.length).toBe(1);
    expect(component.dataSource.data[0].patientName).toBe('Jane Doe');
  });

  it('should set totalRows from pagination', () => {
    expect(component.totalRows).toBe(1);
  });

  it('should have 0 selected initially', () => {
    expect(component.selectedCount).toBe(0);
  });

  it('isAllSelected should return false when nothing is selected', () => {
    expect(component.isAllSelected()).toBeFalse();
  });

  it('toggleAllRows should select all rows', () => {
    component.toggleAllRows();
    expect(component.isAllSelected()).toBeTrue();
    expect(component.selectedCount).toBe(1);
  });

  it('toggleAllRows should deselect all when all are selected', () => {
    component.toggleAllRows();
    component.toggleAllRows();
    expect(component.selectedCount).toBe(0);
  });

  it('generateStatements should call generateStatementBatch with selected patient IDs', () => {
    component.selection.select(mockRow);
    component.generateStatements();
    expect(reconIqSpy.generateStatementBatch).toHaveBeenCalledWith({ patientIds: [1] });
  });

  it('generateStatements should set successMessage on success', fakeAsync(() => {
    component.selection.select(mockRow);
    component.generateStatements();
    tick();
    expect(component.successMessage).toContain('1 statement');
    expect(component.activeBatch?.batchId).toBe('B001');
    discardPeriodicTasks();
  }));

  it('generateStatements should set error flag on failure', fakeAsync(() => {
    reconIqSpy.generateStatementBatch.and.returnValue(throwError(() => new Error('fail')));
    component.selection.select(mockRow);
    component.generateStatements();
    tick();
    expect(component.error).toBeTrue();
  }));

  it('generateStatements should be a no-op when nothing is selected', () => {
    component.generateStatements();
    expect(reconIqSpy.generateStatementBatch).not.toHaveBeenCalled();
  });

  it('resetFilters should reset form to defaults', () => {
    component.filterForm.patchValue({ minBalance: 100, agingBucket: '90_plus' });
    component.resetFilters();
    expect(component.filterForm.value.minBalance).toBe(5);
    expect(component.filterForm.value.agingBucket).toBe('all');
  });

  it('goToPage should not navigate below page 1', () => {
    component.totalPages = 3;
    component.page = 1;
    component.goToPage(0);
    expect(reconIqSpy.getPatientBalances.calls.count()).toBe(1); // only the init call
  });

  it('goToPage should navigate to a valid page', () => {
    reconIqSpy.getPatientBalances.and.returnValue(of({
      ...mockResponse,
      pagination: { ...mockResponse.pagination, page: 2, totalPages: 3 },
    }));
    component.totalPages = 3;
    component.goToPage(2);
    expect(component.page).toBe(2);
    expect(reconIqSpy.getPatientBalances.calls.count()).toBeGreaterThan(1);
  });

  it('fmt should format currency correctly', () => {
    expect(component.fmt(1234.5)).toBe('$1,234.50');
  });

  it('should set error flag when getPatientBalances fails', fakeAsync(() => {
    reconIqSpy.getPatientBalances.and.returnValue(throwError(() => new Error('network error')));
    component.load();
    tick();
    expect(component.error).toBeTrue();
  }));

  it('getStatementPdfUrl should be called with string patient ID', () => {
    component.downloadPdf(mockRow);
    expect(reconIqSpy.getStatementPdfUrl).toHaveBeenCalledWith('1');
  });

  it('ngOnDestroy should not throw', () => {
    expect(() => component.ngOnDestroy()).not.toThrow();
  });
});
