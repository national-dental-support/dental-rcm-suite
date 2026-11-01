import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { KioskService, KioskAppointment, KioskSession, KioskConfig, KioskStats } from './kiosk.service';
import { environment } from '../../../environments/environment';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

const BASE = `${environment.server.baseUrl}/kiosk`;

const mockAppt: KioskAppointment = {
  appointment_id: 1, patient_id: 100, first_name: 'John', last_name: 'Doe',
  date_of_birth: '1990-01-01', appointment_date: '2026-03-17',
  appointment_time: '09:00', duration_minutes: 30, appointment_status: 'scheduled',
  provider_id: 5, provider_first_name: 'Dr', provider_last_name: 'Smith',
  appointment_type: 'checkup', copay_amount: 25, kiosk_session_id: null,
  kiosk_status: null, check_in_time: null,
};

const mockSession: KioskSession = {
  id: 1, customer_id: 10, patient_id: 100, appointment_id: 1,
  check_in_time: '2026-03-17T09:00:00', check_out_time: null,
  status: 'checked_in', forms_completed: true, insurance_verified: true,
  copay_collected: 25, kiosk_device_id: 'K1', created_at: '2026-03-17',
};

const mockConfig: KioskConfig = {
  id: 1, customer_id: 10, require_insurance_scan: true, require_id_scan: false,
  require_consent_forms: true, require_copay: true, welcome_message: 'Welcome!',
  logo_url: null,
};

const mockStats: KioskStats = {
  total_sessions: 50, checked_in_count: 10, in_room_count: 5,
  checked_out_count: 30, no_show_count: 5, avg_visit_duration_min: 45,
  total_copay_collected: 1250, avg_early_arrival_min: 8,
};

describe('KioskService', () => {
  let service: KioskService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [],
    providers: [KioskService, provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()]
});
    service = TestBed.inject(KioskService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('should be created', () => expect(service).toBeTruthy());

  describe('getToday()', () => {
    it('GET /kiosk/today returns appointments', () => {
      service.getToday().subscribe(a => expect(a.length).toBe(1));
      http.expectOne(r => r.url === `${BASE}/today`).flush([mockAppt]);
    });

    it('sends lastName and dob params', () => {
      service.getToday('Doe', '1990-01-01').subscribe();
      const req = http.expectOne(r =>
        r.url === `${BASE}/today` &&
        r.params.get('lastName') === 'Doe' &&
        r.params.get('dob') === '1990-01-01'
      );
      req.flush([]);
    });
  });

  describe('checkIn()', () => {
    it('POST /kiosk/check-in', () => {
      const body = { patient_id: 100, appointment_id: 1, copay_collected: 25 };
      service.checkIn(body).subscribe(s => expect(s.status).toBe('checked_in'));
      const req = http.expectOne(`${BASE}/check-in`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(body);
      req.flush(mockSession);
    });
  });

  describe('checkOut()', () => {
    it('POST /kiosk/check-out', () => {
      service.checkOut(1).subscribe();
      const req = http.expectOne(`${BASE}/check-out`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ session_id: 1 });
      req.flush(mockSession);
    });
  });

  describe('getConfig()', () => {
    it('GET /kiosk/config', () => {
      service.getConfig().subscribe(c => expect(c.require_copay).toBe(true));
      http.expectOne(`${BASE}/config`).flush(mockConfig);
    });
  });

  describe('updateConfig()', () => {
    it('PUT /kiosk/config', () => {
      service.updateConfig({ require_copay: false }).subscribe();
      const req = http.expectOne(`${BASE}/config`);
      expect(req.request.method).toBe('PUT');
      req.flush(mockConfig);
    });
  });

  describe('getStats()', () => {
    it('GET /kiosk/stats', () => {
      service.getStats().subscribe(s => expect(s.total_sessions).toBe(50));
      http.expectOne(`${BASE}/stats`).flush(mockStats);
    });
  });
});
