import { Component, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { RuleDraft } from '../../../../core/models/rules.model';
import { ClaimVisionService } from '../../../../core/services/claim-vision.service';
import { RulesStoreService } from '../../../../core/stores/rules.store.service';

interface SimResult {
  matchCount: number;
  sampleClaims: { id: string; patient: string; payer: string; status: string; dos: string; charged: string }[];
}

@Component({
    selector: 'rp-rule-create-page',
    templateUrl: './rule-create-page.component.html',
    styleUrls: ['./rule-create-page.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class RuleCreatePageComponent {
  saving = false;
  simulating = false;
  simResult: SimResult | null = null;
  simError: string | null = null;

  constructor(
    private router: Router,
    private claimVisionService: ClaimVisionService,
    private rulesStore: RulesStoreService,
    private cdr: ChangeDetectorRef,
  ) {}

  onSave(draft: RuleDraft): void {
    if (this.saving) return;
    this.saving = true;

    this.claimVisionService.createRule(draft).subscribe({
      next: () => {
        this.rulesStore.loadAll(true);
        this.goBack();
      },
      error: (err) => {
        console.error('Failed to create rule', err);
        this.saving = false;
        this.cdr.markForCheck();
      },
    });
  }

  onSimulate(draft: RuleDraft): void {
    if (this.simulating) return;
    this.simulating = true;
    this.simResult = null;
    this.simError = null;
    this.cdr.markForCheck();

    this.claimVisionService.simulateRule(draft).subscribe({
      next: (res) => {
        this.simResult = res as SimResult;
        this.simulating = false;
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.simError = err?.error?.message ?? 'Simulation failed';
        this.simulating = false;
        this.cdr.markForCheck();
      },
    });
  }

  onCancel(): void {
    this.goBack();
  }

  goBack(): void {
    this.router.navigate(['/app/claim-vision/rules']);
  }
}
