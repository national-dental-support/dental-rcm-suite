import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  Input,
  OnInit,
} from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { environment } from '../../../../../../environments/environment';

interface TrendEntry { month: string; deniedCount: number; }
interface PayerEntry  { payerName: string; deniedCount: number; }

interface ClaimContext {
  reasonCode: string;
  denialCount90d: number;
  totalClaims90d: number;
  denialRate90d: number;
  trend: TrendEntry[];
  topPayers: PayerEntry[];
}

@Component({
    selector: 'app-insightflow-panel',
    templateUrl: './insightflow-panel.component.html',
    styleUrls: ['./insightflow-panel.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class InsightflowPanelComponent implements OnInit {
  @Input() reasonCode!: string;

  data: ClaimContext | null = null;
  loading = true;
  error = false;
  notSubscribed = false;

  private readonly base = environment.server.baseUrl;

  constructor(private http: HttpClient, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    if (!this.reasonCode) {
      this.loading = false;
      this.cdr.markForCheck();
      return;
    }
    this.http
      .get<ClaimContext>(`${this.base}/insightflow/claim-context/${encodeURIComponent(this.reasonCode)}`)
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
