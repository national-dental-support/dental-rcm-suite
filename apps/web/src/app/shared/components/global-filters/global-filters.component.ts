import {
  ChangeDetectionStrategy,
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
import { NavigationEnd, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { debounceTime, filter, takeUntil } from 'rxjs/operators';
import { GlobalFilterOptionsService } from '../../../core/services/global-filter-options.service';

import {
  GlobalFilterOptions,
  GlobalFiltersValue,
  LocationScope,
  LocationSelection,
  OrgGroupOption,
} from './global-filters.models';

export type GlobalFiltersForm = FormGroup<{
  startDate: FormControl<Date | null>;
  endDate: FormControl<Date | null>;

  payers: FormControl<string[]>;
  providers: FormControl<string[]>;

  // location scope + selections
  locationScope: FormControl<LocationScope>;
  groups: FormControl<string[]>;
  practices: FormControl<string[]>;
  locations: FormControl<string[]>;
}>;

@Component({
    selector: 'app-global-filters',
    templateUrl: './global-filters.component.html',
    styleUrls: ['./global-filters.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class GlobalFiltersComponent implements OnInit, OnChanges, OnDestroy {
  @Input() options: GlobalFilterOptions | null = null;
  @Input() initialValue: Partial<GlobalFiltersValue> | null = null;
  @Input() isSuperAdmin = false;

  @Output() apply = new EventEmitter<GlobalFiltersValue>();
  @Output() changed = new EventEmitter<GlobalFiltersValue>();

  /**
   * #115 - Provider is only meaningful on ReconIQ Operations Summary (ROS) views.
   * Hide the Provider filter pill on all other routes; also clear any
   * previously-selected providers when navigating away so stale values
   * don't get sent with non-ROS API calls (data validation safeguard).
   */
  showProvider = true;
  private readonly providerRoutePrefixes = ['/recon-iq'];

  readonly filtersForm: GlobalFiltersForm = this.fb.group({
    startDate: this.fb.control<Date | null>(null),
    endDate: this.fb.control<Date | null>(null),

    payers: this.fb.control<string[]>([]),
    providers: this.fb.control<string[]>([]),

    locationScope: this.fb.control<LocationScope>('enterprise'),
    groups: this.fb.control<string[]>([]),
    practices: this.fb.control<string[]>([]),
    locations: this.fb.control<string[]>([]),
  });

  private readonly destroy$ = new Subject<void>();

  /** Refined options from the backend (null = use full @Input options) */
  refinedPractices: string[] | null = null;
  refinedLocations: string[] | null = null;
  refinedPayers: string[] | null = null;
  refinedProviders: string[] | null = null;

  constructor(
    private fb: FormBuilder,
    private filterOptionsSvc: GlobalFilterOptionsService,
    private router: Router,
  ) {}

  private syncProviderVisibility(url: string): void {
    const onRos = this.providerRoutePrefixes.some(p => url.startsWith(p));
    if (onRos === this.showProvider) return;
    this.showProvider = onRos;
    if (!onRos) {
      // Clear any leftover provider selection so the next API call doesn't
      // send a filter dimension the target endpoint can't validate.
      const ctrl = this.filtersForm.controls.providers;
      if ((ctrl.value ?? []).length) {
        ctrl.setValue([], { emitEvent: false });
      }
    }
  }

  /** Practices derived from selected groups (cascading). Null = use flat list. */
  cascadedPractices: string[] | null = null;
  /** Locations derived from selected groups' practices (cascading). Null = use flat list. */
  cascadedLocations: string[] | null = null;

  ngOnInit(): void {
    if (this.initialValue) this.patchFromInitial(this.initialValue);

    // #115 - Track route changes to show/hide the Provider filter
    this.syncProviderVisibility(this.router.url);
    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntil(this.destroy$),
      )
      .subscribe((e) => this.syncProviderVisibility(e.urlAfterRedirects));

    // Cascade: when groups selection changes, derive practices & locations
    this.filtersForm.controls.groups.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe((selectedGroups) => this.onGroupsChanged(selectedGroups ?? []));

    // emit changed (optional)
    this.filtersForm.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.changed.emit(this.value));

    // Refine dropdown options whenever any selection changes
    this.filtersForm.valueChanges
      .pipe(debounceTime(300), takeUntil(this.destroy$))
      .subscribe(() => this.refreshRefinedOptions());
  }

  private refreshRefinedOptions(): void {
    const v = this.filtersForm.getRawValue();
    const hasAny = (v.practices?.length || v.locations?.length || v.payers?.length || v.providers?.length);
    if (!hasAny) {
      // No active filters - clear refinements, use full option lists
      this.refinedPractices = null;
      this.refinedLocations = null;
      this.refinedPayers = null;
      this.refinedProviders = null;
      return;
    }
    this.filterOptionsSvc.getRefinedOptions({
      practices: v.practices ?? [],
      locations: v.locations ?? [],
      payers: v.payers ?? [],
      providers: v.providers ?? [],
    }).subscribe(refined => {
      this.refinedPractices = refined.practices;
      this.refinedLocations = refined.locations;
      this.refinedPayers = refined.payers;
      this.refinedProviders = refined.providers;
    });
  }

  private onGroupsChanged(selectedGroupNames: string[]): void {
    const groupsData = this.options?.groupsData;
    if (!groupsData || !groupsData.length || !selectedGroupNames.length) {
      this.cascadedPractices = null;
      this.cascadedLocations = null;
      return;
    }

    const matchedGroups = groupsData.filter(g => selectedGroupNames.includes(g.name));
    const locations: string[] = [];

    for (const group of matchedGroups) {
      for (const loc of (group.locations || [])) {
        if (!locations.includes(loc.name)) {
          locations.push(loc.name);
        }
      }
    }

    this.cascadedPractices = null;
    this.cascadedLocations = locations.sort();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['initialValue'] && this.initialValue) {
      this.patchFromInitial(this.initialValue);
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // -------------------------
  // Value mapping
  // -------------------------
  get value(): GlobalFiltersValue {
    const v = this.filtersForm.getRawValue();

    const location: LocationSelection =
      v.locationScope === 'enterprise'
        ? { scope: 'enterprise' }
        : v.locationScope === 'group'
          ? { scope: 'group', groups: v.groups ?? [] }
          : v.locationScope === 'practice'
            ? { scope: 'practice', practices: v.practices ?? [] }
            : { scope: 'location', locations: v.locations ?? [] };

    return {
      startDate: v.startDate,
      endDate: v.endDate,
      payers: v.payers ?? [],
      providers: v.providers ?? [],
      location,
    };
  }

  private patchFromInitial(initial: Partial<GlobalFiltersValue>): void {
    const scope: LocationScope = initial.location?.scope ?? 'enterprise';

    const groups = initial.location?.scope === 'group' ? initial.location.groups ?? [] : [];
    const practices = initial.location?.scope === 'practice' ? initial.location.practices ?? [] : [];
    const locations = initial.location?.scope === 'location' ? initial.location.locations ?? [] : [];

    this.filtersForm.patchValue(
      {
        startDate: initial.startDate ?? null,
        endDate: initial.endDate ?? null,

        payers: initial.payers ?? [],
        providers: initial.providers ?? [],

        locationScope: scope,
        groups,
        practices,
        locations,
      },
      { emitEvent: false }
    );
  }

  // -------------------------
  // Pill labels
  // -------------------------
  get dateRangeLabel(): string {
    const s = this.filtersForm.controls.startDate.value;
    const e = this.filtersForm.controls.endDate.value;
    if (!s && !e) return 'All';
    const ss = s ? s.toLocaleDateString() : '\u2026';
    const ee = e ? e.toLocaleDateString() : '\u2026';
    return `${ss} \u2013 ${ee}`;
  }

  get payerLabel(): string {
    return this.formatStringArrayLabel(this.filtersForm.controls.payers.value);
  }

  get providerLabel(): string {
    return this.formatStringArrayLabel(this.filtersForm.controls.providers.value);
  }

  get locationLabel(): string {
    const scope = this.filtersForm.controls.locationScope.value;
    if (scope === 'enterprise') return 'All';
    if (scope === 'group') return this.formatStringArrayLabel(this.filtersForm.controls.groups.value);
    if (scope === 'practice') return this.formatStringArrayLabel(this.filtersForm.controls.practices.value);
    return this.formatStringArrayLabel(this.filtersForm.controls.locations.value);
  }

  private formatStringArrayLabel(values: string[] | null | undefined): string {
    const v = values ?? [];
    if (!v.length) return 'All';
    if (v.length === 1) return v[0];
    return `${v.length} selected`;
  }

  // -------------------------
  // Checkbox helpers (names only)
  // -------------------------
  isSelected(ctrl: FormControl<string[]>, value: string): boolean {
    return (ctrl.value ?? []).includes(value);
  }

  toggleArrayValue(ctrl: FormControl<string[]>, value: string, checked: boolean): void {
    const current = ctrl.value ?? [];
    const next = checked
      ? Array.from(new Set([...current, value]))
      : current.filter(v => v !== value);

    ctrl.setValue(next);
    ctrl.markAsDirty();
  }

  // -------------------------
  // Select-all helpers (string[] controls)
  // -------------------------
  isAllSelectedStr(ctrl: FormControl<string[]>, options: string[]): boolean {
    const vals = ctrl.value ?? [];
    return options.length > 0 && options.every(o => vals.includes(o));
  }

  isSomeSelectedStr(ctrl: FormControl<string[]>, options: string[]): boolean {
    const vals = ctrl.value ?? [];
    return options.some(o => vals.includes(o)) && !this.isAllSelectedStr(ctrl, options);
  }

  toggleSelectAllStr(ctrl: FormControl<string[]>, options: string[]): void {
    if (this.isAllSelectedStr(ctrl, options)) {
      ctrl.setValue([]);
    } else {
      ctrl.setValue([...options]);
    }
    ctrl.markAsDirty();
  }

  // -------------------------
  // Clear helpers
  // -------------------------
  clearDateRange(): void {
    this.filtersForm.controls.startDate.setValue(null);
    this.filtersForm.controls.endDate.setValue(null);
    this.filtersForm.controls.startDate.markAsDirty();
    this.filtersForm.controls.endDate.markAsDirty();
  }

  clearPayers(): void {
    this.filtersForm.controls.payers.setValue([]);
    this.filtersForm.controls.payers.markAsDirty();
  }

  clearProviders(): void {
    this.filtersForm.controls.providers.setValue([]);
    this.filtersForm.controls.providers.markAsDirty();
  }

  clearLocation(): void {
    const scope = this.filtersForm.controls.locationScope.value;
    if (scope === 'group') this.filtersForm.controls.groups.setValue([]);
    if (scope === 'practice') this.filtersForm.controls.practices.setValue([]);
    if (scope === 'location') this.filtersForm.controls.locations.setValue([]);
    this.filtersForm.markAsDirty();
  }

  // Clear + apply
  clearPayersAndApply(): void {
    this.clearPayers();
    this.applyFilters();
  }

  clearProvidersAndApply(): void {
    this.clearProviders();
    this.applyFilters();
  }

  clearDateRangeAndApply(): void {
    this.clearDateRange();
    this.applyFilters();
  }

  clearLocationAndApply(): void {
    this.clearLocation();
    this.applyFilters();
  }

  onLocationScopeChanged(scope: LocationScope): void {
    this.filtersForm.controls.locationScope.setValue(scope);
    this.filtersForm.controls.locationScope.markAsDirty();
  }

  applyFilters(): void {
    console.warn('Apply clicked with filters', this.value);
    this.apply.emit(this.value);
  }

  // -------------------------
  // Options lists (names only)
  // -------------------------
  get payerOptions(): string[] {
    return this.refinedPayers ?? this.options?.payers ?? [];
  }

  get providerOptions(): string[] {
    return this.refinedProviders ?? this.options?.providers ?? [];
  }

  get groupOptions(): string[] {
    return this.options?.groups ?? [];
  }

  get practiceOptions(): string[] {
    if (this.cascadedPractices !== null) return this.cascadedPractices;
    return this.refinedPractices ?? this.options?.practices ?? [];
  }

  get locationOptions(): string[] {
    if (this.cascadedLocations !== null) return this.cascadedLocations;
    return this.refinedLocations ?? this.options?.locations ?? [];
  }

  // -------------------------
  // Search state
  // -------------------------
  payerSearch    = '';
  providerSearch = '';
  locationSearch = '';
  locationTab: 'group' | 'practice' | 'location' = 'location';

  // -------------------------
  // Filtered options (search-narrowed)
  // -------------------------
  get filteredPayerOptions(): string[] {
    const q = this.payerSearch.trim().toLowerCase();
    return q ? this.payerOptions.filter(p => p.toLowerCase().includes(q)) : this.payerOptions;
  }

  get filteredProviderOptions(): string[] {
    const q = this.providerSearch.trim().toLowerCase();
    return q ? this.providerOptions.filter(p => p.toLowerCase().includes(q)) : this.providerOptions;
  }

  get filteredGroupOptions(): string[] {
    const q = this.locationSearch.trim().toLowerCase();
    return q ? this.groupOptions.filter(g => g.toLowerCase().includes(q)) : this.groupOptions;
  }

  get filteredPracticeOptions(): string[] {
    const q = this.locationSearch.trim().toLowerCase();
    return q ? this.practiceOptions.filter(p => p.toLowerCase().includes(q)) : this.practiceOptions;
  }

  get filteredLocationOptions(): string[] {
    const q = this.locationSearch.trim().toLowerCase();
    return q ? this.locationOptions.filter(l => l.toLowerCase().includes(q)) : this.locationOptions;
  }

  // -------------------------
  // Hierarchical location helpers
  // -------------------------
  get groupsData(): OrgGroupOption[] | undefined {
    return this.options?.groupsData;
  }

  onLocationTabChange(): void {
    const groups = this.filtersForm.controls.groups.value ?? [];
    const practices = this.filtersForm.controls.practices.value ?? [];
    const locations = this.filtersForm.controls.locations.value ?? [];

    if (this.locationTab === 'group') {
      this.filtersForm.controls.locationScope.setValue(groups.length ? 'group' : 'enterprise');
    } else if (this.locationTab === 'practice') {
      this.filtersForm.controls.locationScope.setValue(practices.length ? 'practice' : 'enterprise');
    } else {
      this.filtersForm.controls.locationScope.setValue(locations.length ? 'location' : 'enterprise');
    }
    this.filtersForm.markAsDirty();
    this.applyFilters();
  }

  setLocationScope(scope: LocationScope): void {
    this.filtersForm.controls.locationScope.setValue(scope);
    if (scope === 'enterprise') {
      this.filtersForm.controls.groups.setValue([]);
      this.filtersForm.controls.locations.setValue([]);
    }
    this.filtersForm.markAsDirty();
    this.applyFilters();
  }

  isGroupSelected(groupName: string): boolean {
    const group = this.groupsData?.find(g => g.name === groupName);
    if (!group) return false;
    const allLocs = this.getGroupLocationNames(group);
    const selected = this.filtersForm.controls.locations.value ?? [];
    return allLocs.length > 0 && allLocs.every(l => selected.includes(l));
  }

  isGroupIndeterminate(group: OrgGroupOption): boolean {
    const allLocs = this.getGroupLocationNames(group);
    const selected = this.filtersForm.controls.locations.value ?? [];
    const some = allLocs.some(l => selected.includes(l));
    const all = allLocs.every(l => selected.includes(l));
    return some && !all;
  }

  toggleGroup(group: OrgGroupOption, checked: boolean): void {
    const allLocs = this.getGroupLocationNames(group);
    const current = this.filtersForm.controls.locations.value ?? [];

    let next: string[];
    if (checked) {
      next = Array.from(new Set([...current, ...allLocs]));
    } else {
      next = current.filter(l => !allLocs.includes(l));
    }

    this.filtersForm.controls.locations.setValue(next);
    this.filtersForm.controls.locationScope.setValue(next.length > 0 ? 'location' : 'enterprise');
    this.filtersForm.markAsDirty();
    this.applyFilters();
  }

  toggleLocationInGroup(locName: string, checked: boolean): void {
    this.toggleArrayValue(this.filtersForm.controls.locations, locName, checked);
    const locs = this.filtersForm.controls.locations.value ?? [];
    this.filtersForm.controls.locationScope.setValue(locs.length > 0 ? 'location' : 'enterprise');
    this.applyFilters();
  }

  private getGroupLocationNames(group: OrgGroupOption): string[] {
    const names: string[] = [];
    for (const practice of group.practices || []) {
      for (const loc of practice.locations || []) {
        names.push(loc.name);
      }
    }
    return names;
  }
}
