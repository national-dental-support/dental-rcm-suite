import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, catchError, of, tap } from 'rxjs';
import { map } from 'rxjs/operators';

export interface AppChartTheme {
  // Data series colors (charts)
  chart_color_1: string;
  chart_color_2: string;
  chart_color_3: string;
  chart_color_4: string;
  chart_color_5: string;
  // UI chrome colors
  ui_accent: string;   // Navigation pills, hover highlights, filter focus rings
  app_bg: string;      // Main application page background
  nav_bg: string;      // Top navigation bar background
}

export interface SavedPreset {
  name: string;
  theme: AppChartTheme;
  isBuiltin?: boolean;
}

export const DEFAULT_CHART_THEME: AppChartTheme = {
  chart_color_1: '#18a69b',
  chart_color_2: '#3c3c3c',
  chart_color_3: '#4f43bc',
  chart_color_4: '#a63918',
  chart_color_5: '#bb79d3',
  ui_accent: '#2563eb',
  app_bg:    '#f6f7fb',
  nav_bg:    '#ffffff',
};

export const BUILTIN_PRESETS: SavedPreset[] = [
  {
    name: 'Default',
    isBuiltin: true,
    theme: { ...DEFAULT_CHART_THEME },
  },
  {
    name: 'Navy Professional',
    isBuiltin: true,
    theme: {
      chart_color_1: '#1e40af', chart_color_2: '#3b82f6', chart_color_3: '#0ea5e9',
      chart_color_4: '#0891b2', chart_color_5: '#6366f1',
      ui_accent: '#1e40af', app_bg: '#f0f4ff', nav_bg: '#1e3a5f',
    },
  },
  {
    name: 'Earth Tones',
    isBuiltin: true,
    theme: {
      chart_color_1: '#92400e', chart_color_2: '#d97706', chart_color_3: '#65a30d',
      chart_color_4: '#0f766e', chart_color_5: '#7c3aed',
      ui_accent: '#d97706', app_bg: '#fefce8', nav_bg: '#ffffff',
    },
  },
  {
    name: 'Monochrome',
    isBuiltin: true,
    theme: {
      chart_color_1: '#111827', chart_color_2: '#374151', chart_color_3: '#6b7280',
      chart_color_4: '#9ca3af', chart_color_5: '#d1d5db',
      ui_accent: '#374151', app_bg: '#f9fafb', nav_bg: '#ffffff',
    },
  },
  {
    name: 'Vibrant',
    isBuiltin: true,
    theme: {
      chart_color_1: '#dc2626', chart_color_2: '#ea580c', chart_color_3: '#16a34a',
      chart_color_4: '#7c3aed', chart_color_5: '#db2777',
      ui_accent: '#7c3aed', app_bg: '#f8fafc', nav_bg: '#ffffff',
    },
  },
];

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private _theme$ = new BehaviorSubject<AppChartTheme>(DEFAULT_CHART_THEME);
  private _customPresets$ = new BehaviorSubject<SavedPreset[]>([]);
  private _darkMode$ = new BehaviorSubject<boolean>(false);

  /** Observable of the full active palette */
  readonly theme$: Observable<AppChartTheme> = this._theme$.asObservable();

  /** Custom (user-saved) presets only */
  readonly customPresets$: Observable<SavedPreset[]> = this._customPresets$.asObservable();

  /** Dark mode state */
  readonly darkMode$: Observable<boolean> = this._darkMode$.asObservable();

  /** Ordered array of all 5 chart colors - use for multi-series ApexCharts `[colors]` */
  readonly chartColors$: Observable<string[]> = this._theme$.pipe(
    map(t => [t.chart_color_1, t.chart_color_2, t.chart_color_3, t.chart_color_4, t.chart_color_5])
  );

  /** First brand color - use for single-series bar charts `[barColor]` */
  readonly primaryColor$: Observable<string> = this._theme$.pipe(map(t => t.chart_color_1));

  constructor(private http: HttpClient) {
    // Restore dark mode preference from localStorage
    const savedDark = localStorage.getItem('rcm_dark_mode');
    if (savedDark === 'true') {
      this._darkMode$.next(true);
      document.documentElement.classList.add('dark-mode');
    }

    // Wrap in try/catch so a bad value can never kill this subscription
    this._theme$.subscribe(t => {
      try { this.applyCssVars(t); } catch (e) { console.error('[ThemeService] applyCssVars error:', e); }
    });
    this.loadTheme();
    this.loadCustomPresets();
  }

  /** Toggle dark mode on/off */
  toggleDarkMode(): void {
    const next = !this._darkMode$.getValue();
    this._darkMode$.next(next);
    localStorage.setItem('rcm_dark_mode', String(next));
    if (next) {
      document.documentElement.classList.add('dark-mode');
    } else {
      document.documentElement.classList.remove('dark-mode');
    }
  }

  /** Get current dark mode state synchronously */
  isDarkMode(): boolean {
    return this._darkMode$.getValue();
  }

  /**
   * Writes all theme values as CSS custom properties on the document root.
   * Components can reference them via var(--rcm-color-1), var(--rcm-accent), etc.
   */
  private applyCssVars(t: AppChartTheme): void {
    const root = document.documentElement;
    // Chart series colors
    root.style.setProperty('--rcm-color-1', t.chart_color_1);
    root.style.setProperty('--rcm-color-2', t.chart_color_2);
    root.style.setProperty('--rcm-color-3', t.chart_color_3);
    root.style.setProperty('--rcm-color-4', t.chart_color_4);
    root.style.setProperty('--rcm-color-5', t.chart_color_5);
    // Chart color tints (15% alpha) - used for icon chip backgrounds, legend dots, etc.
    root.style.setProperty('--rcm-color-1-tint', this.hexToRgba(t.chart_color_1, 0.15));
    root.style.setProperty('--rcm-color-2-tint', this.hexToRgba(t.chart_color_2, 0.15));
    root.style.setProperty('--rcm-color-3-tint', this.hexToRgba(t.chart_color_3, 0.15));
    root.style.setProperty('--rcm-color-4-tint', this.hexToRgba(t.chart_color_4, 0.15));
    root.style.setProperty('--rcm-color-5-tint', this.hexToRgba(t.chart_color_5, 0.15));
    // UI chrome
    root.style.setProperty('--rcm-accent',        t.ui_accent);
    root.style.setProperty('--rcm-accent-tint',   this.hexToRgba(t.ui_accent, 0.10));
    root.style.setProperty('--rcm-accent-muted',  this.hexToRgba(t.ui_accent, 0.20));
    root.style.setProperty('--rcm-accent-ring',   this.hexToRgba(t.ui_accent, 0.35));
    root.style.setProperty('--rcm-bg',            t.app_bg);
    root.style.setProperty('--rcm-nav-bg',        t.nav_bg);
  }

  /** Convert a hex color + alpha to rgba() - used for computing accent tints */
  private hexToRgba(hex: string, alpha: number): string {
    if (!hex || typeof hex !== 'string') return 'transparent';
    const clean = hex.replace('#', '');
    if (clean.length !== 6) return hex;
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    if (isNaN(r) || isNaN(g) || isNaN(b)) return hex;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  /** Fetch from server; silently falls back to defaults on any error */
  loadTheme(): void {
    this.http.get<AppChartTheme>('/api/admin/theme').pipe(
      catchError(() => of(DEFAULT_CHART_THEME))
    ).subscribe(t => this._theme$.next({ ...DEFAULT_CHART_THEME, ...t }));
  }

  /** Persist to server and update local BehaviorSubject on success */
  saveTheme(theme: AppChartTheme): Observable<AppChartTheme> {
    return this.http.put<AppChartTheme>('/api/admin/theme', theme).pipe(
      // Merge with defaults so a partial server response never corrupts the in-memory theme
      tap(saved => this._theme$.next({ ...DEFAULT_CHART_THEME, ...saved }))
    );
  }

  /** Synchronous snapshot - useful in non-reactive contexts */
  snapshot(): AppChartTheme {
    return this._theme$.getValue();
  }

  // -- Preset management ------------------------------------------------------

  /** Load user-saved presets from server */
  loadCustomPresets(): void {
    this.http.get<SavedPreset[]>('/api/admin/theme/presets').pipe(
      catchError(() => of([]))
    ).subscribe(p => this._customPresets$.next(p));
  }

  /** Save or overwrite a named preset on the server */
  savePreset(name: string, theme: AppChartTheme): Observable<SavedPreset[]> {
    return this.http.post<SavedPreset[]>('/api/admin/theme/presets', { name, theme }).pipe(
      tap(p => this._customPresets$.next(p))
    );
  }

  /** Delete a named preset from the server */
  deletePreset(name: string): Observable<SavedPreset[]> {
    return this.http.delete<SavedPreset[]>(`/api/admin/theme/presets/${encodeURIComponent(name)}`).pipe(
      tap(p => this._customPresets$.next(p))
    );
  }
}
