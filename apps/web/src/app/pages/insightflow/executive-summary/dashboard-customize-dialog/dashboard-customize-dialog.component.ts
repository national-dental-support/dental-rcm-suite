import { Component, Inject, ChangeDetectionStrategy } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import {
  DashboardLayout,
  DashboardLayoutConfig,
} from '../../../../core/models/dashboard-layout.model';

interface KpiItem { key: string; label: string; }
interface SummarySection { slug: string; label: string; kpis: KpiItem[]; }

export interface CustomizeDialogData {
  sections: SummarySection[];
  layout: DashboardLayout | null;
}

export interface CustomizeDialogResult {
  name: string;
  config: DashboardLayoutConfig;
  isDefault: boolean;
}

interface EditKpi { key: string; label: string; visible: boolean; }
interface EditSection { slug: string; label: string; visible: boolean; expanded: boolean; kpis: EditKpi[]; }

@Component({
    selector: 'app-dashboard-customize-dialog',
    templateUrl: './dashboard-customize-dialog.component.html',
    styleUrls: ['./dashboard-customize-dialog.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class DashboardCustomizeDialogComponent {
  layoutName: string;
  isDefault: boolean;
  editSections: EditSection[];

  constructor(
    private ref: MatDialogRef<DashboardCustomizeDialogComponent, CustomizeDialogResult>,
    @Inject(MAT_DIALOG_DATA) data: CustomizeDialogData,
  ) {
    this.layoutName = data.layout?.name ?? '';
    this.isDefault = data.layout?.isDefault ?? false;
    this.editSections = this.buildEditSections(data.sections, data.layout);
  }

  private buildEditSections(sections: SummarySection[], layout: DashboardLayout | null): EditSection[] {
    if (!layout) {
      return sections.map(sec => ({
        slug: sec.slug,
        label: sec.label,
        visible: true,
        expanded: false,
        kpis: sec.kpis.map(k => ({ key: k.key, label: k.label, visible: true })),
      }));
    }

    const cfgMap = new Map(layout.config.sections.map(s => [s.slug, s]));
    const ordered = [...sections].sort((a, b) => {
      const aOrder = cfgMap.get(a.slug)?.order ?? 999;
      const bOrder = cfgMap.get(b.slug)?.order ?? 999;
      return aOrder - bOrder;
    });

    return ordered.map(sec => {
      const cfg = cfgMap.get(sec.slug);
      const kpiCfgMap = cfg ? new Map(cfg.kpis.map(k => [k.key, k])) : new Map<string, any>();
      const sortedKpis = [...sec.kpis].sort((a, b) => {
        const aOrd = kpiCfgMap.get(a.key)?.order ?? 999;
        const bOrd = kpiCfgMap.get(b.key)?.order ?? 999;
        return aOrd - bOrd;
      });
      return {
        slug: sec.slug,
        label: sec.label,
        visible: cfg ? cfg.visible : true,
        expanded: false,
        kpis: sortedKpis.map(k => ({
          key: k.key,
          label: k.label,
          visible: kpiCfgMap.has(k.key) ? kpiCfgMap.get(k.key)!.visible : true,
        })),
      };
    });
  }

  dropSection(event: CdkDragDrop<EditSection[]>): void {
    moveItemInArray(this.editSections, event.previousIndex, event.currentIndex);
  }

  toggleExpand(section: EditSection): void {
    section.expanded = !section.expanded;
  }

  trackBySlug(_: number, s: EditSection): string { return s.slug; }
  trackByKey(_: number, k: EditKpi): string { return k.key; }

  get canSave(): boolean {
    return this.layoutName.trim().length > 0;
  }

  save(): void {
    if (!this.canSave) return;
    const config: DashboardLayoutConfig = {
      version: 1,
      sections: this.editSections.map((sec, sIdx) => ({
        slug: sec.slug,
        visible: sec.visible,
        order: sIdx,
        kpis: sec.kpis.map((kpi, kIdx) => ({
          key: kpi.key,
          visible: kpi.visible,
          order: kIdx,
        })),
      })),
    };
    this.ref.close({ name: this.layoutName.trim(), config, isDefault: this.isDefault });
  }

  cancel(): void {
    this.ref.close();
  }
}
