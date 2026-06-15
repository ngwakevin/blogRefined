import type {
  EvidenceBranch,
  EvidenceSignal,
  FixDiagnosis,
  FollowUpResult,
  RedefinedResult,
  TimelineEntry
} from "@/lib/redefined";

export type FollowUpNormalizationContext = {
  originalPrompt?: string;
  currentResult: RedefinedResult;
  evidenceText: string;
  localSignals: EvidenceSignal[];
  localEvidenceBranch?: EvidenceBranch;
  evidenceBranches: EvidenceBranch[];
  activeEvidenceBranchId?: string;
  timeline?: TimelineEntry[];
};

export type FollowUpNormalizationDebug = {
  followUpSource: "ai" | "repaired" | "local";
  aiRawParsed: boolean;
  normalized: boolean;
  usedLocalBranchBase: boolean;
  aiReturnedActiveBranch: boolean;
  missingFieldsFilled: string[];
  fallbackUsed: boolean;
  fallbackReason?: "zod_failed_after_normalization" | "ai_request_failed" | "json_parse_failed";
};

export function normalizeFollowUpResult(
  raw: unknown,
  context: FollowUpNormalizationContext
): { normalized: unknown; debug: FollowUpNormalizationDebug } {
  const source = isPlainObject(raw) ? raw : {};
  const missingFieldsFilled: string[] = [];
  const activeBranch = normalizeEvidenceBranch(
    source.activeEvidenceBranch,
    context,
    missingFieldsFilled
  );
  const updatedEvidenceBranches = Array.isArray(source.updatedEvidenceBranches)
    ? source.updatedEvidenceBranches.map((branch) =>
        normalizeEvidenceBranch(branch, context, missingFieldsFilled)
      ).filter((branch): branch is EvidenceBranch => Boolean(branch))
    : activeBranch
      ? upsertBranch(context.evidenceBranches, activeBranch)
      : context.evidenceBranches;
  const updatedDiagnosis = normalizeUpdatedDiagnosis(source.updatedDiagnosis, context, missingFieldsFilled);
  const pathUpdate = isPlainObject(source.pathUpdate)
    ? {
        status: normalizePathStatus(source.pathUpdate.status, missingFieldsFilled, "pathUpdate.status"),
        title: stringValue(source.pathUpdate.title, activeBranch?.title, "Evidence branch updated"),
        description: stringValue(
          source.pathUpdate.description,
          activeBranch?.summary,
          "The evidence was mapped to the active investigation branch."
        ),
        nextBestAction: normalizeNextBestAction(
          source.pathUpdate.nextBestAction,
          activeBranch,
          missingFieldsFilled,
          "pathUpdate.nextBestAction"
        )
      }
    : undefined;

  const normalized: FollowUpResult = {
    id: stringValue(source.id, `followup-${Date.now().toString(36)}`),
    parentResultId: stringValue(source.parentResultId, context.currentResult.id),
    userMessage: stringValue(source.userMessage, context.evidenceText),
    signals: normalizeSignals(source.signals, context.localSignals, missingFieldsFilled, "signals"),
    scratchpadUpdates: Array.isArray(source.scratchpadUpdates) ? source.scratchpadUpdates : [],
    updatedDiagnosis,
    issueMapUpdates: Array.isArray(source.issueMapUpdates) ? source.issueMapUpdates : [],
    nextBestAction: normalizeNextBestAction(
      source.nextBestAction,
      activeBranch,
      missingFieldsFilled,
      "nextBestAction"
    ),
    timelineEntries: normalizeTimelineEntries(source.timelineEntries, activeBranch),
    activeEvidenceBranch: activeBranch,
    updatedEvidenceBranches,
    pathUpdate,
    diagnosticTerminal: isPlainObject(source.diagnosticTerminal)
      ? source.diagnosticTerminal as FollowUpResult["diagnosticTerminal"]
      : undefined,
    environmentComparison: isPlainObject(source.environmentComparison)
      ? source.environmentComparison as FollowUpResult["environmentComparison"]
      : undefined,
    shouldPromoteDiagnosis: source.shouldPromoteDiagnosis === true,
    resolved: source.resolved === true
  };

  return {
    normalized,
    debug: {
      followUpSource: "ai",
      aiRawParsed: true,
      normalized: true,
      usedLocalBranchBase: Boolean(context.localEvidenceBranch),
      aiReturnedActiveBranch: isPlainObject(source.activeEvidenceBranch),
      missingFieldsFilled,
      fallbackUsed: false
    }
  };
}

