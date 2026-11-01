import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { MatMenuModule } from '@angular/material/menu';
import { RouterTestingModule } from '@angular/router/testing';
import { InsightflowTabsComponent } from './insightflow-tabs.component';
import { PayerIqFiltersStore } from '../../../shared/components/global-filters/global-filters.store';
import { PayerIqService } from '../../../core/services/payer-iq.service';
import { AnalyticsService } from '../../../core/services/analytics.service';
import { EnterpriseService } from '../../../core/services/enterprise.service';
import { SubscriptionService } from '../../../core/services/subscription.service';

describe('InsightflowTabsComponent', () => {
  let component: InsightflowTabsComponent;
  let fixture: ComponentFixture<InsightflowTabsComponent>;
  let router: Router;

  const mockPayerIqService = {
    getNetworkPayersDropdown: jasmine.createSpy('getNetworkPayersDropdown').and.returnValue(
      of({ message: 'ok', networks: [], networkPayers: [{ PayerName: 'Aetna' }, { PayerName: 'BCBS' }] })
    ),
  };

  const mockSubscriptionService = {
    state$: of({}),
    isSubscribed: jasmine.createSpy('isSubscribed').and.returnValue(true),
  };

  const mockFiltersStore = {
    applied$: of({ payers: [], leaseNetworks: [] }),
    set: jasmine.createSpy('set'),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [InsightflowTabsComponent],
      imports: [MatMenuModule, RouterTestingModule],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        { provide: PayerIqFiltersStore, useValue: mockFiltersStore },
        { provide: PayerIqService, useValue: mockPayerIqService },
        { provide: ChangeDetectorRef, useValue: { markForCheck: () => {} } },
        { provide: AnalyticsService, useValue: { track: () => {} } },
        { provide: EnterpriseService, useValue: { activeEnterprise: null, active$: of(null) } },
        { provide: SubscriptionService, useValue: mockSubscriptionService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(InsightflowTabsComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have primary tabs defined', () => {
    // 7 coreTabs + 3 gatedTabs (isSubscribed always true in mock) = 10
    expect(component.primaryTabs.length).toBe(10);
    expect(component.primaryTabs[0].label).toBe('Executive Summary');
  });

  it('should have tools tabs defined', () => {
    // benchmarking = 1 (enableInsightFlowTools not set -> defaults to enabled)
    expect(component.toolsTabs.length).toBe(1);
    expect(component.toolsTabs[0].link).toBe('benchmarking');
  });

  it('should load payer list from service', () => {
    expect(mockPayerIqService.getNetworkPayersDropdown).toHaveBeenCalled();
    expect(component.payers).toEqual(['Aetna', 'BCBS']);
  });

  it('trackByLabel should return the tab label', () => {
    expect(component.trackByLabel(0, { label: 'Summary', link: 'summary' })).toBe('Summary');
  });

  it('trackTabClick should set activeTab', () => {
    component.trackTabClick({ label: 'KPIs', link: 'kpi' });
    expect(component.activeTab).toBe('kpi');
  });

  it('isToolsRouteActive should return false for non-tool route', () => {
    expect(component.isToolsRouteActive()).toBeFalse();
  });

  it('onGlobalFiltersApply should call filtersStore.set', () => {
    const filters = { payers: ['Aetna'], leaseNetworks: [] } as any;
    component.onGlobalFiltersApply(filters);
    expect(mockFiltersStore.set).toHaveBeenCalledWith(filters);
  });

  it('uniqueSorted should return unique sorted values', () => {
    expect(component.uniqueSorted(['B', 'A', 'B', 'C'])).toEqual(['A', 'B', 'C']);
  });
});
