import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { RouterTestingModule } from '@angular/router/testing';
import { of } from 'rxjs';
import { AnalyticsComponent } from './analytics';
import { ClaimsTrackingService } from '../../core/services/claims-tracking.service';
import { EnterpriseService } from '../../core/services/enterprise.service';

describe('Analytics', () => {
  let component: AnalyticsComponent;
  let fixture: ComponentFixture<AnalyticsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RouterTestingModule],
      declarations: [AnalyticsComponent],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        { provide: ClaimsTrackingService, useValue: { getClaimsTrackingData: () => of({}) } },
        { provide: EnterpriseService, useValue: { active$: of(null), activeEnterprise: null } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AnalyticsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should include base tabs on init', () => {
    expect(component.tabs.length).toBeGreaterThan(0);
    expect(component.tabs.some(t => t.label === 'Payer Mix')).toBeTrue();
  });
});

describe('Analytics \u2014 with activeEnterprise set', () => {
  let component: AnalyticsComponent;
  let fixture: ComponentFixture<AnalyticsComponent>;

  beforeEach(async () => {
    // Cover the activeEnterprise?.slug branch when activeEnterprise is not null (L37 binary-expr arm1)
    const entSvc = { active$: of({ slug: 'testcorp' }), activeEnterprise: { slug: 'testcorp' } };
    await TestBed.configureTestingModule({
      imports: [RouterTestingModule],
      declarations: [AnalyticsComponent],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        { provide: ClaimsTrackingService, useValue: { getClaimsTrackingData: () => of({}) } },
        { provide: EnterpriseService, useValue: entSvc },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AnalyticsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should rebuild tabs when activeEnterprise has a slug', () => {
    expect(component.tabs.some(t => t.label === 'Payer Mix')).toBeTrue();
  });
});
