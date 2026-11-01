import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { RpSkeletonComponent } from './rp-skeleton.component';

describe('RpSkeletonComponent', () => {
  let component: RpSkeletonComponent;
  let fixture: ComponentFixture<RpSkeletonComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [RpSkeletonComponent],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(RpSkeletonComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have default input values', () => {
    expect(component.variant).toBe('rect');
    expect(component.animate).toBe('pulse');
    expect(component.tone).toBe('base');
    expect(component.w).toBe('100%');
    expect(component.h).toBe('16px');
  });

  it('borderRadius should return 999px for circle variant', () => {
    component.variant = 'circle';
    expect(component.borderRadius).toBe('999px');
  });

  it('borderRadius should return 6px for text variant', () => {
    component.variant = 'text';
    expect(component.borderRadius).toBe('6px');
  });

  it('borderRadius should return CSS var for rect variant', () => {
    component.variant = 'rect';
    expect(component.borderRadius).toBe('var(--rp-skeleton-radius)');
  });

  it('borderRadius should use custom radius when provided', () => {
    component.radius = '12px';
    expect(component.borderRadius).toBe('12px');
  });

  it('should accept custom width and height', () => {
    component.w = '200px';
    component.h = '40px';
    expect(component.w).toBe('200px');
    expect(component.h).toBe('40px');
  });
});
