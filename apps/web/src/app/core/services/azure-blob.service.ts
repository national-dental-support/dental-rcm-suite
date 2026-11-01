import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { from, Observable, of } from 'rxjs';
import { switchMap, tap } from 'rxjs/operators';
import ExcelJS from 'exceljs';

export interface BlobItemLite {
  name: string;
  url: string;
  size?: number;
  lastModified?: string;
}

@Injectable({ providedIn: 'root' })
export class AzureBlobService {
  private _blobCache: BlobItemLite[] | null = null;

  constructor(private http: HttpClient) {}

  /** List blobs via backend - cached until clearCache() or full page reload */
  listExcelBlobs(prefix = ''): Observable<BlobItemLite[]> {
    if (this._blobCache) return of(this._blobCache);
    return this.http.get<BlobItemLite[]>('/api/storage/excel', {
      params: { prefix }
    }).pipe(tap(list => this._blobCache = list));
  }

  clearCache(): void { this._blobCache = null; }

  /** Download a blob via backend */
  downloadBlob(name: string) {
    return this.http.get('/api/storage/excel/download', {
      params: { name },
      responseType: 'blob' as const // compile-time: Blob
    });
  }

  /** Parse Excel (first sheet by default) */
  parseExcel(blob: Blob, opts?: { sheet?: string | number }) {
    return from(blob.arrayBuffer()).pipe(
      switchMap(async (ab) => {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(ab);

        let ws: ExcelJS.Worksheet;
        if (typeof opts?.sheet === 'number') {
          ws = workbook.worksheets[opts.sheet];
        } else if (typeof opts?.sheet === 'string') {
          ws = workbook.getWorksheet(opts.sheet)!;
        } else {
          ws = workbook.worksheets[0];
        }

        const sheetName = ws.name;
        const headers: string[] = [];
        const rows: Record<string, unknown>[] = [];

        ws.eachRow({ includeEmpty: false }, (row, rowNum) => {
          if (rowNum === 1) {
            row.eachCell((cell) => headers.push(String(cell.value ?? '')));
            return;
          }
          const obj: Record<string, unknown> = {};
          headers.forEach((h, i) => { obj[h] = row.getCell(i + 1).value ?? null; });
          rows.push(obj);
        });

        return { sheetName, rows };
      })
    );
  }
}
