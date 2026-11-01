import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA, ChangeDetectorRef } from '@angular/core';
import { of, Subject, throwError } from 'rxjs';
import { UnderpaymentsComponent } from './underpayments.component';
import { PayerIqService } from '../../../core/services/payer-iq.service';
import { PayerIqFiltersStore } from '../../../shared/components/global-filters/global-filters.store';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';

describe('UnderpaymentsComponent', () => {
  let component: UnderpaymentsComponent;
  let fixture: ComponentFixture<UnderpaymentsComponent>;
  let mockPayerIqService: jasmine.SpyObj<PayerIqService>;
  let mockDialog: jasmine.SpyObj<MatDialog>;
  let mockSnackBar: jasmine.SpyObj<MatSnackBar>;
  let appliedSubject: Subject<any>;

  const mockApiResponse: any = {
    data: [
      { RowType: 'PAYER', PayerName: 'Aetna', CPTCode: null, Claims: 25, LossRevenue: -5000, RiskRate: 'High' },
      { RowType: 'CPT', PayerName: 'Aetna', CPTCode: 'D0120', Claims: 10, LossRevenue: -2000, RiskRate: null },
      { RowType: 'CPT', PayerName: 'Aetna', CPTCode: 'D1110', Claims: 15, LossRevenue: -3000, RiskRate: null },
      { RowType: 'PAYER', PayerName: 'BCBS', CPTCode: null, Claims: 10, LossRevenue: -1500, RiskRate: 'Medium' },
      { RowType: 'CPT', PayerName: 'BCBS', CPTCode: 'D0150', Claims: 10, LossRevenue: -1500, RiskRate: null },
    ],
  };

  beforeEach(() => {
    appliedSubject = new Subject<any>();

    mockPayerIqService = jasmine.createSpyObj('PayerIqService', ['getAtRiskPayers', 'markReviewed']);
    mockPayerIqService.getAtRiskPayers.and.returnValue(of(mockApiResponse));
    mockPayerIqService.markReviewed.and.returnValue(of({}));

    mockDialog = jasmine.createSpyObj('MatDialog', ['open']);
    mockDialog.open.and.returnValue({ afterClosed: () => of('confirm') } as any);

    mockSnackBar = jasmine.createSpyObj('MatSnackBar', ['open']);

    TestBed.configureTestingModule({
      declarations: [UnderpaymentsComponent],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        { provide: PayerIqService, useValue: mockPayerIqService },
        { provide: PayerIqFiltersStore, useValue: { applied$: appliedSubject.asObservable() } },
        { provide: MatDialog, useValue: mockDialog },
        { provide: MatSnackBar, useValue: mockSnackBar },
      ],
    });

    fixture = TestBed.createComponent(UnderpaymentsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    // Trigger initial filter emission
    appliedSubject.next({});
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // --- ngOnInit / fetchAtRisk ---
  it('should call getAtRiskPayers when filters emit', () => {
    expect(mockPayerIqService.getAtRiskPayers).toHaveBeenCalledWith({} as any);
  });

  it('should map API response into tree structure', () => {
    expect(component.atRiskPayers.length).toBe(2);
  });

  it('should set payer kind correctly', () => {
    expect(component.atRiskPayers.every(r => r.kind === 'payer')).toBeTrue();
  });

  it('should nest CPT rows as children of payer', () => {
    const aetna = component.atRiskPayers.find(r => r.payer === 'Aetna');
    expect(aetna).toBeTruthy();
    expect(aetna!.children!.length).toBe(2);
    expect(aetna!.children![0].kind).toBe('cpt');
  });

  it('should set payerName on CPT rows', () => {
    const aetna = component.atRiskPayers.find(r => r.payer === 'Aetna');
    expect(aetna!.children![0].payerName).toBe('Aetna');
  });

  it('should sort payer rows by lossRevenue descending', () => {
    expect(component.atRiskPayers[0].lossRevenue).toBeGreaterThanOrEqual(
      component.atRiskPayers[1].lossRevenue
    );
  });

  it('should sort CPT children by lossRevenue descending', () => {
    const aetna = component.atRiskPayers.find(r => r.payer === 'Aetna');
    const children = aetna!.children!;
    expect(children[0].lossRevenue).toBeGreaterThanOrEqual(children[1].lossRevenue);
  });

  it('should reload when filters change', () => {
    mockPayerIqService.getAtRiskPayers.calls.reset();
    appliedSubject.next({ payer: 'BCBS' } as any);
    expect(mockPayerIqService.getAtRiskPayers).toHaveBeenCalledWith({ payer: 'BCBS' } as any);
  });

  it('should handle API error gracefully', () => {
    mockPayerIqService.getAtRiskPayers.and.returnValue(throwError(() => new Error('fail')));
    appliedSubject.next({});
    expect(component.atRiskPayers).toEqual([]);
    expect(component.loadingAtRisk).toBeFalse();
  });

  it('should set loadingAtRisk to false after fetch completes', () => {
    expect(component.loadingAtRisk).toBeFalse();
  });

  // --- mapAtRiskTree edge cases ---
  it('should handle CPT rows without a preceding PAYER row', () => {
    mockPayerIqService.getAtRiskPayers.and.returnValue(of({
      data: [
        { RowType: 'CPT', PayerName: 'UnknownPayer', CPTCode: 'D0120', Claims: 5, LossRevenue: -500, RiskRate: null, SortLevel: 2 },
      ],
    } as any));
    appliedSubject.next({});
    expect(component.atRiskPayers.length).toBe(1);
    expect(component.atRiskPayers[0].payer).toBe('UnknownPayer');
    expect(component.atRiskPayers[0].children!.length).toBe(1);
  });

  it('should handle null PayerName', () => {
    mockPayerIqService.getAtRiskPayers.and.returnValue(of({
      data: [
        { RowType: 'PAYER', PayerName: null, CPTCode: null, Claims: 5, LossRevenue: -500, RiskRate: null, SortLevel: 1 },
      ],
    } as any));
    appliedSubject.next({});
    expect(component.atRiskPayers[0].payer).toBe('Unknown');
  });

  it('should handle null CPTCode', () => {
    mockPayerIqService.getAtRiskPayers.and.returnValue(of({
      data: [
        { RowType: 'CPT', PayerName: 'Aetna', CPTCode: null, Claims: 5, LossRevenue: -500, RiskRate: null, SortLevel: 2 },
      ],
    } as any));
    appliedSubject.next({});
    const children = component.atRiskPayers[0].children!;
    expect(children[0].payer).toBe('Unknown');
  });

  it('should handle empty data array', () => {
    mockPayerIqService.getAtRiskPayers.and.returnValue(of({ data: [] }));
    appliedSubject.next({});
    expect(component.atRiskPayers).toEqual([]);
  });

  it('should handle null data', () => {
    mockPayerIqService.getAtRiskPayers.and.returnValue(of({ data: null }));
    appliedSubject.next({});
    expect(component.atRiskPayers).toEqual([]);
  });

  // --- atRiskChildren ---
  it('atRiskChildren should return children for payer rows', () => {
    const payerRow: any = { kind: 'payer', payer: 'Aetna', claims: 10, lossRevenue: 500, children: [{ kind: 'cpt', payer: 'D1110', claims: 5, lossRevenue: 200 }] };
    expect(component.atRiskChildren(payerRow).length).toBe(1);
  });

  it('atRiskChildren should return empty for cpt rows', () => {
    const cptRow: any = { kind: 'cpt', payer: 'D1110', claims: 5, lossRevenue: 200 };
    expect(component.atRiskChildren(cptRow)).toEqual([]);
  });

  it('atRiskChildren should return empty for claim rows', () => {
    const claimRow: any = { kind: 'claim', payer: 'X', claims: 1, lossRevenue: 100 };
    expect(component.atRiskChildren(claimRow)).toEqual([]);
  });

  it('atRiskChildren should return empty for payer with no children', () => {
    const payerRow: any = { kind: 'payer', payer: 'Solo', claims: 1, lossRevenue: 100 };
    expect(component.atRiskChildren(payerRow)).toEqual([]);
  });

  // --- column definitions ---
  it('should expose the at-risk columns and row actions', () => {
    expect(component.atRiskkColumns.map(c => c.id)).toEqual([
      'payer', 'riskRate', 'claims', 'lossRevenue',
      'export', 'mark_reviewed', 'create_dispute', 'view_denial',
    ]);
  });

  it('should have payer column', () => {
    expect(component.atRiskkColumns.some(c => c.id === 'payer')).toBeTrue();
  });

  it('should have riskRate chip column', () => {
    const col = component.atRiskkColumns.find(c => c.id === 'riskRate');
    expect(col!.type).toBe('chip');
  });

  it('should have export action column', () => {
    const col = component.atRiskkColumns.find(c => c.id === 'export');
    expect(col!.type).toBe('action');
    expect(col!.actionId).toBe('export_excel');
  });

  it('export actionVisible should be true for cpt rows', () => {
    const col = component.atRiskkColumns.find(c => c.id === 'export');
    expect(col!.actionVisible!({ kind: 'cpt', payer: 'D0120', claims: 1, lossRevenue: -100 } as any)).toBeTrue();
  });

  it('export actionVisible should be false for payer rows', () => {
    const col = component.atRiskkColumns.find(c => c.id === 'export');
    expect(col!.actionVisible!({ kind: 'payer', payer: 'Aetna', claims: 1, lossRevenue: -100 } as any)).toBeFalse();
  });

  // --- riskRate chip config ---
  it('chipConfig getLabel should return riskRate for payer rows', () => {
    const col = component.atRiskkColumns.find(c => c.id === 'riskRate');
    const chip = col!.chipConfig!;
    expect(chip.getLabel!('High', { kind: 'payer', riskRate: 'High' } as any)).toBe('High');
  });

  it('chipConfig getLabel should return dash for non-payer rows', () => {
    const col = component.atRiskkColumns.find(c => c.id === 'riskRate');
    const chip = col!.chipConfig!;
    expect(chip.getLabel!('', { kind: 'cpt' } as any)).toBe('\u2014');
  });

  it('chipConfig getColor should return risk-high for High', () => {
    const col = component.atRiskkColumns.find(c => c.id === 'riskRate');
    const chip = col!.chipConfig!;
    expect(chip.getColor!('', { kind: 'payer', riskRate: 'High' } as any)).toBe('risk-high');
  });

  it('chipConfig getColor should return risk-medium for Medium', () => {
    const col = component.atRiskkColumns.find(c => c.id === 'riskRate');
    const chip = col!.chipConfig!;
    expect(chip.getColor!('', { kind: 'payer', riskRate: 'Medium' } as any)).toBe('risk-medium');
  });

  it('chipConfig getColor should return risk-low for Low', () => {
    const col = component.atRiskkColumns.find(c => c.id === 'riskRate');
    const chip = col!.chipConfig!;
    expect(chip.getColor!('', { kind: 'payer', riskRate: 'Low' } as any)).toBe('risk-low');
  });

  // --- lossRevenue displayFormatter ---
  it('lossRevenue displayFormatter should format currency', () => {
    const col = component.atRiskkColumns.find(c => c.id === 'lossRevenue');
    const formatted = col!.displayFormatter!(5000, {} as any);
    expect(formatted).toContain('5,000');
  });

  it('lossRevenue displayFormatter should handle null', () => {
    const col = component.atRiskkColumns.find(c => c.id === 'lossRevenue');
    const formatted = col!.displayFormatter!(null as any, {} as any);
    expect(formatted).toContain('0');
  });

  // --- claims displayFormatter ---
  it('claims displayFormatter should format with locale', () => {
    const col = component.atRiskkColumns.find(c => c.id === 'claims');
    const formatted = col!.displayFormatter!(1234, {} as any);
    expect(formatted).toContain('1,234');
  });

  // --- onAtRiskTableAction ---
  it('onAtRiskTableAction should not process non-export_excel actions', () => {
    // Should not throw
    component.onAtRiskTableAction({ actionId: 'other', row: { kind: 'cpt', payer: 'D0120', claims: 1, lossRevenue: -100 } as any });
  });

  it('onAtRiskTableAction should not process non-cpt rows', () => {
    // Should not throw
    component.onAtRiskTableAction({ actionId: 'export_excel', row: { kind: 'payer', payer: 'Aetna', claims: 1, lossRevenue: -100 } as any });
  });

  it('onAtRiskTableAction should export CSV for cpt rows', () => {
    spyOn(document.body, 'appendChild');
    spyOn(URL, 'createObjectURL').and.returnValue('blob:test');
    spyOn(URL, 'revokeObjectURL');

    const cptRow: any = {
      kind: 'cpt',
      payer: 'D0120',
      payerName: 'Aetna',
      claims: 5,
      lossRevenue: -2000,
      children: [
        { kind: 'claim', claimNumber: 'CL001', patientName: 'John', lossRevenue: -500 },
      ],
    };

    component.onAtRiskTableAction({ actionId: 'export_excel', row: cptRow });
    expect(URL.createObjectURL).toHaveBeenCalled();
  });

  // --- remediation next steps ---
  it('should have arNextSteps defined', () => {
    expect(component.arNextSteps.length).toBeGreaterThan(0);
    expect(component.arNextSteps[0].id).toBe('review-at-risk');
  });

  it('should initialize notes as empty string', () => {
    expect(component.notes).toBe('');
  });

  // --- riskRateLabel ---
  it('riskRateLabel should return High for rate >= 0.9', () => {
    expect((component as any).riskRateLabel(0.95)).toBe('High');
  });

  it('riskRateLabel should return Medium for rate >= 0.75', () => {
    expect((component as any).riskRateLabel(0.8)).toBe('Medium');
  });

  it('riskRateLabel should return Low for rate < 0.75', () => {
    expect((component as any).riskRateLabel(0.5)).toBe('Low');
  });

  it('riskRateLabel should return dash for null', () => {
    expect((component as any).riskRateLabel(null)).toBe('\u2014');
  });

  it('riskRateLabel should return dash for undefined', () => {
    expect((component as any).riskRateLabel(undefined)).toBe('\u2014');
  });

  // --- riskRateTone ---
  it('riskRateTone should return high for rate >= 0.9', () => {
    expect((component as any).riskRateTone(0.95)).toBe('high');
  });

  it('riskRateTone should return medium for rate >= 0.75', () => {
    expect((component as any).riskRateTone(0.8)).toBe('medium');
  });

  it('riskRateTone should return low for rate < 0.75', () => {
    expect((component as any).riskRateTone(0.5)).toBe('low');
  });

  it('riskRateTone should return low for null', () => {
    expect((component as any).riskRateTone(null)).toBe('low');
  });

  // --- ngOnDestroy ---
  it('should complete destroy$ on ngOnDestroy', () => {
    spyOn((component as any).destroy$, 'next');
    spyOn((component as any).destroy$, 'complete');
    component.ngOnDestroy();
    expect((component as any).destroy$.next).toHaveBeenCalled();
    expect((component as any).destroy$.complete).toHaveBeenCalled();
  });
});
