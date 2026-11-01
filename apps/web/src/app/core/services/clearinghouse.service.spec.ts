import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import {
  ClearinghouseService,
  ClearinghouseConnection,
  ClearinghouseProvider,
  ClearinghouseLogEntry,
  ClaimStatusResult,
} from './clearinghouse.service';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

// environment.server.baseUrl = '/api', so base = '/api/api/integrations/clearinghouse'
const BASE = '/api/api/integrations/clearinghouse';

const mockConnection: ClearinghouseConnection = {
  id: 1,
  name: 'Test Connection',
  provider: 'availity',
  apiUrl: 'https://api.availity.com',
  username: 'user',
  isActive: true,
  syncInterval: 60,
  createdAt: '2026-01-01T00:00:00Z',
};

describe('ClearinghouseService', () => {
  let service: ClearinghouseService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [],
    providers: [provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()]
});
    service = TestBed.inject(ClearinghouseService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('listConnections()', () => {
    it('should GET /connections', () => {
      service.listConnections().subscribe(conns => {
        expect(conns).toEqual([mockConnection]);
      });

      const req = http.expectOne(`${BASE}/connections`);
      expect(req.request.method).toBe('GET');
      req.flush([mockConnection]);
    });
  });

  describe('createConnection()', () => {
    it('should POST to /connections with connection data', () => {
      const newConn = { name: 'New Conn', provider: 'availity' };
      service.createConnection(newConn).subscribe(res => {
        expect(res.id).toBe(2);
      });

      const req = http.expectOne(`${BASE}/connections`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(newConn);
      req.flush({ id: 2 });
    });
  });

  describe('updateConnection()', () => {
    it('should PUT to /connections/:id with update data', () => {
      service.updateConnection(1, { isActive: false }).subscribe(res => {
        expect(res.success).toBeTrue();
      });

      const req = http.expectOne(`${BASE}/connections/1`);
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual({ isActive: false });
      req.flush({ success: true });
    });
  });

  describe('deleteConnection()', () => {
    it('should DELETE /connections/:id', () => {
      service.deleteConnection(1).subscribe(res => {
        expect(res.success).toBeTrue();
      });

      const req = http.expectOne(`${BASE}/connections/1`);
      expect(req.request.method).toBe('DELETE');
      req.flush({ success: true });
    });
  });

  describe('testConnection()', () => {
    it('should POST to /test/:id with empty body', () => {
      service.testConnection(1).subscribe(res => {
        expect(res.success).toBeTrue();
        expect(res.provider).toBe('availity');
      });

      const req = http.expectOne(`${BASE}/test/1`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({});
      req.flush({ success: true, provider: 'availity', message: 'Connected' });
    });
  });

  describe('checkClaimStatus()', () => {
    it('should POST to /check-status with connectionId and claimId', () => {
      const mockResult: ClaimStatusResult = {
        claimId: 'CL001',
        status: 'paid',
        chargeAmount: 1500,
        checkedAt: '2026-01-01T00:00:00Z',
      };

      service.checkClaimStatus(1, 'CL001').subscribe(res => {
        expect(res).toEqual(mockResult);
      });

      const req = http.expectOne(`${BASE}/check-status`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ connectionId: 1, claimId: 'CL001' });
      req.flush(mockResult);
    });
  });

  describe('getLogs()', () => {
    it('should GET /logs with default days=30', () => {
      const mockLog: ClearinghouseLogEntry = {
        id: 1,
        action: 'check_status',
        status: 'success',
        durationMs: 350,
        createdAt: '2026-01-01T00:00:00Z',
        connectionName: 'Test Connection',
        provider: 'availity',
      };

      service.getLogs().subscribe(logs => {
        expect(logs).toEqual([mockLog]);
      });

      const req = http.expectOne(r => r.url === `${BASE}/logs`);
      expect(req.request.method).toBe('GET');
      expect(req.request.params.get('days')).toBe('30');
      req.flush([mockLog]);
    });

    it('should GET /logs with custom days param', () => {
      service.getLogs(7).subscribe();
      const req = http.expectOne(r => r.url === `${BASE}/logs`);
      expect(req.request.params.get('days')).toBe('7');
      req.flush([]);
    });
  });

  describe('getProviders()', () => {
    it('should GET /providers', () => {
      const mockProviders: ClearinghouseProvider[] = [
        { id: 'availity', name: 'Availity', fields: ['apiKey', 'username'] },
      ];

      service.getProviders().subscribe(providers => {
        expect(providers).toEqual(mockProviders);
      });

      const req = http.expectOne(`${BASE}/providers`);
      expect(req.request.method).toBe('GET');
      req.flush(mockProviders);
    });
  });
});
