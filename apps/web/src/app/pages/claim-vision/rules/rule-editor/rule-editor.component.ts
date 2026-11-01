import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  OnChanges,
  SimpleChanges,
} from '@angular/core';
import { FormBuilder, FormGroup, FormArray, Validators } from '@angular/forms';
import {
  Rule,
  RuleCondition,
  RuleAction,
  RuleStatus,
  RuleDraft,
  MatchType,
  RuleScope,
} from '../../../../core/models/rules.model';
import { CatalogService, CatalogType } from '../../../../core/services/catalog.service';
import { LocationsService } from '../../../../core/services/ar-locations.service';
import { MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';

interface RuleFieldOption {
  key: string;
  label: string;
  group: string;
  segment?: string;
}

interface ScopeOption {
  key: RuleScope;
  label: string;
  icon: string;
}

@Component({
    selector: 'rp-rule-editor',
    templateUrl: './rule-editor.component.html',
    styleUrls: ['./rule-editor.component.scss'],
    standalone: false
})
export class RuleEditorComponent implements OnInit, OnChanges {
  @Input() mode: 'view' | 'edit' = 'view';
  @Input() rule?: Rule | null;
  @Output() save = new EventEmitter<RuleDraft>();
  @Output() simulate = new EventEmitter<RuleDraft>();
  @Output() cancel = new EventEmitter<void>();

  form!: FormGroup;

  categories: string[] = [
    'Documentation',
    'Attachments',
    'Coding',
    'Eligibility',
    'Other',
  ];

  availableFields: RuleFieldOption[] = [
    // -- Subscriber (loop 2000B / 2010BA) -----------------------------
    { group: 'Subscriber',       key: 'subscriberName',         label: 'Subscriber Name',                segment: 'NM103' },
    { group: 'Subscriber',       key: 'subscriberFirstName',    label: 'Subscriber First Name',          segment: 'NM104' },
    { group: 'Subscriber',       key: 'subscriberLastName',     label: 'Subscriber Last Name',           segment: 'NM103' },
    { group: 'Subscriber',       key: 'subscriberId',           label: 'Subscriber ID / Member ID',      segment: 'NM109' },
    { group: 'Subscriber',       key: 'subscriberDob',          label: 'Subscriber Date of Birth',       segment: 'DMG02' },
    { group: 'Subscriber',       key: 'subscriberGender',       label: 'Subscriber Gender',              segment: 'DMG03' },
    { group: 'Subscriber',       key: 'subscriberAddress',      label: 'Subscriber Address',             segment: 'N3'    },
    { group: 'Subscriber',       key: 'subscriberCity',         label: 'Subscriber City',                segment: 'N401' },
    { group: 'Subscriber',       key: 'subscriberState',        label: 'Subscriber State',               segment: 'N402' },
    { group: 'Subscriber',       key: 'subscriberZip',          label: 'Subscriber ZIP',                 segment: 'N403' },
    { group: 'Subscriber',       key: 'groupNumber',            label: 'Group Number',                   segment: 'REF~6P' },
    { group: 'Subscriber',       key: 'groupName',              label: 'Group Name',                     segment: 'NM103' },
    { group: 'Subscriber',       key: 'planType',               label: 'Insurance Plan Type',            segment: 'SBR01' },
    { group: 'Subscriber',       key: 'claimFilingIndicator',   label: 'Claim Filing Indicator',         segment: 'SBR09' },
    { group: 'Subscriber',       key: 'patientRelationship',    label: 'Patient Relationship to Subscriber', segment: 'SBR02' },

    // -- Patient (loop 2000C / 2010CA) ---------------------------------
    { group: 'Patient',          key: 'patientFirstName',       label: 'Patient First Name',             segment: 'NM104' },
    { group: 'Patient',          key: 'patientLastName',        label: 'Patient Last Name',              segment: 'NM103' },
    { group: 'Patient',          key: 'patientDob',             label: 'Patient Date of Birth',          segment: 'DMG02' },
    { group: 'Patient',          key: 'patientGender',          label: 'Patient Gender',                 segment: 'DMG03' },
    { group: 'Patient',          key: 'patientAccountNumber',   label: 'Patient Account Number',         segment: 'CLM01' },
    { group: 'Patient',          key: 'patientAddress',         label: 'Patient Address',                segment: 'N3'    },
    { group: 'Patient',          key: 'patientState',           label: 'Patient State',                  segment: 'N402' },
    { group: 'Patient',          key: 'patientZip',             label: 'Patient ZIP',                    segment: 'N403' },

    // -- Payer (loop 2010BB) --------------------------------------------
    { group: 'Payer',            key: 'payerName',              label: 'Payer Name',                     segment: 'NM103' },
    { group: 'Payer',            key: 'payerId',                label: 'Payer ID',                       segment: 'NM109' },
    { group: 'Payer',            key: 'secondaryPayerName',     label: 'Secondary Payer Name',           segment: 'NM103' },
    { group: 'Payer',            key: 'secondaryPayerId',       label: 'Secondary Payer ID',             segment: 'NM109' },
    { group: 'Payer',            key: 'otherInsuranceIndicator',label: 'Other Insurance Indicator',      segment: 'CLM11' },

    // -- Billing Provider (loop 2010AA) --------------------------------
    { group: 'Billing Provider', key: 'billingProviderName',    label: 'Billing Provider Name',          segment: 'NM103' },
    { group: 'Billing Provider', key: 'billingProviderNpi',     label: 'Billing Provider NPI',           segment: 'NM109' },
    { group: 'Billing Provider', key: 'billingProviderTaxId',   label: 'Billing Provider Tax ID (EIN)',  segment: 'REF~EI' },
    { group: 'Billing Provider', key: 'billingProviderTaxonomy',label: 'Billing Provider Taxonomy',      segment: 'PRV03' },
    { group: 'Billing Provider', key: 'billingProviderAddress', label: 'Billing Provider Address',       segment: 'N3'    },
    { group: 'Billing Provider', key: 'billingProviderState',   label: 'Billing Provider State',         segment: 'N402' },

    // -- Rendering / Attending Provider (loop 2310B) -------------------
    { group: 'Rendering Provider', key: 'providerNpi',          label: 'Rendering Provider NPI',         segment: 'NM109' },
    { group: 'Rendering Provider', key: 'renderingProviderName',label: 'Rendering Provider Name',        segment: 'NM103' },
    { group: 'Rendering Provider', key: 'renderingProviderTaxonomy', label: 'Rendering Provider Taxonomy', segment: 'PRV03' },
    { group: 'Rendering Provider', key: 'attendingProviderNpi', label: 'Attending Physician NPI',         segment: 'NM109' },
    { group: 'Rendering Provider', key: 'referringProviderNpi', label: 'Referring Provider NPI',          segment: 'NM109' },
    { group: 'Rendering Provider', key: 'serviceFacilityNpi',   label: 'Service Facility NPI',            segment: 'NM109' },
    { group: 'Rendering Provider', key: 'serviceFacilityName',  label: 'Service Facility Name',           segment: 'NM103' },

    // -- Claim Header (loop 2300) --------------------------------------
    { group: 'Claim',            key: 'claimControlNumber',     label: 'Claim Control Number',           segment: 'CLM01' },
    { group: 'Claim',            key: 'totalChargeAmount',      label: 'Total Charge Amount',            segment: 'CLM02' },
    { group: 'Claim',            key: 'claimStatus',            label: 'Claim Status',                   segment: 'CLM05-3' },
    { group: 'Claim',            key: 'facilityTypeCode',       label: 'Facility Type Code',             segment: 'CLM05-1' },
    { group: 'Claim',            key: 'placeOfService',         label: 'Place of Service',               segment: 'CLM05-1' },
    { group: 'Claim',            key: 'assignmentOfBenefits',   label: 'Assignment of Benefits',         segment: 'CLM07' },
    { group: 'Claim',            key: 'releaseOfInfo',          label: 'Release of Information',         segment: 'CLM08' },
    { group: 'Claim',            key: 'providerSignatureOnFile', label: 'Provider Signature on File',    segment: 'CLM06' },
    { group: 'Claim',            key: 'statementFromDate',      label: 'Statement From Date',            segment: 'DTP~434' },
    { group: 'Claim',            key: 'statementToDate',        label: 'Statement To Date',              segment: 'DTP~434' },
    { group: 'Claim',            key: 'admissionDate',          label: 'Admission Date',                 segment: 'DTP~435' },
    { group: 'Claim',            key: 'dischargeDate',          label: 'Discharge Date',                 segment: 'DTP~096' },
    { group: 'Claim',            key: 'priorAuthNumber',        label: 'Prior Authorization Number',     segment: 'REF~G1' },
    { group: 'Claim',            key: 'referralNumber',         label: 'Referral Number',                segment: 'REF~9F' },
    { group: 'Claim',            key: 'medicalRecordNumber',    label: 'Medical Record Number',          segment: 'REF~EA' },
    { group: 'Claim',            key: 'claimNote',              label: 'Claim Note',                     segment: 'NTE'    },
    { group: 'Claim',            key: 'accidentState',          label: 'Accident State',                 segment: 'CLM14' },
    { group: 'Claim',            key: 'relatedCausesCode',      label: 'Related Causes Code',            segment: 'CLM11' },

    // -- Diagnosis (HI segment) ----------------------------------------
    { group: 'Diagnosis',        key: 'principalDiagnosis',     label: 'Principal Diagnosis (ICD)',      segment: 'HI~ABK' },
    { group: 'Diagnosis',        key: 'admittingDiagnosis',     label: 'Admitting Diagnosis',            segment: 'HI~ABJ' },
    { group: 'Diagnosis',        key: 'diagnosisCode2',         label: 'Diagnosis Code 2',               segment: 'HI~ABF' },
    { group: 'Diagnosis',        key: 'diagnosisCode3',         label: 'Diagnosis Code 3',               segment: 'HI~ABF' },
    { group: 'Diagnosis',        key: 'diagnosisCode4',         label: 'Diagnosis Code 4',               segment: 'HI~ABF' },
    { group: 'Diagnosis',        key: 'externalCauseCode',      label: 'External Cause of Injury Code',  segment: 'HI~NI'  },
    { group: 'Diagnosis',        key: 'drgCode',                label: 'DRG Code',                       segment: 'HI~DR'  },
    { group: 'Diagnosis',        key: 'conditionCode',          label: 'Condition Code',                 segment: 'HI~BG'  },
    { group: 'Diagnosis',        key: 'occurrenceCode',         label: 'Occurrence Code',                segment: 'HI~BH'  },
    { group: 'Diagnosis',        key: 'valueCode',              label: 'Value Code',                     segment: 'HI~BE'  },

    // -- Service Line (loop 2400) --------------------------------------
    { group: 'Service Line',     key: 'procedureCode',          label: 'Procedure Code (CPT/HCPCS)',     segment: 'SV101' },
    { group: 'Service Line',     key: 'modifier1',              label: 'Modifier 1',                     segment: 'SV102' },
    { group: 'Service Line',     key: 'modifier2',              label: 'Modifier 2',                     segment: 'SV103' },
    { group: 'Service Line',     key: 'modifier3',              label: 'Modifier 3',                     segment: 'SV104' },
    { group: 'Service Line',     key: 'modifier4',              label: 'Modifier 4',                     segment: 'SV105' },
    { group: 'Service Line',     key: 'lineChargeAmount',       label: 'Line Item Charge Amount',        segment: 'SV102' },
    { group: 'Service Line',     key: 'serviceUnits',           label: 'Service Units / Quantity',       segment: 'SV104' },
    { group: 'Service Line',     key: 'diagnosisPointer',       label: 'Diagnosis Code Pointer',         segment: 'SV107' },
    { group: 'Service Line',     key: 'revenueCode',            label: 'Revenue Code',                   segment: 'SV201' },
    { group: 'Service Line',     key: 'lineItemDateOfService',  label: 'Date of Service',                segment: 'DTP~472' },
    { group: 'Service Line',     key: 'ndcCode',                label: 'NDC Drug Code',                  segment: 'LIN03' },
    { group: 'Service Line',     key: 'drugName',               label: 'Drug Name',                      segment: 'LIN' },
    { group: 'Service Line',     key: 'lineNote',               label: 'Line Note',                      segment: 'NTE' },
    { group: 'Service Line',     key: 'renderingProviderOnLine',label: 'Line-Level Rendering Provider NPI', segment: 'NM109' },
    { group: 'Service Line',     key: 'attachmentType',         label: 'Attachment Type',                segment: 'PWK02' },
    { group: 'Service Line',     key: 'attachmentControlNumber',label: 'Attachment Control Number',      segment: 'PWK06' },

    // -- Dental / 837D -------------------------------------------------
    { group: 'Dental (837D)',    key: 'toothNumber',            label: 'Tooth Number',                   segment: 'TOO01' },
    { group: 'Dental (837D)',    key: 'toothSurface',           label: 'Tooth Surface',                  segment: 'TOO02' },
    { group: 'Dental (837D)',    key: 'oralCavity',             label: 'Oral Cavity Designation',        segment: 'TOO03' },
    { group: 'Dental (837D)',    key: 'prosthesisCode',         label: 'Prosthesis / Crown / Inlay Code',segment: 'CRC' },
    { group: 'Dental (837D)',    key: 'orthodonticMonths',      label: 'Orthodontic Treatment Months',   segment: 'DTP' },
    { group: 'Dental (837D)',    key: 'placementDate',          label: 'Placement Date (Prosthesis)',     segment: 'DTP~776' },
    { group: 'Dental (837D)',    key: 'missingTooth',           label: 'Missing Tooth Indicator',        segment: 'TOO' },
    { group: 'Dental (837D)',    key: 'toothStatus',            label: 'Tooth Status',                   segment: 'CRC' },
  ];

  availableOperators: string[] = [
    'Is missing',
    'Is present',
    'Equals',
    'Does not equal',
    'Contains',
    'Does not contain',
  ];

  availableActions: string[] = ['Hard stop', 'Soft warning', 'Info only'];

  scopeOptions: ScopeOption[] = [
    { key: 'enterprise', label: 'Enterprise (Global)', icon: 'public' },
    { key: 'location', label: 'Location', icon: 'location_on' },
    { key: 'provider', label: 'Provider', icon: 'person' },
    { key: 'payer', label: 'Payer', icon: 'account_balance' },
    { key: 'practice', label: 'Practice', icon: 'business' },
    { key: 'group', label: 'Group', icon: 'groups' },
  ];

  scopeValueInput = '';
  scopeSuggestions: string[] = [];
  loadingScopeSuggestions = false;

  // Per-condition display text for the field autocomplete (stores label, not key)
  fieldInputs: string[] = [''];

  get isViewMode(): boolean {
    return this.mode === 'view';
  }

  get needsScopeValues(): boolean {
    return this.form?.get('scope')?.value !== 'enterprise';
  }

  get conditions(): FormArray {
    return this.form.get('conditions') as FormArray;
  }

  get actions(): FormArray {
    return this.form.get('actions') as FormArray;
  }

  constructor(
    private fb: FormBuilder,
    private catalogService: CatalogService,
    private locationsService: LocationsService,
  ) {}

  ngOnInit(): void {
    this.buildForm(this.rule ?? {});
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['rule'] && !changes['rule'].isFirstChange()) {
      this.buildForm(this.rule ?? {});
    }
  }

  private buildForm(draft: Partial<RuleDraft>): void {
    let expiresDate: Date | null = null;
    if (draft.expiresOn) {
      const parsed = new Date(draft.expiresOn);
      expiresDate = !isNaN(parsed.getTime()) ? parsed : null;
    }

    const conditions = draft.conditions?.length
      ? draft.conditions
      : this.createEmptyConditions();
    const actions = draft.actions?.length
      ? draft.actions
      : this.createEmptyActions();

    this.form = this.fb.group({
      kind: [draft.kind ?? 'custom'],
      name: [draft.name ?? '', Validators.required],
      category: [draft.category ?? ''],
      description: [draft.description ?? ''],
      status: [draft.status ?? 'Active'],
      matchType: [draft.matchType ?? 'any'],
      scope: [draft.scope ?? 'enterprise'],
      scopeValues: [draft.scopeValues ?? []],
      expiresDate: [expiresDate],
      conditions: this.fb.array(
        conditions.map(c => this.fb.group({
          field: [c.field],
          operator: [c.operator],
          value: [c.value],
        }))
      ),
      actions: this.fb.array(
        actions.map(a => this.fb.group({
          actionType: [a.actionType],
          message: [a.message],
        }))
      ),
    });

    this.syncFieldInputs();

    const scope = draft.scope as RuleScope;
    if (scope && scope !== 'enterprise') {
      this.loadScopeSuggestions(scope);
    } else {
      this.scopeSuggestions = [];
    }

    if (this.mode === 'view') this.form.disable();
  }

  private syncFieldInputs(): void {
    this.fieldInputs = this.conditions.controls.map(g =>
      this.fieldLabelOf((g as FormGroup).get('field')?.value ?? '')
    );
  }

  private fieldLabelOf(key: string): string {
    if (!key) return '';
    return this.availableFields.find(f => f.key === key)?.label ?? '';
  }

  private createEmptyConditions(): RuleCondition[] {
    return [{ field: '', operator: '', value: '' }];
  }

  private createEmptyActions(): RuleAction[] {
    return [{ actionType: '', message: '' }];
  }

  // ======== AUTOCOMPLETE FILTER HELPERS ========

  filterCategories(term: string): string[] {
    const t = (term || '').toLowerCase();
    if (!t) return this.categories;
    return this.categories.filter((c) => c.toLowerCase().includes(t));
  }

  filteredFieldOptions(searchTerm: string): RuleFieldOption[] {
    const t = (searchTerm || '').toLowerCase().trim();
    if (!t) return this.availableFields;
    return this.availableFields.filter(
      f => f.label.toLowerCase().includes(t)
        || f.group.toLowerCase().includes(t)
        || f.key.toLowerCase().includes(t),
    );
  }

  onFieldSelected(index: number, event: MatAutocompleteSelectedEvent): void {
    const key = event.option.value as string;
    (this.conditions.at(index) as FormGroup).patchValue({ field: key });
    this.fieldInputs[index] = this.fieldLabelOf(key);
  }

  onFieldPanelClosed(index: number): void {
    const savedKey = (this.conditions.at(index) as FormGroup).get('field')?.value as string;
    const saved = this.fieldLabelOf(savedKey);
    const typed = (this.fieldInputs[index] || '').trim();
    if (typed === saved) return;
    const exact = this.availableFields.find(f => f.label.toLowerCase() === typed.toLowerCase());
    if (exact) {
      (this.conditions.at(index) as FormGroup).patchValue({ field: exact.key });
      this.fieldInputs[index] = exact.label;
    } else {
      this.fieldInputs[index] = saved;
    }
  }

  filterScopeSuggestions(term: string): string[] {
    const scopeValues: string[] = this.form?.get('scopeValues')?.value ?? [];
    const available = this.scopeSuggestions.filter(s => !scopeValues.includes(s));
    const t = (term || '').toLowerCase();
    if (!t) return available;
    return available.filter((s) => s.toLowerCase().includes(t));
  }

  /** displayWith for condition field - shows label for stored key */
  displayFieldFn = (key: string): string => {
    if (!key) return '';
    const found = this.availableFields.find((f) => f.key === key);
    return found ? found.label : key;
  };

  // -------- conditions CRUD --------
  addCondition(): void {
    this.conditions.push(this.fb.group({ field: [''], operator: [''], value: [''] }));
    this.fieldInputs.push('');
  }

  removeCondition(index: number): void {
    if (this.conditions.length === 1) return;
    this.conditions.removeAt(index);
    this.fieldInputs.splice(index, 1);
  }

  // -------- actions CRUD --------
  addAction(): void {
    this.actions.push(this.fb.group({ actionType: [''], message: [''] }));
  }

  removeAction(index: number): void {
    if (this.actions.length === 1) return;
    this.actions.removeAt(index);
  }

  // -------- scope --------
  onScopeChange(scope: RuleScope): void {
    this.form.patchValue({ scope, scopeValues: [] });
    if (scope === 'enterprise') {
      this.scopeSuggestions = [];
      return;
    }
    this.loadScopeSuggestions(scope);
  }

  private loadScopeSuggestions(scope: RuleScope): void {
    this.loadingScopeSuggestions = true;
    this.scopeSuggestions = [];

    if (scope === 'location' || scope === 'provider' || scope === 'payer') {
      this.catalogService.list(scope as CatalogType, 'active').subscribe({
        next: (items) => {
          this.scopeSuggestions = items.map((i) => i.name).sort();
          this.loadingScopeSuggestions = false;
        },
        error: () => {
          this.scopeSuggestions = [];
          this.loadingScopeSuggestions = false;
        },
      });
    } else if (scope === 'practice' || scope === 'group') {
      this.locationsService.fetch([]).subscribe({
        next: (data) => {
          this.scopeSuggestions = (data.practiceGroups || []).sort();
          this.loadingScopeSuggestions = false;
        },
        error: () => {
          this.scopeSuggestions = [];
          this.loadingScopeSuggestions = false;
        },
      });
    } else {
      this.loadingScopeSuggestions = false;
    }
  }

  addScopeValue(): void {
    const val = this.scopeValueInput.trim();
    const current: string[] = this.form.get('scopeValues')?.value ?? [];
    if (val && !current.includes(val)) {
      this.form.patchValue({ scopeValues: [...current, val] });
    }
    this.scopeValueInput = '';
  }

  onScopeOptionSelected(event: MatAutocompleteSelectedEvent): void {
    const val = event.option.value;
    const current: string[] = this.form.get('scopeValues')?.value ?? [];
    if (val && !current.includes(val)) {
      this.form.patchValue({ scopeValues: [...current, val] });
    }
    this.scopeValueInput = '';
  }

  removeScopeValue(index: number): void {
    const current: string[] = this.form.get('scopeValues')?.value ?? [];
    this.form.patchValue({ scopeValues: current.filter((_, i) => i !== index) });
  }

  onScopeValueKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.addScopeValue();
    }
  }

  // -------- status / expiration --------
  setStatus(status: RuleStatus | string): void {
    const normalized = status as RuleStatus;
    this.form.patchValue({ status: normalized });
    if (normalized !== 'Expires') {
      this.form.patchValue({ expiresDate: null });
    }
  }

  onActiveChange(): void { this.setStatus('Active'); }
  onInactiveChange(): void { this.setStatus('Inactive'); }
  onExpiresChange(): void { this.setStatus('Expires'); }

  // -------- footer buttons --------
  onCancelClicked(): void {
    this.cancel.emit();
  }

  private buildDraft(): RuleDraft {
    const raw = this.form.getRawValue();
    return {
      kind: raw['kind'] ?? 'custom',
      name: raw['name'],
      description: raw['description'],
      category: raw['category'],
      matchType: raw['matchType'] as MatchType,
      conditions: raw['conditions'] as RuleCondition[],
      actions: raw['actions'] as RuleAction[],
      status: raw['status'] as RuleStatus,
      expiresOn: raw['status'] === 'Expires' && raw['expiresDate']
        ? (raw['expiresDate'] as Date).toISOString()
        : null,
      scope: raw['scope'] as RuleScope,
      scopeValues: raw['scopeValues'] ?? [],
    };
  }

  onSimulateClicked(): void {
    this.simulate.emit(this.buildDraft());
  }

  onSaveClicked(): void {
    if (this.form.invalid) return;
    const raw = this.form.getRawValue();
    const result: RuleDraft = {
      kind: raw['kind'] ?? 'custom',
      name: raw['name'],
      description: raw['description'],
      category: raw['category'],
      matchType: raw['matchType'] as MatchType,
      conditions: raw['conditions'] as RuleCondition[],
      actions: raw['actions'] as RuleAction[],
      status: raw['status'] as RuleStatus,
      expiresOn: raw['status'] === 'Expires' && raw['expiresDate']
        ? (raw['expiresDate'] as Date).toISOString()
        : null,
      scope: raw['scope'] as RuleScope,
      scopeValues: raw['scopeValues'] ?? [],
    };
    this.save.emit(result);
  }
}


