import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { of, throwError } from 'rxjs';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ClaimCommentsComponent } from './claim-comments.component';
import { ClaimCommentsService } from '../../../../core/services/claim-comments.service';
import { UserStoreService } from '../../../../core/stores/user-store.service';

describe('ClaimCommentsComponent', () => {
  let component: ClaimCommentsComponent;
  let fixture: ComponentFixture<ClaimCommentsComponent>;
  let mockCommentsSvc: jasmine.SpyObj<ClaimCommentsService>;
  let mockSnack: jasmine.SpyObj<MatSnackBar>;

  const mockComments: any[] = [
    { id: 1, claimId: 'CL5001', parentId: null, authorId: 10, authorName: 'Test User', authorRole: 'admin', body: 'First comment', mentions: '', isEdited: false, createdAt: '2026-03-12', replies: [] },
    { id: 2, claimId: 'CL5001', parentId: null, authorId: 20, authorName: 'Other User', authorRole: 'staff', body: 'Second comment', mentions: '', isEdited: false, createdAt: '2026-03-12', replies: [] },
  ];

  beforeEach(async () => {
    mockCommentsSvc = jasmine.createSpyObj('ClaimCommentsService', [
      'getComments', 'addComment', 'editComment', 'deleteComment',
    ]);
    mockCommentsSvc.getComments.and.returnValue(of({ comments: mockComments, totalCount: 2 }));
    mockCommentsSvc.addComment.and.returnValue(of({ id: 3, claimId: 'CL5001', parentId: null, authorId: 10, authorName: 'Test User', authorRole: 'admin', body: 'New comment', mentions: '', isEdited: false, createdAt: '2026-03-12' } as any));
    mockCommentsSvc.editComment.and.returnValue(of({}));
    mockCommentsSvc.deleteComment.and.returnValue(of({}));

    mockSnack = jasmine.createSpyObj('MatSnackBar', ['open']);

    await TestBed.configureTestingModule({
      declarations: [ClaimCommentsComponent],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        { provide: ClaimCommentsService, useValue: mockCommentsSvc },
        { provide: UserStoreService, useValue: { getUser: () => ({ userId: '10', email: 'test@test.com', firstName: 'Test', lastName: 'User' }) } },
        { provide: MatSnackBar, useValue: mockSnack },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ClaimCommentsComponent);
    component = fixture.componentInstance;
    component.claimId = 'CL5001';
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load comments on init', () => {
    expect(mockCommentsSvc.getComments).toHaveBeenCalledWith('CL5001');
    expect(component.comments.length).toBe(2);
    expect(component.totalCount).toBe(2);
    expect(component.loading).toBeFalse();
  });

  it('should set currentUserId from user store', () => {
    expect(component.currentUserId).toBe(10);
  });

  it('submitComment should add comment to list', () => {
    component.newBody = 'New comment';
    component.submitComment();
    expect(mockCommentsSvc.addComment).toHaveBeenCalledWith('CL5001', 'New comment', 10, 'Test User');
    expect(component.comments.length).toBe(3);
    expect(component.totalCount).toBe(3);
    expect(component.newBody).toBe('');
    expect(component.submitting).toBeFalse();
  });

  it('submitComment should not submit if body is empty', () => {
    component.newBody = '   ';
    component.submitComment();
    expect(mockCommentsSvc.addComment).not.toHaveBeenCalled();
  });

  it('startReply should set replyingTo and clear editingComment', () => {
    component.editingComment = mockComments[0] as any;
    component.startReply(mockComments[1] as any);
    expect(component.replyingTo).toBe(mockComments[1] as any);
    expect(component.replyBody).toBe('');
    expect(component.editingComment).toBeNull();
  });

  it('cancelReply should clear reply state', () => {
    component.replyingTo = mockComments[0] as any;
    component.replyBody = 'something';
    component.cancelReply();
    expect(component.replyingTo).toBeNull();
    expect(component.replyBody).toBe('');
  });

  it('submitReply should not submit if no replyingTo', () => {
    component.replyingTo = null;
    component.replyBody = 'text';
    component.submitReply();
    expect(mockCommentsSvc.addComment).not.toHaveBeenCalled();
  });

  it('submitReply should not submit if replyBody is empty', () => {
    component.replyingTo = mockComments[0] as any;
    component.replyBody = '   ';
    component.submitReply();
    expect(mockCommentsSvc.addComment).not.toHaveBeenCalled();
  });

  it('startEdit should set editingComment and editBody', () => {
    const comment = component.comments[1];
    component.replyingTo = component.comments[0] as any;
    component.startEdit(comment as any);
    expect(component.editingComment).toBe(comment as any);
    expect(component.editBody).toBe(comment.body);
    expect(component.replyingTo).toBeNull();
  });

  it('cancelEdit should clear edit state', () => {
    component.editingComment = mockComments[0] as any;
    component.editBody = 'changed';
    component.cancelEdit();
    expect(component.editingComment).toBeNull();
    expect(component.editBody).toBe('');
  });

  it('submitEdit should not submit if editBody is empty', () => {
    component.editingComment = mockComments[0] as any;
    component.editBody = '';
    component.submitEdit();
    expect(mockCommentsSvc.editComment).not.toHaveBeenCalled();
  });

  it('submitEdit should not submit if no editingComment', () => {
    component.editingComment = null;
    component.editBody = 'text';
    component.submitEdit();
    expect(mockCommentsSvc.editComment).not.toHaveBeenCalled();
  });

  it('submitEdit should call editComment and update the comment', () => {
    component.editingComment = component.comments[0] as any;
    component.editBody = 'Updated text';
    component.submitEdit();
    expect(mockCommentsSvc.editComment).toHaveBeenCalledWith(1, 'Updated text');
    expect(component.comments[0].body).toBe('Updated text');
    expect(component.comments[0].isEdited).toBeTrue();
    expect(component.editingComment).toBeNull();
    expect(mockSnack.open).toHaveBeenCalledWith('Comment updated', 'OK', jasmine.any(Object));
  });

  it('deleteComment should remove top-level comment from list', () => {
    component.deleteComment(mockComments[0] as any);
    expect(mockCommentsSvc.deleteComment).toHaveBeenCalledWith(1);
    expect(component.comments.length).toBe(1);
    expect(component.totalCount).toBe(1);
  });

  it('deleteComment should remove reply from parent', () => {
    const reply = { id: 10, body: 'reply', authorId: 10, isEdited: false } as any;
    component.comments[0].replies = [reply];
    component.deleteComment(reply, 1);
    expect(mockCommentsSvc.deleteComment).toHaveBeenCalledWith(10);
    expect(component.comments[0].replies!.length).toBe(0);
  });

  it('isOwner should return true for matching authorId', () => {
    expect(component.isOwner({ authorId: 10 } as any)).toBeTrue();
    expect(component.isOwner({ authorId: 20 } as any)).toBeFalse();
  });

  it('trackById should return comment id', () => {
    expect(component.trackById(0, { id: 42 } as any)).toBe(42);
  });

  it('should reload comments when claimId input changes', () => {
    mockCommentsSvc.getComments.calls.reset();
    component.claimId = 'CL9999';
    component.ngOnChanges({
      claimId: { previousValue: 'CL5001', currentValue: 'CL9999', firstChange: false, isFirstChange: () => false },
    });
    expect(mockCommentsSvc.getComments).toHaveBeenCalledWith('CL9999');
  });
});
