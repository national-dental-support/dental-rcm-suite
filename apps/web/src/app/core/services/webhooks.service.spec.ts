import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { WebhooksService, WebhookSubscription } from './webhooks.service';
import { environment } from '../../../environments/environment';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

describe('WebhooksService', () => {
  let service: WebhooksService;
  let http: HttpTestingController;
  const base = `${environment.server.baseUrl}/api/webhooks`;

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [],
    providers: [WebhooksService, provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()]
});
    service = TestBed.inject(WebhooksService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('listSubscriptions() should GET /subscriptions without params', () => {
    service.listSubscriptions().subscribe(res => expect(Array.isArray(res)).toBeTrue());
    const req = http.expectOne(`${base}/subscriptions`);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('listSubscriptions() should pass customerId param when provided', () => {
    service.listSubscriptions(5).subscribe();
    const req = http.expectOne(r => r.url === `${base}/subscriptions` && r.params.get('customerId') === '5');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('createSubscription() should POST to /subscriptions', () => {
    const sub = { customerId: 1, eventType: 'claim.denied', targetUrl: 'https://example.com/hook' };
    service.createSubscription(sub).subscribe(res => expect(res).toEqual({ id: 10 }));
    const req = http.expectOne(`${base}/subscriptions`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(sub);
    req.flush({ id: 10 });
  });

  it('deleteSubscription() should DELETE /subscriptions/:id', () => {
    service.deleteSubscription(10).subscribe(res => expect(res).toEqual({ success: true }));
    const req = http.expectOne(`${base}/subscriptions/10`);
    expect(req.request.method).toBe('DELETE');
    req.flush({ success: true });
  });

  it('getDeliveries() should GET /subscriptions/:id/deliveries', () => {
    service.getDeliveries(10).subscribe(res => expect(Array.isArray(res)).toBeTrue());
    const req = http.expectOne(`${base}/subscriptions/10/deliveries`);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('getEventTypes() should GET /event-types', () => {
    service.getEventTypes().subscribe(res => expect(Array.isArray(res)).toBeTrue());
    const req = http.expectOne(`${base}/event-types`);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });
});
