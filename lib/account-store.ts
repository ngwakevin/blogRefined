import {
  getPlan,
  isPlanId,
  upgradeForFeature,
  upgradeForLimit,
  type BooleanFeature,
  type PlanId,
  type PlanLimitKey
} from "@/lib/plans";

const ACCOUNT_KEY = "docredefined.account";
export const ACCOUNT_CHANGED_EVENT = "account:changed";

export type BillingStatus = "active" | "trialing" | "past_due" | "cancelled" | "none";
export type BillingInterval = "monthly" | "yearly";

export type AccountUsage = {
  workspacesCreated: number;
  projectsCreated: number;
  promptRunsThisMonth: number;
  artifactsThisMonth: number;
  audioGuidesThisMonth: number;
  exportsThisMonth: number;
};

export type Account = {
  currentPlanId: PlanId;
  billingStatus: BillingStatus;
  billingInterval: BillingInterval;
  usagePeriodStart: string;
  usagePeriodEnd: string;
  usage: AccountUsage;
};

export type MonthlyUsageKey =
  | "promptRunsThisMonth"
  | "artifactsThisMonth"
  | "audioGuidesThisMonth"
  | "exportsThisMonth";

export type GateResult = {
  allowed: boolean;
  reason?: string;
  limit?: number | "custom";
  used?: number;
  upgradePlanId?: PlanId;
};

function monthEnd(from: Date): string {
  const end = new Date(from);
  end.setMonth(end.getMonth() + 1);
  return end.toISOString();
}

function emptyUsage(): AccountUsage {
  return {
    workspacesCreated: 0,
    projectsCreated: 0,
    promptRunsThisMonth: 0,
    artifactsThisMonth: 0,
    audioGuidesThisMonth: 0,
    exportsThisMonth: 0
  };
}

function defaultAccount(): Account {
  const now = new Date();
  return {
    currentPlanId: "free",
    billingStatus: "active",
    billingInterval: "monthly",
    usagePeriodStart: now.toISOString(),
    usagePeriodEnd: monthEnd(now),
    usage: emptyUsage()
  };
}

function canUseStorage(): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem("docredefined.storageTest", "1");
    window.localStorage.removeItem("docredefined.storageTest");
    return true;
  } catch {
    return false;
  }
}

function read(): Account {
  if (!canUseStorage()) return defaultAccount();
  try {
    const raw = window.localStorage.getItem(ACCOUNT_KEY);
    if (!raw) return defaultAccount();
    const parsed = JSON.parse(raw) as Partial<Account>;
    const base = defaultAccount();
    return {
      ...base,
      ...parsed,
      currentPlanId: isPlanId(parsed.currentPlanId) ? parsed.currentPlanId : "free",
      usage: { ...base.usage, ...(parsed.usage ?? {}) }
    };
  } catch {
    return defaultAccount();
  }
}

function write(account: Account): void {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(ACCOUNT_KEY, JSON.stringify(account));
    window.dispatchEvent(new Event(ACCOUNT_CHANGED_EVENT));
  } catch {
    // best effort only
  }
}

/** Resets monthly usage counters when the billing period has rolled over. */
function withPeriodReset(account: Account): Account {
  const now = Date.now();
  if (now < new Date(account.usagePeriodEnd).getTime()) return account;

  const start = new Date();
  const reset: Account = {
    ...account,
    usagePeriodStart: start.toISOString(),
    usagePeriodEnd: monthEnd(start),
    usage: {
      ...account.usage,
      promptRunsThisMonth: 0,
      artifactsThisMonth: 0,
      audioGuidesThisMonth: 0,
      exportsThisMonth: 0
    }
  };
  write(reset);
  return reset;
}

export function getAccount(): Account {
  return withPeriodReset(read());
}

export function setPlan(planId: PlanId): Account {
  const next: Account = { ...getAccount(), currentPlanId: planId, billingStatus: "active" };
  write(next);
  return next;
}

export function setBillingInterval(interval: BillingInterval): Account {
  const next: Account = { ...getAccount(), billingInterval: interval };
  write(next);
  return next;
}

export function incrementUsage(key: keyof AccountUsage, amount = 1): Account {
  const account = getAccount();
  const next: Account = {
    ...account,
    usage: { ...account.usage, [key]: (account.usage[key] ?? 0) + amount }
  };
  write(next);
  return next;
}

/* ── gating helpers ────────────────────────────────────────────────────────── */

function limitGate(args: {
  account: Account;
  key: PlanLimitKey;
  used: number;
  label: string;
}): GateResult {
  const limit = getPlan(args.account.currentPlanId).limits[args.key];
  if (limit === "custom") return { allowed: true, limit, used: args.used };
  if (args.used < limit) return { allowed: true, limit, used: args.used };
  return {
    allowed: false,
    reason: `You have used ${args.used} of ${limit} ${args.label} on your ${getPlan(args.account.currentPlanId).name} plan.`,
    limit,
    used: args.used,
    upgradePlanId: upgradeForLimit(args.account.currentPlanId, args.key)
  };
}

export function canCreateWorkspace(account: Account, workspaceCount: number): GateResult {
  return limitGate({ account, key: "workspaces", used: workspaceCount, label: "workspaces" });
}

export function canCreateProject(account: Account, projectCount: number): GateResult {
  return limitGate({ account, key: "projects", used: projectCount, label: "projects" });
}

export function canRunPrompt(account: Account): GateResult {
  return limitGate({
    account,
    key: "promptRunsPerMonth",
    used: account.usage.promptRunsThisMonth,
    label: "prompt runs this month"
  });
}

export function canCreateArtifact(account: Account): GateResult {
  return limitGate({
    account,
    key: "artifactsPerMonth",
    used: account.usage.artifactsThisMonth,
    label: "artifacts this month"
  });
}

export function canCreateAudioGuide(account: Account): GateResult {
  return limitGate({
    account,
    key: "audioGuidesPerMonth",
    used: account.usage.audioGuidesThisMonth,
    label: "audio guides this month"
  });
}

export function canExportWorkspace(account: Account): GateResult {
  return limitGate({
    account,
    key: "exportsPerMonth",
    used: account.usage.exportsThisMonth,
    label: "exports this month"
  });
}

export function canUseFeature(account: Account, feature: BooleanFeature): GateResult {
  const allowed = getPlan(account.currentPlanId).features[feature];
  if (allowed) return { allowed: true };
  return {
    allowed: false,
    reason: `This feature is not available on your ${getPlan(account.currentPlanId).name} plan.`,
    upgradePlanId: upgradeForFeature(feature)
  };
}
