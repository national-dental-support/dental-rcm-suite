import { Component, Inject, OnInit, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { SecurityContext } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { MatSnackBar } from '@angular/material/snack-bar';
import {
  ClaimDocumentService,
  ClaimDocument,
} from '../../../../core/services/claim-document.service';

interface DialogData {
  title: string;
  docType?: 'eob' | 'claim-form';
  claimId?: string;
  narrative?: string;
}

@Component({
    selector: 'app-claim-document-dialog',
    templateUrl: './claim-document-dialog.component.html',
    styleUrls: ['./claim-document-dialog.component.scss'],
    standalone: false
})
export class ClaimDocumentDialogComponent implements OnInit, OnDestroy {
  documents: ClaimDocument[] = [];
  loading = true;
  uploading = false;
  uploadDocType = 'other';
  activeTab = 0;
  cms1500Html: string | null = null;

  /** Currently previewed document */
  previewUrl: SafeResourceUrl | null = null;
  previewDoc: ClaimDocument | null = null;
  private _previewObjectUrl: string | null = null;

  constructor(
    public dialogRef: MatDialogRef<ClaimDocumentDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: DialogData,
    private docSvc: ClaimDocumentService,
    private sanitizer: DomSanitizer,
    private snack: MatSnackBar,
    private http: HttpClient,
  ) {}

  ngOnInit(): void {
    this.uploadDocType = this.data.docType || 'other';
    if (this.data.docType === 'claim-form') {
      this.activeTab = 1;
    }
    this.loadDocuments();
    if (this.data.claimId) {
      this.loadCms1500();
    }
  }

  private loadCms1500(): void {
    if (!this.data.claimId) return;
    const url = `/api/denial-iq/claim-detail/documents/cms1500?claimId=${this.data.claimId}`;
    this.http.get(url, { responseType: 'text' }).subscribe({
      next: (html) => {
        this.cms1500Html = this.sanitizer.sanitize(SecurityContext.HTML, html) ?? '';
      },
      error: () => {
        this.cms1500Html = '<div style="padding:20px;color:#666">Unable to load CMS-1500 form.</div>';
      },
    });
  }

  private loadDocuments(): void {
    if (!this.data.claimId) {
      this.loading = false;
      return;
    }
    this.loading = true;
    this.docSvc.list(this.data.claimId).subscribe({
      next: docs => {
        this.documents = docs;
        this.loading = false;
      },
      error: () => {
        this.loading = false;
      },
    });
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input?.files?.[0];
    if (!file || !this.data.claimId) return;

    this.uploading = true;
    this.docSvc.upload(this.data.claimId, file, this.uploadDocType).subscribe({
      next: doc => {
        this.documents = [doc, ...this.documents];
        this.uploading = false;
        this.snack.open('Document uploaded', 'OK', { duration: 2000 });
        input.value = '';
      },
      error: () => {
        this.uploading = false;
        this.snack.open('Upload failed', 'OK', { duration: 3000 });
        input.value = '';
      },
    });
  }

  preview(doc: ClaimDocument): void {
    this.docSvc.downloadBlob(doc.id).subscribe({
      next: blob => {
        if (this._previewObjectUrl) URL.revokeObjectURL(this._previewObjectUrl);
        this._previewObjectUrl = URL.createObjectURL(blob);
        this.previewUrl = this.sanitizer.bypassSecurityTrustResourceUrl(this._previewObjectUrl);
        this.previewDoc = doc;
      },
      error: () => this.snack.open('Unable to preview document', 'OK', { duration: 3000 }),
    });
  }

  closePreview(): void {
    if (this._previewObjectUrl) {
      URL.revokeObjectURL(this._previewObjectUrl);
      this._previewObjectUrl = null;
    }
    this.previewUrl = null;
    this.previewDoc = null;
  }

  download(doc: ClaimDocument): void {
    this.docSvc.downloadBlob(doc.id).subscribe({
      next: blob => {
        const objectUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = objectUrl;
        a.download = doc.file_name;
        a.click();
        URL.revokeObjectURL(objectUrl);
      },
      error: () => this.snack.open('Download failed', 'OK', { duration: 3000 }),
    });
  }

  deleteDoc(doc: ClaimDocument): void {
    if (!confirm(`Delete "${doc.file_name}"?`)) return;
    this.docSvc.remove(doc.id).subscribe({
      next: () => {
        this.documents = this.documents.filter(d => d.id !== doc.id);
        if (this.previewDoc?.id === doc.id) {
          this.closePreview();
        }
        this.snack.open('Document deleted', 'OK', { duration: 2000 });
      },
      error: () => {
        this.snack.open('Delete failed', 'OK', { duration: 3000 });
      },
    });
  }

  formatSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  docTypeLabel(dt: string): string {
    const map: Record<string, string> = {
      eob: 'EOB',
      'claim-form': 'Claim Form',
      appeal: 'Appeal Letter',
      correspondence: 'Correspondence',
      other: 'Other',
    };
    return map[dt] || dt;
  }

  iconForType(contentType: string): string {
    if (contentType === 'application/pdf') return 'picture_as_pdf';
    if (contentType.startsWith('image/')) return 'image';
    return 'description';
  }

  ngOnDestroy(): void {
    if (this._previewObjectUrl) URL.revokeObjectURL(this._previewObjectUrl);
  }

  onClose(): void {
    this.dialogRef.close();
  }
}
