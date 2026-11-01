import {
  ChangeDetectorRef, Component, Input, OnInit, OnChanges, SimpleChanges, OnDestroy,
} from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import { MatSnackBar } from '@angular/material/snack-bar';
import {
  ClaimCommentsService, ClaimComment,
} from '../../../../core/services/claim-comments.service';
import { UserStoreService } from '../../../../core/stores/user-store.service';

@Component({
    selector: 'app-claim-comments',
    templateUrl: './claim-comments.component.html',
    styleUrls: ['./claim-comments.component.scss'],
    standalone: false
})
export class ClaimCommentsComponent implements OnInit, OnChanges, OnDestroy {
  @Input() claimId = '';

  comments: ClaimComment[] = [];
  loading = true;
  totalCount = 0;

  // New comment form
  newBody = '';
  submitting = false;

  // Reply state
  replyingTo: ClaimComment | null = null;
  replyBody = '';

  // Edit state
  editingComment: ClaimComment | null = null;
  editBody = '';

  currentUserId = 0;
  currentUserName = '';

  private destroy$ = new Subject<void>();

  constructor(
    private commentsSvc: ClaimCommentsService,
    private userStore: UserStoreService,
    private snack: MatSnackBar,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    const u = this.userStore.getUser();
    this.currentUserId = u ? parseInt(u.userId, 10) || 0 : 0;
    this.currentUserName = u ? `${u.firstName} ${u.lastName}`.trim() : '';
    if (this.claimId) this.load();
  }

  ngOnChanges(ch: SimpleChanges): void {
    if (ch['claimId'] && !ch['claimId'].firstChange) this.load();
  }

  load(): void {
    this.loading = true;
    this.commentsSvc.getComments(this.claimId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: res => {
          this.comments = res.comments;
          this.totalCount = res.totalCount;
          this.loading = false;
          this.cdr.markForCheck();
        },
        error: () => { this.loading = false; this.cdr.markForCheck(); },
      });
  }

  submitComment(): void {
    const body = this.newBody.trim();
    if (!body) return;
    this.submitting = true;
    this.commentsSvc.addComment(this.claimId, body, this.currentUserId, this.currentUserName)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: comment => {
          this.comments = [...this.comments, { ...comment, replies: [] }];
          this.totalCount++;
          this.newBody = '';
          this.submitting = false;
          this.cdr.markForCheck();
          this.snack.open('Comment added', 'OK', { duration: 2000 });
        },
        error: () => {
          this.snack.open('Failed to add comment', 'OK', { duration: 3000 });
          this.submitting = false;
          this.cdr.markForCheck();
        },
      });
  }

  // -- Reply --------------------------------------------------------------
  startReply(comment: ClaimComment): void {
    this.replyingTo = comment;
    this.replyBody = '';
    this.editingComment = null;
  }

  cancelReply(): void {
    this.replyingTo = null;
    this.replyBody = '';
  }

  submitReply(): void {
    if (!this.replyingTo || !this.replyBody.trim()) return;
    this.submitting = true;
    this.commentsSvc.addComment(this.claimId, this.replyBody.trim(), this.currentUserId, this.currentUserName, this.replyingTo.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: reply => {
          const parent = this.comments.find(c => c.id === this.replyingTo!.id);
          if (parent) {
            parent.replies = [...(parent.replies || []), reply];
          }
          this.totalCount++;
          this.replyingTo = null;
          this.replyBody = '';
          this.submitting = false;
          this.cdr.markForCheck();
        },
        error: () => {
          this.snack.open('Failed to add reply', 'OK', { duration: 3000 });
          this.submitting = false;
          this.cdr.markForCheck();
        },
      });
  }

  // -- Edit ---------------------------------------------------------------
  startEdit(comment: ClaimComment): void {
    this.editingComment = comment;
    this.editBody = comment.body;
    this.replyingTo = null;
  }

  cancelEdit(): void {
    this.editingComment = null;
    this.editBody = '';
  }

  submitEdit(): void {
    if (!this.editingComment || !this.editBody.trim()) return;
    this.submitting = true;
    this.commentsSvc.editComment(this.editingComment.id, this.editBody.trim())
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          if (this.editingComment) {
            this.editingComment.body = this.editBody.trim();
            this.editingComment.isEdited = true;
          }
          this.editingComment = null;
          this.editBody = '';
          this.submitting = false;
          this.cdr.markForCheck();
          this.snack.open('Comment updated', 'OK', { duration: 2000 });
        },
        error: () => {
          this.snack.open('Failed to update comment', 'OK', { duration: 3000 });
          this.submitting = false;
          this.cdr.markForCheck();
        },
      });
  }

  // -- Delete -------------------------------------------------------------
  deleteComment(comment: ClaimComment, parentId?: number): void {
    this.commentsSvc.deleteComment(comment.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          if (parentId) {
            const parent = this.comments.find(c => c.id === parentId);
            if (parent) {
              parent.replies = (parent.replies || []).filter(r => r.id !== comment.id);
            }
          } else {
            this.comments = this.comments.filter(c => c.id !== comment.id);
          }
          this.totalCount--;
          this.cdr.markForCheck();
          this.snack.open('Comment deleted', 'OK', { duration: 2000 });
        },
        error: () => {
          this.snack.open('Failed to delete comment', 'OK', { duration: 3000 });
          this.cdr.markForCheck();
        },
      });
  }

  isOwner(comment: ClaimComment): boolean {
    return comment.authorId === this.currentUserId;
  }

  trackById(_: number, c: ClaimComment): number { return c.id; }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