function normalizeEvidenceBranch(
  value: unknown,
  context: FollowUpNormalizationContext,
  missingFieldsFilled: string[]
): EvidenceBranch | undefined {
  const source = isPlainObject(value) ? value : {};
  const base =
    context.localEvidenceBranch ??
    context.evidenceBranches.find((branch) => branch.id === context.activeEvidenceBranchId) ??
    context.evidenceBranches.find((branch) => branch.status === "active");

  if (!isPlainObject(value) && !base) return undefined;

  const branchType = normalizeBranchType(source.branchType, base?.branchType, context.localSignals);
  const summary = fillString(source.summary, base?.summary, branchSummary(branchType), "activeEvidenceBranch.summary", missingFieldsFilled);

  return {
    id: fillString(source.id, base?.id, `evidence-${branchType}-${Date.now().toString(36)}`, "activeEvidenceBranch.id", missingFieldsFilled),
    title: fillString(source.title, base?.title, branchTitle(branchType), "activeEvidenceBranch.title", missingFieldsFilled),
    branchType,
    status: normalizeBranchStatus(source.status, base?.status, missingFieldsFilled),
    confidence: normalizeNumericConfidence(source.confidence, base?.confidence, missingFieldsFilled),
    summary,
    explanation: normalizeBranchExplanation(source.explanation, base?.explanation, summary),
    cliSteps: normalizeCliSteps(source.cliSteps, base?.cliSteps),
    fixSteps: normalizeStringArray(source.fixSteps, base?.fixSteps, [branchNextAction(branchType)]),
    followUpQuestions: normalizeStringArray(
      source.followUpQuestions,
      base?.followUpQuestions,
      ["What exact system, identity, or endpoint produced this evidence?"]
    ),
    evidenceExcerpt: fillString(source.evidenceExcerpt, base?.evidenceExcerpt, context.evidenceText, "activeEvidenceBranch.evidenceExcerpt", missingFieldsFilled),
    signals: normalizeSignals(source.signals, base?.signals ?? context.localSignals, missingFieldsFilled, "activeEvidenceBranch.signals"),
    nextAction: fillString(source.nextAction, base?.nextAction, branchNextAction(branchType), "activeEvidenceBranch.nextAction", missingFieldsFilled),
    createdAt: fillString(source.createdAt, base?.createdAt, new Date().toISOString(), "activeEvidenceBranch.createdAt", missingFieldsFilled)
  };
}

function normalizeUpdatedDiagnosis(
  value: unknown,
  context: FollowUpNormalizationContext,
  missingFieldsFilled: string[]
): FollowUpResult["updatedDiagnosis"] {
  const source = isPlainObject(value) ? value : {};
  const current = context.currentResult.diagnosis;

  return {
    title: fillString(source.title, current?.title, "Evidence analysed", "updatedDiagnosis.title", missingFieldsFilled),
    answer: fillString(source.answer, current?.answer, "Evidence was analysed and mapped to an investigation branch.", "updatedDiagnosis.answer", missingFieldsFilled),
    confidence: normalizeConfidence(source.confidence, current?.confidence),
    why: normalizeStringArray(
      source.why,
      current?.why,
      ["Evidence was mapped against the current workspace context."]
    ),
    likelyCauses: normalizeLikelyCauses(source.likelyCauses, current?.likelyCauses),
    status: normalizePathStatus(source.status, missingFieldsFilled, "updatedDiagnosis.status")
  };
}

function normalizeNextBestAction(
  value: unknown,
  branch: EvidenceBranch | undefined,
  missingFieldsFilled: string[],
  fieldPrefix: string
): FollowUpResult["nextBestAction"] {
  const source = isPlainObject(value) ? value : {};

  return {
    title: fillString(source.title, branch?.nextAction, "Review active evidence branch", `${fieldPrefix}.title`, missingFieldsFilled),
    description: fillString(source.description, branch?.nextAction, "Use the active evidence branch to choose the next validation step.", `${fieldPrefix}.description`, missingFieldsFilled),
    commands: normalizeOptionalStringArray(source.commands)
  };
}

