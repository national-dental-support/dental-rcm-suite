import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  Input,
  OnInit,
} from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { environment } from '../../../../../../environments/environment';

interface ReconIqSummary {
  matched: boolean;
  eobId?: string;
  eobDate?: string;
  eobType?: string;
  matchedPaymentAmount?: number;
  matchedPaymentDate?: string;
  reconciliationStatus?: string;
  payerName?: string;
}

@Component({
    selector: 'app-recon-iq-panel',
    templateUrl: './recon-iq-panel.component.html',
    styleUrls: ['./recon-iq-panel.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class ReconIqPanelComponent implements OnInit {
  @Input() claimId!: string;

  data: ReconIqSummary | null = null;
  loading = true;
  error = false;
  notSubscribed = false;

  private readonly base = environment.server.baseUrl;

  constructor(private http: HttpClient, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.http
      .get<ReconIqSummary>(`${this.base}/recon-iq/claim-summary/${this.claimId}`)
      .subscribe({
        next: res => {
          this.data = res;
          this.loading = false;
          this.cdr.markForCheck();
        },
        error: (err: HttpErrorResponse) => {
          if (err.status === 403 && err.error?.subscriptionRequired) {
            this.notSubscribed = true;
          } else {
            this.error = true;
          }
          this.loading = false;
          this.cdr.markForCheck();
        },
      });
  }
}
