import { ProductSlug } from './master-claim.model';

export interface Product {
  id: number;
  slug: ProductSlug;
  name: string;
  icon: string;
  navRoute: string;
  navOrder: number;
  isActive: boolean;
  subscribed?: boolean; // false = show grayed-out in home menu, block navigation
}

export interface OrgSubscriptions {
  customerId: number | null;
  subscriptions: ProductSlug[];
  role?: string;
  permissions?: Record<string, boolean>;
}
