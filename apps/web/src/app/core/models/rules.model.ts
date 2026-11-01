export type RuleStatus = 'Active' | 'Inactive' | 'Expires';
export type RuleKind = 'custom' | 'system';
export type MatchType = 'any' | 'all';
export type RuleScope = 'enterprise' | 'location' | 'provider' | 'payer' | 'practice' | 'group';

export interface RuleCondition {
  field: string;
  operator: string;
  value: string;
}

export interface RuleAction {
  actionType: string;   // e.g. 'Hard stop', 'Soft warning'
  message: string;
}

export interface Rule {
  id: string;
  name: string;
  category: string;
  description: string;
  matchType: MatchType;
  conditions: RuleCondition[];
  actions: RuleAction[];
  status: RuleStatus;
  expiresOn?: string | null;
  createdLabel: string;   // e.g. "Mar 10, 2025\nMarion Denton"
  modifiedLabel: string;  // e.g. "Mar 18, 2025\nMarion Denton"
  claimsImpacted: number;
  kind: RuleKind;
  scope?: RuleScope;
  scopeValues?: string[];
  priority?: number;
}

export interface RuleDraft {
  kind?: RuleKind;
  name: string;
  description: string;
  category: string;
  matchType: MatchType;
  conditions: RuleCondition[];
  actions: RuleAction[];
  status: RuleStatus;
  expiresOn?: string | null;
  scope: RuleScope;
  scopeValues: string[];
}

export interface RulesFilter {
  name?: string;
  category?: string;
  description?: string;
  status?: RuleStatus | 'All';
  expiresOnFrom?: string;
  expiresOnTo?: string;
  minClaimsImpacted?: number | null;
  maxClaimsImpacted?: number | null;
}
