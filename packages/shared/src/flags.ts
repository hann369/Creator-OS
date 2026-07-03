export interface FeatureFlagRules {
  percentageRollout?: number; // 0 to 100
  allowListedUserIds?: string[];
}

export interface FeatureFlag {
  key: string;
  enabled: boolean;
  rules?: FeatureFlagRules;
}

export class FeatureFlagEngine {
  private flags = new Map<string, FeatureFlag>();

  constructor(initialFlags: FeatureFlag[] = []) {
    for (const flag of initialFlags) {
      this.flags.set(flag.key, flag);
    }
  }

  setFlag(flag: FeatureFlag): void {
    this.flags.set(flag.key, flag);
  }

  isEnabled(key: string, userId?: string): boolean {
    const flag = this.flags.get(key);
    if (!flag) {
      return false; // Default to false if flag is missing
    }

    if (!flag.enabled) {
      return false;
    }

    const rules = flag.rules;
    if (!rules) {
      return true; // No rules, enabled is true
    }

    // 1. Check User ID Allowlist
    if (userId && rules.allowListedUserIds && rules.allowListedUserIds.includes(userId)) {
      return true;
    }

    // 2. Check Percentage Rollout
    if (userId && rules.percentageRollout !== undefined) {
      const hash = this.hashString(userId + key);
      const bucket = hash % 100;
      return bucket < rules.percentageRollout;
    }

    // If rules are defined but conditions are not met
    if (rules.allowListedUserIds || rules.percentageRollout !== undefined) {
      return false;
    }

    return true;
  }

  // Consistent hashing for user bucket assignment
  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0; // Convert to 32bit integer
    }
    return Math.abs(hash);
  }
}

export const globalFeatureFlags = new FeatureFlagEngine();
