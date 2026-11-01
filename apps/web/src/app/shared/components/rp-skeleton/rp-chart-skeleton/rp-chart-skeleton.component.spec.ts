import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { RpChartSkeletonComponent } from './rp-chart-skeleton.component';

describe('RpChartSkeletonComponent', () => {
  let component: RpChartSkeletonComponent;
  let fixture: ComponentFixture<RpChartSkeletonComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [RpChartSkeletonComponent],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(RpChartSkeletonComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have default input values', () => {
    expect(component.type).toBe('pie');
    expect(component.showLegend).toBeTrue();
    expect(component.showAxes).toBeTrue();
    expect(component.message).toBe('Preparing insights\u2026');
  });

  it('should accept type input', () => {
    component.type = 'bar';
    expect(component.type).toBe('bar');
  });

  it('should accept title input', () => {
    component.title = 'Revenue Chart';
    expect(component.title).toBe('Revenue Chart');
  });

  it('should have 4 legend items', () => {
    expect(component.legendItems.length).toBe(4);
  });

  it('should have 8 bar heights', () => {
    expect(component.bars.length).toBe(8);
  });

  it('should accept custom message', () => {
    component.message = 'Loading data\u2026';
    expect(component.message).toBe('Loading data\u2026');
  });
});
