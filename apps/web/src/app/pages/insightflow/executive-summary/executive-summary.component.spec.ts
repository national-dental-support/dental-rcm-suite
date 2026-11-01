import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA, ChangeDetectorRef } from '@angular/core';
import { of, throwError } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import { ExecutiveSummaryComponent } from './executive-summary.component';
import { InsightflowStore } from '../../../store/insightflow/insightflow.store';
import { GlobalFiltersStore } from '../../../shared/components/global-filters/global-filters.store';
import { DashboardLayoutService } from '../../../core/services/dashboard-layout.service';

const mockExecData = {
  generatedAt: '2026-03-12T12:00:00Z',
  overallStatus: 'green' as const,
  criticalCount: 0,
  warningCount: 1,
  okCount: 3,
  sections: {
    'denial-iq': { slug: 'denial-iq', label: 'Denial IQ', status: 'red' as const, kpis: [], alerts: [] },
    'recon-iq':  { slug: 'recon-iq',  label: 'Recon IQ',  status: 'green' as const, kpis: [], alerts: [] },
  },
  crossProductInsights: [],
  actionQueue: [],
};

describe('ExecutiveSummaryComponent', () => {
  let component: ExecutiveSummaryComponent;
  let fixture: ComponentFixture<ExecutiveSummaryComponent>;
  let mockLayoutService: jasmine.SpyObj<DashboardLayoutService>;
  let mockDialog: jasmine.SpyObj<MatDialog>;

  const mockStore = {
    execSummary$: of({ data: mockExecData, loading: false, error: null, cachedAt: Date.now() }),
    loadExecSummary: jasmine.createSpy('loadExecSummary'),
  };

  beforeEach(async () => {
    mockLayoutService = jasmine.createSpyObj('DashboardLayoutService', [
      'getLayouts', 'createLayout', 'updateLayout', 'deleteLayout', 'setActiveLayout', 'getCachedActiveId',
    ]);
    mockLayoutService.getLayouts.and.returnValue(of({ layouts: [], activeId: null }));
    mockLayoutService.getCachedActiveId.and.returnValue(null);
    mockLayoutService.setActiveLayout.and.returnValue(of(void 0 as any));

    mockDialog = jasmine.createSpyObj('MatDialog', ['open']);

    await TestBed.configureTestingModule({
      declarations: [ExecutiveSummaryComponent],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        { provide: ChangeDetectorRef, useValue: { markForCheck: () => {} } },
        { provide: InsightflowStore, useValue: mockStore },
        { provide: GlobalFiltersStore, useValue: { applied$: of({ location: { scope: 'all' }, payers: [], providers: [] }) } },
        { provide: DashboardLayoutService, useValue: mockLayoutService },
        { provide: MatDialog, useValue: mockDialog },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ExecutiveSummaryComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load exec summary from store on init', () => {
    expect(mockStore.loadExecSummary).toHaveBeenCalled();
    expect(component.data).toBeTruthy();
    expect(component.loading).toBeFalse();
  });

  it('should populate sections and displayedSections from store data', () => {
    expect(component.sections.length).toBe(2);
    expect(component.displayedSections.length).toBe(2);
  });

  it('should load layouts on init', () => {
    expect(mockLayoutService.getLayouts).toHaveBeenCalled();
    expect(component.layouts).toEqual([]);
  });

  it('should gracefully handle layout load failure', async () => {
    mockLayoutService.getLayouts.and.returnValue(throwError(() => new Error('404')));
    component.ngOnInit();
    expect(component.layouts).toEqual([]);
    expect(component.activeLayoutId).toBeNull();
  });

  it('selectLayout should set activeLayoutId and call setActiveLayout', () => {
    component.layouts = [{ id: 5, name: 'Test', isDefault: false, config: { version: 1, sections: [] }, createdAt: '', updatedAt: '' }];
    component.selectLayout(5);
    expect(component.activeLayoutId).toBe(5);
    expect(mockLayoutService.setActiveLayout).toHaveBeenCalledWith(5);
  });

  it('selectLayout with null should reset to default view', () => {
    component.selectLayout(null);
    expect(component.activeLayoutId).toBeNull();
    expect(component.displayedSections.length).toBe(component.sections.length);
  });

  it('applyConfig should filter out hidden sections', () => {
    component['sections'] = Object.values(mockExecData.sections) as any;
    const config = {
      version: 1 as const,
      sections: [
        { slug: 'denial-iq', visible: false, order: 0, kpis: [] },
        { slug: 'recon-iq',  visible: true,  order: 1, kpis: [] },
      ],
    };
    const result = component['applyConfig'](component['sections'], config);
    expect(result.length).toBe(1);
    expect(result[0].slug).toBe('recon-iq');
  });

  it('applyConfig should reorder sections by config order', () => {
    component['sections'] = Object.values(mockExecData.sections) as any;
    const config = {
      version: 1 as const,
      sections: [
        { slug: 'recon-iq',  visible: true, order: 0, kpis: [] },
        { slug: 'denial-iq', visible: true, order: 1, kpis: [] },
      ],
    };
    const result = component['applyConfig'](component['sections'], config);
    expect(result[0].slug).toBe('recon-iq');
    expect(result[1].slug).toBe('denial-iq');
  });

  it('deleteLayout should call service and remove from layouts', () => {
    const layout = { id: 3, name: 'L', isDefault: false, config: { version: 1 as const, sections: [] }, createdAt: '', updatedAt: '' };
    component.layouts = [layout];
    mockLayoutService.deleteLayout.and.returnValue(of(void 0 as any));
    component.deleteLayout(layout);
    expect(mockLayoutService.deleteLayout).toHaveBeenCalledWith(3);
    expect(component.layouts.length).toBe(0);
  });

  it('deleteLayout should reset activeLayoutId when deleting active layout', () => {
    const layout = { id: 3, name: 'L', isDefault: false, config: { version: 1 as const, sections: [] }, createdAt: '', updatedAt: '' };
    component.layouts = [layout];
    component.activeLayoutId = 3;
    mockLayoutService.deleteLayout.and.returnValue(of(void 0 as any));
    component.deleteLayout(layout);
    expect(component.activeLayoutId).toBeNull();
  });

  it('formatKpi should format currency values', () => {
    const result = component.formatKpi({ key: 'test', label: 'Test', value: 50000, format: 'currency' });
    expect(result).toContain('$');
    expect(result).toContain('50,000');
  });

  it('formatKpi should format percent values', () => {
    const result = component.formatKpi({ key: 'test', label: 'Test', value: 0.123, format: 'percent' });
    expect(result).toBe('12.3%');
  });

  it('formatKpi should format number values', () => {
    const result = component.formatKpi({ key: 'test', label: 'Test', value: 1234, format: 'number' });
    expect(result).toContain('1,234');
  });

  it('formatKpi should return -- for null', () => {
    expect(component.formatKpi({ key: 'test', label: 'Test', value: null, format: 'number' })).toBe('--');
  });

  it('getIcon should return correct icons', () => {
    expect(component.getIcon('denial-iq')).toBe('gavel');
    expect(component.getIcon('recon-iq')).toBe('account_balance');
    expect(component.getIcon('unknown')).toBe('insights');
  });

  it('getColor should return correct colors', () => {
    expect(component.getColor('denial-iq')).toBe('#ef4444');
    expect(component.getColor('unknown')).toBe('#6b7280');
  });

  it('severityIcon should return correct icons', () => {
    expect(component.severityIcon('critical')).toBe('error');
    expect(component.severityIcon('warning')).toBe('warning');
    expect(component.severityIcon('info')).toBe('info');
  });

  it('severityClass should return correct classes', () => {
    expect(component.severityClass('critical')).toBe('sev-critical');
    expect(component.severityClass('warning')).toBe('sev-warning');
    expect(component.severityClass('info')).toBe('sev-info');
  });

  it('statusClass should return correct classes', () => {
    expect(component.statusClass('red')).toBe('status-red');
    expect(component.statusClass('yellow')).toBe('status-yellow');
    expect(component.statusClass('green')).toBe('status-green');
  });

  it('overallStatusClass should use data overallStatus', () => {
    expect(component.overallStatusClass()).toBe('status-green');
  });

  it('overallLabel should return Healthy for green', () => {
    expect(component.overallLabel()).toBe('Healthy');
  });

  it('priorityClass should return correct classes', () => {
    expect(component.priorityClass('high')).toBe('pri-high');
    expect(component.priorityClass('medium')).toBe('pri-medium');
    expect(component.priorityClass('low')).toBe('pri-low');
  });

  it('formatTs should format ISO dates', () => {
    const result = component.formatTs('2026-03-12T12:00:00Z');
    expect(result).toBeTruthy();
    expect(result.length).toBeGreaterThan(0);
  });

  it('formatTs should return empty string for empty input', () => {
    expect(component.formatTs('')).toBe('');
  });

  // -- activeLayout getter ------------------------------------------------

  it('activeLayout should return null when no activeLayoutId', () => {
    component.activeLayoutId = null;
    component.layouts = [];
    expect(component.activeLayout).toBeNull();
  });

  it('activeLayout should return the matching layout', () => {
    const layout = { id: 5, name: 'L', isDefault: false, config: { version: 1 as const, sections: [] }, createdAt: '', updatedAt: '' };
    component.layouts = [layout];
    component.activeLayoutId = 5;
    expect(component.activeLayout).toBe(layout);
  });

  it('activeLayout should return null when activeLayoutId does not match any layout', () => {
    const layout = { id: 5, name: 'L', isDefault: false, config: { version: 1 as const, sections: [] }, createdAt: '', updatedAt: '' };
    component.layouts = [layout];
    component.activeLayoutId = 99;
    expect(component.activeLayout).toBeNull();
  });

  // -- getKpiTooltip ------------------------------------------------------

  it('getKpiTooltip should return tooltip for known key', () => {
    expect(component.getKpiTooltip('deniedClaims')).toContain('denied');
  });

  it('getKpiTooltip should return empty string for unknown key', () => {
    expect(component.getKpiTooltip('unknownKey')).toBe('');
  });

  // -- getSectionTooltip --------------------------------------------------

  it('getSectionTooltip should return tooltip for payer-iq', () => {
    expect(component.getSectionTooltip('payer-iq')).toBeTruthy();
  });

  it('getSectionTooltip should return empty string for unknown slug', () => {
    expect(component.getSectionTooltip('unknown-section')).toBe('');
  });

  // -- trackBy functions --------------------------------------------------

  it('trackByLayout should return layout id', () => {
    const layout = { id: 7, name: 'L', isDefault: false, config: { version: 1 as const, sections: [] }, createdAt: '', updatedAt: '' };
    expect(component.trackByLayout(0, layout)).toBe(7);
  });

  it('trackBySection should return section slug', () => {
    expect(component.trackBySection(0, { slug: 'denial-iq', label: '', status: 'green' as const, kpis: [], alerts: [] })).toBe('denial-iq');
  });

  it('trackByKpi should return kpi key', () => {
    expect(component.trackByKpi(0, { key: 'denialRate', label: 'Denial Rate', value: 0.05, format: 'percent' })).toBe('denialRate');
  });

  it('trackByPayer should return payer name', () => {
    expect(component.trackByPayer(0, { payerName: 'Aetna' } as any)).toBe('Aetna');
  });

  it('trackByIndex should return the index', () => {
    expect(component.trackByIndex(3)).toBe(3);
  });

  // -- overallLabel with different statuses -------------------------------

  it('overallLabel should return Critical for red status', () => {
    component.data = { ...mockExecData, overallStatus: 'red' } as any;
    expect(component.overallLabel()).toBe('Critical');
  });

  it('overallLabel should return Warning for yellow status', () => {
    component.data = { ...mockExecData, overallStatus: 'yellow' } as any;
    expect(component.overallLabel()).toBe('Warning');
  });

  it('overallLabel should return Healthy when data is null', () => {
    component.data = null;
    expect(component.overallLabel()).toBe('Healthy');
  });

  // -- overallStatusClass with different statuses -------------------------

  it('overallStatusClass should return status-red for red', () => {
    component.data = { ...mockExecData, overallStatus: 'red' } as any;
    expect(component.overallStatusClass()).toBe('status-red');
  });

  it('overallStatusClass should return status-yellow for yellow', () => {
    component.data = { ...mockExecData, overallStatus: 'yellow' } as any;
    expect(component.overallStatusClass()).toBe('status-yellow');
  });

  it('overallStatusClass should return status-green when data is null', () => {
    component.data = null;
    expect(component.overallStatusClass()).toBe('status-green');
  });

  // -- openCustomizeDialog ------------------------------------------------

  it('openCustomizeDialog should open dialog and do nothing if result is undefined', () => {
    mockDialog.open.and.returnValue({
      afterClosed: () => of(undefined),
    } as any);
    expect(() => component.openCustomizeDialog()).not.toThrow();
    expect(mockDialog.open).toHaveBeenCalled();
  });

  it('openCustomizeDialog should call saveLayout when dialog returns result', () => {
    const result = {
      name: 'My Layout',
      isDefault: false,
      config: { version: 1 as const, sections: [] },
    };
    mockDialog.open.and.returnValue({
      afterClosed: () => of(result),
    } as any);
    mockLayoutService.createLayout.and.returnValue(of({ id: 10 } as any));
    mockLayoutService.setActiveLayout.and.returnValue(of(void 0 as any));
    component.openCustomizeDialog();
    expect(mockLayoutService.createLayout).toHaveBeenCalled();
  });

  // -- saveLayout - updateExistingLayout ---------------------------------

  it('should update existing layout when activeLayoutId is set', () => {
    const layout = { id: 5, name: 'Old', isDefault: false, config: { version: 1 as const, sections: [] }, createdAt: '', updatedAt: '' };
    component.layouts = [layout];
    component.activeLayoutId = 5;
    const result = { name: 'Updated', isDefault: false, config: { version: 1 as const, sections: [] } };
    mockDialog.open.and.returnValue({ afterClosed: () => of(result) } as any);
    mockLayoutService.updateLayout.and.returnValue(of({} as any));
    component.openCustomizeDialog();
    expect(mockLayoutService.updateLayout).toHaveBeenCalledWith(5, result);
  });

  it('should set layoutError on updateLayout error', () => {
    const layout = { id: 5, name: 'Old', isDefault: false, config: { version: 1 as const, sections: [] }, createdAt: '', updatedAt: '' };
    component.layouts = [layout];
    component.activeLayoutId = 5;
    const result = { name: 'Updated', isDefault: false, config: { version: 1 as const, sections: [] } };
    mockDialog.open.and.returnValue({ afterClosed: () => of(result) } as any);
    mockLayoutService.updateLayout.and.returnValue(throwError(() => new Error('fail')));
    component.openCustomizeDialog();
    expect(component.layoutError).toBeTruthy();
  });

  // -- createNewLayout ----------------------------------------------------

  it('should create new layout when activeLayoutId is null', () => {
    component.activeLayoutId = null;
    const result = { name: 'New Layout', isDefault: false, config: { version: 1 as const, sections: [] } };
    mockDialog.open.and.returnValue({ afterClosed: () => of(result) } as any);
    mockLayoutService.createLayout.and.returnValue(of({ id: 20 } as any));
    component.openCustomizeDialog();
    expect(mockLayoutService.createLayout).toHaveBeenCalled();
    expect(component.activeLayoutId).toBe(20);
  });

  it('should set layoutError on createLayout error', () => {
    component.activeLayoutId = null;
    const result = { name: 'New Layout', isDefault: false, config: { version: 1 as const, sections: [] } };
    mockDialog.open.and.returnValue({ afterClosed: () => of(result) } as any);
    mockLayoutService.createLayout.and.returnValue(throwError(() => new Error('fail')));
    component.openCustomizeDialog();
    expect(component.layoutError).toBeTruthy();
  });

  // -- deleteLayout error path --------------------------------------------

  it('deleteLayout should set layoutError on error', () => {
    const layout = { id: 3, name: 'L', isDefault: false, config: { version: 1 as const, sections: [] }, createdAt: '', updatedAt: '' };
    component.layouts = [layout];
    mockLayoutService.deleteLayout.and.returnValue(throwError(() => new Error('fail')));
    component.deleteLayout(layout);
    expect(component.layoutError).toBe('Failed to delete layout.');
  });

  // -- getIcon ------------------------------------------------------------

  it('getIcon should return correct icon for payer-iq', () => {
    expect(component.getIcon('payer-iq')).toBe('local_hospital');
  });

  it('getIcon should return correct icon for workforce', () => {
    expect(component.getIcon('workforce')).toBe('groups');
  });

  it('getIcon should return correct icon for training', () => {
    expect(component.getIcon('training')).toBe('school');
  });

  it('getIcon should return correct icon for kpi', () => {
    expect(component.getIcon('kpi')).toBe('show_chart');
  });

  // -- getColor -----------------------------------------------------------

  it('getColor should return correct color for recon-iq', () => {
    expect(component.getColor('recon-iq')).toBe('#0ea5e9');
  });

  it('getColor should return correct color for payer-iq', () => {
    expect(component.getColor('payer-iq')).toBe('#f59e0b');
  });

  it('getColor should return correct color for workforce', () => {
    expect(component.getColor('workforce')).toBe('#8b5cf6');
  });

  // -- loadLayouts - cachedId branch --------------------------------------

  it('loadLayouts should use cachedId as activeLayoutId when cachedId matches a layout', () => {
    const layout = { id: 7, name: 'Cached', isDefault: false, config: { version: 1 as const, sections: [] }, createdAt: '', updatedAt: '' };
    mockLayoutService.getCachedActiveId.and.returnValue(7);
    mockLayoutService.getLayouts.and.returnValue(of({ layouts: [layout], activeId: null } as any));
    component.ngOnInit();
    expect(component.activeLayoutId).toBe(7);
  });

  it('loadLayouts should prefer activeId from response over cachedId', () => {
    const layout5 = { id: 5, name: 'L5', isDefault: false, config: { version: 1 as const, sections: [] }, createdAt: '', updatedAt: '' };
    const layout7 = { id: 7, name: 'L7', isDefault: false, config: { version: 1 as const, sections: [] }, createdAt: '', updatedAt: '' };
    mockLayoutService.getCachedActiveId.and.returnValue(7);
    mockLayoutService.getLayouts.and.returnValue(of({ layouts: [layout5, layout7], activeId: 5 } as any));
    component.ngOnInit();
    expect(component.activeLayoutId).toBe(5);
  });

  // -- applyConfig with kpis filtering -----------------------------------

  it('applyConfig should filter kpis when cfg.kpis is non-empty', () => {
    const sections: any[] = [
      {
        slug: 'denial-iq', label: 'Denial IQ', status: 'green',
        kpis: [{ key: 'deniedClaims', label: 'Denied', value: 5, format: 'number' }, { key: 'denialRate', label: 'Rate', value: 0.05, format: 'percent' }],
        alerts: [],
      },
    ];
    const config = {
      version: 1 as const,
      sections: [{
        slug: 'denial-iq', visible: true, order: 0,
        kpis: [{ key: 'deniedClaims', visible: false, order: 0 }, { key: 'denialRate', visible: true, order: 1 }],
      }],
    };
    const result = (component as any).applyConfig(sections, config);
    expect(result[0].kpis.length).toBe(1);
    expect(result[0].kpis[0].key).toBe('denialRate');
  });

  it('applyConfig should include sections not in config with default visibility', () => {
    const sections: any[] = [
      { slug: 'denial-iq', label: 'Denial IQ', status: 'green', kpis: [], alerts: [] },
      { slug: 'new-section', label: 'New', status: 'green', kpis: [], alerts: [] },
    ];
    const config = {
      version: 1 as const,
      sections: [{ slug: 'denial-iq', visible: true, order: 0, kpis: [] }],
    };
    const result = (component as any).applyConfig(sections, config);
    // new-section is not in config so sMap.get returns undefined -> visible defaults to true
    expect(result.length).toBe(2);
  });
});
