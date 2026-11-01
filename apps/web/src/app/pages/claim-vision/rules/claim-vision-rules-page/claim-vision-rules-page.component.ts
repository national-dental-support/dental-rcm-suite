import {
  Component,
  ChangeDetectionStrategy,
  OnInit,
  OnDestroy,
  ChangeDetectorRef,
} from '@angular/core';
import { Router } from '@angular/router';
import { Rule } from '../../../../core/models/rules.model';
import { Subscription } from 'rxjs';
import { RulesStoreService } from '../../../../core/stores/rules.store.service';

@Component({
    selector: 'rp-claim-vision-rules-page',
    templateUrl: './claim-vision-rules-page.component.html',
    styleUrls: ['./claim-vision-rules-page.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class ClaimVisionRulesPageComponent implements OnInit, OnDestroy {
  myCustomRules: Rule[] = [];
  systemRules: Rule[] = [];

  private sub = new Subscription();

  constructor(
    private router: Router,
    private rulesStore: RulesStoreService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.rulesStore.loadAll(true);

    this.sub.add(
      this.rulesStore.customRules$.subscribe((rules) => {
        this.myCustomRules = rules || [];
        this.cdr.markForCheck();
      })
    );

    this.sub.add(
      this.rulesStore.systemRules$.subscribe((rules) => {
        this.systemRules = rules || [];
        this.cdr.markForCheck();
      })
    );
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  onNewRule(): void {
    this.router.navigate(['/app/claim-vision/rules/new']);
  }

  onViewDetails(rule: Rule): void {
    this.router.navigate(['/app/claim-vision/rules', rule.id]);
  }

  onDeleteRule(rule: Rule): void {
    this.rulesStore.deleteRule(rule.id);
  }

  onReorderRules(reordered: Rule[]): void {
    this.rulesStore.reorderCustomRules(reordered);
  }
}
