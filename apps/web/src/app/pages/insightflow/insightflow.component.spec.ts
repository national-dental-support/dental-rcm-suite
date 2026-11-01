import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA, ChangeDetectorRef } from '@angular/core';
import { of, throwError } from 'rxjs';

import { InsightflowComponent } from './insightflow.component';
import { AnalyticsService } from '../../core/services/analytics.service';
import { InsightflowService } from '../../core/services/insight-flow.service';

describe('InsightflowComponent', () => {
  let component: InsightflowComponent;
  let fixture: ComponentFixture<InsightflowComponent>;
  let mockAnalytics: jasmine.SpyObj<AnalyticsService>;
  let mockInsightflowService: jasmine.SpyObj<InsightflowService>;

  beforeEach(async () => {
    mockAnalytics = jasmine.createSpyObj('AnalyticsService', ['track']);
    mockInsightflowService = jasmine.createSpyObj('InsightflowService', ['getHealth']);
    mockInsightflowService.getHealth.and.returnValue(of({ sections: [] }));

    // Stub localStorage
    spyOn(localStorage, 'getItem').and.returnValue(null);
    spyOn(localStorage, 'setItem');

    await TestBed.configureTestingModule({
      declarations: [InsightflowComponent],
      providers: [
        { provide: AnalyticsService, useValue: mockAnalytics },
        { provide: InsightflowService, useValue: mockInsightflowService },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(InsightflowComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should default viewMode to "list" when localStorage returns null', () => {
    expect(component.viewMode).toBe('list');
  });

  it('should have 5 insights', () => {
    expect(component.insights.length).toBe(5);
  });

  it('should set healthLoading to false after getHealth resolves', () => {
    expect(component.healthLoading).toBeFalse();
  });

  it('should toggle viewMode from list to grid', () => {
    component.viewMode = 'list';
    component.toggleView();
    expect(component.viewMode).toBe('grid');
  });

  it('should toggle viewMode from grid to list', () => {
    component.viewMode = 'grid';
    component.toggleView();
    expect(component.viewMode).toBe('list');
  });

  it('should call analytics.track on toggleView', () => {
    component.toggleView();
    expect(mockAnalytics.track).toHaveBeenCalledWith('insightflow_view_mode_toggled', jasmine.any(Object));
  });

  it('should call analytics.track on trackMenuClick', () => {
    const item = component.insights[0];
    component.trackMenuClick(item);
    expect(mockAnalytics.track).toHaveBeenCalledWith('insightflow_menu_item_clicked', { route: item.route, title: item.title });
  });

  it('should return trackByTitle function that uses item.title', () => {
    const item = component.insights[0];
    expect(component.trackByTitle(0, item)).toBe(item.title);
  });

  it('should return "flag" icon for flagged status', () => {
    const item = { ...component.insights[0], status: 'flagged' as const };
    expect(component.statusIcon(item)).toBe('flag');
  });

  it('should return "warning" icon for warning status', () => {
    const item = { ...component.insights[0], status: 'warning' as const };
    expect(component.statusIcon(item)).toBe('warning');
  });

  it('should return "check_circle" icon for ok status', () => {
    const item = { ...component.insights[0], status: 'ok' as const };
    expect(component.statusIcon(item)).toBe('check_circle');
  });

  it('should return "radio_button_unchecked" icon for unknown status', () => {
    const item = { ...component.insights[0], status: undefined };
    expect(component.statusIcon(item)).toBe('radio_button_unchecked');
  });

  it('should return correct statusClass for flagged', () => {
    const item = { ...component.insights[0], status: 'flagged' as const };
    expect(component.statusClass(item)).toBe('flagged');
  });

  it('should return correct statusClass for ok', () => {
    const item = { ...component.insights[0], status: 'ok' as const };
    expect(component.statusClass(item)).toBe('ok');
  });

  it('should return "loading" statusClass for unknown status', () => {
    const item = { ...component.insights[0], status: undefined };
    expect(component.statusClass(item)).toBe('loading');
  });

  it('should handle getHealth error gracefully and set healthLoading false', () => {
    mockInsightflowService.getHealth.and.returnValue(throwError(() => new Error('Network error')));
    component.ngOnInit();
    expect(component.healthLoading).toBeFalse();
  });

  it('should apply health sections from getHealth response', () => {
    const sections = [{ section: 'payer-mix', status: 'green', metric: '95%' }];
    mockInsightflowService.getHealth.and.returnValue(of({ sections } as any));
    component.ngOnInit();
    const payerMix = component.insights.find(i => i.route === 'payer-mix');
    expect(payerMix?.status).toBe('ok');
    expect(payerMix?.metric).toBe('95%');
  });

  it('should map "red" health status to "flagged"', () => {
    const sections = [{ section: 'ar', status: 'red', metric: '70%' }];
    mockInsightflowService.getHealth.and.returnValue(of({ sections } as any));
    component.ngOnInit();
    const ar = component.insights.find(i => i.route === 'ar');
    expect(ar?.status).toBe('flagged');
  });

  it('should map "yellow" health status to "warning"', () => {
    const sections = [{ section: 'denials', status: 'yellow', metric: '85%' }];
    mockInsightflowService.getHealth.and.returnValue(of({ sections } as any));
    component.ngOnInit();
    const denials = component.insights.find(i => i.route === 'denials');
    expect(denials?.status).toBe('warning');
  });

  it('applyHealth should skip sections with unrecognized routes (if !item continue)', () => {
    // 'unknown-route' does not match any insight's route -> item is undefined -> continue
    const sections = [{ section: 'unknown-route', status: 'green', metric: '99%' }];
    mockInsightflowService.getHealth.and.returnValue(of({ sections } as any));
    component.ngOnInit();
    // All insights should retain their default status (undefined) since no match was found
    const allUndefined = component.insights.every(i => i.status === undefined);
    expect(allUndefined).toBeTrue();
  });
});
