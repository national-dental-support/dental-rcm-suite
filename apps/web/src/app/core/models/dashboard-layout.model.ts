export interface KpiConfig {
  key: string;
  visible: boolean;
  order: number;
}

export interface SectionConfig {
  slug: string;
  visible: boolean;
  order: number;
  kpis: KpiConfig[];
}

export interface DashboardLayoutConfig {
  version: 1;
  sections: SectionConfig[];
}

export interface DashboardLayout {
  id: number;
  name: string;
  isDefault: boolean;
  config: DashboardLayoutConfig;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardLayoutsResponse {
  layouts: DashboardLayout[];
  activeId: number | null;
}
