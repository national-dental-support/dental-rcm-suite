import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface MaskingRule {
  id: number;
  fieldName: string;
  displayLabel: string;
  category: 'phi' | 'pii' | 'financial';
  maskType: 'full' | 'last4' | 'date' | 'partial';
  visibleAboveRole: number;
  isActive: boolean;
}

export interface EncryptionConfig {
  tde_enabled: string;
  field_encryption_enabled: string;
  encrypted_fields: string;
  [key: string]: string;
}

export interface SecurityStatus {
  encryption: {
    tdeEnabled: boolean;
    fieldEncryptionEnabled: boolean;
    encryptedFields: string[];
  };
  masking: {
    activeMaskingRules: number;
  };
  fieldEncryptionKeyConfigured: boolean;
}

@Injectable({ providedIn: 'root' })
export class SecurityAdminService {
  private base = `${environment.server.baseUrl}/api/admin/security`;

  constructor(private http: HttpClient) {}

  getMaskingRules(): Observable<MaskingRule[]> {
    return this.http.get<MaskingRule[]>(`${this.base}/masking-rules`);
  }

  createMaskingRule(data: Partial<MaskingRule>): Observable<{ id: number }> {
    return this.http.post<{ id: number }>(`${this.base}/masking-rules`, data);
  }

  updateMaskingRule(id: number, data: Partial<MaskingRule>): Observable<{ success: boolean }> {
    return this.http.put<{ success: boolean }>(`${this.base}/masking-rules/${id}`, data);
  }

  deleteMaskingRule(id: number): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(`${this.base}/masking-rules/${id}`);
  }

  getEncryptionConfig(): Observable<EncryptionConfig> {
    return this.http.get<EncryptionConfig>(`${this.base}/encryption`);
  }

  updateEncryptionConfig(config: Partial<EncryptionConfig>): Observable<{ success: boolean }> {
    return this.http.put<{ success: boolean }>(`${this.base}/encryption`, config);
  }

  getSecurityStatus(): Observable<SecurityStatus> {
    return this.http.get<SecurityStatus>(`${this.base}/status`);
  }
}
