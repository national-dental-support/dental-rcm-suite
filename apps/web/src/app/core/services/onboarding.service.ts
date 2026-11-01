import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
}

export interface OrgCreateResult {
  customerId: number;
  groupId: number;
  practiceId: number;
  name: string;
}

export interface OnboardingProgress {
  customer_id: number;
  product_slug: string;
  current_step: number;
  baa_signed: boolean;
  status: string;
}

export interface TableInfo {
  name: string;
  schema: string;
  columns: Array<{ name: string; dataType: string; nullable: boolean; sourceType: string }>;
  rowCount?: number;
}

export interface DenialIqField {
  table: string;
  column: string;
  label: string;
  required: boolean;
  dataType: string;
}

export interface FieldMapping {
  sourceTable: string;
  sourceColumn: string;
  sourceType?: string;
  targetTable: string;
  targetColumn: string;
  targetLabel?: string;
  transform?: any;
  isRequired?: boolean;
  confidence?: number;
  mappedBy?: string;
}

@Injectable({ providedIn: 'root' })
export class OnboardingService {
  private readonly base = `${environment.server.baseUrl}/superadmin/onboarding`;

  constructor(private http: HttpClient) {}

  // Templates
  getTemplates(): Observable<{ data: EmailTemplate[] }> {
    return this.http.get<any>(`${this.base}/denial-iq/templates`);
  }

  // Step 3
  createOrganization(data: any): Observable<{ data: OrgCreateResult }> {
    console.warn("Creating organization with data:", data);
    return this.http.post<any>(`${this.base}/start`, data);
  }

  // Step 4
  createLocations(customerId: number, locations: any[]): Observable<any> {
    return this.http.post<any>(`${this.base}/${customerId}/locations`, { locations });
  }

  // Step 5
  createUsers(customerId: number, users: any[]): Observable<any> {
    return this.http.post<any>(`${this.base}/${customerId}/users`, { users });
  }

  // Step 6
  createPayers(customerId: number, payers: any[]): Observable<any> {
    return this.http.post<any>(`${this.base}/${customerId}/payers`, { payers });
  }

  // Step 7
  createDataSource(customerId: number, data: any): Observable<any> {
    console.warn("Creating data source with config:", data);
    return this.http.post<any>(`${this.base}/${customerId}/data-source`, data);
  }

  testDataSource(customerId: number): Observable<any> {
    console.warn("Testing data source for customer:", customerId);
    return this.http.post<any>(`${this.base}/${customerId}/data-source/test`, {});
  }

  // Step 8
  discoverSchema(customerId: number): Observable<{ data: { tables: TableInfo[]; denialIqFields: DenialIqField[] } }> {
    return this.http.get<any>(`${this.base}/${customerId}/data-source/schema`);
  }

  autoMap(customerId: number, tables: TableInfo[]): Observable<{ data: FieldMapping[] }> {
    return this.http.post<any>(`${this.base}/${customerId}/data-source/auto-map`, { tables });
  }

  previewMapping(customerId: number, mappings: FieldMapping[]): Observable<any> {
    return this.http.post<any>(`${this.base}/${customerId}/data-source/preview`, { mappings });
  }

  saveMapping(customerId: number, mappings: FieldMapping[]): Observable<any> {
    return this.http.post<any>(`${this.base}/${customerId}/data-source/mapping`, { mappings });
  }

  // Step 9
  validate(customerId: number): Observable<any> {
    return this.http.post<any>(`${this.base}/${customerId}/validate`, {});
  }

  // Step 10
  activate(customerId: number): Observable<any> {
    return this.http.post<any>(`${this.base}/${customerId}/activate`, {});
  }

  // Progress
  getProgress(customerId: number): Observable<{ data: OnboardingProgress | null }> {
    return this.http.get<any>(`${this.base}/${customerId}/status`);
  }

  // -- PMS Connector Methods -------------------------------------------------

  getSupportedPms(): Observable<{ data: PmsConnectorInfo[] }> {
    return this.http.get<any>(`${this.base}/pms/supported`);
  }

  provisionPms(customerId: number, data: PmsProvisionRequest): Observable<any> {
    return this.http.post<any>(`${this.base}/${customerId}/pms/provision`, data);
  }

  testPms(customerId: number, data: PmsTestRequest): Observable<{ data: { ok: boolean; message: string } }> {
    return this.http.post<any>(`${this.base}/${customerId}/pms/test`, data);
  }

  getPmsSchema(customerId: number, data: { pms_type: string; api_url: string; api_key: string; developer_key: string }): Observable<any> {
    return this.http.post<any>(`${this.base}/${customerId}/pms/schema`, data);
  }

  getPmsMappings(customerId: number, pmsType: string): Observable<{ data: FieldMapping[] }> {
    return this.http.get<any>(`${this.base}/${customerId}/pms/mappings/${pmsType}`);
  }

  triggerPmsSync(customerId: number): Observable<any> {
    return this.http.post<any>(`${this.base}/${customerId}/pms/trigger-sync`, {});
  }

  getPmsSyncStatus(customerId: number): Observable<any> {
    return this.http.get<any>(`${this.base}/${customerId}/pms/sync-status`);
  }
}

export interface PmsConnectorInfo {
  pms_type: string;
  label: string;
  status: 'available' | 'coming_soon';
}

export interface PmsProvisionRequest {
  pms_type: string;
  api_url?: string;
  api_key?: string;
  developer_key?: string;
  odbc_dsn?: string;
  sync_interval_min?: number;
}

export interface PmsTestRequest {
  pms_type: string;
  api_url?: string;
  api_key?: string;
  developer_key?: string;
  odbc_dsn?: string;
}
