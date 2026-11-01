import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef, HostListener } from '@angular/core';
import { Subject, forkJoin } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { InsightflowService } from '../../../core/services/insight-flow.service';

@Component({
  selector: 'app-cpt-denial',
  templateUrl: './cpt-denial.component.html',
  styleUrls: ['./cpt-denial.component.scss'],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CptDenialComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  loading = true;
  error   = false;

  stats:      any     = null;
  matrix:     any     = null;
  highRisk:   any[]   = [];
  byCpt:      any[]   = [];
  filtered:   any[]   = [];
  showHighOnly        = false;

  // Heatmap cell tooltip
  tooltipVisible  = false;
  tooltipText     = '';
  tooltipX        = 0;
  tooltipY        = 0;

  // CPT code definition popout
  cptPopup = { visible: false, code: '', name: '', description: '', category: '', x: 0, y: 0 };

  readonly cptDefs: Record<string, { name: string; description: string; category: string }> = {
    'D0120': { name: 'Periodic Oral Evaluation',          category: 'Diagnostic',        description: 'Evaluation of an established patient; records oral health changes since the last exam and checks for new conditions.' },
    'D0140': { name: 'Limited Oral Evaluation',           category: 'Diagnostic',        description: 'Problem-focused evaluation targeting a specific complaint or condition rather than a full comprehensive exam.' },
    'D0150': { name: 'Comprehensive Oral Evaluation',     category: 'Diagnostic',        description: 'Thorough evaluation of all hard and soft tissues, including charting. Typically done for new patients.' },
    'D0210': { name: 'Full Mouth Radiographic Survey',    category: 'Diagnostic Imaging', description: 'Complete series of X-rays covering all teeth and surrounding bone; standard for comprehensive diagnosis.' },
    'D0220': { name: 'Periapical Radiograph, 1st Image',  category: 'Diagnostic Imaging', description: 'Single X-ray showing the full length of one tooth and the surrounding bone.' },
    'D0274': { name: 'Bitewing Radiographs, 4 Images',   category: 'Diagnostic Imaging', description: 'Four posterior X-rays showing the crowns of upper and lower back teeth; used to detect interproximal decay and assess crestal bone levels.' },
    'D0330': { name: 'Panoramic Radiographic Image',      category: 'Diagnostic Imaging', description: 'Single wide-field X-ray showing all teeth, both jaws, and surrounding anatomy in one image.' },
    'D1110': { name: 'Adult Prophylaxis',                 category: 'Preventive',        description: 'Removal of plaque, calculus, and stains from permanent and transitional teeth. The routine "cleaning" for patients 14 and older.' },
    'D1120': { name: 'Child Prophylaxis',                 category: 'Preventive',        description: 'Preventive cleaning for patients up to age 13; removes deposits from primary and transitional dentition.' },
    'D2140': { name: 'Amalgam Restoration, 1 Surface',   category: 'Restorative',       description: 'Silver-alloy filling restoring a single surface (occlusal, buccal, etc.) of a primary or permanent tooth.' },
    'D2150': { name: 'Amalgam Restoration, 2 Surfaces',  category: 'Restorative',       description: 'Silver-alloy filling restoring two tooth surfaces in one placement; common for interproximal cavities.' },
    'D2160': { name: 'Amalgam Restoration, 3 Surfaces',  category: 'Restorative',       description: 'Silver-alloy filling spanning three surfaces; used for larger cavities that involve multiple tooth walls.' },
    'D2330': { name: 'Resin Restoration, 1 Surface, Ant.', category: 'Restorative',     description: 'Tooth-colored composite resin filling on one surface of a front (anterior) tooth.' },
    'D2391': { name: 'Resin Restoration, 1 Surface, Post.', category: 'Restorative',    description: 'Tooth-colored composite resin filling on one surface of a back (posterior) tooth.' },
    'D2740': { name: 'Crown, Porcelain/Ceramic',          category: 'Restorative',       description: 'Full-coverage porcelain or ceramic crown used to restore a heavily damaged or fractured tooth.' },
    'D2750': { name: 'Crown, Porcelain Fused to Metal',   category: 'Restorative',       description: 'Crown with a metal substructure and porcelain exterior; balances strength with aesthetics.' },
    'D3310': { name: 'Endodontic Therapy, Anterior',      category: 'Endodontics',       description: 'Root canal treatment on a front tooth: removal of infected pulp tissue, canal shaping, and obturation. Does not include final restoration.' },
    'D3320': { name: 'Endodontic Therapy, Premolar',      category: 'Endodontics',       description: 'Root canal treatment on a bicuspid tooth; typically has 1\u20132 canals.' },
    'D3330': { name: 'Endodontic Therapy, Molar',         category: 'Endodontics',       description: 'Root canal treatment on a molar; most complex endodontic procedure due to multiple curved canals.' },
    'D4341': { name: 'Periodontal Scaling & Root Planing, 1\u20133 Teeth', category: 'Periodontics', description: 'Deep cleaning below the gumline to remove tartar and bacteria from root surfaces, treating active periodontal (gum) disease.' },
    'D4342': { name: 'Periodontal Scaling & Root Planing, 4+ Teeth',  category: 'Periodontics', description: 'Comprehensive deep cleaning of four or more teeth; typically billed per quadrant for moderate-to-severe periodontitis.' },
    'D6010': { name: 'Endosteal Implant',                 category: 'Implants',          description: 'Surgical placement of a titanium fixture into the jawbone to serve as the root of an artificial tooth.' },
    'D7110': { name: 'Single Tooth Extraction',           category: 'Oral Surgery',      description: 'Removal of an erupted tooth using elevation and forceps; requires sectioning only if multirooted.' },
    'D7210': { name: 'Surgical Tooth Extraction',         category: 'Oral Surgery',      description: 'Removal of an erupted or non-erupted tooth requiring flap elevation, bone removal, or tooth sectioning.' },
    // Medical CPT codes
    '99213': { name: 'Office Visit, Est. Patient (L3)',   category: 'E&M',               description: 'Outpatient visit for an established patient with straightforward to low medical decision complexity.' },
    '99214': { name: 'Office Visit, Est. Patient (L4)',   category: 'E&M',               description: 'Outpatient visit requiring moderate medical decision-making; the most commonly billed E&M code.' },
    '99215': { name: 'Office Visit, Est. Patient (L5)',   category: 'E&M',               description: 'Complex outpatient visit requiring high medical decision-making; typically for acute, severe, or multi-system problems.' },
    '90837': { name: 'Psychotherapy, 60 Minutes',         category: 'Behavioral Health',  description: '60-minute individual psychotherapy session, billed directly by the rendering clinician.' },
    '96372': { name: 'Therapeutic Injection (IM/SQ)',     category: 'Injections',         description: 'Single subcutaneous or intramuscular injection of a therapeutic or prophylactic substance.' },
  };

  constructor(
    private svc: InsightflowService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void { this.load(); }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  load(): void {
    this.loading = true;
    this.error   = false;
    forkJoin({
      stats:    this.svc.getCptDenialStats(),
      matrix:   this.svc.getCptDenialRiskMatrix(),
      highRisk: this.svc.getCptDenialHighRisk(),
      byCpt:    this.svc.getCptDenialByCpt(),
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: res => {
        this.stats    = res.stats;
        this.matrix   = res.matrix;
        this.highRisk = res.highRisk;
        this.byCpt    = res.byCpt;
        this.applyFilter();
        this.loading  = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.error   = true;
        this.loading = false;
        this.cdr.markForCheck();
      },
    });
  }

  applyFilter(): void {
    this.filtered = this.showHighOnly
      ? this.highRisk.filter(r => r.denialRate >= 40)
      : [...this.highRisk];
    this.cdr.markForCheck();
  }

  onFilterToggle(): void {
    this.applyFilter();
  }

  cellRisk(cptIdx: number, payerIdx: number): number {
    return this.matrix?.matrix?.[cptIdx]?.[payerIdx] ?? 0;
  }

  cellBg(risk: number): string {
    const alpha = Math.min(risk / 100, 1);
    // Blend from dark grey (risk=0) to vivid red (risk=100)
    const r = Math.round(30 + alpha * 190);
    const g = Math.round(30 + (1 - alpha) * 60);
    const b = Math.round(30 + (1 - alpha) * 30);
    return `rgb(${r},${g},${b})`;
  }

  cellFg(risk: number): string {
    return risk >= 50 ? '#fff' : '#ccc';
  }

  private wrapperRect(event: MouseEvent): DOMRect | null {
    const el = (event.currentTarget as HTMLElement).closest('.heatmap-wrapper') as HTMLElement | null;
    return el ? el.getBoundingClientRect() : null;
  }

  showTooltip(event: MouseEvent, cptCode: string, payer: string, risk: number): void {
    const wr = this.wrapperRect(event);
    if (!wr) return;
    this.tooltipText    = `${cptCode} \u00D7 ${payer}: ${risk}% denial risk`;
    this.tooltipX       = event.clientX - wr.left + 12;
    this.tooltipY       = event.clientY - wr.top  - 10;
    this.tooltipVisible = true;
    this.cdr.markForCheck();
  }

  hideTooltip(): void {
    this.tooltipVisible = false;
    this.cdr.markForCheck();
  }

  @HostListener('mouseover', ['$event'])
  onRowHover(event: MouseEvent): void {
    const el = event.target as HTMLElement;
    if (!el?.classList?.contains('row-header')) return;
    const code = el.textContent?.trim() ?? '';
    const def = this.cptDefs[code];
    if (!def) return;
    const tr = el.getBoundingClientRect();
    this.cptPopup = {
      visible: true, code,
      name: def.name, description: def.description, category: def.category,
      x: Math.min(tr.right + 8, window.innerWidth - 296),
      y: Math.min(tr.top, window.innerHeight - 155),
    };
    this.cdr.markForCheck();
  }

  @HostListener('mouseout', ['$event'])
  onRowLeave(event: MouseEvent): void {
    if ((event.target as HTMLElement)?.classList?.contains('row-header')) {
      this.cptPopup.visible = false;
      this.cdr.markForCheck();
    }
  }

  trendIcon(trend: string): string {
    const map: Record<string, string> = { up: 'trending_up', stable: 'trending_flat', down: 'trending_down' };
    return map[trend] ?? 'trending_flat';
  }

  trendColor(trend: string): string {
    const map: Record<string, string> = { up: '#ef5350', stable: '#ffa726', down: '#4caf50' };
    return map[trend] ?? '#bbb';
  }

  rateColor(rate: number): string {
    if (rate >= 60) return '#ef5350';
    if (rate >= 40) return '#ffa726';
    return '#4caf50';
  }

  trackByIdx(i: number): number { return i; }
  trackByCode(_: number, row: any): string { return row.cptCode + row.payer; }
}
