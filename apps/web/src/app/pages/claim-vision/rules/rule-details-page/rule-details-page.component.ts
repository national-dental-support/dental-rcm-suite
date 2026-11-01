// src/app/pages/claim-vision/rules/rule-details-page/rule-details-page.component.ts

import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Rule, RuleDraft } from '../../../../core/models/rules.model';
import { combineLatest, map, pipe, Subject, Subscription, switchMap, takeUntil } from 'rxjs';
import { RulesStoreService } from '../../../../core/stores/rules.store.service';
import { ClaimVisionService } from '../../../../core/services/claim-vision.service';


interface RuleHistoryItem {
  date: string;
  action: string;
  by: string;
}

@Component({
    selector: 'rp-rule-details-page',
    templateUrl: './rule-details-page.component.html',
    styleUrls: ['./rule-details-page.component.scss'],
    standalone: false
})
export class RuleDetailsPageComponent implements OnInit {
  rule: Rule | null = null;
  private destroy$ = new Subject<void>();

  // ----- metrics shown in "Rule Performance" cards -----
  impactedLast12Months = 0;
  impactedAllTime = 0;

  // ----- history table -----
  history: RuleHistoryItem[] = [];
  editMode = false;
  saving = false;
  private sub = new Subscription();

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private rulesStore: RulesStoreService,
    private claimVisionService: ClaimVisionService
  ) {}

   ngOnInit(): void {
    // Ensure store is populated (custom + system)
    this.rulesStore.loadAll();

    const ruleSub = this.route.paramMap
      .pipe(
        map((params) => params.get('id')),
        // whenever id changes, re-evaluate against BOTH streams
        switchMap((id) =>
          combineLatest([
            this.rulesStore.customRules$,
            this.rulesStore.systemRules$,
          ]).pipe(
            map(([customRules, systemRules]) => {
              const all = [
                ...(customRules || []),
                ...(systemRules || []),
              ];
              return all.find((r) => r.id === id) ?? null;
            })
          )
        )
      )
      .subscribe((rule) => {
        this.rule = rule;
        this.editMode = false;

        if (this.rule) {
          //  recompute metrics + history whenever rule changes
          this.history = this.buildHistory(this.rule);
          this.impactedLast12Months = this.rule.claimsImpacted ?? 0;
          this.impactedAllTime = this.rule.claimsImpacted ?? 0;
        } else {
          this.history = [];
          this.impactedLast12Months = 0;
          this.impactedAllTime = 0;
        }
      });

    this.sub.add(ruleSub);
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

    /** Called from the "Edit rule" button */
  scrollToEditor(): void {
    this.editMode = true; //  flip into edit mode

    // then scroll to editor
    setTimeout(() => {
      const el = document.getElementById('rule-editor');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 0);
  }

  goBack(): void {
    this.router.navigate(['/app/claim-vision/rules']);
  }

  goToInsightFlow(): void {
    const params = this.rule?.category ? { queryParams: { ruleCategory: this.rule.category } } : {};
    this.router.navigate(['/app/insightflow/view/denials'], params);
  }

  exportClaims(): void {
    if (!this.rule) return;
    this.claimVisionService.getRejectedClaimsDetail('', this.rule.id).subscribe(claims => {
      if (!claims.length) return;
      const header = 'Claim ID,Patient,Payer,Submitted Date,Status,Rejection Message\n';
      const rows = claims.map(c =>
        `"${c.id ?? ''}","${c.patient ?? ''}","${c.payer ?? ''}","${c.submittedDate ?? ''}","${c.status ?? ''}","${(c.rejectionMessage ?? '').replace(/"/g, '""')}"`
      ).join('\n');
      const blob = new Blob([header + rows], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `rule-claims-${this.rule?.id ?? 'export'}.csv`;
      a.click(); URL.revokeObjectURL(url);
    });
  }

  exportHistory(): void {
    if (!this.history.length) return;
    const header = 'Date,Action,Performed By\n';
    const rows = this.history.map(h => `"${h.date}","${h.action}","${h.by}"`).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `rule-history-${this.rule?.id ?? 'export'}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  onSave(draft: RuleDraft): void {
    if (!this.rule || this.saving) return;
    this.saving = true;

    this.claimVisionService.updateRule(this.rule.id, draft).subscribe({
      next: () => {
        this.rulesStore.loadAll();
        this.editMode = false;
        this.saving = false;
        this.goBack();
      },
      error: (err) => {
        console.error('Failed to update rule', err);
        this.saving = false;
      },
    });
  }

  private buildModifiedLabel(previous: string): string {
    const now = new Date();
    const dateLabel = now.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

    const parts = previous?.split('\n') ?? [];
    const who = parts[1] || 'You';

    return `${dateLabel}\n${who}`;
  }

  private buildHistory(rule: Rule): RuleHistoryItem[] {
    const items: RuleHistoryItem[] = [];

    // Created row from createdLabel (e.g. "Mar 10, 2025\nSystem")
    if (rule.createdLabel) {
      const [createdDate, createdBy] = rule.createdLabel.split('\n');
      items.push({
        date: createdDate || '\u2014',
        action: 'Rule created',
        by: createdBy || '\u2014',
      });
    }

    // Modified row (if any)
    if (rule.modifiedLabel && rule.modifiedLabel !== '\u2014') {
      const [modifiedDate, modifiedBy] = rule.modifiedLabel.split('\n');
      items.push({
        date: modifiedDate || '\u2014',
        action: 'Rule updated',
        by: modifiedBy || '\u2014',
      });
    }

    return items;
  }

   /** Handle Cancel/Back from editor */
  onEditorCancel(): void {
    if (this.editMode) {
      // if we were editing, just flip back to view mode
      this.editMode = false;
    } else {
      // in pure view mode, behave like Back
      this.goBack();
    }
  }
}
