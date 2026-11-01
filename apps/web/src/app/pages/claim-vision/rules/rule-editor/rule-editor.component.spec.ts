import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule, FormsModule } from '@angular/forms';
import { NO_ERRORS_SCHEMA, SimpleChange } from '@angular/core';
import { of } from 'rxjs';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';

import { RuleEditorComponent } from './rule-editor.component';
import { CatalogService } from '../../../../core/services/catalog.service';
import { LocationsService } from '../../../../core/services/ar-locations.service';

const MOCK_RULE: any = {
  id: 1,
  kind: 'custom',
  name: 'Test Rule',
  category: 'Coding',
  description: 'A test rule',
  status: 'Active',
  matchType: 'any',
  scope: 'enterprise',
  scopeValues: [],
  conditions: [{ field: 'procedureCode', operator: 'Equals', value: '99213' }],
  actions: [{ actionType: 'Soft warning', message: 'Check code' }],
  expiresOn: null,
};

describe('RuleEditorComponent', () => {
  let component: RuleEditorComponent;
  let fixture: ComponentFixture<RuleEditorComponent>;
  let catalogSpy: jasmine.SpyObj<CatalogService>;
  let locationsSpy: jasmine.SpyObj<LocationsService>;

  beforeEach(async () => {
    catalogSpy = jasmine.createSpyObj('CatalogService', ['list']);
    locationsSpy = jasmine.createSpyObj('LocationsService', ['fetch']);
    catalogSpy.list.and.returnValue(of([]));
    locationsSpy.fetch.and.returnValue(of({ practiceGroups: [], locations: [] }));

    await TestBed.configureTestingModule({
      declarations: [RuleEditorComponent],
      imports: [
        ReactiveFormsModule,
        FormsModule,
        MatAutocompleteModule,
        MatDatepickerModule,
        MatNativeDateModule,
        BrowserAnimationsModule,
      ],
      providers: [
        { provide: CatalogService, useValue: catalogSpy },
        { provide: LocationsService, useValue: locationsSpy },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(RuleEditorComponent);
    component = fixture.componentInstance;
    component.mode = 'edit';
    fixture.detectChanges();
  });

  // --- creation & default state ---

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('form is defined after ngOnInit', () => {
    expect(component.form).toBeDefined();
  });

  it('conditions FormArray has length 1 by default', () => {
    expect(component.conditions.length).toBe(1);
  });

  it('actions FormArray has length 1 by default', () => {
    expect(component.actions.length).toBe(1);
  });

  it('default scope is enterprise', () => {
    expect(component.form.get('scope')?.value).toBe('enterprise');
  });

  it('default status is Active', () => {
    expect(component.form.get('status')?.value).toBe('Active');
  });

  it('default matchType is any', () => {
    expect(component.form.get('matchType')?.value).toBe('any');
  });

  // --- buildForm with populated rule ---

  it('form populates name from input rule', () => {
    component.rule = MOCK_RULE;
    component.ngOnInit();
    expect(component.form.get('name')?.value).toBe('Test Rule');
  });

  it('form populates category from input rule', () => {
    component.rule = MOCK_RULE;
    component.ngOnInit();
    expect(component.form.get('category')?.value).toBe('Coding');
  });

  it('form populates conditions array from input rule', () => {
    component.rule = MOCK_RULE;
    component.ngOnInit();
    expect(component.conditions.length).toBe(1);
    expect(component.conditions.at(0).get('field')?.value).toBe('procedureCode');
    expect(component.conditions.at(0).get('operator')?.value).toBe('Equals');
    expect(component.conditions.at(0).get('value')?.value).toBe('99213');
  });

  it('form populates actions array from input rule', () => {
    component.rule = MOCK_RULE;
    component.ngOnInit();
    expect(component.actions.length).toBe(1);
    expect(component.actions.at(0).get('actionType')?.value).toBe('Soft warning');
    expect(component.actions.at(0).get('message')?.value).toBe('Check code');
  });

  it('fieldInputs syncs to condition field labels after buildForm', () => {
    component.rule = MOCK_RULE;
    component.ngOnInit();
    expect(component.fieldInputs[0]).toBe('Procedure Code (CPT/HCPCS)');
  });

  it('form is disabled when mode is view', () => {
    component.mode = 'view';
    component.rule = MOCK_RULE;
    component.ngOnInit();
    expect(component.form.disabled).toBeTrue();
  });

  it('form is enabled when mode is edit', () => {
    component.mode = 'edit';
    component.ngOnInit();
    expect(component.form.disabled).toBeFalse();
  });

  // --- ngOnChanges ---

  it('ngOnChanges rebuilds form when rule input changes after init', () => {
    const newRule = { ...MOCK_RULE, name: 'Changed Rule' };
    component.rule = newRule;
    component.ngOnChanges({
      rule: new SimpleChange(MOCK_RULE, newRule, false),
    });
    expect(component.form.get('name')?.value).toBe('Changed Rule');
  });

  it('ngOnChanges does not rebuild on first change', () => {
    const spy = spyOn<any>(component, 'buildForm');
    component.ngOnChanges({
      rule: new SimpleChange(null, MOCK_RULE, true),
    });
    expect(spy).not.toHaveBeenCalled();
  });

  // --- conditions CRUD ---

  it('addCondition() appends empty condition to FormArray', () => {
    const before = component.conditions.length;
    component.addCondition();
    expect(component.conditions.length).toBe(before + 1);
  });

  it('addCondition() appends empty string to fieldInputs', () => {
    component.addCondition();
    expect(component.fieldInputs[component.fieldInputs.length - 1]).toBe('');
  });

  it('removeCondition(0) removes condition at index when more than one exists', () => {
    component.addCondition();
    const before = component.conditions.length;
    component.removeCondition(0);
    expect(component.conditions.length).toBe(before - 1);
  });

  it('removeCondition removes corresponding fieldInputs entry', () => {
    component.addCondition();
    const before = component.fieldInputs.length;
    component.removeCondition(0);
    expect(component.fieldInputs.length).toBe(before - 1);
  });

  it('removeCondition does not remove if only 1 condition remains', () => {
    expect(component.conditions.length).toBe(1);
    component.removeCondition(0);
    expect(component.conditions.length).toBe(1);
  });

  it('fieldInputs length stays 1 after removeCondition on single condition', () => {
    component.removeCondition(0);
    expect(component.fieldInputs.length).toBe(1);
  });

  // --- actions CRUD ---

  it('addAction() appends empty action to FormArray', () => {
    const before = component.actions.length;
    component.addAction();
    expect(component.actions.length).toBe(before + 1);
  });

  it('removeAction(0) removes action at index when more than one exists', () => {
    component.addAction();
    const before = component.actions.length;
    component.removeAction(0);
    expect(component.actions.length).toBe(before - 1);
  });

  it('removeAction does not remove if only 1 action remains', () => {
    expect(component.actions.length).toBe(1);
    component.removeAction(0);
    expect(component.actions.length).toBe(1);
  });

  // --- scope management ---

  it('onScopeChange("location") calls catalogService.list', () => {
    component.onScopeChange('location');
    expect(catalogSpy.list).toHaveBeenCalledWith('location', 'active');
  });

  it('onScopeChange("provider") calls catalogService.list', () => {
    component.onScopeChange('provider');
    expect(catalogSpy.list).toHaveBeenCalledWith('provider', 'active');
  });

  it('onScopeChange("payer") calls catalogService.list', () => {
    component.onScopeChange('payer');
    expect(catalogSpy.list).toHaveBeenCalledWith('payer', 'active');
  });

  it('onScopeChange("enterprise") clears scopeSuggestions', () => {
    component.scopeSuggestions = ['A', 'B'];
    component.onScopeChange('enterprise');
    expect(component.scopeSuggestions).toEqual([]);
  });

  it('onScopeChange resets scopeValues to empty array', () => {
    component.form.patchValue({ scopeValues: ['existing'] });
    component.onScopeChange('location');
    expect(component.form.get('scopeValues')?.value).toEqual([]);
  });

  it('onScopeChange("practice") calls locationsService.fetch', () => {
    component.onScopeChange('practice');
    expect(locationsSpy.fetch).toHaveBeenCalled();
  });

  it('addScopeValue() adds trimmed value to scopeValues', () => {
    component.scopeValueInput = '  Main Office  ';
    component.addScopeValue();
    expect(component.form.get('scopeValues')?.value).toContain('Main Office');
  });

  it('addScopeValue() does not add duplicate', () => {
    component.form.patchValue({ scopeValues: ['Main Office'] });
    component.scopeValueInput = 'Main Office';
    component.addScopeValue();
    expect(component.form.get('scopeValues')?.value).toEqual(['Main Office']);
  });

  it('addScopeValue() clears scopeValueInput after adding', () => {
    component.scopeValueInput = 'Branch';
    component.addScopeValue();
    expect(component.scopeValueInput).toBe('');
  });

  it('removeScopeValue(0) removes value at index', () => {
    component.form.patchValue({ scopeValues: ['A', 'B', 'C'] });
    component.removeScopeValue(0);
    expect(component.form.get('scopeValues')?.value).toEqual(['B', 'C']);
  });

  it('filterScopeSuggestions excludes already-added scopeValues', () => {
    component.scopeSuggestions = ['Alpha', 'Beta', 'Gamma'];
    component.form.patchValue({ scopeValues: ['Alpha'] });
    const result = component.filterScopeSuggestions('');
    expect(result).not.toContain('Alpha');
    expect(result).toContain('Beta');
  });

  // --- filterCategories / filteredFieldOptions ---

  it('filterCategories("") returns all categories', () => {
    expect(component.filterCategories('')).toEqual(component.categories);
  });

  it('filterCategories("cod") returns only matching categories', () => {
    const result = component.filterCategories('cod');
    expect(result).toContain('Coding');
    expect(result.every(c => c.toLowerCase().includes('cod'))).toBeTrue();
  });

  it('filteredFieldOptions("") returns all fields', () => {
    expect(component.filteredFieldOptions('').length).toBe(component.availableFields.length);
  });

  it('filteredFieldOptions("procedure") filters by label', () => {
    const result = component.filteredFieldOptions('procedure');
    expect(result.length).toBeGreaterThan(0);
    expect(result.every(f =>
      f.label.toLowerCase().includes('procedure') ||
      f.group.toLowerCase().includes('procedure') ||
      f.key.toLowerCase().includes('procedure')
    )).toBeTrue();
  });

  it('filteredFieldOptions("procedureCode") filters by exact key match', () => {
    const result = component.filteredFieldOptions('procedureCode');
    expect(result.length).toBeGreaterThan(0);
    expect(result.some(f => f.key === 'procedureCode')).toBeTrue();
  });

  // --- status toggles ---

  it('onActiveChange sets status to Active', () => {
    component.form.patchValue({ status: 'Inactive' });
    component.onActiveChange();
    expect(component.form.get('status')?.value).toBe('Active');
  });

  it('onInactiveChange sets status to Inactive', () => {
    component.onInactiveChange();
    expect(component.form.get('status')?.value).toBe('Inactive');
  });

  it('onExpiresChange sets status to Expires', () => {
    component.onExpiresChange();
    expect(component.form.get('status')?.value).toBe('Expires');
  });

  it('setStatus("Active") clears expiresDate', () => {
    component.form.patchValue({ expiresDate: new Date() });
    component.setStatus('Active');
    expect(component.form.get('expiresDate')?.value).toBeNull();
  });

  it('setStatus("Inactive") clears expiresDate', () => {
    component.form.patchValue({ expiresDate: new Date() });
    component.setStatus('Inactive');
    expect(component.form.get('expiresDate')?.value).toBeNull();
  });

  it('setStatus("Expires") does not clear expiresDate', () => {
    const d = new Date('2027-01-01');
    component.form.patchValue({ expiresDate: d });
    component.setStatus('Expires');
    expect(component.form.get('expiresDate')?.value).toEqual(d);
  });

  // --- save / cancel ---

  it('onCancelClicked emits cancel event', () => {
    let emitted = false;
    component.cancel.subscribe(() => { emitted = true; });
    component.onCancelClicked();
    expect(emitted).toBeTrue();
  });

  it('onSaveClicked emits save event with form values', () => {
    component.rule = MOCK_RULE;
    component.ngOnInit();
    let emitted: any = null;
    component.save.subscribe(v => { emitted = v; });
    component.onSaveClicked();
    expect(emitted).toBeTruthy();
    expect(emitted.name).toBe('Test Rule');
  });

  it('onSaveClicked does not emit when form is invalid (empty name)', () => {
    component.form.patchValue({ name: '' });
    let emitted = false;
    component.save.subscribe(() => { emitted = true; });
    component.onSaveClicked();
    expect(emitted).toBeFalse();
  });

  it('onSaveClicked includes conditions in emitted RuleDraft', () => {
    component.rule = MOCK_RULE;
    component.ngOnInit();
    let emitted: any = null;
    component.save.subscribe(v => { emitted = v; });
    component.onSaveClicked();
    expect(emitted.conditions).toBeTruthy();
    expect(emitted.conditions.length).toBe(1);
    expect(emitted.conditions[0].field).toBe('procedureCode');
  });

  it('onSaveClicked includes actions in emitted RuleDraft', () => {
    component.rule = MOCK_RULE;
    component.ngOnInit();
    let emitted: any = null;
    component.save.subscribe(v => { emitted = v; });
    component.onSaveClicked();
    expect(emitted.actions).toBeTruthy();
    expect(emitted.actions.length).toBe(1);
    expect(emitted.actions[0].actionType).toBe('Soft warning');
  });

  it('onSaveClicked sets expiresOn to ISO string when status is Expires and expiresDate is set', () => {
    const expDate = new Date('2027-06-15');
    component.form.patchValue({ status: 'Expires', expiresDate: expDate, name: 'Valid' });
    let emitted: any = null;
    component.save.subscribe(v => { emitted = v; });
    component.onSaveClicked();
    expect(emitted.expiresOn).toBe(expDate.toISOString());
  });

  it('onSaveClicked sets expiresOn to null when status is Active', () => {
    component.form.patchValue({ status: 'Active', name: 'Valid' });
    let emitted: any = null;
    component.save.subscribe(v => { emitted = v; });
    component.onSaveClicked();
    expect(emitted.expiresOn).toBeNull();
  });

  // --- isViewMode getter ---

  it('isViewMode returns true when mode is view', () => {
    component.mode = 'view';
    expect(component.isViewMode).toBeTrue();
  });

  it('isViewMode returns false when mode is edit', () => {
    component.mode = 'edit';
    expect(component.isViewMode).toBeFalse();
  });

  // --- needsScopeValues getter ---

  it('needsScopeValues returns false for enterprise scope', () => {
    component.form.patchValue({ scope: 'enterprise' });
    expect(component.needsScopeValues).toBeFalse();
  });

  it('needsScopeValues returns true for location scope', () => {
    component.onScopeChange('location');
    expect(component.needsScopeValues).toBeTrue();
  });
});
