import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnInit,
} from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { MatSnackBar } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';

export interface LocationMapping {
  id: number;
  entityType: 'practice' | 'location';
  orgId: number;
  orgName: string;
  reconKey: string;
  isActive: boolean;
  updatedAt: string;
}

export interface MappingSuggestions {
  orgLocations:      { id: number; name: string }[];
  orgPractices:      { id: number; name: string }[];
  reconLocationKeys: string[];
  reconPracticeKeys: string[];
}

@Component({
    selector: 'app-location-mappings',
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
    <div class="lm-container">
    
      <!-- Unmapped warning -->
      @if (unmapped.length) {
        <div class="lm-warning">
          <mat-icon>warning</mat-icon>
          <span>
            {{ unmapped.length }} org {{ unmapped.length === 1 ? 'entry has' : 'entries have' }}
            no active mapping \u2014 filter selections for these names will not match any data.
          </span>
        </div>
      }
    
      <!-- Add mapping form -->
      <mat-card class="lm-add-card">
        <mat-card-header>
          <mat-card-title>Add Mapping</mat-card-title>
          <mat-card-subtitle>Connect an org hierarchy name to its raw PMS value in transaction data.</mat-card-subtitle>
        </mat-card-header>
        <mat-card-content>
          <form [formGroup]="addForm" class="lm-form" (ngSubmit)="save()">
            <mat-form-field appearance="outline" class="lm-field">
              <mat-label>Type</mat-label>
              <mat-select formControlName="entityType" (selectionChange)="onTypeChange()">
                <mat-option value="practice">Practice</mat-option>
                <mat-option value="location">Location</mat-option>
              </mat-select>
            </mat-form-field>
    
            <mat-form-field appearance="outline" class="lm-field">
              <mat-label>Display Name (Org Hierarchy)</mat-label>
              <mat-select formControlName="orgId">
                @for (opt of orgOptions; track opt) {
                  <mat-option
                    [value]="opt.id">
                    {{ opt.name }}
                  </mat-option>
                }
              </mat-select>
              <mat-hint>Name shown in the global filter dropdown</mat-hint>
            </mat-form-field>
    
            <mat-form-field appearance="outline" class="lm-field">
              <mat-label>Maps To (PMS Value)</mat-label>
              <mat-select formControlName="reconKey">
                @for (key of reconKeyOptions; track key) {
                  <mat-option
                    [value]="key">
                    {{ key }}
                  </mat-option>
                }
              </mat-select>
              <mat-hint>Value as it appears in transaction data</mat-hint>
            </mat-form-field>
    
            <button mat-flat-button color="primary" type="submit"
              [disabled]="addForm.invalid || saving">
              <mat-icon>add</mat-icon>
              Add Mapping
            </button>
          </form>
        </mat-card-content>
      </mat-card>
    
      <!-- Mappings table -->
      <div class="lm-table-wrap">
        @if (loading) {
          <div class="lm-loading">
            <mat-spinner diameter="32"></mat-spinner>
          </div>
        }
    
        @if (!loading) {
          <table mat-table [dataSource]="mappings" class="lm-table">
            <ng-container matColumnDef="entityType">
              <th mat-header-cell *matHeaderCellDef>Type</th>
              <td mat-cell *matCellDef="let row">
                <span class="lm-badge" [class.lm-badge--practice]="row.entityType === 'practice'"
                  [class.lm-badge--location]="row.entityType === 'location'">
                  {{ row.entityType }}
                </span>
              </td>
            </ng-container>
            <ng-container matColumnDef="orgName">
              <th mat-header-cell *matHeaderCellDef>Display Name</th>
              <td mat-cell *matCellDef="let row">{{ row.orgName }}</td>
            </ng-container>
            <ng-container matColumnDef="reconKey">
              <th mat-header-cell *matHeaderCellDef>Maps To (PMS Value)</th>
              <td mat-cell *matCellDef="let row">
                @if (editingId !== row.id) {
                  <code class="lm-code">{{ row.reconKey }}</code>
                }
                @if (editingId === row.id) {
                  <mat-form-field appearance="outline" class="lm-inline-field">
                    <mat-select [(ngModel)]="editReconKey">
                      @for (key of getReconKeyOptionsFor(row.entityType); track key) {
                        <mat-option
                          [value]="key">
                          {{ key }}
                        </mat-option>
                      }
                    </mat-select>
                  </mat-form-field>
                }
              </td>
            </ng-container>
            <ng-container matColumnDef="isActive">
              <th mat-header-cell *matHeaderCellDef>Active</th>
              <td mat-cell *matCellDef="let row">
                <mat-checkbox
                  [checked]="row.isActive"
                  (change)="toggleActive(row, $event.checked)">
                </mat-checkbox>
              </td>
            </ng-container>
            <ng-container matColumnDef="actions">
              <th mat-header-cell *matHeaderCellDef></th>
              <td mat-cell *matCellDef="let row">
                @if (editingId !== row.id) {
                  <button mat-icon-button (click)="startEdit(row)" matTooltip="Edit mapping">
                    <mat-icon>edit</mat-icon>
                  </button>
                  <button mat-icon-button color="warn" (click)="deleteMapping(row)" matTooltip="Delete">
                    <mat-icon>delete</mat-icon>
                  </button>
                }
                @if (editingId === row.id) {
                  <button mat-icon-button color="primary" (click)="commitEdit(row)" matTooltip="Save">
                    <mat-icon>check</mat-icon>
                  </button>
                  <button mat-icon-button (click)="cancelEdit()" matTooltip="Cancel">
                    <mat-icon>close</mat-icon>
                  </button>
                }
              </td>
            </ng-container>
            <tr mat-header-row *matHeaderRowDef="cols"></tr>
            <tr mat-row *matRowDef="let row; columns: cols;"
            [class.lm-row-inactive]="!row.isActive"></tr>
          </table>
        }
    
        @if (!loading && !mappings.length) {
          <p class="lm-empty">
            No mappings yet. Add one above.
          </p>
        }
      </div>
    </div>
    `,
    styles: [`
    .lm-container { padding: 16px 0; }

    .lm-warning {
      display: flex; align-items: center; gap: 8px;
      padding: 12px 16px;
      background: #fff3cd; border-left: 4px solid #ff9800;
      border-radius: 4px; margin-bottom: 16px;
      font-size: 13px; color: #5d4037;
    }

    .lm-add-card { margin-bottom: 20px; }

    .lm-form {
      display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-start;
      padding-top: 8px;
    }
    .lm-field { min-width: 200px; flex: 1; }

    .lm-table-wrap { overflow-x: auto; }
    .lm-table { width: 100%; }
    .lm-loading { display: flex; justify-content: center; padding: 24px; }

    .lm-badge {
      display: inline-block; padding: 2px 8px; border-radius: 12px;
      font-size: 11px; font-weight: 500; text-transform: capitalize;
    }
    .lm-badge--practice { background: #e3f2fd; color: #1565c0; }
    .lm-badge--location { background: #e8f5e9; color: #2e7d32; }

    .lm-code {
      background: #f5f5f5; padding: 2px 6px; border-radius: 3px;
      font-size: 12px; font-family: monospace;
    }

    .lm-inline-field { width: 180px; margin-bottom: -1.25em; }

    .lm-row-inactive { opacity: 0.5; }

    .lm-empty { text-align: center; color: #999; padding: 24px; }
  `],
    standalone: false
})
export class LocationMappingsComponent implements OnInit {
  mappings: LocationMapping[] = [];
  suggestions: MappingSuggestions = {
    orgLocations: [], orgPractices: [], reconLocationKeys: [], reconPracticeKeys: [],
  };

  loading = false;
  saving = false;

  editingId: number | null = null;
  editReconKey = '';

  cols = ['entityType', 'orgName', 'reconKey', 'isActive', 'actions'];

  addForm: FormGroup;

  get orgOptions() {
    const type = this.addForm.get('entityType')?.value;
    return type === 'location' ? this.suggestions.orgLocations : this.suggestions.orgPractices;
  }

  get reconKeyOptions() {
    const type = this.addForm.get('entityType')?.value;
    return type === 'location'
      ? this.suggestions.reconLocationKeys
      : this.suggestions.reconPracticeKeys;
  }

  get unmapped(): { name: string; type: string }[] {
    const mapped = new Set(
      this.mappings
        .filter((m) => m.isActive)
        .map((m) => `${m.entityType}:${m.orgId}`)
    );
    const result: { name: string; type: string }[] = [];
    for (const p of this.suggestions.orgPractices) {
      if (!mapped.has(`practice:${p.id}`)) result.push({ name: p.name, type: 'practice' });
    }
    for (const l of this.suggestions.orgLocations) {
      if (!mapped.has(`location:${l.id}`)) result.push({ name: l.name, type: 'location' });
    }
    return result;
  }

  constructor(
    private fb: FormBuilder,
    private http: HttpClient,
    private snack: MatSnackBar,
    private cdr: ChangeDetectorRef,
  ) {
    this.addForm = this.fb.group({
      entityType: ['practice', Validators.required],
      orgId:      [null, Validators.required],
      reconKey:   ['', Validators.required],
    });
  }

  ngOnInit(): void {
    this.load();
  }

  onTypeChange(): void {
    this.addForm.patchValue({ orgId: null, reconKey: '' });
    this.cdr.markForCheck();
  }

  getReconKeyOptionsFor(entityType: 'practice' | 'location'): string[] {
    return entityType === 'location'
      ? this.suggestions.reconLocationKeys
      : this.suggestions.reconPracticeKeys;
  }

  private async load(): Promise<void> {
    this.loading = true;
    this.cdr.markForCheck();
    try {
      const [mappingsRes, suggestionsRes] = await Promise.all([
        firstValueFrom(this.http.get<{ data: LocationMapping[] }>('/api/admin/location-mappings')),
        firstValueFrom(this.http.get<MappingSuggestions>('/api/admin/location-mappings/suggestions')),
      ]);
      this.mappings = mappingsRes.data;
      this.suggestions = suggestionsRes;
    } catch {
      this.snack.open('Failed to load location mappings', 'Dismiss', { duration: 4000 });
    } finally {
      this.loading = false;
      this.cdr.markForCheck();
    }
  }

  async save(): Promise<void> {
    if (this.addForm.invalid) return;
    this.saving = true;
    this.cdr.markForCheck();
    try {
      await firstValueFrom(
        this.http.post('/api/admin/location-mappings', this.addForm.value),
      );
      this.addForm.patchValue({ orgId: null, reconKey: '' });
      this.snack.open('Mapping added', '', { duration: 2500 });
      await this.load();
    } catch (err: any) {
      const msg = err?.error?.message ?? 'Failed to add mapping';
      this.snack.open(msg, 'Dismiss', { duration: 4000 });
    } finally {
      this.saving = false;
      this.cdr.markForCheck();
    }
  }

  startEdit(row: LocationMapping): void {
    this.editingId = row.id;
    this.editReconKey = row.reconKey;
    this.cdr.markForCheck();
  }

  cancelEdit(): void {
    this.editingId = null;
    this.cdr.markForCheck();
  }

  async commitEdit(row: LocationMapping): Promise<void> {
    try {
      await firstValueFrom(
        this.http.patch(`/api/admin/location-mappings/${row.id}`, { reconKey: this.editReconKey }),
      );
      this.snack.open('Mapping updated', '', { duration: 2500 });
      this.editingId = null;
      await this.load();
    } catch (err: any) {
      const msg = err?.error?.message ?? 'Failed to update mapping';
      this.snack.open(msg, 'Dismiss', { duration: 4000 });
    }
  }

  async toggleActive(row: LocationMapping, isActive: boolean): Promise<void> {
    try {
      await firstValueFrom(
        this.http.patch(`/api/admin/location-mappings/${row.id}`, { isActive }),
      );
      row.isActive = isActive;
      this.cdr.markForCheck();
    } catch {
      this.snack.open('Failed to update mapping', 'Dismiss', { duration: 4000 });
    }
  }

  async deleteMapping(row: LocationMapping): Promise<void> {
    if (!confirm(`Delete mapping: "${row.orgName}" \u2192 "${row.reconKey}"?`)) return;
    try {
      await firstValueFrom(this.http.delete(`/api/admin/location-mappings/${row.id}`));
      this.snack.open('Mapping deleted', '', { duration: 2500 });
      await this.load();
    } catch {
      this.snack.open('Failed to delete mapping', 'Dismiss', { duration: 4000 });
    }
  }
}
