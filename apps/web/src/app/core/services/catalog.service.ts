import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

export type CatalogType = 'location' | 'provider' | 'payer';
export type CatalogStatus = 'pending' | 'active' | 'archived';

export interface CatalogItem {
  id: number;
  name: string;
  status: CatalogStatus;
  source: string;
  created_at: string;
  updated_at: string;
}

export interface SyncResult {
  added: number;
  isFirstSync: boolean;
  total: number;
  pending: number;
  active: number;
  archived: number;
}

export interface AliasItem {
  id: number;
  entity_type: string;
  dirty_name: string;
  canonical_name: string;
  created_by: string | null;
  created_at: string;
}

@Injectable({ providedIn: 'root' })
export class CatalogService {
  private base = `${environment.server.baseUrl}/admin/catalog`;

  constructor(private http: HttpClient) {}

  list(type: CatalogType, status?: CatalogStatus): Observable<CatalogItem[]> {
    const params = status ? `?status=${status}` : '';
    return this.http
      .get<{ data: CatalogItem[] }>(`${this.base}/${type}${params}`)
      .pipe(map(r => r.data));
  }

  sync(type: CatalogType): Observable<SyncResult> {
    return this.http.post<SyncResult>(`${this.base}/${type}/sync`, {});
  }

  addManual(type: CatalogType, name: string): Observable<CatalogItem> {
    return this.http
      .post<{ data: CatalogItem }>(`${this.base}/${type}`, { name })
      .pipe(map(r => r.data));
  }

  updateStatus(type: CatalogType, id: number, status: CatalogStatus): Observable<void> {
    return this.http.patch<void>(`${this.base}/${type}/${id}`, { status });
  }

  bulkUpdateStatus(type: CatalogType, ids: number[], status: CatalogStatus): Observable<void> {
    return this.http.patch<void>(`${this.base}/${type}`, { ids, status });
  }

  deleteManual(type: CatalogType, id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/${type}/${id}`);
  }

  /** Active items only - used by provisioning form */
  activeNames(type: CatalogType): Observable<string[]> {
    return this.list(type, 'active').pipe(map(items => items.map(i => i.name)));
  }

  listAliases(type: CatalogType): Observable<AliasItem[]> {
    return this.http
      .get<{ data: AliasItem[] }>(`${this.base}/${type}/aliases`)
      .pipe(map(r => r.data));
  }

  mapToCanonical(type: CatalogType, dirty_name: string, canonical_name: string): Observable<{ mapped: boolean; aliasId: number }> {
    return this.http.post<{ mapped: boolean; aliasId: number }>(
      `${this.base}/${type}/map`,
      { dirty_name, canonical_name }
    );
  }

  deleteAlias(type: CatalogType, id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/${type}/aliases/${id}`);
  }
}
