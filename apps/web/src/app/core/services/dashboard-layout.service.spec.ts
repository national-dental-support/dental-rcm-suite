import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { DashboardLayoutService } from './dashboard-layout.service';
import { DashboardLayoutConfig } from '../models/dashboard-layout.model';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

const mockConfig: DashboardLayoutConfig = {
  version: 1,
  sections: [{ slug: 'denial-iq', visible: true, order: 0, kpis: [] }],
};

describe('DashboardLayoutService', () => {
  let service: DashboardLayoutService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [],
    providers: [provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()]
});
    service = TestBed.inject(DashboardLayoutService);
    http = TestBed.inject(HttpTestingController);
    localStorage.clear();
  });

  afterEach(() => {
    http.verify();
    localStorage.clear();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('getLayouts should GET the layouts endpoint', () => {
    const mockResp = { layouts: [], activeId: null };
    service.getLayouts().subscribe(res => expect(res).toEqual(mockResp));
    const req = http.expectOne('/api/insightflow/my/dashboard-layouts');
    expect(req.request.method).toBe('GET');
    req.flush(mockResp);
  });

  it('createLayout should POST to layouts endpoint', () => {
    const body = { name: 'My Layout', config: mockConfig, isDefault: false };
    service.createLayout(body).subscribe(res => expect(res).toEqual({ id: 42 }));
    const req = http.expectOne('/api/insightflow/my/dashboard-layouts');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(body);
    req.flush({ id: 42 });
  });

  it('updateLayout should PUT to the specific layout URL', () => {
    service.updateLayout(7, { name: 'Updated' }).subscribe();
    const req = http.expectOne('/api/insightflow/my/dashboard-layouts/7');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ name: 'Updated' });
    req.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('deleteLayout should DELETE the specific layout URL', () => {
    service.deleteLayout(3).subscribe();
    const req = http.expectOne('/api/insightflow/my/dashboard-layouts/3');
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('setActiveLayout should PUT to active endpoint and cache id', () => {
    service.setActiveLayout(5).subscribe(() => {
      expect(localStorage.getItem('insightflow_active_layout_id')).toBe('5');
    });
    const req = http.expectOne('/api/insightflow/my/dashboard-layouts/active');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ id: 5 });
    req.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('setActiveLayout with null should remove cached id', () => {
    localStorage.setItem('insightflow_active_layout_id', '5');
    service.setActiveLayout(null).subscribe(() => {
      expect(localStorage.getItem('insightflow_active_layout_id')).toBeNull();
    });
    const req = http.expectOne('/api/insightflow/my/dashboard-layouts/active');
    req.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('getCachedActiveId should return null when nothing cached', () => {
    expect(service.getCachedActiveId()).toBeNull();
  });

  it('getCachedActiveId should return the cached numeric id', () => {
    localStorage.setItem('insightflow_active_layout_id', '12');
    expect(service.getCachedActiveId()).toBe(12);
  });
});
