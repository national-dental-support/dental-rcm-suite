import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA, ChangeDetectorRef } from '@angular/core';
import { of, Subject, throwError } from 'rxjs';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { MatchingComponent } from './matching.component';
import { ReconIqService } from '../../../core/services/recon-iq.service';
import { ReconIqWindowService } from '../../../core/services/recon-iq-window.service';
import { GlobalFiltersStore } from '../../../shared/components/global-filters/global-filters.store';

describe('MatchingComponent', () => {
  let component: MatchingComponent;
  let fixture: ComponentFixture<MatchingComponent>;
  let mockReconIqService: jasmine.SpyObj<any>;
  let mockDialog: jasmine.SpyObj<MatDialog>;
  let mockReconWindows: jasmine.SpyObj<ReconIqWindowService>;
  let mockGlobalFiltersStore: { applied$: any; value: any };
  let appliedSubject: Subject<any>;

  const makePaymentRow = (id = 'P1') => ({
    paymentId: id,
    value: 'REF-1',
    date: '2025-01-01',
    payer: 'BlueCross',
    type: 'EFT',
    amount: '$100.00',
  });

  const makeEobRow = (id = 'E1') => ({
    eobId: id,
    value: 'REF-2',
    date: '2025-01-02',
    payer: 'BlueCross',
    type: 'ERA',
    amount: '$100.00',
  });

  beforeEach(async () => {
    appliedSubject = new Subject<any>();

    mockReconIqService = jasmine.createSpyObj('ReconIqService', [
      'getPaymentsWithNoEob',
      'getEobsWithNoPayment',
      'applyMatch',
      'getMatchedPairs',
      'unmatch',
      'getSuggestions',
      'generateSuggestions',
      'acceptSuggestion',
      'rejectSuggestion',
      'autoAcceptSuggestions',
    ]);
    mockReconIqService.getPaymentsWithNoEob.and.returnValue(of({ rows: [] }));
    mockReconIqService.getEobsWithNoPayment.and.returnValue(of({ rows: [] }));
    mockReconIqService.applyMatch.and.returnValue(of({ success: true }));
    mockReconIqService.getMatchedPairs.and.returnValue(of({ rows: [] }));
    mockReconIqService.unmatch.and.returnValue(of({ message: 'ok', remittanceFileId: 'R1', bankDepositId: 'B1' }));
    mockReconIqService.getSuggestions.and.returnValue(of({ rows: [] }));
    mockReconIqService.generateSuggestions.and.returnValue(of({ generated: 0 }));
    mockReconIqService.acceptSuggestion.and.returnValue(of({ message: 'ok' }));
    mockReconIqService.rejectSuggestion.and.returnValue(of({ message: 'ok' }));
    mockReconIqService.autoAcceptSuggestions.and.returnValue(of({ accepted: 0 }));

    mockDialog = jasmine.createSpyObj('MatDialog', ['open']);
    mockDialog.open.and.returnValue({
      afterClosed: () => of(false),
    } as MatDialogRef<any>);

    mockReconWindows = jasmine.createSpyObj('ReconIqWindowService', [
      'openPaymentWindow',
      'openEobWindow',
    ]);

    mockGlobalFiltersStore = { applied$: appliedSubject.asObservable(), value: null };

    await TestBed.configureTestingModule({
      declarations: [MatchingComponent],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        { provide: MatDialog, useValue: mockDialog },
        { provide: ReconIqService, useValue: mockReconIqService },
        { provide: ChangeDetectorRef, useValue: { markForCheck: () => {} } },
        { provide: ReconIqWindowService, useValue: mockReconWindows },
        { provide: GlobalFiltersStore, useValue: mockGlobalFiltersStore },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MatchingComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    appliedSubject.complete();
  });

  // -- 1. Creation ------------------------------------------------------------
  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // -- 2. ngOnInit triggers API calls ----------------------------------------
  it('should call getPaymentsWithNoEob and getEobsWithNoPayment on init', () => {
    expect(mockReconIqService.getPaymentsWithNoEob).toHaveBeenCalled();
    expect(mockReconIqService.getEobsWithNoPayment).toHaveBeenCalled();
  });

  // -- 3. Global filter applied$ triggers reload -----------------------------
  it('should reload tables when globalFiltersStore.applied$ emits', () => {
    const callsBefore = mockReconIqService.getPaymentsWithNoEob.calls.count();
    appliedSubject.next({});
    expect(mockReconIqService.getPaymentsWithNoEob.calls.count()).toBeGreaterThan(callsBefore);
  });

  // -- 4. canMatch - falsy when nothing selected -----------------------------
  it('canMatch should be false when no payment or EOB is selected', () => {
    expect(component.canMatch).toBeFalse();
  });

  // -- 5. canMatch - true when both selected ---------------------------------
  it('canMatch should be true when both payment and EOB are selected', () => {
    component.selectedPayment = makePaymentRow();
    component.selectedEob = makeEobRow();
    expect(component.canMatch).toBeTrue();
  });

  // -- 6. clearSelections resets both ----------------------------------------
  it('clearSelections should set selectedPayment and selectedEob to null', () => {
    component.selectedPayment = makePaymentRow();
    component.selectedEob = makeEobRow();
    component.clearSelections();
    expect(component.selectedPayment).toBeNull();
    expect(component.selectedEob).toBeNull();
  });

  // -- 7. onPaymentSelected toggles ------------------------------------------
  it('onPaymentSelected should select a row and deselect it when clicked again', () => {
    const row = makePaymentRow();
    component.onPaymentSelected(row);
    expect(component.selectedPayment).toEqual(row);
    component.onPaymentSelected(row);
    expect(component.selectedPayment).toBeNull();
  });

  // -- 8. onEobSelected toggles ----------------------------------------------
  it('onEobSelected should select a row and deselect it when clicked again', () => {
    const row = makeEobRow();
    component.onEobSelected(row);
    expect(component.selectedEob).toEqual(row);
    component.onEobSelected(row);
    expect(component.selectedEob).toBeNull();
  });

  // -- 9. toggleFilters flips boolean ----------------------------------------
  it('toggleFilters should flip showFilters', () => {
    component.showFilters = false;
    component.toggleFilters();
    expect(component.showFilters).toBeTrue();
    component.toggleFilters();
    expect(component.showFilters).toBeFalse();
  });

  // -- 10. activeFilterCount is 0 with blank currentFilters ------------------
  it('activeFilterCount should return 0 when all currentFilters are empty', () => {
    component.currentFilters = { paymentId: '', value: '', date: '', payer: '', type: '', amount: '' };
    expect(component.activeFilterCount).toBe(0);
  });

  // -- 11. activeFilterCount counts non-empty entries ------------------------
  it('activeFilterCount should count non-empty filter values', () => {
    component.currentFilters = { paymentId: 'P99', value: '', date: '', payer: 'Aetna', type: '', amount: '' };
    expect(component.activeFilterCount).toBe(2);
  });

  // -- 12. onFilterReset clears filtersForm$ and search$ --------------------
  it('onFilterReset should reset filtersForm$ to all-empty and clear search$', () => {
    component.filtersForm$.next({ paymentId: 'P1', value: 'V1', eobId: 'E1', date: '2025-01-01', payer: 'X', type: 'EFT', amount: '100' });
    component.search$.next('some search');
    component.onFilterReset();
    expect(component.filtersForm$.value).toEqual({ paymentId: '', value: '', eobId: '', date: '', payer: '', type: '', amount: '' });
    expect(component.search$.value).toBe('');
  });

  // -- 13. onMatchingSearchChanged updates search$ ---------------------------
  it('onMatchingSearchChanged should update search$ with the provided value', () => {
    component.onMatchingSearchChanged('BlueCross');
    expect(component.search$.value).toBe('BlueCross');
  });

  // -- 14. onViewPayment delegates to reconWindows ---------------------------
  it('onViewPayment should call reconWindows.openPaymentWindow with correct args', () => {
    const row = makePaymentRow();
    component.onViewPayment(row);
    expect(mockReconWindows.openPaymentWindow).toHaveBeenCalledWith({
      paymentId: row.paymentId,
      referenceId: row.value,
      date: row.date,
      payer: row.payer,
      type: row.type,
      amount: row.amount,
    });
  });

  // -- 15. onViewEobEra delegates to reconWindows ----------------------------
  it('onViewEobEra should call reconWindows.openEobWindow with correct args', () => {
    const row = makeEobRow();
    component.onViewEobEra(row);
    expect(mockReconWindows.openEobWindow).toHaveBeenCalledWith({
      eobId:       row.eobId,
      referenceId: row.value,
      date:        row.date,
      payer:       row.payer,
      type:        row.type,
      amount:      row.amount,
    });
  });

  // -- 16. onMatchSelected opens dialog; no applyMatch when cancelled --------
  it('onMatchSelected should open dialog and NOT call applyMatch when user cancels', () => {
    mockDialog.open.and.returnValue({ afterClosed: () => of(false) } as MatDialogRef<any>);
    component.selectedPayment = makePaymentRow();
    component.selectedEob = makeEobRow();
    component.onMatchSelected();
    expect(mockDialog.open).toHaveBeenCalled();
    expect(mockReconIqService.applyMatch).not.toHaveBeenCalled();
  });

  // -- 17. onMatchSelected calls applyMatch when user confirms ---------------
  it('onMatchSelected should call applyMatch when user confirms in dialog', () => {
    mockDialog.open.and.returnValue({ afterClosed: () => of(true) } as MatDialogRef<any>);
    component.selectedPayment = makePaymentRow('PMT-99');
    component.selectedEob = makeEobRow('EOB-99');
    component.onMatchSelected();
    expect(mockReconIqService.applyMatch).toHaveBeenCalledWith('PMT-99', 'EOB-99');
  });

  // -- 18. paymentRowClassFn returns 'rp-row--selected' for selected row -----
  it('paymentRowClassFn should return selection class for selected row only', () => {
    const row = makePaymentRow('P-SEL');
    component.selectedPayment = row;
    expect(component.paymentRowClassFn(row)).toBe('rp-row--selected');
    expect(component.paymentRowClassFn(makePaymentRow('P-OTHER'))).toBeNull();
  });

  // -- 19. eobRowClassFn returns 'rp-row--selected' for selected EOB ---------
  it('eobRowClassFn should return selection class for selected EOB row only', () => {
    const row = makeEobRow('E-SEL');
    component.selectedEob = row;
    expect(component.eobRowClassFn(row)).toBe('rp-row--selected');
    expect(component.eobRowClassFn(makeEobRow('E-OTHER'))).toBeNull();
  });

  // -- 20. filteredPaymentsNoEob$ respects search term -----------------------
  it('filteredPaymentsNoEob$ should filter out rows not matching the search term', fakeAsync(() => {
    const matchRow = makePaymentRow('P-MATCH');
    const noMatchRow = { ...makePaymentRow('P-NOMATCH'), payer: 'XYZ-Corp' };
    component.paymentsNoEobData$.next([matchRow, noMatchRow]);
    component.search$.next('BlueCross');

    let result: any[] = [];
    const sub = component.filteredPaymentsNoEob$.subscribe((rows) => (result = rows));
    tick();
    sub.unsubscribe();

    expect(result.map((r) => r.paymentId)).toContain('P-MATCH');
    expect(result.map((r) => r.paymentId)).not.toContain('P-NOMATCH');
  }));

  // -- 21. filteredEobNoPayments$ respects filter form values ---------------
  it('filteredEobNoPayments$ should filter rows by filtersForm$ payer value', fakeAsync(() => {
    const matchRow = makeEobRow('E-MATCH');
    const noMatchRow = { ...makeEobRow('E-NOMATCH'), payer: 'SomeOtherPayer' };
    component.eobNoPaymentsData$.next([matchRow, noMatchRow]);
    component.filtersForm$.next({ paymentId: '', value: '', eobId: '', date: '', payer: 'BlueCross', type: '', amount: '' });

    let result: any[] = [];
    const sub = component.filteredEobNoPayments$.subscribe((rows) => (result = rows));
    tick();
    sub.unsubscribe();

    expect(result.map((r) => r.eobId)).toContain('E-MATCH');
    expect(result.map((r) => r.eobId)).not.toContain('E-NOMATCH');
  }));

  // -- 22. loadMatchingTables with actual row data ---------------------------
  it('loadMatchingTables should populate paymentsNoEobData$ and eobNoPaymentsData$', fakeAsync(() => {
    mockReconIqService.getPaymentsWithNoEob.and.returnValue(of({
      rows: [{ paymentId: 'PMT-1', value: 'REF1', paymentDate: '2025-01-01', payerName: 'BCBS', paymentType: 'EFT', amount: 1000 }],
    }));
    mockReconIqService.getEobsWithNoPayment.and.returnValue(of({
      rows: [{ eobId: 'EOB-1', value: 'REF2', eobDate: '2025-01-02', payerName: 'Aetna', eobType: 'ERA', amount: 500 }],
    }));

    component.ngOnInit();
    tick();

    expect(component.paymentsNoEobData$.value.length).toBe(1);
    expect(component.paymentsNoEobData$.value[0].paymentId).toBe('PMT-1');
    expect(component.eobNoPaymentsData$.value.length).toBe(1);
    expect(component.eobNoPaymentsData$.value[0].eobId).toBe('EOB-1');
  }));

  // -- 23. loadMatchingTables error path clears data -------------------------
  it('loadMatchingTables should clear data arrays on API error', fakeAsync(() => {
    mockReconIqService.getPaymentsWithNoEob.and.returnValue(throwError(() => new Error('fail')));
    component.paymentsNoEobData$.next([makePaymentRow()]);
    component.eobNoPaymentsData$.next([makeEobRow()]);

    component.ngOnInit();
    tick();

    expect(component.paymentsNoEobData$.value).toEqual([]);
    expect(component.eobNoPaymentsData$.value).toEqual([]);
  }));

  // -- 24. onMatchSelected success path calls applyMatch and removes rows ----
  it('onMatchSelected with confirmed dialog should apply match and remove rows from streams', () => {
    mockDialog.open.and.returnValue({ afterClosed: () => of(true) } as MatDialogRef<any>);
    const payment = makePaymentRow('PMT-DEL');
    const eob = makeEobRow('EOB-DEL');
    component.paymentsNoEobData$.next([payment, makePaymentRow('PMT-KEEP')]);
    component.eobNoPaymentsData$.next([eob, makeEobRow('EOB-KEEP')]);
    component.selectedPayment = payment;
    component.selectedEob = eob;

    component.onMatchSelected();

    expect(mockReconIqService.applyMatch).toHaveBeenCalledWith('PMT-DEL', 'EOB-DEL');
    expect(component.paymentsNoEobData$.value.find(p => p.paymentId === 'PMT-DEL')).toBeUndefined();
    expect(component.eobNoPaymentsData$.value.find(e => e.eobId === 'EOB-DEL')).toBeUndefined();
    expect(component.selectedPayment).toBeNull();
    expect(component.selectedEob).toBeNull();
  });

  // -- 25. onMatchSelected error path ----------------------------------------
  it('onMatchSelected error path should handle applyMatch failure gracefully', () => {
    mockDialog.open.and.returnValue({ afterClosed: () => of(true) } as MatDialogRef<any>);
    mockReconIqService.applyMatch.and.returnValue(throwError(() => new Error('match failed')));
    component.selectedPayment = makePaymentRow('PMT-ERR');
    component.selectedEob = makeEobRow('EOB-ERR');

    expect(() => component.onMatchSelected()).not.toThrow();
  });

  // -- 26. onMatchSelected does nothing when selectedPayment/Eob is null -----
  it('onMatchSelected should do nothing when payment or eob is null', () => {
    component.selectedPayment = null;
    component.selectedEob = null;
    component.onMatchSelected();
    expect(mockDialog.open).not.toHaveBeenCalled();
  });

  // -- 27. toggleMatchedPanel loads pairs when panel opens ------------------
  it('toggleMatchedPanel should load matched pairs when panel opens and no data', () => {
    component.showMatchedPanel = false;
    component.matchedPairs = [];
    component.toggleMatchedPanel();
    expect(component.showMatchedPanel).toBeTrue();
    expect(mockReconIqService.getMatchedPairs).toHaveBeenCalled();
  });

  // -- 28. toggleMatchedPanel does not reload when already has data ----------
  it('toggleMatchedPanel should not reload when panel already has data', () => {
    component.showMatchedPanel = false;
    component.matchedPairs = [{ reconciliationId: 'R1' } as any];
    component.toggleMatchedPanel();
    expect(mockReconIqService.getMatchedPairs).not.toHaveBeenCalled();
  });

  // -- 29. loadMatchedPairs error path --------------------------------------
  it('loadMatchedPairs should set matchedLoading=false on error', () => {
    mockReconIqService.getMatchedPairs.and.returnValue(throwError(() => new Error('fail')));
    component.loadMatchedPairs();
    expect(component.matchedLoading).toBeFalse();
  });

  // -- 30. unmatch cancelled does nothing -----------------------------------
  it('unmatch should do nothing when user cancels prompt', () => {
    spyOn(window, 'prompt').and.returnValue(null);
    component.unmatch({ reconciliationId: 'R1' } as any);
    expect(mockReconIqService.unmatch).not.toHaveBeenCalled();
  });

  // -- 31. unmatch confirmed calls API and refreshes -------------------------
  it('unmatch should call API and reload tables when confirmed', () => {
    spyOn(window, 'prompt').and.returnValue('test reason');
    component.matchedPairs = [{ reconciliationId: 'R1' } as any, { reconciliationId: 'R2' } as any];
    component.unmatch({ reconciliationId: 'R1' } as any);
    expect(mockReconIqService.unmatch).toHaveBeenCalledWith('R1', 'test reason');
    expect(component.matchedPairs.find(p => p.reconciliationId === 'R1')).toBeUndefined();
  });

  // -- 32. toggleSuggestionsPanel loads suggestions when no data -------------
  it('toggleSuggestionsPanel should load suggestions when panel opens and no data', () => {
    component.showSuggestionsPanel = false;
    component.suggestions = [];
    component.toggleSuggestionsPanel();
    expect(component.showSuggestionsPanel).toBeTrue();
    expect(mockReconIqService.getSuggestions).toHaveBeenCalled();
  });

  // -- 33. loadSuggestions error path ---------------------------------------
  it('loadSuggestions should set suggestionsLoading=false on error', () => {
    mockReconIqService.getSuggestions.and.returnValue(throwError(() => new Error('fail')));
    component.loadSuggestions();
    expect(component.suggestionsLoading).toBeFalse();
  });

  // -- 34. generateSuggestions calls loadSuggestions on success -------------
  it('generateSuggestions should call getSuggestions after generating', () => {
    component.generateSuggestions();
    expect(mockReconIqService.generateSuggestions).toHaveBeenCalled();
    expect(mockReconIqService.getSuggestions).toHaveBeenCalled();
  });

  // -- 35. generateSuggestions error path -----------------------------------
  it('generateSuggestions should handle error gracefully', () => {
    mockReconIqService.generateSuggestions.and.returnValue(throwError(() => new Error('fail')));
    expect(() => component.generateSuggestions()).not.toThrow();
    expect(component.suggestionsLoading).toBeFalse();
  });

  // -- 36. acceptSuggestion removes suggestion and updates streams -----------
  it('acceptSuggestion should remove the suggestion from list', () => {
    const suggestion = { id: 1, bankDepositId: 'PMT-1', remittanceFileId: 'EOB-1', confidenceScore: 90 } as any;
    component.suggestions = [suggestion, { id: 2 } as any];
    component.paymentsNoEobData$.next([makePaymentRow('PMT-1'), makePaymentRow('OTHER')]);
    component.eobNoPaymentsData$.next([makeEobRow('EOB-1'), makeEobRow('OTHER')]);
    component.acceptSuggestion(suggestion);
    expect(mockReconIqService.acceptSuggestion).toHaveBeenCalledWith(1);
    expect(component.suggestions.find(s => s.id === 1)).toBeUndefined();
    expect(component.paymentsNoEobData$.value.find(p => p.paymentId === 'PMT-1')).toBeUndefined();
    expect(component.eobNoPaymentsData$.value.find(e => e.eobId === 'EOB-1')).toBeUndefined();
  });

  // -- 37. rejectSuggestion removes suggestion from list --------------------
  it('rejectSuggestion should remove the suggestion from list', () => {
    const suggestion = { id: 5 } as any;
    component.suggestions = [suggestion, { id: 6 } as any];
    component.rejectSuggestion(suggestion);
    expect(mockReconIqService.rejectSuggestion).toHaveBeenCalledWith(5);
    expect(component.suggestions.find(s => s.id === 5)).toBeUndefined();
  });

  // -- 38. autoAcceptHighConfidence does nothing when no high-confidence -----
  it('autoAcceptHighConfidence should do nothing when no suggestions meet threshold', () => {
    component.suggestions = [{ id: 1, confidenceScore: 50 } as any];
    component.autoAcceptHighConfidence();
    expect(mockReconIqService.autoAcceptSuggestions).not.toHaveBeenCalled();
  });

  // -- 39. autoAcceptHighConfidence calls API on confirm ---------------------
  it('autoAcceptHighConfidence should call API when confirmed', () => {
    spyOn(window, 'confirm').and.returnValue(true);
    component.suggestions = [{ id: 1, confidenceScore: 85 } as any, { id: 2, confidenceScore: 90 } as any];
    component.autoAcceptHighConfidence();
    expect(mockReconIqService.autoAcceptSuggestions).toHaveBeenCalledWith(80);
  });

  // -- 40. autoAcceptHighConfidence cancelled --------------------------------
  it('autoAcceptHighConfidence should not call API when user cancels', () => {
    spyOn(window, 'confirm').and.returnValue(false);
    component.suggestions = [{ id: 1, confidenceScore: 85 } as any];
    component.autoAcceptHighConfidence();
    expect(mockReconIqService.autoAcceptSuggestions).not.toHaveBeenCalled();
  });

  // -- 41. confidenceClass returns correct class -----------------------------
  it('confidenceClass should return green for score >= 80', () => {
    expect(component.confidenceClass(85)).toBe('conf-bar--green');
    expect(component.confidenceClass(80)).toBe('conf-bar--green');
  });

  it('confidenceClass should return yellow for score 60-79', () => {
    expect(component.confidenceClass(65)).toBe('conf-bar--yellow');
    expect(component.confidenceClass(60)).toBe('conf-bar--yellow');
  });

  it('confidenceClass should return red for score < 60', () => {
    expect(component.confidenceClass(59)).toBe('conf-bar--red');
    expect(component.confidenceClass(0)).toBe('conf-bar--red');
  });

  // -- 42. onTableFilterStateChanged updates filtersForm$ -------------------
  it('onTableFilterStateChanged should update filtersForm$ when state changes', () => {
    const state: any = {
      global: '',
      columns: {
        paymentId: { operator: 'contains', value: 'PMT-99', value2: '', selectedValues: [] },
        value: { operator: null, value: '', value2: '', selectedValues: [] },
        date: { operator: null, value: '', value2: '', selectedValues: [] },
        payer: { operator: 'contains', value: 'BCBS', value2: '', selectedValues: [] },
        type: { operator: null, value: '', value2: '', selectedValues: [] },
        amount: { operator: null, value: '', value2: '', selectedValues: [] },
        eobId: { operator: null, value: '', value2: '', selectedValues: [] },
      },
    };
    component.onTableFilterStateChanged(state);
    expect(component.filtersForm$.value.paymentId).toBe('PMT-99');
    expect(component.filtersForm$.value.payer).toBe('BCBS');
  });

  it('onTableFilterStateChanged should not emit when state is unchanged', () => {
    const state: any = { global: '', columns: {} };
    const initialValue = component.filtersForm$.value;
    component.onTableFilterStateChanged(state); // sets to empty
    component.onTableFilterStateChanged(state); // same state - should not emit again
    expect(component.filtersForm$.value).toEqual(initialValue);
  });

  // -- 43. onFiltersChange and onFiltersReset --------------------------------
  it('onFiltersChange should merge new filter values into filters$', () => {
    component.onFiltersChange({ payer: 'Cigna', paymentId: '', value: '', date: '', type: '', amount: '' });
    expect(component.filters$.value.payer).toBe('Cigna');
  });

  it('onFiltersReset should reset filters$ to empty values', () => {
    component.filters$.next({ payer: 'BCBS', amount: '100', date: '2025-01-01', paymentId: 'P1', type: 'EFT', value: 'REF1' });
    component.onFiltersReset();
    expect(component.filters$.value.payer).toBe('');
    expect(component.filters$.value.amount).toBe('');
  });

  // -- 44. onMatchingFiltersChanged merges to filtersForm$ -------------------
  it('onMatchingFiltersChanged should merge values into filtersForm$', () => {
    component.onMatchingFiltersChanged({ payer: 'Humana', paymentId: '', value: '', eobId: '', date: '', type: '', amount: '' } as any);
    expect(component.filtersForm$.value.payer).toBe('Humana');
  });

  // -- 45. removeFilterChip clears the chip key ------------------------------
  it('removeFilterChip should clear the chip key in filtersForm$', () => {
    component.filtersForm$.next({ paymentId: 'P1', value: '', eobId: '', date: '', payer: 'BCBS', type: '', amount: '' });
    component.removeFilterChip({ key: 'payer', label: 'Payer', value: 'BCBS' });
    expect(component.filtersForm$.value.payer).toBe('');
    expect(component.filtersForm$.value.paymentId).toBe('P1'); // other values unchanged
  });

  // -- 46. activeFilters getter returns chip list ----------------------------
  it('activeFilters should return chips for non-empty filter values', () => {
    component.currentFilters = { paymentId: 'P1', payer: 'BCBS', value: '', date: '', type: '', amount: '' };
    const chips = component.activeFilters;
    expect(chips.length).toBe(2);
    expect(chips.find(c => c.key === 'paymentId')).toBeTruthy();
    expect(chips.find(c => c.key === 'payer')).toBeTruthy();
  });

  it('activeFilters should return empty array when no filters set', () => {
    component.currentFilters = { paymentId: '', payer: '', value: '', date: '', type: '', amount: '' };
    expect(component.activeFilters.length).toBe(0);
  });

  // -- 47. clearEncounterSearch clears matchingGlobalSearch -----------------
  it('clearEncounterSearch should clear matchingGlobalSearch', () => {
    component.matchingGlobalSearch = 'some search';
    component.clearEncounterSearch();
    expect(component.matchingGlobalSearch).toBe('');
  });

  // -- 48. applyFilter sets filterValue ------------------------------------
  it('applyFilter should set filterValue', () => {
    component.applyFilter('test-filter');
    expect(component.filterValue).toBe('test-filter');
  });

  // -- 49. ngOnDestroy completes destroy$ -----------------------------------
  it('ngOnDestroy should not throw', () => {
    expect(() => component.ngOnDestroy()).not.toThrow();
  });

  // -- 50. getReconIqMatchingQueryFilters with actual globalFiltersStore value
  it('loadMatchingTables should pass date filters from globalFiltersStore.value', fakeAsync(() => {
    mockGlobalFiltersStore.value = {
      startDate: new Date('2025-01-01'),
      endDate: new Date('2025-03-31'),
      payers: ['BCBS'],
      providers: ['Dr. Smith'],
      location: { id: 1 },
    };
    component.ngOnInit();
    tick();
    const callArgs = mockReconIqService.getPaymentsWithNoEob.calls.mostRecent().args[0];
    expect(callArgs.from).toBe('2025-01-01');
    expect(callArgs.to).toBe('2025-03-31');
    expect(callArgs.payers).toEqual(['BCBS']);
  }));

  // -- 51. toggleMatchedPanel closes panel ----------------------------------
  it('toggleMatchedPanel should close panel when already open', () => {
    component.showMatchedPanel = true;
    component.matchedPairs = [{ reconciliationId: 'R1' } as any];
    component.toggleMatchedPanel();
    expect(component.showMatchedPanel).toBeFalse();
    expect(mockReconIqService.getMatchedPairs).not.toHaveBeenCalled();
  });

  // -- 52. toggleSuggestionsPanel closes panel -------------------------------
  it('toggleSuggestionsPanel should close panel when already open', () => {
    component.showSuggestionsPanel = true;
    component.suggestions = [{ id: 1 } as any];
    component.toggleSuggestionsPanel();
    expect(component.showSuggestionsPanel).toBeFalse();
    expect(mockReconIqService.getSuggestions).not.toHaveBeenCalled();
  });

  // -- 53. exportCsv does not throw -----------------------------------------
  it('exportCsv should not throw', () => {
    component.paymentsNoEobData$.next([makePaymentRow()]);
    component.eobNoPaymentsData$.next([makeEobRow()]);
    spyOn(document, 'createElement').and.callThrough();
    expect(() => component.exportCsv()).not.toThrow();
  });

  // -- 54. onMatchingGlobalSearchInput updates matchingGlobalSearch ----------
  it('onMatchingGlobalSearchInput should update matchingGlobalSearch from event', () => {
    const event = { target: { value: 'search text' } } as any;
    component.onMatchingGlobalSearchInput(event);
    expect(component.matchingGlobalSearch).toBe('search text');
  });

  // -- 55. loadMatchedPairs populates matchedPairs ---------------------------
  it('loadMatchedPairs should populate matchedPairs on success', () => {
    mockReconIqService.getMatchedPairs.and.returnValue(of({ rows: [{ reconciliationId: 'R99' } as any] }));
    component.loadMatchedPairs();
    expect(component.matchedPairs.length).toBe(1);
    expect(component.matchedPairs[0].reconciliationId).toBe('R99');
    expect(component.matchedLoading).toBeFalse();
  });

  // -- 56. matchedPanel triggers reload when showMatchedPanel=true on match --
  it('applyMatch success reloads matchedPairs if panel is open', () => {
    mockDialog.open.and.returnValue({ afterClosed: () => of(true) } as MatDialogRef<any>);
    component.showMatchedPanel = true;
    component.selectedPayment = makePaymentRow('P-1');
    component.selectedEob = makeEobRow('E-1');
    component.onMatchSelected();
    expect(mockReconIqService.getMatchedPairs).toHaveBeenCalled();
  });
});
