import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { EscalationChainsService, EscalationChain, EscalationLevel } from './escalation-chains.service';
import { environment } from '../../../environments/environment';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

describe('EscalationChainsService', () => {
  let service: EscalationChainsService;
  let http: HttpTestingController;
  const base = `${environment.server.baseUrl}/admin/escalation`;

  const mockLevel: EscalationLevel = {
    id: 1,
    chainId: 1,
    levelOrder: 1,
    targetRole: 'manager',
    slaHours: 48,
    notifyAtPct: 80,
    description: 'Level 1',
  };

  const mockChain: EscalationChain = {
    id: 1,
    name: 'Default Chain',
    description: 'Standard escalation',
    isActive: true,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    levels: [mockLevel],
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [],
    providers: [provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()]
});
    service = TestBed.inject(EscalationChainsService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('listChains', () => {
    it('should GET /admin/escalation/chains and extract data array', () => {
      service.listChains().subscribe(chains => {
        expect(chains).toEqual([mockChain]);
      });

      const req = http.expectOne(`${base}/chains`);
      expect(req.request.method).toBe('GET');
      req.flush({ data: [mockChain] });
    });

    it('should return empty array when data is null', () => {
      service.listChains().subscribe(chains => expect(chains).toEqual([]));
      const req = http.expectOne(`${base}/chains`);
      req.flush({ data: null });
    });
  });

  describe('createChain', () => {
    it('should POST /admin/escalation/chains with body', () => {
      const body = { name: 'New Chain', levels: [{ levelOrder: 1, targetRole: 'admin', slaHours: 24, notifyAtPct: 75, description: null }] };
      service.createChain(body).subscribe(res => expect(res).toEqual({ id: 5 }));

      const req = http.expectOne(`${base}/chains`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(body);
      req.flush({ id: 5 });
    });
  });

  describe('updateChain', () => {
    it('should PUT /admin/escalation/chains/:id with body', () => {
      const body = { name: 'Updated', description: null, isActive: true, levels: [] };
      service.updateChain(1, body).subscribe(res => expect(res).toBeTruthy());

      const req = http.expectOne(`${base}/chains/1`);
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual(body);
      req.flush({ success: true });
    });
  });

  describe('deleteChain', () => {
    it('should DELETE /admin/escalation/chains/:id', () => {
      service.deleteChain(1).subscribe(res => expect(res).toBeTruthy());

      const req = http.expectOne(`${base}/chains/1`);
      expect(req.request.method).toBe('DELETE');
      req.flush({ success: true });
    });
  });

  describe('getSlaStatus', () => {
    it('should GET /admin/escalation/sla-status', () => {
      const mockResponse = {
        data: [
          {
            claimId: 'CL50001',
            patientName: 'John Doe',
            assignedTo: 'jane@example.com',
            assignedRole: 'specialist',
            claimStatus: 'open',
            carcCode: 'CO-4',
            balanceDue: 1500,
            hoursOpen: 50,
            slaHours: 48,
            slaStatus: 'breached' as const,
            hoursRemaining: -2,
          },
        ],
        summary: { breached: 1, warning: 0, ok: 5, total: 6 },
      };

      service.getSlaStatus().subscribe(res => {
        expect(res.data.length).toBe(1);
        expect(res.summary.breached).toBe(1);
      });

      const req = http.expectOne(`${base}/sla-status`);
      expect(req.request.method).toBe('GET');
      req.flush(mockResponse);
    });
  });

  describe('triggerAutoEscalate', () => {
    it('should POST /admin/escalation/check-sla with empty body', () => {
      service.triggerAutoEscalate().subscribe(res => {
        expect(res.message).toBe('done');
        expect(res.escalated).toBe(3);
      });

      const req = http.expectOne(`${base}/check-sla`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({});
      req.flush({ message: 'done', escalated: 3 });
    });
  });
});
