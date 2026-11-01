import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TeamChatService, ChatChannel, ChatMessage } from './team-chat.service';
import { environment } from '../../../environments/environment';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

describe('TeamChatService', () => {
  let service: TeamChatService;
  let http: HttpTestingController;
  const base = `${environment.server.baseUrl}/api/collaboration/team-chat`;

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [],
    providers: [TeamChatService, provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()]
});
    service = TestBed.inject(TeamChatService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('listChannels() should GET /channels without params if no userId', () => {
    service.listChannels().subscribe(res => expect(Array.isArray(res)).toBeTrue());
    const req = http.expectOne(`${base}/channels`);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('listChannels() should pass userId param when provided', () => {
    service.listChannels('user-42').subscribe();
    const req = http.expectOne(r => r.url === `${base}/channels` && r.params.get('userId') === 'user-42');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('createChannel() should POST to /channels', () => {
    const channel = { name: 'general', channelType: 'team', createdBy: 'user-1' };
    service.createChannel(channel).subscribe(res => expect(res).toEqual({ id: 1 }));
    const req = http.expectOne(`${base}/channels`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(channel);
    req.flush({ id: 1 });
  });

  it('getMessages() should GET /channels/:id/messages without before param', () => {
    service.getMessages(5).subscribe(res => expect(Array.isArray(res)).toBeTrue());
    const req = http.expectOne(`${base}/channels/5/messages`);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('getMessages() should pass before param when provided', () => {
    service.getMessages(5, 100).subscribe();
    const req = http.expectOne(r =>
      r.url === `${base}/channels/5/messages` && r.params.get('before') === '100'
    );
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('sendMessage() should POST to /channels/:id/messages', () => {
    const msg = { senderId: 'u1', body: 'Hello team' };
    service.sendMessage(5, msg).subscribe(res => expect(res).toEqual({ id: 99 }));
    const req = http.expectOne(`${base}/channels/5/messages`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(msg);
    req.flush({ id: 99 });
  });
});
