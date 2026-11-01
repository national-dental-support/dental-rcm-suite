import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA, ChangeDetectorRef } from '@angular/core';
import { of } from 'rxjs';
import { ReconciliationReportComponent } from './reconciliation-report.component';
import { ReconIqService } from '../../../core/services/recon-iq.service';
import { ReconIqStore } from '../../../store/recon-iq/recon-iq.store';

describe('ReconciliationReportComponent', () => {
  let component: ReconciliationReportComponent;
  let fixture: ComponentFixture<ReconciliationReportComponent>;

  const mockReconIqService = {
    getReconFilterOptions:  jasmine.createSpy('getReconFilterOptions').and.returnValue(of({ locations: [], payers: [] })),
    exportReconDetailCsv:   jasmine.createSpy('exportReconDetailCsv').and.returnValue(of('Claim ID\nCL001')),
    getReconReportByProvider: jasmine.createSpy('getReconReportByProvider').and.returnValue(of({ rows: [] })),
    getPostingAudit:        jasmine.createSpy('getPostingAudit').and.returnValue(of({ rows: [], total: 0, totalPages: 1 })),
  };

  const mockReconIqStore = {
    report$: of({ data: null, loading: false, error: null, cachedAt: 0 }),
    loadReport: jasmine.createSpy('loadReport'),
    reloadReport: jasmine.createSpy('reloadReport'),
    reportSnapshot: null,
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ReconciliationReportComponent],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        { provide: ReconIqService, useValue: mockReconIqService },
        { provide: ReconIqStore, useValue: mockReconIqStore },
        { provide: ChangeDetectorRef, useValue: { markForCheck: () => {}, detectChanges: () => {} } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ReconciliationReportComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    mockReconIqService.exportReconDetailCsv.calls.reset();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should call loadReport on init', () => {
    expect(mockReconIqStore.loadReport).toHaveBeenCalled();
  });

  it('should have default filters', () => {
    expect(component.filters).toEqual({ months: 6, location: '', payer: '', postStatus: 'all' });
  });

  it('activeFilterCount should be 0 with default filters', () => {
    expect(component.activeFilterCount).toBe(0);
  });

  it('activeFilterCount should count non-default filters', () => {
    component.filters = { months: 12, location: 'NYC', payer: '', postStatus: 'all' };
    expect(component.activeFilterCount).toBe(2);
  });

  it('formatCurrency should format large numbers', () => {
    expect(component.formatCurrency(1_500_000)).toBe('$1.5M');
    expect(component.formatCurrency(5_000)).toBe('$5K');
    expect(component.formatCurrency(500)).toBe('$500');
  });

  it('matchRatio should return 0 when no summary', () => {
    expect(component.matchRatio).toBe(0);
  });

  it('postingRate should return 0 when no summary', () => {
    expect(component.postingRate).toBe(0);
  });

  it('denialClass should return correct class', () => {
    expect(component.denialClass(20)).toBe('rate-high');
    expect(component.denialClass(10)).toBe('rate-med');
    expect(component.denialClass(3)).toBe('rate-ok');
  });

  it('diffClass should return correct class', () => {
    expect(component.diffClass(0)).toBe('diff-ok');
    expect(component.diffClass(3000)).toBe('diff-warn');
    expect(component.diffClass(10000)).toBe('diff-high');
  });

  it('agedClass should return correct class', () => {
    expect(component.agedClass(35)).toBe('rate-high');
    expect(component.agedClass(20)).toBe('rate-med');
    expect(component.agedClass(10)).toBe('');
  });

  it('resetFilters should reset to defaults and reload', () => {
    component.filters = { months: 12, location: 'NYC', payer: 'Aetna', postStatus: 'posted' };
    component.resetFilters();
    expect(component.filters).toEqual({ months: 6, location: '', payer: '', postStatus: 'all' });
  });

  it('toggleInTransit should toggle showInTransit', () => {
    expect(component.showInTransit).toBeFalse();
    component.toggleInTransit();
    expect(component.showInTransit).toBeTrue();
    component.toggleInTransit();
    expect(component.showInTransit).toBeFalse();
  });

  it('applyInTransitSearch should set filter on data source', () => {
    component.applyInTransitSearch('test');
    expect(component.inTransitDs.filter).toBe('test');
  });

  it('applyFilters should close filters and call loadData', () => {
    component.filtersOpen = true;
    component.applyFilters();
    expect(component.filtersOpen).toBeFalse();
    expect(mockReconIqStore.reloadReport).toHaveBeenCalled();
  });

  it('loadData should reset in-transit state and call reloadReport', () => {
    component.inTransitDs.data = [{ remittanceFileId: 1 } as any];
    component.inTransitSearch = 'test';
    component.showInTransit = true;
    component.loadData();
    expect(component.inTransitDs.data).toEqual([]);
    expect(component.inTransitSearch).toBe('');
    expect(component.showInTransit).toBeFalse();
  });

  it('matchRatio should calculate correctly when summary exists', () => {
    component.summary = { matchedCount: 80, unmatchedPayments: 10, unmatchedEOBs: 10 } as any;
    expect(component.matchRatio).toBe(80);
  });

  it('matchRatio should return 0 when total is 0', () => {
    component.summary = { matchedCount: 0, unmatchedPayments: 0, unmatchedEOBs: 0 } as any;
    expect(component.matchRatio).toBe(0);
  });

  it('postingRate should calculate correctly when summary exists', () => {
    component.summary = { matchedCount: 100, postedCount: 75 } as any;
    expect(component.postingRate).toBe(75);
  });

  it('postingRate should return 0 when matchedCount is 0', () => {
    component.summary = { matchedCount: 0, postedCount: 0 } as any;
    expect(component.postingRate).toBe(0);
  });

  it('activeFilterCount should count all non-default filters', () => {
    component.filters = { months: 3, location: 'NYC', payer: 'Aetna', postStatus: 'posted' };
    expect(component.activeFilterCount).toBe(4);
  });

  it('toggleInTransit should load data from store snapshot when available', () => {
    (mockReconIqStore as any).reportSnapshot = { inTransit: { rows: [{ remittanceFileId: 1 }] } };
    component.showInTransit = false;
    component.toggleInTransit();
    expect(component.showInTransit).toBeTrue();
    expect(component.inTransitDs.data.length).toBe(1);
  });

  it('downloadCsv with overview section should create CSV', () => {
    spyOn(URL, 'createObjectURL').and.returnValue('blob:test');
    spyOn(URL, 'revokeObjectURL');
    const clickSpy = jasmine.createSpy('click');
    spyOn(document, 'createElement').and.returnValue({ click: clickSpy, href: '', download: '' } as any);

    component.activeSection = 'overview';
    component.summary = {
      matchedCount: 100, matchedAmount: 50000, unpostedCount: 5,
      unmatchedPayments: 3, unmatchedEOBs: 2, denialRate: 5,
      bankTxCount: 50, bankTxTotal: 60000, pmsTxCount: 48, pmsTxTotal: 59000,
      bankPmsDiff: 1000, inTransitCount: 4, inTransitTotal: 8000, postedCount: 95,
    } as any;
    component.downloadCsv();
    expect(clickSpy).toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalled();
  });

  it('downloadCsv with payers section should create CSV', () => {
    spyOn(URL, 'createObjectURL').and.returnValue('blob:test');
    spyOn(URL, 'revokeObjectURL');
    const clickSpy = jasmine.createSpy('click');
    spyOn(document, 'createElement').and.returnValue({ click: clickSpy, href: '', download: '' } as any);

    component.activeSection = 'payers';
    component.payerRows = [{ payerName: 'Aetna', remittanceCount: 10, totalAmount: 5000, avgAmount: 500, linkedClaims: 8, deniedClaims: 1, denialRate: 12.5 }] as any;
    component.downloadCsv();
    expect(clickSpy).toHaveBeenCalled();
  });

  it('downloadCsv with trend section should create CSV', () => {
    spyOn(URL, 'createObjectURL').and.returnValue('blob:test');
    spyOn(URL, 'revokeObjectURL');
    const clickSpy = jasmine.createSpy('click');
    spyOn(document, 'createElement').and.returnValue({ click: clickSpy, href: '', download: '' } as any);

    component.activeSection = 'trend';
    component.trendRows = [{ period: '2025-01', reconcileCount: 50, reconcileAmount: 25000, claimCount: 60, deniedCount: 5, denialRate: 8, postedCount: 45 }] as any;
    component.downloadCsv();
    expect(clickSpy).toHaveBeenCalled();
  });

  it('exportDetailCsv should call exportReconDetailCsv and trigger download', () => {
    spyOn(URL, 'createObjectURL').and.returnValue('blob:test');
    spyOn(URL, 'revokeObjectURL');
    const clickSpy = jasmine.createSpy('click');
    spyOn(document, 'createElement').and.returnValue({ click: clickSpy, href: '', download: '' } as any);

    component.exportDetailCsv();
    expect(mockReconIqService.exportReconDetailCsv).toHaveBeenCalledWith(component.filters);
    expect(clickSpy).toHaveBeenCalled();
    expect(component.exportingDetail).toBeFalse();
  });

  it('exportDetailCsv should not re-enter while exporting', () => {
    mockReconIqService.exportReconDetailCsv.calls.reset();
    component.exportingDetail = true;
    component.exportDetailCsv();
    expect(mockReconIqService.exportReconDetailCsv).not.toHaveBeenCalled();
  });

  it('ngOnDestroy should not throw', () => {
    expect(() => component.ngOnDestroy()).not.toThrow();
  });
});
