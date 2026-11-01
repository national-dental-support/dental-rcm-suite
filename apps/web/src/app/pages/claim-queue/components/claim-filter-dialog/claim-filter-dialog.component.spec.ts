import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ReactiveFormsModule, FormBuilder } from '@angular/forms';
import { MatSelectModule } from '@angular/material/select';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ClaimFilterDialogComponent } from './claim-filter-dialog.component';

describe('ClaimFilterDialogComponent', () => {
  let component: ClaimFilterDialogComponent;
  let fixture: ComponentFixture<ClaimFilterDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ClaimFilterDialogComponent],
      imports: [ReactiveFormsModule],
      providers: [FormBuilder],
      schemas: [NO_ERRORS_SCHEMA],
    })
    .overrideComponent(ClaimFilterDialogComponent, { set: { template: '<div></div>' } })
    .compileComponents();

    fixture = TestBed.createComponent(ClaimFilterDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize the form on init', () => {
    expect(component.form).toBeDefined();
    expect(component.form.get('assignedTo')).toBeTruthy();
    expect(component.form.get('payer')).toBeTruthy();
    expect(component.form.get('claimStatus')).toBeTruthy();
  });

  it('should use initialFilters values when provided', () => {
    component.initialFilters = { payer: 'Cigna', assignedTo: 'Dr. Smith' } as any;
    component.ngOnInit();
    expect(component.form.get('payer')?.value).toBe('Cigna');
    expect(component.form.get('assignedTo')?.value).toBe('Dr. Smith');
  });

  it('should emit filtersChange on form value changes', fakeAsync(() => {
    const spy = jasmine.createSpy('filtersChange');
    component.filtersChange.subscribe(spy);

    component.form.patchValue({ payer: 'Aetna' });
    tick(300);

    expect(spy).toHaveBeenCalled();
    const emitted = spy.calls.mostRecent().args[0];
    expect(emitted.payer).toBe('Aetna');
  }));

  it('should emit reset event on onReset', () => {
    const spy = jasmine.createSpy('reset');
    component.reset.subscribe(spy);
    component.onReset();
    expect(spy).toHaveBeenCalled();
  });

  it('should reset form fields on onReset', () => {
    component.form.patchValue({ payer: 'Cigna', assignedTo: 'John' });
    component.onReset();
    expect(component.form.get('payer')?.value).toBeNull();
    expect(component.form.get('assignedTo')?.value).toBeNull();
  });

  // -- ngOnChanges --------------------------------------------------------

  it('ngOnChanges patches form when initialFilters changes', () => {
    const filters = { payer: 'BlueCross', assignedTo: 'Jane' } as any;
    component.initialFilters = filters;
    component.ngOnChanges({
      initialFilters: { currentValue: filters, previousValue: null, firstChange: false, isFirstChange: () => false },
    });
    expect(component.form.get('payer')?.value).toBe('BlueCross');
    expect(component.form.get('assignedTo')?.value).toBe('Jane');
  });

  it('ngOnChanges patches form with null initialFilters (uses empty object fallback)', () => {
    component.initialFilters = null;
    component.ngOnChanges({
      initialFilters: { currentValue: null, previousValue: {}, firstChange: false, isFirstChange: () => false },
    });
    expect(component.form.get('payer')?.value).toBeNull();
    expect(component.form.get('assignedTo')?.value).toBeNull();
  });

  it('ngOnChanges does nothing when initialFilters is not in changes', () => {
    const originalValue = component.form.get('payer')?.value;
    component.ngOnChanges({
      options: { currentValue: {}, previousValue: {}, firstChange: false, isFirstChange: () => false },
    });
    expect(component.form.get('payer')?.value).toBe(originalValue);
  });

  it('ngOnChanges does nothing when form is not initialized', () => {
    const freshFixture = TestBed.createComponent(ClaimFilterDialogComponent);
    const freshComponent = freshFixture.componentInstance;
    // Before ngOnInit, form is undefined - ngOnChanges should be a no-op
    freshComponent.initialFilters = { payer: 'Aetna' } as any;
    expect(() => freshComponent.ngOnChanges({
      initialFilters: { currentValue: { payer: 'Aetna' }, previousValue: null, firstChange: false, isFirstChange: () => false },
    })).not.toThrow();
  });

  // -- form emits null values as undefined (except dates) -----------------

  it('filtersChange should emit undefined for null form values', fakeAsync(() => {
    const spy = jasmine.createSpy('filtersChange');
    component.filtersChange.subscribe(spy);

    component.form.patchValue({ assignedTo: null, payer: null });
    tick(300);

    const emitted = spy.calls.mostRecent().args[0];
    expect(emitted.assignedTo).toBeUndefined();
    expect(emitted.payer).toBeUndefined();
  }));

  it('filtersChange should keep submittedFrom as null when not set', fakeAsync(() => {
    const spy = jasmine.createSpy('filtersChange');
    component.filtersChange.subscribe(spy);

    component.form.patchValue({ payer: 'Cigna', submittedFrom: null });
    tick(300);

    const emitted = spy.calls.mostRecent().args[0];
    expect(emitted.submittedFrom).toBeNull();
  }));

  it('filtersChange emits all fields including escalationReason', fakeAsync(() => {
    const spy = jasmine.createSpy('filtersChange');
    component.filtersChange.subscribe(spy);

    component.form.patchValue({
      denialReason: 'CO-4',
      placeOfService: '11',
      claimStatus: 'open',
      escalationReason: 'urgent',
    });
    tick(300);

    const emitted = spy.calls.mostRecent().args[0];
    expect(emitted.denialReason).toBe('CO-4');
    expect(emitted.placeOfService).toBe('11');
    expect(emitted.claimStatus).toBe('open');
    expect(emitted.escalationReason).toBe('urgent');
  }));

  // -- initialFilters with all fields ------------------------------------

  it('should initialize with all filter fields from initialFilters', () => {
    component.initialFilters = {
      assignedTo: 'Alice',
      payer: 'Aetna',
      billingProvider: 'Dr. Brown',
      submittedFrom: '2025-01-01',
      submittedTo: '2025-12-31',
      denialReason: 'CO-4',
      placeOfService: '11',
      claimStatus: 'open',
      escalationReason: null,
    } as any;
    component.ngOnInit();
    expect(component.form.get('billingProvider')?.value).toBe('Dr. Brown');
    expect(component.form.get('submittedFrom')?.value).toBe('2025-01-01');
    expect(component.form.get('denialReason')?.value).toBe('CO-4');
    expect(component.form.get('placeOfService')?.value).toBe('11');
  });
});
