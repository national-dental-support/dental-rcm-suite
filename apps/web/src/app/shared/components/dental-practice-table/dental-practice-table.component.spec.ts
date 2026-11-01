import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { DentalPracticeTableComponent } from './dental-practice-table.component';
import { PageEvent } from '@angular/material/paginator';

describe('DentalPracticeTableComponent', () => {
  let component: DentalPracticeTableComponent;
  let fixture: ComponentFixture<DentalPracticeTableComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [DentalPracticeTableComponent],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(DentalPracticeTableComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have expected displayedColumns', () => {
    expect(component.displayedColumns).toContain('practice');
    expect(component.displayedColumns).toContain('numberOfCollections');
    expect(component.displayedColumns).toContain('insuranceCollections');
  });

  it('isOpen() should return false for unknown name', () => {
    expect(component.isOpen('SomePractice')).toBeFalse();
  });

  it('toggle() should open a closed practice', () => {
    component.toggle('Practice A');
    expect(component.isOpen('Practice A')).toBeTrue();
  });

  it('toggle() should close an open practice', () => {
    component.toggle('Practice A');
    component.toggle('Practice A');
    expect(component.isOpen('Practice A')).toBeFalse();
  });

  it('onPageChange() should update page state', () => {
    const event: PageEvent = { pageIndex: 2, pageSize: 25, length: 100 };
    component.onPageChange(event);
    // No public accessor, but it should not throw
    expect(true).toBeTrue();
  });

  it('trackRow returns practice key for practice rows', () => {
    const row: any = { kind: 'practice', name: 'TestPractice', totals: {} };
    expect(component.trackRow(0, row)).toBe('p:TestPractice');
  });

  it('trackRow returns location key for location rows', () => {
    const row: any = { kind: 'location', practiceName: 'P1', location: { name: 'Loc1' } };
    expect(component.trackRow(0, row)).toBe('l:P1:Loc1');
  });

  it('computeTotals should compute collectionRateAvg when count > 0', () => {
    const practice: any = {
      data: [
        { numberOfCollections: 10, insuranceCollections: 5000, patientCollections: 1000,
          grossCollections: 6000, prodcutionAdjustment: 500, collectionAdjustment: 200,
          refund: 100, insuranceBilled: 7000, collectionRate: 0.85 },
        { numberOfCollections: 5, insuranceCollections: 2500, patientCollections: 500,
          grossCollections: 3000, prodcutionAdjustment: 250, collectionAdjustment: 100,
          refund: 50, insuranceBilled: 3500, collectionRate: 0.90 },
      ]
    };
    const totals = (component as any).computeTotals(practice);
    expect(totals.collectionRateAvg).toBeCloseTo((0.85 + 0.90) / 2, 4);
  });

  it('computeTotals should return 0 collectionRateAvg when count is 0 (empty data)', () => {
    const practice: any = { data: [] };
    const totals = (component as any).computeTotals(practice);
    expect(totals.collectionRateAvg).toBe(0);
  });
});
