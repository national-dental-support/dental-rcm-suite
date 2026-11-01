import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class DateUtilService {
  /** "Jun 7, 2025" - display label for dates */
  toDisplay(iso: string | null | undefined): string {
    if (!iso) return '\u2014';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '\u2014';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  /** "6/7/25" - compact label */
  toShort(iso: string | null | undefined): string {
    if (!iso) return '\u2014';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '\u2014';
    return d.toLocaleDateString('en-US');
  }

  /** "2025-06-07" - ISO date string (no time) */
  toIso(d: Date | string | null | undefined): string {
    if (!d) return '';
    const dt = d instanceof Date ? d : new Date(d);
    if (isNaN(dt.getTime())) return '';
    return dt.toISOString().slice(0, 10);
  }

  /** "Jun 2025" - month + year label for charts */
  toMonthYear(iso: string | null | undefined): string {
    if (!iso) return '\u2014';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '\u2014';
    return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  }
}
