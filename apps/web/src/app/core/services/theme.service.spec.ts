import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ThemeService, AppChartTheme, DEFAULT_CHART_THEME, SavedPreset } from './theme.service';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

describe('ThemeService', () => {
  let service: ThemeService;
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.removeItem('rcm_dark_mode');

    TestBed.configureTestingModule({
    imports: [],
    providers: [provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()]
});
    service = TestBed.inject(ThemeService);
    http = TestBed.inject(HttpTestingController);

    // The constructor calls loadTheme() and loadCustomPresets() - flush those
    const themeReq = http.expectOne(r => r.url === '/api/admin/theme' && r.method === 'GET');
    themeReq.flush(DEFAULT_CHART_THEME);

    const presetsReq = http.expectOne(r => r.url === '/api/admin/theme/presets' && r.method === 'GET');
    presetsReq.flush([]);
  });

  afterEach(() => http.verify());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // -- theme$ ------------------------------------------------------------------

  describe('theme$', () => {
    it('should emit the default theme initially', (done) => {
      service.theme$.subscribe(t => {
        expect(t.chart_color_1).toBe(DEFAULT_CHART_THEME.chart_color_1);
        expect(t.chart_color_5).toBe(DEFAULT_CHART_THEME.chart_color_5);
        done();
      });
    });
  });

  // -- primaryColor$ -----------------------------------------------------------

  describe('primaryColor$', () => {
    it('should emit chart_color_1 from the current theme', (done) => {
      service.primaryColor$.subscribe(c => {
        expect(c).toBe(DEFAULT_CHART_THEME.chart_color_1);
        done();
      });
    });
  });

  // -- chartColors$ ------------------------------------------------------------

  describe('chartColors$', () => {
    it('should emit an array of 5 chart colors', (done) => {
      service.chartColors$.subscribe(colors => {
        expect(colors.length).toBe(5);
        expect(colors[0]).toBe(DEFAULT_CHART_THEME.chart_color_1);
        expect(colors[4]).toBe(DEFAULT_CHART_THEME.chart_color_5);
        done();
      });
    });
  });

  // -- snapshot() --------------------------------------------------------------

  describe('snapshot()', () => {
    it('should return the current theme synchronously', () => {
      const snap = service.snapshot();
      expect(snap.chart_color_1).toBe(DEFAULT_CHART_THEME.chart_color_1);
    });
  });

  // -- loadTheme() -------------------------------------------------------------

  describe('loadTheme()', () => {
    it('should GET /api/admin/theme and update theme$', (done) => {
      const custom: AppChartTheme = { ...DEFAULT_CHART_THEME, chart_color_1: '#ff0000' };

      service.loadTheme();
      const req = http.expectOne(r => r.url === '/api/admin/theme');
      expect(req.request.method).toBe('GET');
      req.flush(custom);

      service.theme$.subscribe(t => {
        expect(t.chart_color_1).toBe('#ff0000');
        done();
      });
    });

    it('should fall back to defaults on error', (done) => {
      service.loadTheme();
      const req = http.expectOne(r => r.url === '/api/admin/theme');
      req.error(new ProgressEvent('error'));

      service.theme$.subscribe(t => {
        expect(t.chart_color_1).toBe(DEFAULT_CHART_THEME.chart_color_1);
        done();
      });
    });
  });

  // -- saveTheme() -------------------------------------------------------------

  describe('saveTheme()', () => {
    it('should PUT /api/admin/theme and update theme$', (done) => {
      const updated: AppChartTheme = { ...DEFAULT_CHART_THEME, chart_color_2: '#00ff00' };

      service.saveTheme(updated).subscribe(saved => {
        expect(saved.chart_color_2).toBe('#00ff00');
        done();
      });

      const req = http.expectOne(r => r.url === '/api/admin/theme');
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual(updated);
      req.flush(updated);
    });
  });

  // -- dark mode ---------------------------------------------------------------

  describe('toggleDarkMode()', () => {
    it('should toggle dark mode on and off', () => {
      expect(service.isDarkMode()).toBe(false);
      service.toggleDarkMode();
      expect(service.isDarkMode()).toBe(true);
      service.toggleDarkMode();
      expect(service.isDarkMode()).toBe(false);
    });

    it('should emit updated dark mode state', (done) => {
      service.toggleDarkMode();
      service.darkMode$.subscribe(dark => {
        expect(dark).toBe(true);
        done();
      });
    });
  });

  // -- customPresets$ ----------------------------------------------------------

  describe('customPresets$', () => {
    it('should initially emit empty array', (done) => {
      service.customPresets$.subscribe(p => {
        expect(p).toEqual([]);
        done();
      });
    });
  });

  // -- loadCustomPresets() -----------------------------------------------------

  describe('loadCustomPresets()', () => {
    it('should GET /api/admin/theme/presets', () => {
      const presets: SavedPreset[] = [{ name: 'Mine', theme: DEFAULT_CHART_THEME }];
      service.loadCustomPresets();
      const req = http.expectOne(r => r.url === '/api/admin/theme/presets');
      expect(req.request.method).toBe('GET');
      req.flush(presets);
    });

    it('should fall back to empty array on error', (done) => {
      service.loadCustomPresets();
      const req = http.expectOne(r => r.url === '/api/admin/theme/presets');
      req.error(new ProgressEvent('error'));

      service.customPresets$.subscribe(p => {
        expect(p).toEqual([]);
        done();
      });
    });
  });

  // -- savePreset() ------------------------------------------------------------

  describe('savePreset()', () => {
    it('should POST /api/admin/theme/presets', (done) => {
      const result: SavedPreset[] = [{ name: 'Test', theme: DEFAULT_CHART_THEME }];
      service.savePreset('Test', DEFAULT_CHART_THEME).subscribe(presets => {
        expect(presets.length).toBe(1);
        expect(presets[0].name).toBe('Test');
        done();
      });
      const req = http.expectOne(r => r.url === '/api/admin/theme/presets');
      expect(req.request.method).toBe('POST');
      expect(req.request.body.name).toBe('Test');
      req.flush(result);
    });
  });

  // -- deletePreset() ----------------------------------------------------------

  describe('deletePreset()', () => {
    it('should DELETE /api/admin/theme/presets/:name', (done) => {
      service.deletePreset('MyPreset').subscribe(presets => {
        expect(presets).toEqual([]);
        done();
      });
      const req = http.expectOne(r => r.url.includes('/api/admin/theme/presets/MyPreset'));
      expect(req.request.method).toBe('DELETE');
      req.flush([]);
    });

    it('should encode preset name in URL', (done) => {
      service.deletePreset('My Preset').subscribe(() => done());
      const req = http.expectOne(r => r.url.includes('/api/admin/theme/presets/My%20Preset'));
      expect(req.request.method).toBe('DELETE');
      req.flush([]);
    });
  });
});
