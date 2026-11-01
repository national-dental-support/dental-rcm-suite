// claim-queue-filter.component.ts
import {ChangeDetectionStrategy, Component,
  EventEmitter,
  Input,
  OnChanges,
  OnInit,
  Output,
  SimpleChanges,
} from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { debounceTime } from 'rxjs';
import { ClaimFilterOptions, ClaimQueueFilter } from '../../models/claim.models';

export type QueueType = 'manager' | 'ar-specialist';

@Component({
    selector: 'app-claim-queue-filter',
    templateUrl: './claim-filter-dialog.component.html',
    styleUrls: ['./claim-filter-dialog.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class ClaimFilterDialogComponent implements OnInit, OnChanges {
  @Input() initialFilters: ClaimQueueFilter | null = null;
  @Input() options: ClaimFilterOptions = {
    assignedTo: [], payer: [], billingProvider: [],
    denialReason: [], placeOfService: [], claimStatus: [], escalationReason: [],
  };

  @Output() filtersChange = new EventEmitter<ClaimQueueFilter>();
  @Output() reset = new EventEmitter<void>();

  form!: FormGroup;

  constructor(private fb: FormBuilder) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['initialFilters'] && this.form) {
      const f = this.initialFilters ?? {};
      this.form.patchValue({
        assignedTo:      f.assignedTo      ?? null,
        payer:           f.payer           ?? null,
        billingProvider: f.billingProvider ?? null,
        submittedFrom:   f.submittedFrom   ?? null,
        submittedTo:     f.submittedTo     ?? null,
        denialReason:    f.denialReason    ?? null,
        placeOfService:  f.placeOfService  ?? null,
        claimStatus:     f.claimStatus     ?? null,
        escalationReason: f.escalationReason ?? null,
      }, { emitEvent: false });
    }
  }

  ngOnInit(): void {
    this.form = this.fb.group({
      assignedTo: [this.initialFilters?.assignedTo ?? null],
      payer: [this.initialFilters?.payer ?? null],
      billingProvider: [this.initialFilters?.billingProvider ?? null],

      // Date range for "Submitted" column
      submittedFrom: [this.initialFilters?.submittedFrom ?? null],
      submittedTo: [this.initialFilters?.submittedTo ?? null],

      denialReason: [this.initialFilters?.denialReason ?? null],
      placeOfService: [this.initialFilters?.placeOfService ?? null],
      claimStatus: [this.initialFilters?.claimStatus ?? null],
      escalationReason: [this.initialFilters?.escalationReason ?? null],
    });

    this.form.valueChanges
      .pipe(debounceTime(200))
      .subscribe((raw) => {
        // Shape it explicitly as a ClaimQueueFilter
        const value: ClaimQueueFilter = {
          assignedTo: raw.assignedTo ?? undefined,
          payer: raw.payer ?? undefined,
          billingProvider: raw.billingProvider ?? undefined,
          submittedFrom: raw.submittedFrom ?? null,
          submittedTo: raw.submittedTo ?? null,
          denialReason: raw.denialReason ?? undefined,
          placeOfService: raw.placeOfService ?? undefined,
          claimStatus: raw.claimStatus ?? undefined,
          escalationReason: raw.escalationReason ?? null,
        };

        this.filtersChange.emit(value);
      });
  }

  onReset(): void {
    this.form.reset({
      assignedTo: null,
      payer: null,
      billingProvider: null,
      submittedFrom: null,
      submittedTo: null,
      denialReason: null,
      placeOfService: null,
      claimStatus: null,
      escalationReason: null,
    });

    this.reset.emit();
  }
}
