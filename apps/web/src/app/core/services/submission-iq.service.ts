import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface ScrubResult {
  errors: { field: string; message: string; severity: 'error' | 'warning' }[];
  passCount: number;
  warnCount: number;
  errorCount: number;
  riskScore: number;
  riskLevel: 'high' | 'medium' | 'low';
  riskFactors: string[];
}

export interface TimelyFilingRecord {
  id: number;
  claimId: string;
  patientName: string;
  payerName: string;
  dateOfService: string;
  submittedDate: string | null;
  timelyCutoffDate: string;
  daysRemaining: number;
  urgency: 'critical' | 'warning' | 'ok';
  status: string;
}

export interface TimelyFilingResponse {
  data: TimelyFilingRecord[];
  total: number;
  criticalCount: number;
  warningCount: number;
  avgDaysRemaining: number;
}

export interface AttachmentRecord {
  id: number;
  customer_id: number;
  claim_id: string;
  patient_name: string;
  payer_name: string;
  attachment_type: 'X12_275' | 'Medical_Record' | 'EOB' | 'Other';
  file_name: string;
  file_size_kb: number;
  status: 'pending' | 'sent' | 'acknowledged' | 'rejected';
  sent_at: string | null;
  acknowledged_at: string | null;
  notes: string;
  created_at: string;
}

export interface AttachmentsResponse {
  data: AttachmentRecord[];
  total: number;
  pendingCount: number;
  sentCount: number;
  acknowledgedCount: number;
}

@Injectable({ providedIn: 'root' })
export class SubmissionIqService {
  private base = '/api/submission-iq';
  constructor(private http: HttpClient) {}

  getDashboard(): Observable<any> {
    return this.http.get(`${this.base}/dashboard`);
  }

  getBatches(page = 0, pageSize = 20): Observable<any> {
    return this.http.get(`${this.base}/batch-status`, { params: { page, pageSize } });
  }

  getBatchRecords(batchId: number, status?: string, page = 0, pageSize = 50): Observable<any> {
    const params: any = { page, pageSize };
    if (status) params['status'] = status;
    return this.http.get(`${this.base}/batch-status/${batchId}/records`, { params });
  }

  scrub(payload: any): Observable<ScrubResult> {
    return this.http.post<ScrubResult>(`${this.base}/scrub`, payload);
  }

  getRejections(params?: any): Observable<any> {
    return this.http.get(`${this.base}/rejections`, { params });
  }

  resubmit(id: number, body: { notes: string; resubmitDate?: string }): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>(`${this.base}/rejections/${id}/resubmit`, body);
  }

  getTimelyFiling(urgency?: string): Observable<TimelyFilingResponse> {
    const params: any = {};
    if (urgency && urgency !== 'all') params['urgency'] = urgency;
    return this.http.get<TimelyFilingResponse>(`${this.base}/timely-filing`, { params });
  }

  getEdiPreview(claimId: string): Observable<{ claimId: string; ediContent: string }> {
    return this.http.get<{ claimId: string; ediContent: string }>(`${this.base}/claims/${encodeURIComponent(claimId)}/edi-preview`);
  }

  getAttachments(params?: { claimId?: string; status?: string; type?: string }): Observable<AttachmentsResponse> {
    return this.http.get<AttachmentsResponse>(`${this.base}/attachments`, { params: params as any });
  }

  createAttachment(body: Partial<AttachmentRecord>): Observable<AttachmentRecord> {
    return this.http.post<AttachmentRecord>(`${this.base}/attachments`, body);
  }

  updateAttachmentStatus(id: number, status: string): Observable<AttachmentRecord> {
    return this.http.patch<AttachmentRecord>(`${this.base}/attachments/${id}/status`, { status });
  }
}