function normalizeTimelineEntries(value: unknown, branch?: EvidenceBranch): TimelineEntry[] {
  if (Array.isArray(value) && value.length > 0) return value as TimelineEntry[];

  return [
    {
      id: `timeline-followup-${Date.now().toString(36)}`,
      type: "evidence_received",
      title: branch ? `${branch.title} updated` : "Evidence analysed",
      summary: branch?.summary ?? "Evidence was analysed against the current workspace.",
      timestampLabel: "Just now"
    }
  ];
}

function normalizeBranchExplanation(
  value: unknown,
  fallback: EvidenceBranch["explanation"],
  summary: string
): EvidenceBranch["explanation"] {
  const source = isPlainObject(value) ? value : {};
  return {
    meaning: stringValue(source.meaning, fallback?.meaning, summary),
    whyThisBranch: stringValue(
      source.whyThisBranch,
      fallback?.whyThisBranch,
      "The pasted evidence matched signals for this investigation branch."
    ),
    likelyRootCause: stringValue(
      source.likelyRootCause,
      fallback?.likelyRootCause,
      "The branch needs one more validation check before confirming root cause."
    )
  };
}

function normalizeCliSteps(value: unknown, fallback?: EvidenceBranch["cliSteps"]) {
  if (Array.isArray(value) && value.length > 0) {
    return value.map((item, index) => {
      const source = isPlainObject(item) ? item : {};
      return {
        label: stringValue(source.label, source.title, `Check ${index + 1}`),
        command: stringValue(source.command, item, "Paste the exact command output or log evidence."),
        expected: stringValue(source.expected) || undefined
      };
    });
  }

  return fallback ?? [];
}

function normalizeLikelyCauses(value: unknown, fallback?: FixDiagnosis["likelyCauses"]) {
  return Array.isArray(value) && value.length > 0
    ? value as FixDiagnosis["likelyCauses"]
    : fallback ?? [
        {
          label: "Active evidence branch",
          reason: "The pasted evidence created or updated an investigation branch.",
          priority: "medium"
        }
      ];
}

function upsertBranch(branches: EvidenceBranch[], activeBranch: EvidenceBranch): EvidenceBranch[] {
  if (branches.some((branch) => branch.id === activeBranch.id || branch.branchType === activeBranch.branchType)) {
    return branches.map((branch) =>
      branch.id === activeBranch.id || branch.branchType === activeBranch.branchType
        ? { ...branch, ...activeBranch }
        : branch.status === "active"
          ? { ...branch, status: "new" }
          : branch
    );
  }

  return [
    ...branches.map((branch) =>
      branch.status === "active" ? { ...branch, status: "new" as const } : branch
    ),
    activeBranch
  ];
}

function normalizeSignals(
  value: unknown,
  fallback: EvidenceSignal[],
  missingFieldsFilled: string[],
  fieldName: string
): EvidenceSignal[] {
  if (Array.isArray(value) && value.length > 0) return value as EvidenceSignal[];
  missingFieldsFilled.push(fieldName);
  return fallback;
}

function normalizeStringArray(...values: unknown[]): string[] {
  for (const value of values) {
    if (Array.isArray(value)) {
      const strings = value.map((item) => stringValue(item)).filter(Boolean);
      if (strings.length > 0) return strings;
    }
  }
  return [];
}

function normalizeOptionalStringArray(value: unknown): string[] | undefined {
  const values = normalizeStringArray(value);
  return values.length > 0 ? values : undefined;
}

function normalizePathStatus(
  value: unknown,
  missingFieldsFilled: string[],
  fieldName: string
): "initial" | "narrowed" | "resolved" | "needs_more_evidence" {
  const status = stringValue(value).toLowerCase();
  if (["initial", "narrowed", "resolved", "needs_more_evidence"].includes(status)) {
    return status as "initial" | "narrowed" | "resolved" | "needs_more_evidence";
  }
  missingFieldsFilled.push(fieldName);
  return "narrowed";
}

