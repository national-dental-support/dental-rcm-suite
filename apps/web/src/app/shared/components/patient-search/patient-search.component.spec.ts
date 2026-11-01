import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { SharedPatientSearchComponent } from './patient-search.component';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

describe('SharedPatientSearchComponent', () => {
  let component: SharedPatientSearchComponent;
  let fixture: ComponentFixture<SharedPatientSearchComponent>;
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
    declarations: [SharedPatientSearchComponent],
    schemas: [NO_ERRORS_SCHEMA],
    imports: [NoopAnimationsModule, MatAutocompleteModule],
    providers: [provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()]
}).compileComponents();

    fixture = TestBed.createComponent(SharedPatientSearchComponent);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // -- displayFn -----------------------------------------------------------

  describe('displayFn()', () => {
    it('should return empty string for null', () => {
      expect(component.displayFn(null)).toBe('');
    });

    it('should return empty string for undefined', () => {
      expect(component.displayFn(undefined)).toBe('');
    });

    it('should return patient name when present', () => {
      expect(component.displayFn({ name: 'John Doe' })).toBe('John Doe');
    });

    it('should return empty string when patient has no name', () => {
      expect(component.displayFn({ id: 1 })).toBe('');
    });
  });

  // -- onSelect ------------------------------------------------------------

  describe('onSelect()', () => {
    it('should emit patientSelected event', () => {
      let emitted: any;
      component.patientSelected.subscribe(p => emitted = p);
      const patient = { id: 1, name: 'John Doe' };
      component.onSelect(patient);
      expect(emitted).toEqual(patient);
    });

    it('should NOT clear form or results when clearAfterSelect=false', () => {
      component.clearAfterSelect = false;
      component.searchControl.setValue('John');
      component.results = [{ id: 1, name: 'John Doe' }];
      component.onSelect({ id: 1, name: 'John Doe' });
      expect(component.searchControl.value).toBe('John');
      expect(component.results.length).toBe(1);
    });

    it('should clear form and results when clearAfterSelect=true', () => {
      component.clearAfterSelect = true;
      component.searchControl.setValue('John');
      component.results = [{ id: 1, name: 'John Doe' }];
      component.onSelect({ id: 1, name: 'John Doe' });
      expect(component.searchControl.value).toBe('');
      expect(component.results.length).toBe(0);
    });
  });

  // -- ngOnDestroy ---------------------------------------------------------

  describe('ngOnDestroy()', () => {
    it('should complete the destroy$ subject', () => {
      let completed = false;
      (component as any).destroy$.subscribe({ complete: () => (completed = true) });
      component.ngOnDestroy();
      expect(completed).toBeTrue();
    });
  });

  // -- Search filter: min 2 chars ------------------------------------------

  describe('search pipe filter', () => {
    it('should filter out non-string values (e.g. object selected from autocomplete)', (done) => {
      // Set a non-string value (like when a patient is selected from autocomplete)
      (component.searchControl as any).setValue({ id: 1, name: 'John Doe' });
      // No HTTP call should be made for non-string values
      setTimeout(() => {
        http.expectNone('/api/patient-cards/search');
        done();
      }, 350);
    });

    it('should filter out strings shorter than 2 chars', (done) => {
      component.searchControl.setValue('J');
      setTimeout(() => {
        http.expectNone('/api/patient-cards/search');
        done();
      }, 350);
    });
  });
});
