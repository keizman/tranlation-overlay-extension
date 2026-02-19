import glob from './glob';
import {
  WebsiteManagementSettings,
  WebsiteRule,
  WebsiteRuleType,
  WebsiteStatus,
} from './types';

interface BlacklistSettings {
  patterns: string[];
}

interface ParsedDomainPart {
  pattern: string;
  negated: boolean;
}

interface ParsedCustomFilterRule {
  domains: ParsedDomainPart[];
  selector: string;
  exception: boolean;
}

const DEFAULT_SETTINGS: WebsiteManagementSettings = {
  rules: [],
  customFiltersEnabled: true,
  customFiltersText: '',
};
const STORAGE_KEY = 'website-management-settings';
const LEGACY_BLACKLIST_KEY = 'blacklist-settings';

export class WebsiteManager {
  private settingsCache: WebsiteManagementSettings | null = null;
  private cacheTimestamp: number | null = null;

  async getWebsiteStatus(url: string): Promise<WebsiteStatus> {
    const settings = await this.getSettings();

    const now = Date.now();
    if (this.cacheTimestamp && now - this.cacheTimestamp > 5000) {
      this.clearCache();
    }

    const blacklistRules = settings.rules.filter(
      (rule) => rule.type === 'blacklist' && rule.enabled,
    );
    for (const rule of blacklistRules) {
      if (glob.match(rule.pattern, url)) {
        return 'blacklisted';
      }
    }

    const whitelistRules = settings.rules.filter(
      (rule) => rule.type === 'whitelist' && rule.enabled,
    );
    for (const rule of whitelistRules) {
      if (glob.match(rule.pattern, url)) {
        return 'whitelisted';
      }
    }

    return 'normal';
  }

  async isBlacklisted(url: string): Promise<boolean> {
    return (await this.getWebsiteStatus(url)) === 'blacklisted';
  }

  async isWhitelisted(url: string): Promise<boolean> {
    return (await this.getWebsiteStatus(url)) === 'whitelisted';
  }

  async getRules(): Promise<WebsiteRule[]> {
    const settings = await this.getSettings();
    return [...settings.rules];
  }

  async getRulesByType(type: WebsiteRuleType): Promise<WebsiteRule[]> {
    this.clearCache();
    const settings = await this.getSettings();
    return settings.rules.filter((rule) => rule.type === type);
  }

  async addRule(
    pattern: string,
    type: WebsiteRuleType,
    description?: string,
  ): Promise<void> {
    if (!pattern) return;

    this.clearCache();
    const settings = await this.getSettings();

    const existingRule = settings.rules.find(
      (rule) => rule.pattern === pattern,
    );
    if (existingRule) {
      if (existingRule.type === type) {
        return;
      }
      settings.rules = settings.rules.filter(
        (rule) => rule.id !== existingRule.id,
      );
    }

    const newRule: WebsiteRule = {
      id: this.generateId(),
      pattern,
      type,
      enabled: true,
      createdAt: new Date(),
      description,
    };

    settings.rules.push(newRule);
    await this.saveSettings(settings);
    this.clearCache();
  }

  async updateRule(id: string, updates: Partial<WebsiteRule>): Promise<void> {
    const settings = await this.getSettings();
    const ruleIndex = settings.rules.findIndex((rule) => rule.id === id);

    if (ruleIndex === -1) {
      throw new Error('规则不存在');
    }

    settings.rules[ruleIndex] = {
      ...settings.rules[ruleIndex],
      ...updates,
    };

    await this.saveSettings(settings);
    this.clearCache();
  }

  async removeRule(id: string): Promise<void> {
    const settings = await this.getSettings();
    settings.rules = settings.rules.filter((rule) => rule.id !== id);
    await this.saveSettings(settings);
    this.clearCache();
  }

  async removeRules(ids: string[]): Promise<void> {
    const settings = await this.getSettings();
    settings.rules = settings.rules.filter((rule) => !ids.includes(rule.id));
    await this.saveSettings(settings);
    this.clearCache();
  }

  async toggleRule(id: string): Promise<void> {
    const settings = await this.getSettings();
    const rule = settings.rules.find((item) => item.id === id);

    if (!rule) return;

    rule.enabled = !rule.enabled;
    await this.saveSettings(settings);
    this.clearCache();
  }

