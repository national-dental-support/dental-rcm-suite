import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  Input,
  OnInit,
} from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { environment } from '../../../../../../environments/environment';

interface RuleEntry {
  ruleId: number;
  ruleName: string;
  description: string;
  category: string;
  rejectedDate: string;
}

interface ClaimVisionSummary {
  rejected: boolean;
  rules: RuleEntry[];
}

@Component({
    selector: 'app-claim-vision-panel',
    templateUrl: './claim-vision-panel.component.html',
    styleUrls: ['./claim-vision-panel.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class ClaimVisionPanelComponent implements OnInit {
  @Input() claimId!: string;

  data: ClaimVisionSummary | null = null;
  loading = true;
  error = false;
  notSubscribed = false;

  private readonly base = environment.server.baseUrl;

  constructor(private http: HttpClient, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.http
      .get<ClaimVisionSummary>(`${this.base}/claim-vision/claim-summary/${this.claimId}`)
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
