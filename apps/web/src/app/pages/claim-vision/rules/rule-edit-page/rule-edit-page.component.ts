import {
  Component,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { Rule, RuleDraft } from '../../../../core/models/rules.model';
import { RulesStoreService } from '../../../../core/stores/rules.store.service';
import { ClaimVisionService } from '../../../../core/services/claim-vision.service';

@Component({
    selector: 'rp-rule-edit-page',
    templateUrl: './rule-edit-page.component.html',
    styleUrls: ['./rule-edit-page.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class RuleEditPageComponent implements OnInit, OnDestroy {
  rule: Rule | null = null;
  saving = false;
  private sub = new Subscription();

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private rulesStore: RulesStoreService,
    private claimVisionService: ClaimVisionService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.goBack();
      return;
    }

    this.rulesStore.loadAll();

    // Find the rule from the store once loaded
    this.sub.add(
      this.rulesStore.customRules$.subscribe((rules) => {
        const found = (rules || []).find((r) => r.id === id);
        if (found) { this.rule = found; this.cdr.markForCheck(); }
      })
    );
    this.sub.add(
      this.rulesStore.systemRules$.subscribe((rules) => {
        const found = (rules || []).find((r) => r.id === id);
        if (found) { this.rule = found; this.cdr.markForCheck(); }
      })
    );
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  onSave(draft: RuleDraft): void {
    if (!this.rule || this.saving) return;
    this.saving = true;

    this.claimVisionService.updateRule(this.rule.id, draft).subscribe({
      next: () => {
        this.rulesStore.loadAll();
        this.goBack();
      },
      error: (err) => {
        console.error('Failed to update rule', err);
        this.saving = false;
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
