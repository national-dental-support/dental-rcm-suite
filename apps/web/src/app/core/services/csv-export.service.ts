import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class CsvExportService {
  download(filename: string, headers: string[], rows: (string | number | null | undefined)[][]): void {
    const escape = (v: string | number | null | undefined): string => {
      if (v == null) return '';
      const s = String(v).replace(/"/g, '""');
      return /[,"\n\r]/.test(s) ? `"${s}"` : s;
    };

    const lines = [
      headers.map(escape).join(','),
      ...rows.map(r => r.map(escape).join(',')),
    ];

    const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
}