  async isCustomFiltersEnabled(): Promise<boolean> {
    const settings = await this.getSettings();
    return settings.customFiltersEnabled;
  }

  async setCustomFiltersEnabled(enabled: boolean): Promise<void> {
    const settings = await this.getSettings();
    settings.customFiltersEnabled = enabled;
    await this.saveSettings(settings);
    this.clearCache();
  }

  async getCustomFiltersText(): Promise<string> {
    const settings = await this.getSettings();
    return settings.customFiltersText;
  }

  async setCustomFiltersText(text: string): Promise<void> {
    const settings = await this.getSettings();
    settings.customFiltersText = this.normalizeCustomFiltersTextValue(text);
    await this.saveSettings(settings);
    this.clearCache();
  }

  async appendCustomFilterLine(line: string): Promise<boolean> {
    const normalized = this.normalizeFilterLine(line);
    if (!normalized) {
      return false;
    }

    const settings = await this.getSettings();
    const existingLines = settings.customFiltersText
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean);

    if (existingLines.includes(normalized)) {
      return true;
    }

    const nextText = settings.customFiltersText.trim();
    settings.customFiltersText = nextText
      ? `${nextText}\n${normalized}`
      : normalized;
    await this.saveSettings(settings);
    this.clearCache();
    return true;
  }

  async getMatchingCustomFilterSelectors(url: string): Promise<string[]> {
    const settings = await this.getSettings();
    if (!settings.customFiltersEnabled) {
      return [];
    }

    const hostname = this.extractHostname(url);
    if (!hostname) {
      return [];
    }

    const rules = this.parseCustomFilterRules(settings.customFiltersText);
    const included = new Set<string>();
    const exceptions = new Set<string>();

    for (const rule of rules) {
      if (!this.ruleMatchesHostname(rule, hostname)) {
        continue;
      }

      if (rule.exception) {
        exceptions.add(rule.selector);
      } else {
        included.add(rule.selector);
      }
    }

    for (const selector of exceptions) {
      included.delete(selector);
    }

    return Array.from(included);
  }

  async getSettingsSnapshot(): Promise<WebsiteManagementSettings> {
    const settings = await this.getSettings();
    return {
      ...settings,
      rules: [...settings.rules],
    };
  }

  async replaceSettings(settings: any): Promise<void> {
    const normalized = this.normalizeSettings(settings);
    await this.saveSettings(normalized);
    this.clearCache();
  }

  private async getSettings(): Promise<WebsiteManagementSettings> {
    if (this.settingsCache) {
      return this.settingsCache;
    }

    try {
      const result = await browser.storage.sync.get(STORAGE_KEY);
      if (result && result[STORAGE_KEY]) {
        const parsed = JSON.parse(result[STORAGE_KEY]);
        const normalized = this.normalizeSettings(parsed);
        this.settingsCache = normalized;
        this.cacheTimestamp = Date.now();
        return normalized;
      }

      const legacyResult = await browser.storage.sync.get(LEGACY_BLACKLIST_KEY);
      if (legacyResult && legacyResult[LEGACY_BLACKLIST_KEY]) {
        const legacySettings: BlacklistSettings = JSON.parse(
          legacyResult[LEGACY_BLACKLIST_KEY],
        );
        const migratedSettings = await this.migrateLegacyData(legacySettings);
        this.settingsCache = migratedSettings;
        this.cacheTimestamp = Date.now();
        return migratedSettings;
      }

      this.settingsCache = { ...DEFAULT_SETTINGS };
      this.cacheTimestamp = Date.now();
      return this.settingsCache;
    } catch (error) {
      console.error('获取网站管理设置失败:', error);
      this.settingsCache = { ...DEFAULT_SETTINGS };
      this.cacheTimestamp = Date.now();
      return this.settingsCache;
    }
  }

  private normalizeSettings(raw: any): WebsiteManagementSettings {
    const rules: WebsiteRule[] = Array.isArray(raw?.rules)
      ? raw.rules
          .map((rule: any) => this.normalizeWebsiteRule(rule))
          .filter((rule: WebsiteRule | null): rule is WebsiteRule => !!rule)
      : [];

    const customFiltersText = this.normalizeCustomFiltersTextFromUnknown(raw);

    return {
      rules,
      customFiltersEnabled: raw?.customFiltersEnabled !== false,
      customFiltersText,
    };
  }

  private normalizeWebsiteRule(raw: any): WebsiteRule | null {
    const pattern = typeof raw?.pattern === 'string' ? raw.pattern.trim() : '';
    if (!pattern) return null;
    const type: WebsiteRuleType =
      raw?.type === 'whitelist' ? 'whitelist' : 'blacklist';

    return {
      id: typeof raw?.id === 'string' && raw.id ? raw.id : this.generateId(),
      pattern,
      type,
      enabled: raw?.enabled !== false,
      createdAt: this.parseDate(raw?.createdAt),
      description:
        typeof raw?.description === 'string' ? raw.description : undefined,
    };
  }

  private normalizeCustomFiltersTextFromUnknown(raw: any): string {
    if (typeof raw?.customFiltersText === 'string') {
      return this.normalizeCustomFiltersTextValue(raw.customFiltersText);
    }

    if (Array.isArray(raw?.customFilters)) {
      return this.convertLegacyCustomFiltersToText(raw.customFilters);
    }

    return '';
  }

  private convertLegacyCustomFiltersToText(rawFilters: any[]): string {
    const lines: string[] = [];
    for (const rawFilter of rawFilters) {
      if (rawFilter?.enabled === false) {
        continue;
      }

      const selector =
        typeof rawFilter?.selector === 'string'
          ? rawFilter.selector.trim()
          : '';
      if (!selector || !this.isValidSelector(selector)) {
        continue;
      }

      const scopeType =
        rawFilter?.scopeType === 'pattern' ? 'pattern' : 'hostname';
      const scopeValue =
        typeof rawFilter?.scopeValue === 'string' ? rawFilter.scopeValue : '';

      if (scopeType === 'pattern') {
        const host = this.extractHostnameFromPattern(scopeValue);
        if (host) {
          lines.push(`${host}##${selector}`);
          continue;
        }
      }

      const hostname = this.normalizeHostname(scopeValue);
      if (!hostname) {
        continue;
      }

      lines.push(`${hostname}##${selector}`);
    }

    return this.normalizeCustomFiltersTextValue(lines.join('\n'));
  }

  private normalizeCustomFiltersTextValue(text: string): string {
    if (!text) {
      return '';
    }

    return text
      .replace(/\r\n/g, '\n')
      .split('\n')
      .map((line) => line.trimEnd())
      .join('\n')
      .trim();
  }

  private normalizeFilterLine(line: string): string | null {
    const trimmed = line.trim();
    if (!trimmed) {
      return null;
    }

    const marker = trimmed.includes('#@#')
      ? '#@#'
      : trimmed.includes('##')
        ? '##'
        : '';
    if (!marker) {
      return null;
    }

    const markerIndex = trimmed.indexOf(marker);
    const domainPart = trimmed.slice(0, markerIndex).trim();
    const selector = trimmed.slice(markerIndex + marker.length).trim();
    if (!selector || !this.isValidSelector(selector)) {
      return null;
    }

    if (!domainPart) {
      return `${marker}${selector}`;
    }

    const normalizedDomains = domainPart
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
    if (normalizedDomains.length === 0) {
      return `${marker}${selector}`;
    }

    return `${normalizedDomains.join(',')}${marker}${selector}`;
  }

  private parseCustomFilterRules(text: string): ParsedCustomFilterRule[] {
    const rules: ParsedCustomFilterRule[] = [];
    const lines = text.replace(/\r\n/g, '\n').split('\n');

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith('!') || line.startsWith('[')) {
        continue;
      }

      const marker = line.includes('#@#')
        ? '#@#'
        : line.includes('##')
          ? '##'
          : '';
      if (!marker) {
        continue;
      }

      const markerIndex = line.indexOf(marker);
      const domainPart = line.slice(0, markerIndex).trim();
      const selector = line.slice(markerIndex + marker.length).trim();
      if (!selector || !this.isValidSelector(selector)) {
        continue;
      }

      const domains = domainPart
        ? domainPart
            .split(',')
            .map((item) => this.parseDomainPart(item))
            .filter(
              (item: ParsedDomainPart | null): item is ParsedDomainPart =>
                !!item,
            )
        : [];

      rules.push({
        domains,
        selector,
        exception: marker === '#@#',
      });
    }

    return rules;
  }

  private parseDomainPart(rawPart: string): ParsedDomainPart | null {
    const trimmed = rawPart.trim();
    if (!trimmed) {
      return null;
    }

    const negated = trimmed.startsWith('~');
    let pattern = negated ? trimmed.slice(1).trim() : trimmed;
    if (!pattern) {
      return null;
    }

    if (pattern.startsWith('||')) {
      pattern = pattern.slice(2);
    } else if (pattern.startsWith('|')) {
      pattern = pattern.slice(1);
    }

    pattern = pattern.replace(/\^+$/, '');
    pattern = pattern.replace(/^https?:\/\//i, '');
    pattern = pattern.split('/')[0] || pattern;
    pattern = pattern.replace(/:\d+$/, '');
    pattern = pattern.toLowerCase();

    if (!pattern) {
      return null;
    }

    return {
      pattern,
      negated,
    };
  }

  private ruleMatchesHostname(
    rule: ParsedCustomFilterRule,
    hostname: string,
  ): boolean {
    if (rule.domains.length === 0) {
      return true;
    }

    let hasPositive = false;
    let positiveMatched = false;

    for (const domain of rule.domains) {
      const matched = this.hostMatchesPattern(hostname, domain.pattern);
      if (domain.negated && matched) {
        return false;
      }

      if (!domain.negated) {
        hasPositive = true;
        if (matched) {
          positiveMatched = true;
        }
      }
    }

    if (!hasPositive) {
      return true;
    }

    return positiveMatched;
  }

  private hostMatchesPattern(hostname: string, pattern: string): boolean {
    if (!hostname || !pattern) {
      return false;
    }

    if (pattern === '*') {
      return true;
    }

    if (pattern.includes('*')) {
      const escaped = pattern.replace(
        /[.+?^${}()|[\]\\]/g,
        (char) => `\\${char}`,
      );
      const regex = new RegExp(`^${escaped.replace(/\*/g, '.*')}$`, 'i');
      return regex.test(hostname);
    }

    return hostname === pattern || hostname.endsWith(`.${pattern}`);
  }

  private isValidSelector(selector: string): boolean {
    try {
      document.querySelector(selector);
      return true;
    } catch {
      return false;
    }
  }

  private parseDate(value: unknown): Date {
    if (value instanceof Date) return value;
    const parsed = new Date((value as string | number | Date) ?? Date.now());
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  }

  private extractHostname(url: string): string {
    try {
      return new URL(url).hostname.toLowerCase();
    } catch {
      return '';
    }
  }

  private extractHostnameFromPattern(pattern: string): string {
    const value = pattern.trim();
    if (!value) {
      return '';
    }

    if (value.includes('://')) {
      try {
        const url = new URL(value);
        return this.normalizeHostname(url.hostname);
      } catch {
        return '';
      }
    }

    const normalized = value
      .replace(/^[*]+:\/\//, '')
      .replace(/^https?:\/\//i, '')
      .split('/')[0]
      .replace(/^\*\./, '');

    return this.normalizeHostname(normalized);
  }

  private normalizeHostname(hostname: string): string {
    return hostname
      .trim()
      .toLowerCase()
      .replace(/^\.+/, '')
      .replace(/:\d+$/, '');
  }

  private async migrateLegacyData(
    legacySettings: BlacklistSettings,
  ): Promise<WebsiteManagementSettings> {
    const migratedRules: WebsiteRule[] = legacySettings.patterns.map(
      (pattern) => ({
        id: this.generateId(),
        pattern,
        type: 'blacklist',
        enabled: true,
        createdAt: new Date(),
        description: '从黑名单迁移',
      }),
    );

    const newSettings: WebsiteManagementSettings = {
      ...DEFAULT_SETTINGS,
      rules: migratedRules,
    };

    await this.saveSettings(newSettings);
    return newSettings;
  }

  private async saveSettings(
    settings: WebsiteManagementSettings,
  ): Promise<void> {
    try {
      const normalized = this.normalizeSettings(settings);
      const serializedSettings = JSON.stringify(normalized);
      await browser.storage.sync.set({ [STORAGE_KEY]: serializedSettings });
      this.settingsCache = normalized;
      this.cacheTimestamp = Date.now();
    } catch (error) {
      console.error('保存网站管理设置失败:', error);
    }
  }

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
  }

  clearCache(): void {
    this.settingsCache = null;
    this.cacheTimestamp = null;
  }
}
