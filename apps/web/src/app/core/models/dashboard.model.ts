export enum UserRole {
  Manager = 'Manager',
  ARSpecialist = 'AR Specialist',
}

export interface StatsCard {
  label: string;
  value: string | number;
  description?: string;
  highlight?: 'danger' | 'success' | 'warning' | null;
  route?: string;
  queryParams?: Record<string, string>;
}

export interface KpiCard {
  label: string;
  value: string;
  subLabel?: string;
  changeLabel?: string;   // "^ 5% from previous week"
  changeDirection?: 'up' | 'down' | 'neutral';
}