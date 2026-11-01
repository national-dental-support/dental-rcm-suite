import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface ReportDimension {
  key: string;
  label: string;
}

export interface ReportMeasure {
  key: string;
  label: string;
  format?: string;
}

export interface ReportSchema {
  dimensions: ReportDimension[];
  measures: ReportMeasure[];
}

export interface ReportResult {
  rows: any[];
  rowCount: number;
  dimensions: string[];
  measures: string[];
}

export interface SavedReport {
  id: number;
  name: string;
  description: string;
  dimensions: string;
  measures: string;
  filters: string;
  isShared: boolean;
  createdAt: string;
  updatedAt: string;
  ownerName: string;
}

@Injectable({ providedIn: 'root' })
export class ReportBuilderService {
  private base = `${environment.server.baseUrl}/insightflow/report-builder`;

  constructor(private http: HttpClient) {}

  getSchema(): Observable<ReportSchema> {
    return this.http.get<ReportSchema>(`${this.base}/schema`);
  }

  runReport(dimensions: string[], measures: string[], days: number): Observable<ReportResult> {
    return this.http.post<ReportResult>(`${this.base}/run`, { dimensions, measures, days });
  }

  listSaved(): Observable<SavedReport[]> {
    return this.http.get<SavedReport[]>(`${this.base}/saved`);
  }

  saveReport(body: any): Observable<{ id: number }> {
    return this.http.post<{ id: number }>(`${this.base}/saved`, body);
  }

  deleteSaved(id: number): Observable<any> {
    return this.http.delete(`${this.base}/saved/${id}`);
  }
}
