import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface KbArticleListItem {
  id: number;
  title: string;
  slug: string;
  category: string;
  carcCodes: string;
  payerIds: string;
  cptCodes: string;
  tags: string;
  viewCount: number;
  updatedAt: string;
  authorName: string;
  excerpt: string;
}

export interface KbArticle {
  id: number;
  title: string;
  slug: string;
  body: string;
  category: string;
  carcCodes: string;
  payerIds: string;
  cptCodes: string;
  tags: string;
  viewCount: number;
  createdAt: string;
  updatedAt: string;
  authorName: string;
}

export interface KbCategory {
  category: string;
  articleCount: number;
}

export interface AdminKbRow {
  id: number;
  title: string;
  slug: string;
  category: string;
  carcCodes: string;
  tags: string;
  isPublished: boolean;
  viewCount: number;
  createdAt: string;
  updatedAt: string;
  authorName: string;
}

@Injectable({ providedIn: 'root' })
export class KnowledgeBaseService {
  private base = `${environment.server.baseUrl}/training/kb`;
  private adminBase = `${environment.server.baseUrl}/training/admin/kb`;

  constructor(private http: HttpClient) {}

  // User
  list(filters?: { category?: string; carcCode?: string; search?: string }): Observable<KbArticleListItem[]> {
    let params = new HttpParams();
    if (filters?.category) params = params.set('category', filters.category);
    if (filters?.carcCode) params = params.set('carcCode', filters.carcCode);
    if (filters?.search) params = params.set('search', filters.search);
    return this.http.get<KbArticleListItem[]>(this.base, { params });
  }

  get(idOrSlug: number | string): Observable<KbArticle> {
    return this.http.get<KbArticle>(`${this.base}/${idOrSlug}`);
  }

  getForClaim(carcCode: string): Observable<KbArticleListItem[]> {
    return this.http.get<KbArticleListItem[]>(`${this.base}/by-claim/${encodeURIComponent(carcCode)}`);
  }

  getCategories(): Observable<KbCategory[]> {
    return this.http.get<KbCategory[]>(`${this.base}/categories`);
  }

  // Admin
  adminList(): Observable<AdminKbRow[]> {
    return this.http.get<AdminKbRow[]>(this.adminBase);
  }

  adminCreate(body: any): Observable<{ id: number; slug: string }> {
    return this.http.post<{ id: number; slug: string }>(this.adminBase, body);
  }

  adminUpdate(id: number, body: any): Observable<any> {
    return this.http.put(`${this.adminBase}/${id}`, body);
  }

  adminDelete(id: number): Observable<any> {
    return this.http.delete(`${this.adminBase}/${id}`);
  }
}
