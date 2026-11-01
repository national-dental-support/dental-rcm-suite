import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PeerTipsService, PeerTip } from './peer-tips.service';
import { environment } from '../../../environments/environment';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

describe('PeerTipsService', () => {
  let service: PeerTipsService;
  let http: HttpTestingController;
  const base = `${environment.server.baseUrl}/api/lms/peer-tips`;

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [],
    providers: [PeerTipsService, provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()]
});
    service = TestBed.inject(PeerTipsService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('listTips() should GET base URL with no params when none provided', () => {
    const tips: PeerTip[] = [];
    service.listTips().subscribe(res => expect(res).toEqual(tips));
    const req = http.expectOne(base);
    expect(req.request.method).toBe('GET');
    req.flush(tips);
  });

  it('listTips() should pass params when provided', () => {
    service.listTips({ reasonCode: 'CO-4', status: 'approved' }).subscribe();
    const req = http.expectOne(r => r.url === base &&
      r.params.get('reasonCode') === 'CO-4' &&
      r.params.get('status') === 'approved');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('createTip() should POST to base with tip data', () => {
    const tip = { reasonCode: 'CO-4', title: 'My Tip', body: 'Details here' };
    service.createTip(tip).subscribe(res => expect(res).toEqual({ id: 42 }));
    const req = http.expectOne(base);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(tip);
    req.flush({ id: 42 });
  });

  it('vote() should POST to /:tipId/vote', () => {
    service.vote(10, 1, 'user-abc').subscribe(res => expect(res).toEqual({ success: true }));
    const req = http.expectOne(`${base}/10/vote`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ userId: 'user-abc', direction: 1 });
    req.flush({ success: true });
  });

  it('approveTip() should PATCH to /:tipId/approve', () => {
    service.approveTip(5, 'approved').subscribe(res => expect(res).toEqual({ success: true }));
    const req = http.expectOne(`${base}/5/approve`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ status: 'approved' });
    req.flush({ success: true });
  });
});