function normalizeConfidence(value: unknown, fallback?: string): "low" | "medium" | "high" {
  const confidence = stringValue(value, fallback).toLowerCase();
  return ["low", "medium", "high"].includes(confidence)
    ? confidence as "low" | "medium" | "high"
    : "medium";
}

function normalizeNumericConfidence(
  value: unknown,
  fallback: number | undefined,
  missingFieldsFilled: string[]
): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.min(1, Math.max(0, value));
  const text = stringValue(value).toLowerCase();
  if (text === "high") return 0.9;
  if (text === "medium") return 0.7;
  if (text === "low") return 0.45;
  missingFieldsFilled.push("activeEvidenceBranch.confidence");
  return fallback ?? 0.72;
}

function normalizeBranchType(
  value: unknown,
  fallback: EvidenceBranch["branchType"] | undefined,
  signals: EvidenceSignal[]
): EvidenceBranch["branchType"] {
  const text = stringValue(value, fallback).toLowerCase();
  if (["rbac", "network", "token", "identity", "configuration", "unknown"].includes(text)) {
    return text as EvidenceBranch["branchType"];
  }
  const signalText = signals.map((signal) => `${signal.affectedBranchId ?? ""} ${signal.label}`).join(" ").toLowerCase();
  if (/(rbac|permission|role)/.test(signalText)) return "rbac";
  if (/(network|firewall|dns|private endpoint)/.test(signalText)) return "network";
  if (/(sas|token|auth)/.test(signalText)) return "token";
  if (/identity|principal/.test(signalText)) return "identity";
  if (/config|mismatch/.test(signalText)) return "configuration";
  return "unknown";
}

function normalizeBranchStatus(
  value: unknown,
  fallback: EvidenceBranch["status"] | undefined,
  missingFieldsFilled: string[]
): EvidenceBranch["status"] {
  const status = stringValue(value, fallback).toLowerCase();
  if (["active", "new", "confirmed", "dismissed"].includes(status)) {
    return status as EvidenceBranch["status"];
  }
  missingFieldsFilled.push("activeEvidenceBranch.status");
  return "active";
}

function branchTitle(branchType: EvidenceBranch["branchType"]): string {
  const labels: Record<EvidenceBranch["branchType"], string> = {
    rbac: "RBAC evidence branch",
    network: "Network evidence branch",
    token: "Token/SAS evidence branch",
    identity: "Identity evidence branch",
    configuration: "Configuration evidence branch",
    unknown: "Evidence branch"
  };
  return labels[branchType];
}

function branchSummary(branchType: EvidenceBranch["branchType"]): string {
  const summaries: Record<EvidenceBranch["branchType"], string> = {
    rbac: "The pasted evidence points to missing or incorrect data-plane permissions.",
    network: "The pasted evidence points to firewall, routing, private endpoint, or DNS restrictions.",
    token: "The pasted evidence points to an expired, invalid, restricted, or incorrectly scoped token.",
    identity: "The pasted evidence points to caller identity or principal resolution.",
    configuration: "The pasted evidence points to mismatched configured versus observed values.",
    unknown: "The pasted evidence created a focused investigation branch."
  };
  return summaries[branchType];
}

function branchNextAction(branchType: EvidenceBranch["branchType"]): string {
  const actions: Record<EvidenceBranch["branchType"], string> = {
    rbac: "Confirm the caller has the required data-plane role at the correct scope.",
    network: "Check network rules, private endpoint approval, DNS resolution, and route path.",
    token: "Validate token expiry, permissions, audience, allowed IP, protocol, and clock skew.",
    identity: "Confirm the caller identity, tenant, principal ID, and credential path.",
    configuration: "Compare source, target, environment, and runtime configuration values.",
    unknown: "Add the exact error output or command result needed to classify the branch."
  };
  return actions[branchType];
}

function fillString(
  value: unknown,
  fallback: unknown,
  finalFallback: string,
  fieldName: string,
  missingFieldsFilled: string[]
): string {
  const resolved = stringValue(value, fallback);
  if (resolved) return resolved;
  missingFieldsFilled.push(fieldName);
  return finalFallback;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}
