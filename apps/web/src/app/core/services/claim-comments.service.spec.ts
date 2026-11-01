import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ClaimCommentsService, ClaimComment, CommentsResponse } from './claim-comments.service';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

const BASE = '/api/denial-iq/claim-detail/comments';

const mockComment: ClaimComment = {
  id: 1,
  claimId: 'CL001',
  parentId: null,
  authorId: 10,
  authorName: 'Jane Doe',
  authorRole: 'manager',
  body: 'This is a comment',
  mentions: '',
  isEdited: false,
  createdAt: '2026-01-01T00:00:00Z',
};

describe('ClaimCommentsService', () => {
  let service: ClaimCommentsService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [],
    providers: [provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()]
});
    service = TestBed.inject(ClaimCommentsService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('getComments()', () => {
    it('should GET comments for a given claimId', () => {
      const mockResponse: CommentsResponse = {
        comments: [mockComment],
        totalCount: 1,
      };

      service.getComments('CL001').subscribe(res => {
        expect(res).toEqual(mockResponse);
      });

      const req = http.expectOne(`${BASE}/CL001`);
      expect(req.request.method).toBe('GET');
      req.flush(mockResponse);
    });

    it('should URL-encode the claimId', () => {
      service.getComments('CL 001/sub').subscribe();
      const req = http.expectOne(`${BASE}/CL%20001%2Fsub`);
      expect(req.request.method).toBe('GET');
      req.flush({ comments: [], totalCount: 0 });
    });
  });

  describe('addComment()', () => {
    it('should POST a new top-level comment', () => {
      service.addComment('CL001', 'New comment', 10, 'Jane Doe').subscribe(res => {
        expect(res).toEqual(mockComment);
      });

      const req = http.expectOne(`${BASE}/CL001`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ body: 'New comment', authorId: 10, authorName: 'Jane Doe', parentId: null });
      req.flush(mockComment);
    });

    it('should POST a reply with a parentId', () => {
      service.addComment('CL001', 'Reply text', 10, 'Jane Doe', 5).subscribe();

      const req = http.expectOne(`${BASE}/CL001`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ body: 'Reply text', authorId: 10, authorName: 'Jane Doe', parentId: 5 });
      req.flush(mockComment);
    });
  });

  describe('editComment()', () => {
    it('should PUT to the comment endpoint with the new body', () => {
      service.editComment(1, 'Updated body').subscribe();

      const req = http.expectOne(`${BASE}/1`);
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual({ body: 'Updated body' });
      req.flush({ success: true });
    });
  });

  describe('deleteComment()', () => {
    it('should DELETE the specified comment', () => {
      service.deleteComment(1).subscribe();

      const req = http.expectOne(`${BASE}/1`);
      expect(req.request.method).toBe('DELETE');
      req.flush(null);
    });
  });
});
