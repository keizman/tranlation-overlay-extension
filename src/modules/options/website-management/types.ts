export type WebsiteRuleType = 'blacklist' | 'whitelist';

export interface WebsiteRule {
  id: string;
  pattern: string;
  type: WebsiteRuleType;
  enabled: boolean;
  createdAt: Date;
  description?: string;
}

export interface WebsiteManagementSettings {
  rules: WebsiteRule[];
  customFiltersEnabled: boolean;
  customFiltersText: string;
}

export type WebsiteStatus = 'blacklisted' | 'whitelisted' | 'normal';

export interface RuleTypeOption {
  value: WebsiteRuleType;
  label: string;
  description: string;
  icon: string;
  color: string;
}
