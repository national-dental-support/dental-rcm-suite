import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, FormGroup, FormControl } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { of } from 'rxjs';
import { FilterDialogComponent } from './filter-dialog.component';
import { FilterDialogConfig } from '../../../core/models/filter-dialog.model';

describe('FilterDialogComponent', () => {
  let component: FilterDialogComponent;
  let fixture: ComponentFixture<FilterDialogComponent>;
  let mockDialogRef: jasmine.SpyObj<MatDialogRef<FilterDialogComponent>>;

  const mockConfig: FilterDialogConfig = {
    title: 'Test Filters',
    fields: [
      { key: 'status', label: 'Status', type: 'select', options: [{ label: 'Active', value: 'active' }] },
      { key: 'name', label: 'Name', type: 'text' },
    ],
    initial: { status: 'active' },
  };

  beforeEach(async () => {
    mockDialogRef = jasmine.createSpyObj('MatDialogRef', ['close']);

    await TestBed.configureTestingModule({
      declarations: [FilterDialogComponent],
      imports: [ReactiveFormsModule],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        { provide: MatDialogRef, useValue: mockDialogRef },
        { provide: MAT_DIALOG_DATA, useValue: mockConfig },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(FilterDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize form with fields from config', () => {
    expect(component.form).toBeTruthy();
    expect(component.form?.get('status')).toBeTruthy();
    expect(component.form?.get('name')).toBeTruthy();
  });

  it('should set title from config', () => {
    expect(component.title).toBe('Test Filters');
  });

  it('apply() should close dialog with form values', () => {
    component.apply();
    expect(mockDialogRef.close).toHaveBeenCalledWith({ values: component.form!.getRawValue() });
  });

  it('cancel() should close dialog with undefined', () => {
    component.cancel();
    expect(mockDialogRef.close).toHaveBeenCalledWith(undefined);
  });

  it('reset() should reset the form and close dialog', () => {
    component.reset();
    expect(mockDialogRef.close).toHaveBeenCalled();
  });

  it('spanClass() should return a span class string', () => {
    expect(component.spanClass({ span: 6 })).toBe('span-6');
  });

  it('spanClass() should default to span-4 when no span provided', () => {
    expect(component.spanClass({})).toBe('span-4');
  });

  it('spanClass() should default to span-4 for null/undefined', () => {
    expect(component.spanClass(null)).toBe('span-4');
    expect(component.spanClass(undefined)).toBe('span-4');
  });

  it('trackByKey should return the field key', () => {
    const field: any = { key: 'myField', type: 'text', label: 'My Field' };
    expect(component.trackByKey(0, field)).toBe('myField');
  });

  it('trackByOpt should return value for object option', () => {
    expect(component.trackByOpt(0, { label: 'A', value: 'a' })).toBe('a');
  });

  it('trackByOpt should return option itself for primitive', () => {
    expect(component.trackByOpt(0, 'hello')).toBe('hello');
  });

  it('trackByOpt should return null for null/undefined', () => {
    expect(component.trackByOpt(0, null)).toBeNull();
    expect(component.trackByOpt(0, undefined)).toBeNull();
  });

  // -- getOptions ----------------------------------------------------

  it('getOptions() should return an observable for array options', (done) => {
    const field: any = { key: 'status', type: 'select', options: [{ label: 'A', value: 'a' }] };
    component.getOptions(field).subscribe(opts => {
      expect(Array.isArray(opts)).toBeTrue();
      done();
    });
  });

  it('getOptions() should handle function returning array', (done) => {
    const field: any = { key: 'x', type: 'select', options: () => [{ label: 'B', value: 'b' }] };
    component.getOptions(field).subscribe(opts => {
      expect(Array.isArray(opts)).toBeTrue();
      done();
    });
  });

  it('getOptions() should handle function returning observable', (done) => {
    const field: any = { key: 'x', type: 'select', options: () => of([{ label: 'C', value: 'c' }]) };
    component.getOptions(field).subscribe(opts => {
      expect(opts.length).toBe(1);
      done();
    });
  });

  it('getOptions() should handle function returning promise', (done) => {
    const field: any = {
      key: 'x', type: 'select',
      options: () => Promise.resolve([{ label: 'D', value: 'd' }]),
    };
    component.getOptions(field).subscribe(opts => {
      expect(Array.isArray(opts)).toBeTrue();
      done();
    });
  });

  // -- isAllSelected -------------------------------------------------

  it('isAllSelected() should return true when value is empty array', () => {
    component.form!.get('name')?.setValue([]);
    expect(component.isAllSelected('name')).toBeTrue();
  });

  it('isAllSelected() should return true when value is not an array', () => {
    component.form!.get('name')?.setValue('someString');
    expect(component.isAllSelected('name')).toBeTrue();
  });

  it('isAllSelected() should return false when value is non-empty array', () => {
    component.form!.get('name')?.setValue(['a', 'b']);
    expect(component.isAllSelected('name')).toBeFalse();
  });

  // -- onSelectChange ------------------------------------------------

  it('onSelectChange should do nothing for non-multiselect fields', () => {
    const field: any = { key: 'name', type: 'text' };
    // Should not throw
    expect(() => component.onSelectChange(field, ['a'])).not.toThrow();
  });

  it('onSelectChange should drop "all" when specifics are selected', () => {
    // Add a multiselect control manually
    component.form!.addControl('ms', new FormControl(['all', 'x']));
    const field: any = { key: 'ms', type: 'multiselect' };
    component.onSelectChange(field, ['all', 'x']);
    expect(component.form!.get('ms')?.value).toEqual(['x']);
  });

  // -- onAllOptionToggled --------------------------------------------

  it('onAllOptionToggled should do nothing for non-multiselect fields', () => {
    const field: any = { key: 'name', type: 'text' };
    expect(() => component.onAllOptionToggled(field, true)).not.toThrow();
  });

  it('onAllOptionToggled should set "all" when toggled on', () => {
    component.form!.addControl('ms2', new FormControl([]));
    const field: any = { key: 'ms2', type: 'multiselect', options: [{ label: 'A', value: 'a' }] };
    component.onAllOptionToggled(field, true);
    expect(component.form!.get('ms2')?.value).toEqual(['all']);
  });

  it('onAllOptionToggled should clear "all" when toggled off', () => {
    component.form!.addControl('ms3', new FormControl(['all']));
    const field: any = { key: 'ms3', type: 'multiselect', options: [{ label: 'A', value: 'a' }] };
    component.onAllOptionToggled(field, false);
    expect(component.form!.get('ms3')?.value).toEqual([]);
  });

  it('onAllOptionToggled should force all when no options available', () => {
    component.form!.addControl('ms4', new FormControl([]));
    const field: any = { key: 'ms4', type: 'multiselect', options: [] };
    component.onAllOptionToggled(field, false);
    expect(component.form!.get('ms4')?.value).toEqual(['all']);
  });

  // -- onDateStartChange / onDateEndChange ---------------------------

  it('onDateStartChange should set start value on date-range group', () => {
    const fb = TestBed.inject(FormBuilder);
    const grp = fb.group({ start: [null], end: [null] });
    component.form!.setControl('dr', grp);

    const d = new Date('2025-06-01');
    component.onDateStartChange('dr', d);
    expect(grp.get('start')?.value).toEqual(d);
  });

  it('onDateEndChange should set end value on date-range group', () => {
    const fb = TestBed.inject(FormBuilder);
    const grp = fb.group({ start: [null], end: [null] });
    component.form!.setControl('dr2', grp);

    const d = new Date('2025-12-31');
    component.onDateEndChange('dr2', d);
    expect(grp.get('end')?.value).toEqual(d);
  });

  it('onDateStartChange should do nothing for nonexistent key', () => {
    expect(() => component.onDateStartChange('nonexistent', new Date())).not.toThrow();
  });

  // -- onMultiChange -------------------------------------------------

  it('onMultiChange should clear to empty array when ALL sentinel is clicked', () => {
    component.form!.addControl('mc1', new FormControl(['a', 'b']));
    const mockEvent = { value: [component.ALL], source: { close: jasmine.createSpy() } } as any;
    component.onMultiChange('mc1', mockEvent);
    expect(component.form!.get('mc1')?.value).toEqual([]);
  });

  it('onMultiChange should filter out ALL sentinel from values', () => {
    component.form!.addControl('mc2', new FormControl([]));
    const mockEvent = { value: ['a', 'b'], source: { close: jasmine.createSpy() } } as any;
    component.onMultiChange('mc2', mockEvent);
    expect(component.form!.get('mc2')?.value).toEqual(['a', 'b']);
  });

  it('onMultiChange should do nothing for missing control', () => {
    const mockEvent = { value: ['x'], source: { close: jasmine.createSpy() } } as any;
    expect(() => component.onMultiChange('nonexistent', mockEvent)).not.toThrow();
  });

  it('onMultiChange should handle null event value', () => {
    component.form!.addControl('mc3', new FormControl(['x']));
    const mockEvent = { value: null, source: { close: jasmine.createSpy() } } as any;
    component.onMultiChange('mc3', mockEvent);
    expect(component.form!.get('mc3')?.value).toEqual([]);
  });

  it('onMultiChange should not update if values are the same', () => {
    component.form!.addControl('mc4', new FormControl(['a', 'b']));
    const spy = spyOn(component.form!.get('mc4')!, 'setValue');
    const mockEvent = { value: ['a', 'b'], source: { close: jasmine.createSpy() } } as any;
    component.onMultiChange('mc4', mockEvent);
    expect(spy).not.toHaveBeenCalled();
  });

  it('onMultiChange should deduplicate values', () => {
    component.form!.addControl('mc5', new FormControl([]));
    const mockEvent = { value: ['a', 'a', 'b'], source: { close: jasmine.createSpy() } } as any;
    component.onMultiChange('mc5', mockEvent);
    expect(component.form!.get('mc5')?.value).toEqual(['a', 'b']);
  });

  // -- arrEq ---------------------------------------------------------

  it('arrEq should treat different-length arrays as not equal', () => {
    component.form!.addControl('ae1', new FormControl(['a']));
    const mockEvent = { value: ['a', 'b'], source: { close: jasmine.createSpy() } } as any;
    component.onMultiChange('ae1', mockEvent);
    expect(component.form!.get('ae1')?.value).toEqual(['a', 'b']);
  });

  // -- emit applied/cancelled when not in dialog mode ----------------

  it('should emit applied when not in dialog mode', () => {
    const fb = TestBed.inject(FormBuilder);
    const altComponent = new FilterDialogComponent(fb, null, null);
    altComponent.fields = mockConfig.fields!;
    altComponent.initial = {};
    altComponent.ngOnInit();

    const emitted: any[] = [];
    altComponent.applied.subscribe((v: any) => emitted.push(v));
    altComponent.apply();
    expect(emitted.length).toBe(1);
  });

  it('should emit cancelled when not in dialog mode', () => {
    const fb = TestBed.inject(FormBuilder);
    const altComponent = new FilterDialogComponent(fb, null, null);
    altComponent.fields = mockConfig.fields!;
    altComponent.initial = {};
    altComponent.ngOnInit();

    const emitted: any[] = [];
    altComponent.cancelled.subscribe(() => emitted.push(true));
    altComponent.cancel();
    expect(emitted.length).toBe(1);
  });

  // -- labels override -----------------------------------------------

  it('should merge labels from config', () => {
    const fb = TestBed.inject(FormBuilder);
    const comp2 = new FilterDialogComponent(fb, null, {
      fields: [],
      labels: { apply: 'Go', cancel: 'Nope' },
    } as any);
    comp2.ngOnInit();
    expect(comp2.labels.apply).toBe('Go');
    expect(comp2.labels.cancel).toBe('Nope');
    expect(comp2.labels.reset).toBe('Reset');
  });

  // -- @Input config override ----------------------------------------

  it('should use @Input config if no dialog data', () => {
    const fb = TestBed.inject(FormBuilder);
    const comp2 = new FilterDialogComponent(fb, null, null);
    comp2.config = {
      title: 'Input Title',
      fields: [{ key: 'f1', label: 'F1', type: 'text' } as any],
    };
    comp2.ngOnInit();
    expect(comp2.title).toBe('Input Title');
    expect(comp2.fields.length).toBe(1);
  });

  // -- form pre-supplied (if arm 1 on !this.form check) -------------

  it('should not create a new form when form is already set before ngOnInit', () => {
    const fb = TestBed.inject(FormBuilder);
    const comp2 = new FilterDialogComponent(fb, null, {
      fields: [{ key: 'presetField', label: 'Preset', type: 'text' }],
      initial: { presetField: 'hello' },
    } as any);
    const existingForm = fb.group({ presetField: ['hello'] });
    comp2.form = existingForm;
    comp2.ngOnInit();
    // Should reuse the existing form, not create a new one
    expect(comp2.form).toBe(existingForm);
  });

  // -- ensureFormMatchesFields when control already exists -----------

  it('should not re-add control if it already exists (select type)', () => {
    const fb = TestBed.inject(FormBuilder);
    const comp2 = new FilterDialogComponent(fb, null, {
      fields: [{ key: 'sel', label: 'Sel', type: 'select', options: [] }],
      initial: { sel: 'active' },
    } as any);
    comp2.ngOnInit();
    const originalCtrl = comp2.form?.get('sel');
    // Call ngOnInit again - should not re-add the control since it exists
    comp2.ngOnInit();
    expect(comp2.form?.get('sel')).toBe(originalCtrl);
  });

  it('should not re-add date-range group if it already exists', () => {
    const fb = TestBed.inject(FormBuilder);
    const comp2 = new FilterDialogComponent(fb, null, {
      fields: [{ key: 'dr', label: 'Date', type: 'date-range' }],
      initial: { dr: { start: null, end: null } },
    } as any);
    comp2.ngOnInit();
    const originalCtrl = comp2.form?.get('dr');
    comp2.ngOnInit(); // second call - existing FormGroup should not be replaced
    expect(comp2.form?.get('dr')).toBe(originalCtrl);
  });

  it('should not re-add number-range group if it already exists', () => {
    const fb = TestBed.inject(FormBuilder);
    const comp2 = new FilterDialogComponent(fb, null, {
      fields: [{ key: 'nr', label: 'Range', type: 'number-range' }],
      initial: { nr: { min: 0, max: 100 } },
    } as any);
    comp2.ngOnInit();
    const originalCtrl = comp2.form?.get('nr');
    comp2.ngOnInit();
    expect(comp2.form?.get('nr')).toBe(originalCtrl);
  });

  // -- gridCols property uses data?.gridColumns ?? 12 ----------------

  it('should set gridCols from data.gridColumns', () => {
    const fb = TestBed.inject(FormBuilder);
    const comp2 = new FilterDialogComponent(fb, null, { fields: [], gridColumns: 6 } as any);
    expect(comp2.gridCols).toBe(6);
  });

  it('should set gridCols to 12 when data is null', () => {
    const fb = TestBed.inject(FormBuilder);
    const comp2 = new FilterDialogComponent(fb, null, null);
    expect(comp2.gridCols).toBe(12);
  });

  // -- onAllOptionToggled - not clearing "all" if not in current values --

  it('onAllOptionToggled false when all is not in current selection does nothing', () => {
    component.form!.addControl('ms5', new FormControl(['specific-value']));
    const field: any = { key: 'ms5', type: 'multiselect', options: [{ label: 'A', value: 'a' }] };
    component.onAllOptionToggled(field, false);
    // 'all' is not in ['specific-value'] so no change
    expect(component.form!.get('ms5')?.value).toEqual(['specific-value']);
  });

  // -- onMultiChange with non-array scalar value ---------------------

  it('onMultiChange should handle scalar (non-array) event value', () => {
    component.form!.addControl('mc6', new FormControl([]));
    const mockEvent = { value: 'single', source: { close: jasmine.createSpy() } } as any;
    component.onMultiChange('mc6', mockEvent);
    expect(component.form!.get('mc6')?.value).toEqual(['single']);
  });

  // -- isAllSelected when ALL sentinel is already selected ----------

  it('onMultiChange with ALL when already selected should clear without calling setValue', () => {
    // Already all-selected
    component.form!.addControl('mc7', new FormControl([])); // empty = isAllSelected true
    const mockEvent = { value: [component.ALL], source: { close: jasmine.createSpy() } } as any;
    component.onMultiChange('mc7', mockEvent);
    // isAllSelected was already true, so setValue with [] should NOT be called
    expect(component.form!.get('mc7')?.value).toEqual([]);
  });

  // -- getOptions with observable directly in options property ------

  it('getOptions() should handle observable options directly', (done) => {
    const { of: of2 } = require('rxjs');
    const field: any = { key: 'obs', type: 'select', options: of2([{ label: 'Z', value: 'z' }]) };
    component.getOptions(field).subscribe((opts: any) => {
      expect(opts.length).toBe(1);
      done();
    });
  });

  // -- incoming.fields empty - uses component.fields -----------------

  it('should use component.fields when incoming.fields is empty', () => {
    const fb = TestBed.inject(FormBuilder);
    const comp2 = new FilterDialogComponent(fb, null, { fields: [] } as any);
    comp2.fields = [{ key: 'f2', label: 'F2', type: 'text' } as any];
    comp2.ngOnInit();
    // incoming.fields?.length is 0 (falsy) -> use this.fields
    expect(comp2.fields.length).toBeGreaterThanOrEqual(1);
  });

  // -- field type initialization via constructor ---------------------

  describe('field type initialization', () => {
    let fb: FormBuilder;
    beforeEach(() => {
      fb = TestBed.inject(FormBuilder);
    });

    it('should create a FormGroup for date-range', () => {
      const comp = new FilterDialogComponent(fb, null, {
        fields: [{ key: 'dateRange', label: 'Date', type: 'date-range' } as any],
        initial: { dateRange: { start: new Date('2025-01-01'), end: new Date('2025-12-31') } },
      } as any);
      comp.ngOnInit();
      const ctrl = comp.form?.get('dateRange');
      expect(ctrl).toBeTruthy();
      expect(ctrl instanceof FormGroup).toBeTrue();
    });

    it('should create a FormGroup for number-range', () => {
      const comp = new FilterDialogComponent(fb, null, {
        fields: [{ key: 'numRange', label: 'Amount', type: 'number-range' } as any],
        initial: { numRange: { min: 0, max: 100 } },
      } as any);
      comp.ngOnInit();
      const ctrl = comp.form?.get('numRange');
      expect(ctrl).toBeTruthy();
      expect(ctrl instanceof FormGroup).toBeTrue();
    });

    it('should default multiselect to ["all"] when no initial', () => {
      const comp = new FilterDialogComponent(fb, null, {
        fields: [{ key: 'multi', label: 'Multi', type: 'multiselect', options: [{ label: 'A', value: 'a' }] } as any],
        initial: {},
      } as any);
      comp.ngOnInit();
      const val = comp.form?.get('multi')?.value;
      expect(val).toEqual(['all']);
    });

    it('should create a boolean control for checkbox', () => {
      const comp = new FilterDialogComponent(fb, null, {
        fields: [
          { key: 'check', label: 'Check', type: 'checkbox' } as any,
          { key: 'bool', label: 'Bool', type: 'boolean' } as any,
        ],
        initial: { check: true },
      } as any);
      comp.ngOnInit();
      expect(comp.form?.get('check')?.value).toBeTrue();
      expect(comp.form?.get('bool')?.value).toBeFalse();
    });

    it('should set gridColumns from config', () => {
      const comp = new FilterDialogComponent(fb, null, {
        fields: [],
        gridColumns: 8,
      } as any);
      comp.ngOnInit();
      expect(comp.gridColumns).toBe(8);
    });
  });
});
