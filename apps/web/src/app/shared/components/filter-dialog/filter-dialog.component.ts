import {
  Component, Input, Output, EventEmitter, OnInit, Optional, Inject, ViewEncapsulation,
  ChangeDetectionStrategy
} from '@angular/core';
import { FormBuilder, FormGroup, FormControl } from '@angular/forms';
import { of, from, isObservable } from 'rxjs';
import { take } from 'rxjs/operators';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import {
  FilterField, SelectField, FilterDialogConfig, FilterDialogResult
} from '../../../core/models/filter-dialog.model';
import { MatSelectChange } from '@angular/material/select';

@Component({
    selector: 'app-filter-dialog',
    templateUrl: './filter-dialog.component.html',
    styleUrls: ['./filter-dialog.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    encapsulation: ViewEncapsulation.None,
    standalone: false
})
export class FilterDialogComponent implements OnInit {
  @Input() config?: FilterDialogConfig;
  @Input() fields: FilterField[] = [];
  @Input() initial: Record<string, any> = {};
  @Input() title = 'Filters';
  @Input() gridColumns = 12;
  @Input() form?: FormGroup;

  @Output() applied = new EventEmitter<FilterDialogResult>();
  @Output() cancelled = new EventEmitter<void>();
  ALL = '__ALL__';
  labels = { apply: 'Apply', cancel: 'Cancel', reset: 'Reset' };

  constructor(
    private fb: FormBuilder,
    @Optional() private dialogRef: MatDialogRef<FilterDialogComponent> | null,
    @Optional() @Inject(MAT_DIALOG_DATA) private data: FilterDialogConfig | null
  ) {}

  ngOnInit(): void {
    const incoming: Partial<FilterDialogConfig> = { ...(this.config ?? {}), ...(this.data ?? {}) };
    this.fields      = (incoming.fields?.length ? incoming.fields : this.fields) ?? [];
    this.title       = incoming.title ?? this.title;
    this.labels      = { ...this.labels, ...(incoming.labels || {}) };
    this.initial     = incoming.initial ?? this.initial ?? {};
    this.gridColumns = incoming.gridColumns ?? this.gridColumns;

    if (!this.form) this.form = this.fb.group({});
    this.ensureFormMatchesFields(); // no async work here -> opens fast
  }

  // ---------- grid helpers ----------
gridCols = this.data?.gridColumns ?? 12;
spanClass(f: any) { return `span-${f?.span ?? 4}`; }

  // ---------- form building ----------
  private toMultiArray(v: any): any[] {
    if (v == null) return [];
    return Array.isArray(v) ? v : [v];
  }
  private normalizeMultiInitial(v: any): any[] {
    const arr = this.toMultiArray(v);
    return arr.length ? arr : ['all']; // default to ALL
  }

  private ensureFormMatchesFields() {
    for (const f of this.fields) {
      const existing = this.form!.get(f.key);

      switch (f.type) {
        case 'date-range': {
          if (!existing || !(existing instanceof FormGroup)) {
            this.form!.setControl(
              f.key,
              this.fb.group({
                start: [this.initial?.[f.key]?.start ?? null],
                end:   [this.initial?.[f.key]?.end   ?? null],
              })
            );
          }
          break;
        }

        case 'number-range': {
          if (!existing || !(existing instanceof FormGroup)) {
            this.form!.setControl(
              f.key,
              this.fb.group({
                min: [this.initial?.[f.key]?.min ?? null],
                max: [this.initial?.[f.key]?.max ?? null],
              })
            );
          }
          break;
        }

        case 'select':
        case 'multiselect': {
          const init = f.type === 'multiselect'
            ? this.normalizeMultiInitial(this.initial?.[f.key])
            : (this.initial?.[f.key] ?? null);
          if (!existing) this.form!.addControl(f.key, new FormControl(init));
          break;
        }

        case 'boolean':
        case 'checkbox': {
          if (!existing) this.form!.addControl(f.key, new FormControl(!!this.initial?.[f.key]));
          break;
        }

        default: {
          if (!existing) this.form!.addControl(f.key, new FormControl(this.initial?.[f.key] ?? null));
          break;
        }
      }
    }
  }

  // ---------- options loader ----------
  getOptions(f: FilterField) {
    const sf = f as SelectField<any>;
    const src: any = (sf && sf.options);
    if (Array.isArray(src)) return of(src);
    const out = typeof src === 'function' ? src() : src;
    if (Array.isArray(out)) return of(out);
    if (isObservable(out)) return out;
    return from(Promise.resolve(out));
  }

  // ---------- multiselect behavior ----------
  onSelectChange(f: FilterField, value: any) {
    if (f.type !== 'multiselect') return;
    const ctrl = this.form?.get(f.key); if (!ctrl) return;
    const selected = this.toMultiArray(value);
    // If "All" + specifics -> drop "All"
    if (selected.includes('all') && selected.length > 1) {
      ctrl.setValue(selected.filter(v => v !== 'all'));
    }
  }

  onAllOptionToggled(f: FilterField, selected: boolean) {
    if (f.type !== 'multiselect') return;
    const ctrl = this.form?.get(f.key); if (!ctrl) return;

    // Enforce All when there are no concrete options
    this.getOptions(f).pipe(take(1)).subscribe(list => {
      const count = Array.isArray(list) ? list.length : 0;
      if (count === 0) {
        ctrl.setValue(['all'], { emitEvent: false });
        return;
      }
      if (selected) ctrl.setValue(['all']);
      else {
        const cur = this.toMultiArray(ctrl.value);
        if (cur.includes('all')) ctrl.setValue([]);
      }
    });
  }

  // ---------- actions ----------
  reset() {
    this.form?.reset();
    if (this.dialogRef) this.dialogRef.close('reset' as any);
  }
  cancel() {
    if (this.dialogRef) this.dialogRef.close(undefined);
    else this.cancelled.emit();
  }
  apply() {
    const result: FilterDialogResult = { values: this.form!.getRawValue() };
    if (this.dialogRef) this.dialogRef.close(result);
    else this.applied.emit(result);
  }

  // ---------- trackBys ----------
  trackByKey = (_: number, f: FilterField) => f.key;
  trackByOpt = (_: number, opt: any) => (opt ? (opt.value ?? opt) : null);

  onDateStartChange(key: string, value: Date | null): void {
  const g = this.form?.get(key) as FormGroup | null;
  g?.get('start')?.setValue(value);
  g?.markAsDirty();
}

onDateEndChange(key: string, value: Date | null): void {
  const g = this.form?.get(key) as FormGroup | null;
  g?.get('end')?.setValue(value);
  g?.markAsDirty();
}

isAllSelected(key: string): boolean {
  const v = this.form.get(key)?.value;
  return !Array.isArray(v) || v.length === 0;
}

onMultiChange(key: string, ev: MatSelectChange): void {
  const ctrl = this.form.get(key);
  if (!ctrl) return;

  // Normalize to array
  const raw = Array.isArray(ev.value) ? ev.value : (ev.value == null ? [] : [ev.value]);

  // If the "All" option was clicked, force empty array and stop
  if (raw.includes(this.ALL)) {
    if (!this.isAllSelected(key)) {
      ctrl.setValue([], { emitEvent: false });
    }
    ev.source.close(); // optional: collapses the panel for immediate feedback
    return;
  }

  // Remove sentinel and dedupe
  const next = Array.from(new Set(raw.filter(v => v !== this.ALL)));

  // Only update if changed; never re-emit to avoid loops
  const cur = (ctrl.value as any[]) ?? [];
  if (!this.arrEq(cur, next)) {
    ctrl.setValue(next, { emitEvent: false });
  }
}

private arrEq(a: any[], b: any[]): boolean {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
}
