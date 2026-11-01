import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface KioskAppointment {
  appointment_id: number;
  patient_id: number;
  first_name: string;
  last_name: string;
  date_of_birth: string;
  appointment_date: string;
  appointment_time: string;
  duration_minutes: number;
  appointment_status: string;
  provider_id: number;
  provider_first_name: string;
  provider_last_name: string;
  appointment_type: string;
  copay_amount: number | null;
  kiosk_session_id: number | null;
  kiosk_status: string | null;
  check_in_time: string | null;
}

export interface KioskSession {
  id: number;
  customer_id: number;
  patient_id: number;
  appointment_id: number | null;
  check_in_time: string;
  check_out_time: string | null;
  status: 'checked_in' | 'in_room' | 'checked_out' | 'no_show';
  forms_completed: boolean;
  insurance_verified: boolean;
  copay_collected: number | null;
  kiosk_device_id: string | null;
  created_at: string;
}

export interface KioskConfig {
  id?: number;
  customer_id: number;
  require_insurance_scan: boolean;
  require_id_scan: boolean;
  require_consent_forms: boolean;
  require_copay: boolean;
  welcome_message: string;
  logo_url: string | null;
}

export interface KioskStats {
  total_sessions: number;
  checked_in_count: number;
  in_room_count: number;
  checked_out_count: number;
  no_show_count: number;
  avg_visit_duration_min: number | null;
  total_copay_collected: number;
  avg_early_arrival_min: number;
}

@Injectable({ providedIn: 'root' })
export class KioskService {
  private base = `${environment.server.baseUrl}/kiosk`;

  constructor(private http: HttpClient) {}

  getToday(lastName?: string, dob?: string): Observable<KioskAppointment[]> {
    let params = new HttpParams();
    if (lastName) params = params.set('lastName', lastName);
    if (dob) params = params.set('dob', dob);
    return this.http.get<KioskAppointment[]>(`${this.base}/today`, { params });
  }

  checkIn(body: { patient_id: number; appointment_id?: number; kiosk_device_id?: string; copay_collected?: number }): Observable<KioskSession> {
    return this.http.post<KioskSession>(`${this.base}/check-in`, body);
  }

  checkOut(sessionId: number): Observable<KioskSession> {
    return this.http.post<KioskSession>(`${this.base}/check-out`, { session_id: sessionId });
  }

  getConfig(): Observable<KioskConfig> {
    return this.http.get<KioskConfig>(`${this.base}/config`);
  }

  updateConfig(config: Partial<KioskConfig>): Observable<KioskConfig> {
    return this.http.put<KioskConfig>(`${this.base}/config`, config);
  }

  getStats(): Observable<KioskStats> {
    return this.http.get<KioskStats>(`${this.base}/stats`);
  }
}
