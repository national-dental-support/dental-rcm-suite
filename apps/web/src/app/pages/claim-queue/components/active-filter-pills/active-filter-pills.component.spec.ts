import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ActiveFilterPillsComponent } from './active-filter-pills.component';

describe('ActiveFilterPillsComponent', () => {
  let component: ActiveFilterPillsComponent;
  let fixture: ComponentFixture<ActiveFilterPillsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ActiveFilterPillsComponent],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(ActiveFilterPillsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have default empty filters', () => {
    expect(component.filters).toEqual({});
  });

  it('should emit clearKey when clearKey emitter fires', () => {
    const spy = jasmine.createSpy('clearKey');
    component.clearKey.subscribe(spy);
    component.clearKey.emit('assignedTo');
    expect(spy).toHaveBeenCalledWith('assignedTo');
  });

  it('should emit clearAll when clearAll emitter fires', () => {
    const spy = jasmine.createSpy('clearAll');
    component.clearAll.subscribe(spy);
    component.clearAll.emit();
    expect(spy).toHaveBeenCalled();
  });

  it('should accept filters input', () => {
    component.filters = { claimStatus: 'denied', assignedTo: 'TestUser' };
    expect(component.filters['claimStatus']).toBe('denied');
    expect(component.filters['assignedTo']).toBe('TestUser');
  });

  it('should build pills for known filter keys when ngOnChanges is called', () => {
    component.filters = { assignedTo: 'Dr. Smith', payer: 'Aetna' };
    component.ngOnChanges();
    expect(component.pills.some(p => p.key === 'assignedTo' && p.label === 'Assigned To')).toBeTrue();
    expect(component.pills.some(p => p.key === 'payer' && p.label === 'Payer')).toBeTrue();
  });

  it('should exclude null and empty string filter values from pills', () => {
    component.filters = { assignedTo: null as any, payer: '', claimStatus: 'active' };
    component.ngOnChanges();
    const keys = component.pills.map(p => p.key);
    expect(keys).not.toContain('assignedTo');
    expect(keys).not.toContain('payer');
    expect(keys).toContain('claimStatus');
  });

  it('should format Date values using toLocaleDateString', () => {
    const d = new Date('2025-06-15');
    component.filters = { submittedFrom: d };
    component.ngOnChanges();
    const pill = component.pills.find(p => p.key === 'submittedFrom');
    expect(pill).toBeTruthy();
    expect(pill!.value).toBe(d.toLocaleDateString());
  });

  it('should format Date object for submittedTo key', () => {
    const d = new Date('2025-12-31');
    component.filters = { submittedTo: d };
    component.ngOnChanges();
    const pill = component.pills.find(p => p.key === 'submittedTo');
    expect(pill).toBeTruthy();
    expect(pill!.value).toBe(d.toLocaleDateString());
  });

  it('should format slaStatus "critical" as a descriptive label', () => {
    component.filters = { slaStatus: 'critical' };
    component.ngOnChanges();
    const pill = component.pills.find(p => p.key === 'slaStatus');
    expect(pill).toBeTruthy();
    expect(pill!.value).toBe('Critical (Overdue + Urgent)');
  });

  it('should format non-critical slaStatus as its plain string value', () => {
    component.filters = { slaStatus: 'urgent' };
    component.ngOnChanges();
    const pill = component.pills.find(p => p.key === 'slaStatus');
    expect(pill).toBeTruthy();
    expect(pill!.value).toBe('urgent');
  });

  it('should produce empty pills array when filters object has no known keys set', () => {
    component.filters = {};
    component.ngOnChanges();
    expect(component.pills).toEqual([]);
  });

  it('should exclude undefined filter values from pills', () => {
    component.filters = { assignedTo: undefined as any };
    component.ngOnChanges();
    const keys = component.pills.map(p => p.key);
    expect(keys).not.toContain('assignedTo');
  });

  it('should format string submittedFrom value using Date parsing', () => {
    // Exercises the string-date formatting branch (not Date instance)
    component.filters = { submittedFrom: '2025-03-15' as any };
    component.ngOnChanges();
    const pill = component.pills.find(p => p.key === 'submittedFrom');
    expect(pill).toBeTruthy();
    // value should be a localized date string
    expect(pill!.value).toBeTruthy();
  });

  it('should format string submittedTo value using Date parsing', () => {
    component.filters = { submittedTo: '2025-06-30' as any };
    component.ngOnChanges();
    const pill = component.pills.find(p => p.key === 'submittedTo');
    expect(pill).toBeTruthy();
    expect(pill!.value).toBeTruthy();
  });
});
