import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  SimpleChanges,
} from '@angular/core';
import { FormBuilder, FormControl, FormGroup } from '@angular/forms';
import { Subject, debounceTime, takeUntil } from 'rxjs';
import { DateRangeValue, FilterField, FilterFormConfig } from './filter-form.models';
import { FloatLabelType } from '@angular/material/form-field';

type FilterMode = 'search' | 'form' | 'both';

@Component({
    selector: 'app-rp-filter-form',
    templateUrl: './recon-iq-filter-dialog.component.html',
    styleUrls: ['./recon-iq-filter-dialog.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class ReconIQFilterComponent<TFilters extends Record<string, any> = any>
  implements OnInit, OnChanges, OnDestroy
{
  /** Existing */
  @Input() config!: FilterFormConfig<TFilters>;
  @Input() initialFilters: TFilters | null = null;
  @Input() value: Partial<TFilters> | null = null;
  @Output() filtersChange = new EventEmitter<TFilters>();
  @Output() reset = new EventEmitter<void>();

  /** [ok] NEW: reusable search */
  @Input() mode: FilterMode = 'form';               // 'search' | 'form' | 'both'
  @Input() enableSearch = false;                    // gate the UI + outputs
  @Input() searchLabel = 'Search';
  @Input() searchPlaceholder = 'Search...';
  @Input() searchDebounceMs = 250;

  // two-way friendly
  @Input() searchValue = '';
  @Output() searchValueChange = new EventEmitter<string>();

  // optional extra event (nice for non banana usage)
  @Output() searchChange = new EventEmitter<string>();

  readonly searchCtrl = new FormControl<string>('', { nonNullable: true });

  form!: FormGroup;
  floatLabel: FloatLabelType = 'always';

  private readonly destroy$ = new Subject<void>();
  private readonly rebuild$ = new Subject<void>();
  private didInitialEmit = false;

  constructor(private fb: FormBuilder, private cdr:ChangeDetectorRef) {}

  ngOnInit(): void {
    // [ok] Search stream (independent of form)
    this.searchCtrl.valueChanges
      .pipe(debounceTime(this.searchDebounceMs), takeUntil(this.destroy$))
      .subscribe((v) => {
        const next = (v ?? '').toString();
        this.searchValue = next;
        this.searchValueChange.emit(next);
        this.searchChange.emit(next);
      });

    // seed initial search value
    if (this.enableSearch) {
      this.searchCtrl.setValue(this.searchValue ?? '', { emitEvent: false });
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    // [ok] keep searchCtrl synced when parent sets searchValue programmatically
    if (this.enableSearch && changes['searchValue'] && !changes['searchValue'].firstChange) {
      const next = (this.searchValue ?? '').toString();
      if (this.searchCtrl.value !== next) {
        this.searchCtrl.setValue(next, { emitEvent: false });
      }
    }

    const shouldRenderForm = this.mode === 'form' || this.mode === 'both';
  if (!shouldRenderForm) return;
  if (!this.config?.fields?.length) return;

  if (changes['config'] || changes['initialFilters']) {
    const prev = this.form?.getRawValue?.() ?? {};

    this.buildForm();
    this.form.patchValue(prev, { emitEvent: false });

    if (this.initialFilters) {
      this.form.patchValue(this.initialFilters as any, { emitEvent: false });
    }

    this.wireValueChanges();

    if (!this.didInitialEmit) {
      this.didInitialEmit = true;
      this.emitFilters(this.form.getRawValue());
    }
  }

  // [ok] NEW: external value drives the UI
    if (changes['value'] && this.form) {
    this.form.patchValue(this.value ?? {}, { emitEvent: false });
  }
  }

  ngOnDestroy(): void {
    this.rebuild$.next();
    this.rebuild$.complete();

    this.destroy$.next();
    this.destroy$.complete();
  }

  /** [ok] NEW: clear search */
  clearSearch(): void {
    this.searchCtrl.setValue('', { emitEvent: true });
  }

  onReset(): void {
    // reset filter form (if present)
    if (this.form) {
      this.form.reset(this.getResetValues());
      this.emitFilters(this.form.getRawValue());
    }

    // reset search (if enabled)
    if (this.enableSearch) {
      this.searchCtrl.setValue('', { emitEvent: true });
    }

    this.reset.emit();
  }

  private buildForm(): void {
    const group: Record<string, FormControl> = {};

    for (const field of this.config.fields) {
      if (field.type === 'dateRange') {
        group[field.key] = new FormControl<DateRangeValue>(
          this.resolveInitialValue(field),
          field.validators ?? []
        ) as any;
      } else {
        group[field.key] = new FormControl(
          this.resolveInitialValue(field),
          field.validators ?? []
        );
      }
    }

    this.form = this.fb.group(group);
  }

  private wireValueChanges(): void {
    this.rebuild$.next();

    const debounceMs = this.config.debounceMs ?? 200;

    this.form.valueChanges
      .pipe(debounceTime(debounceMs), takeUntil(this.rebuild$), takeUntil(this.destroy$))
      .subscribe((raw) => this.emitFilters(raw));
  }

  private emitFilters(raw: any): void {
    const mapped =
      this.config.mapValue?.(raw, this.initialFilters) ??
      (this.defaultMapValue(raw) as TFilters);

    this.filtersChange.emit(mapped);
  }

  private defaultMapValue(raw: any): TFilters {
    const emptyStringToUndefined = this.config.emptyStringToUndefined ?? true;
    const stripEmptyKeys = this.config.stripEmptyKeys ?? true;

    const out: any = { ...(this.initialFilters ?? {}) };

    for (const field of this.config.fields) {
      let v = raw[field.key];

      if (field.type === 'text' && emptyStringToUndefined && typeof v === 'string') {
        const trimmed = v.trim();
        v = trimmed === '' ? undefined : trimmed;
      }

      out[field.key] = v;
    }

    if (stripEmptyKeys) {
      for (const k of Object.keys(out)) {
        const v = out[k];
        const isEmptyString = typeof v === 'string' && v.trim() === '';
        const isEmptyRange =
          v && typeof v === 'object' && 'from' in v && 'to' in v && !v.from && !v.to;

        if (v === null || v === undefined || isEmptyString || isEmptyRange) {
          delete out[k];
        }
      }
    }

    return out as TFilters;
  }

  private resolveInitialValue(field: FilterField): any {
    const initial = this.initialFilters as any;

    if (field.type === 'dateRange') {
      const existing = initial?.[field.key];
      if (existing && typeof existing === 'object' && 'from' in existing && 'to' in existing) {
        return existing;
      }
      return field.defaultValue ?? { from: null, to: null };
    }

    if (initial && field.key in initial) return initial[field.key];
    return field.defaultValue ?? null;
  }

  private getResetValues(): Record<string, any> {
    const resetValues: Record<string, any> = {};
    for (const field of this.config.fields) {
      resetValues[field.key] =
        field.type === 'dateRange'
          ? { from: null, to: null }
          : null;
    }
    return resetValues;
  }

  // ---------- helpers for template ----------
  get rows(): number[] {
    const maxRow = Math.max(...this.config.fields.map((f) => f.row ?? 0), 0);
    return Array.from({ length: maxRow + 1 }, (_, i) => i);
  }

  fieldsForRow(row: number): FilterField[] {
    return this.config.fields.filter((f) => (f.row ?? 0) === row);
  }

  get showSearch(): boolean {
    return this.enableSearch && (this.mode === 'search' || this.mode === 'both');
  }

  get showForm(): boolean {
    return this.mode === 'form' || this.mode === 'both';
  }

  getDateRangeValue(key: string): DateRangeValue {
    const v = this.form.get(key)?.value as DateRangeValue | null;
    return v ?? { from: null, to: null };
  }

  setDateRangePart(key: string, part: 'from' | 'to', value: Date | null): void {
    const current = this.getDateRangeValue(key);
    const next: DateRangeValue = { ...current, [part]: value };
    this.form.get(key)?.setValue(next);
    this.form.get(key)?.markAsDirty();
    this.form.get(key)?.markAsTouched();
  }
}
