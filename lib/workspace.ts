import type { RedefinedResult } from "@/lib/redefined";
import type {
  JourneyEvent,
  UserWorkspaceState,
  WorkspaceArtifact,
  WorkspaceBranch,
  WorkspaceItem,
  WorkspaceMeta,
  WorkspacePreferredMode,
  WorkspacePersistence,
  WorkspaceSection,
  WorkspaceSectionType
} from "@/lib/workspace-types";

const RESULT_SECTION_BY_MODE: Record<RedefinedResult["mode"], WorkspaceSectionType[]> = {
  understand: ["overview", "mental_model", "examples", "notes", "artifact"],
  build: ["overview", "plan", "decisions", "outputs", "artifact"],
  fix: ["overview", "evidence", "checks", "commands", "runbook"],
  artifact: ["overview", "drafts", "exports", "notes", "artifact"]
};

/** Assigns a generated result to the most relevant section, falling back to Overview. */
export function assignResultToSection(
  sections: WorkspaceSection[],
  result: RedefinedResult,
  workspaceId: string,
  now = new Date().toISOString()
): { sections: WorkspaceSection[]; items: WorkspaceItem[] } {
  if (sections.length === 0) return { sections, items: [] };

  const preferred = RESULT_SECTION_BY_MODE[result.mode] ?? ["overview"];
  const target =
    preferred
      .map((type) => sections.find((section) => section.type === type))
      .find(Boolean) ?? sections[0];

  const item: WorkspaceItem = {
    id: `item-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    workspaceId,
    sectionId: target.id,
    type: "result",
    sourceId: result.id,
    createdAt: now
  };

  const nextSections = sections.map((section) =>
    section.id === target.id
      ? { ...section, itemIds: [...section.itemIds, item.id], updatedAt: now }
      : section
  );

  return { sections: nextSections, items: [item] };
}
import { getLocalProfile } from "@/lib/profile-store";

export const TEMP_WORKSPACE_LIMIT = 5;
export const TEMP_WORKSPACE_GRACE_LIMIT = 2;
export const TEMP_WORKSPACE_HARD_LIMIT = TEMP_WORKSPACE_LIMIT + TEMP_WORKSPACE_GRACE_LIMIT;

const NAME_BANKS: Record<RedefinedResult["mode"], string[]> = {
  understand: [
    "The Clarity Map",
    "The Concept Lens",
    "The Idea Decoder",
    "The Mental Model Room",
    "The Knowledge Compass"
  ],
  build: [
    "The Build Bench",
    "The Blueprint Room",
    "The Strategy Forge",
    "The Launch Pad",
    "The Plan Studio"
  ],
  fix: [
    "The Signal Hunt",
    "The Access Maze",
    "The Debug Trail",
    "The Root Cause Room",
    "The Failure Map"
  ],
  artifact: [
    "The Handoff Dock",
    "The Output Studio",
    "The Runbook Vault",
    "The Briefing Room",
    "The Artifact Desk"
  ]
};

function createWorkspaceId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function pickName(mode: RedefinedResult["mode"], prompt: string) {
  const normalizedPrompt = prompt.toLowerCase();

  if (mode === "build" && /business plan|strategy|go-to-market|launch/.test(normalizedPrompt)) {
    return "The Strategy Forge";
  }

  if (mode === "fix" && /access|permission|auth|login|storage account|blocked/.test(normalizedPrompt)) {
    return "The Access Maze";
  }

  if (mode === "artifact" && /draft|document|plan|brief|handoff/.test(normalizedPrompt)) {
    return "The Handoff Dock";
  }

  const bank = NAME_BANKS[mode];
  let hash = 0;
  for (const character of prompt) {
    hash = (hash + character.charCodeAt(0)) % bank.length;
  }

  return bank[hash];
}

function titleCase(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => {
      const lower = part.toLowerCase();
      if (["ai", "api", "ci/cd", "dns", "rbac"].includes(lower)) return lower.toUpperCase();
      if (["azure", "storage", "terraform"].includes(lower)) {
        return lower.charAt(0).toUpperCase() + lower.slice(1);
      }
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

export function generateWorkspaceNameFromPrompt(
  prompt: string,
  mode: WorkspacePreferredMode = "auto"
): string {
  const raw = prompt.toLowerCase();
  const compactTopic = (value: string) =>
    titleCase(
      value
        .replace(/[?.!,;:]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
    );

  const businessPlanMatch = raw.match(/business plan(?:\s+for)?\s+(?:a|an|the)?\s*([a-z0-9\s-]+)/);
  if (businessPlanMatch?.[1]) {
    const topic = businessPlanMatch[1]
      .replace(/\b(platform|app|service|product|company|business)\b/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .split(" ")
      .slice(0, 3)
      .join(" ");
    if (topic) return `${compactTopic(topic)} Business Plan`;
  }

  const accessMatch =
    raw.match(/(?:cannot|can't|unable to)\s+access\s+(?:to\s+)?(?:an?\s+)?([a-z0-9\s-]+?)(?:\s+from|\s+with|\s+because|,|$)/) ??
    raw.match(/access\s+denied\s+(?:to\s+|for\s+)?(?:an?\s+)?([a-z0-9\s-]+?)(?:\s+from|\s+with|\s+because|,|$)/) ??
    raw.match(/access\s+(?:to\s+)?(?:an?\s+)?([a-z0-9\s-]+?)(?:\s+from|\s+with|\s+because|,|$)/);
  if (accessMatch?.[1]) {
    const topic = accessMatch[1]
      .replace(/\b(my|the|an?|vm|account|resource)\b/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .split(" ")
      .slice(0, 3)
      .join(" ");
    if (topic) return `${compactTopic(topic)} Access Investigation`;
  }

  const explainMatch = raw.match(/(?:explain|what is|what does)\s+([a-z0-9\s-]+?)(?:\s+with|\s+using|\s+for|$)/);
  if (explainMatch?.[1]) {
    const topic = explainMatch[1]
      .replace(/\b(flow|concept|overview|guide)\b/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .split(" ")
      .slice(0, 4)
      .join(" ");
    if (topic) return `${compactTopic(topic)} Guide`;
  }

  const cleaned = prompt
    .toLowerCase()
    .replace(/[?.!,;:]+/g, " ")
    .replace(/\b(help me|how do i|can you|please|create a|create an|create|explain|what is|what does|draft a|draft an|draft|build|fix|i cannot|i can't|cannot|can't|from my|with)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const words = cleaned
    .split(" ")
    .filter((word) => word.length > 1 && !["the", "and", "for", "from", "into", "about", "this", "that", "you", "your", "how"].includes(word))
    .slice(0, 5);

  if (words.length === 0) return "Untitled Workspace";

  const base = titleCase(words.join(" "));
  const lower = `${prompt} ${mode}`.toLowerCase();

  if (mode === "fix" || /(cannot|can't|access denied|error|issue|fail|blocked)/.test(lower)) {
    return /\b(issue|investigation)\b/i.test(base) ? base : `${base} Investigation`;
  }

  if (mode === "build" || /(business plan|plan|strategy|build|create)/.test(lower)) {
    return /\b(plan|builder|strategy)\b/i.test(base) ? base : `${base} Plan`;
  }

  if (mode === "understand" || /(what is|what does|explain|guide|concept)/.test(lower)) {
    return /\b(guide|concept)\b/i.test(base) ? base : `${base} Guide`;
  }

  if (mode === "artifact" || /(script|runbook|checklist|summary|draft)/.test(lower)) {
    return /\b(runbook|checklist|script|draft|summary)\b/i.test(base) ? base : `${base} Draft`;
  }

  return base.split(" ").slice(0, 6).join(" ");
}

function extractUsefulTopic(result: RedefinedResult, prompt: string) {
  const topic =
    result.classification?.topic ||
    result.domain ||
    result.title ||
    prompt;

  return titleCase(
    topic
      .replace(/^(what does|what is|how to|how do i|draft a|draft an|draft|build|create|fix|cannot|can't|i cannot|i can't)\s+/i, "")
      .replace(/[?.!]+$/g, "")
      .trim()
      .slice(0, 64)
  );
}

function subtitleForMode(result: RedefinedResult, prompt: string) {
  const topic = extractUsefulTopic(result, prompt);
  const normalizedPrompt = prompt.toLowerCase();

  if (result.mode === "understand") {
    if (/business strategy/.test(normalizedPrompt)) return "Business strategy concept workspace";
    return `${topic || "Concept"} concept workspace`;
  }

  if (result.mode === "build") {
    if (/business plan/.test(normalizedPrompt)) return "Business plan builder";
    if (/terraform/.test(normalizedPrompt)) return `${topic || "Terraform"} builder`;
    return `${topic || "Plan"} builder`;
  }

  if (result.mode === "fix") {
    if (/azure storage|storage account/.test(normalizedPrompt)) {
      return "Azure Storage access investigation";
    }
    return `${topic || "Issue"} investigation`;
  }

  if (/business plan/.test(normalizedPrompt)) return "Business plan draft";
  if (/checklist/.test(normalizedPrompt)) return `${topic || "Cloud security"} checklist artifact`;
  if (/runbook/.test(normalizedPrompt)) return `${topic || "Operations"} runbook artifact`;
  return `${topic || "Workspace"} artifact`;
}

export function generateWorkspaceIdentity(
  result: RedefinedResult,
  prompt: string
): {
  workspaceName: string;
  workspaceSubtitle: string;
} {
  return {
    workspaceName: pickName(result.mode, prompt),
    workspaceSubtitle: subtitleForMode(result, prompt)
  };
}

export function getUserWorkspaceState(tempCount = 0): UserWorkspaceState {
  const profile = getLocalProfile();

  if (profile) {
    return {
      state: "profile",
      ownerType: "local_profile",
      persistence: "local_profile",
      tempCount,
      tempLimit: TEMP_WORKSPACE_LIMIT,
      graceLimit: TEMP_WORKSPACE_GRACE_LIMIT,
      hardLimit: TEMP_WORKSPACE_HARD_LIMIT,
      remainingNormal: 0,
      remainingGrace: 0,
      profileName: profile.name
    };
  }

  const baseGuest = {
    ownerType: "guest" as const,
    persistence: "temporary" as const,
    tempCount,
    tempLimit: TEMP_WORKSPACE_LIMIT,
    graceLimit: TEMP_WORKSPACE_GRACE_LIMIT,
    hardLimit: TEMP_WORKSPACE_HARD_LIMIT,
    remainingNormal: Math.max(TEMP_WORKSPACE_LIMIT - tempCount, 0),
    remainingGrace: Math.max(TEMP_WORKSPACE_HARD_LIMIT - Math.max(tempCount, TEMP_WORKSPACE_LIMIT), 0)
  };

  if (tempCount === 0) {
    return {
      ...baseGuest,
      state: "guest_empty",
    };
  }

  if (tempCount < TEMP_WORKSPACE_LIMIT) {
    return {
      ...baseGuest,
      state: "guest_normal",
    };
  }

  if (tempCount === TEMP_WORKSPACE_LIMIT) {
    return {
      ...baseGuest,
      state: "guest_near_limit",
    };
  }

  if (tempCount > TEMP_WORKSPACE_LIMIT && tempCount < TEMP_WORKSPACE_HARD_LIMIT) {
    return {
      ...baseGuest,
      state: "guest_grace"
    };
  }

  return {
    ...baseGuest,
    state: "guest_hard_limit"
  };
}

export function createDefaultBranch(
  result: RedefinedResult,
  sourcePrompt: string,
  now = new Date().toISOString()
): WorkspaceBranch {
  const branchByMode: Record<
    RedefinedResult["mode"],
    Pick<WorkspaceBranch, "name" | "branchType">
  > = {
    understand: { name: "Main concept branch", branchType: "main" },
    build: { name: "Main build path", branchType: "implementation" },
    fix: { name: "Initial diagnostic branch", branchType: "investigation" },
    artifact: { name: "Main artifact version", branchType: "artifact_version" }
  };

  const branch = branchByMode[result.mode];

  return {
    id: createWorkspaceId("branch"),
    name: branch.name,
    mode: result.mode,
    branchType: branch.branchType,
    status: "active",
    confidence: result.classification?.confidence,
    summary: result.summary,
    sourcePrompt,
    createdAt: now,
    updatedAt: now
  };
}

export function createInitialJourney(branch: WorkspaceBranch): JourneyEvent[] {
  const now = branch.createdAt;

  return [
    {
      id: createWorkspaceId("event"),
      eventType: "workspace_created",
      title: "Workspace created",
      description: "Created from the original prompt.",
      timestamp: now
    },
    {
      id: createWorkspaceId("event"),
      eventType: "branch_created",
      title: "Main branch created",
      description: "Initial branch created for this workspace.",
      timestamp: now,
      branchId: branch.id
    }
  ];
}

function artifactTypeFromResult(result: RedefinedResult): WorkspaceArtifact["artifactType"] {
  const workspaceType = result.workspaceType?.toLowerCase() ?? "";
  const prompt = result.originalPrompt?.toLowerCase() ?? "";
  const title = result.title.toLowerCase();
  const combined = `${workspaceType} ${prompt} ${title}`;

  if (combined.includes("runbook")) return "runbook";
  if (combined.includes("business plan")) return "business_plan";
  if (combined.includes("checklist")) return "checklist";
  if (combined.includes("ticket")) return "ticket";
  if (combined.includes("code")) return "code";
  if (combined.includes("summary")) return "summary";
  return "document";
}

export function createWorkspaceArtifacts(
  result: RedefinedResult,
  branch: WorkspaceBranch,
  now = new Date().toISOString()
): WorkspaceArtifact[] {
  if (result.mode !== "artifact") return [];

  return [
    {
      id: createWorkspaceId("artifact"),
      name: result.title || "Workspace artifact",
      artifactType: artifactTypeFromResult(result),
      sourceMode: result.mode,
      sourceBranchId: branch.id,
      createdAt: now,
      updatedAt: now
    }
  ];
}

export function createWorkspaceMeta(args: {
  result: RedefinedResult;
  prompt: string;
  userState: UserWorkspaceState;
  currentBranchId: string;
  persistence?: WorkspacePersistence;
  projectId?: string;
  createdFromWorkspaceId?: string;
  preferredMode?: WorkspaceMeta["preferredMode"];
  createdFrom?: WorkspaceMeta["createdFrom"];
  workspaceIdOverride?: string;
  workspaceNameOverride?: string;
}): WorkspaceMeta {
  const now = new Date().toISOString();
  const identity = generateWorkspaceIdentity(args.result, args.prompt);
  const persistence = args.persistence ?? args.userState.persistence;
  const nextTempIndex =
    args.userState.ownerType === "guest" && persistence === "temporary"
      ? Math.min(args.userState.tempCount + 1, args.userState.tempLimit)
      : undefined;

  return {
    workspaceId: args.workspaceIdOverride ?? createWorkspaceId("workspace"),
    workspaceName: args.workspaceNameOverride?.trim() || identity.workspaceName,
    workspaceSubtitle: identity.workspaceSubtitle,
    mode: args.result.mode,
    domain: args.result.domain || args.result.classification?.topic || "General",
    workspaceType: args.result.workspaceType,
    originalPrompt: args.prompt,
    currentBranchId: args.currentBranchId,
    projectId: args.projectId,
    createdFromWorkspaceId: args.createdFromWorkspaceId,
    preferredMode: args.preferredMode,
    createdFrom: args.createdFrom,
    ownerType: args.userState.ownerType,
    persistence,
    tempIndex: nextTempIndex,
    tempLimit: args.userState.tempLimit,
    createdAt: now,
    updatedAt: now
  };
}

export function attachWorkspaceToResult(args: {
  result: RedefinedResult;
  workspaceMeta: WorkspaceMeta;
  branches: WorkspaceBranch[];
  journey: JourneyEvent[];
  artifacts: WorkspaceArtifact[];
  promptRuns?: RedefinedResult["workspacePromptRuns"];
  followUpResults?: RedefinedResult["workspaceFollowUpResults"];
  sections?: WorkspaceSection[];
  items?: WorkspaceItem[];
}): RedefinedResult {
  return {
    ...args.result,
    workspaceMeta: args.workspaceMeta,
    workspaceBranches: args.branches,
    workspaceJourney: args.journey,
    workspaceArtifacts: args.artifacts,
    workspacePromptRuns: args.promptRuns ?? args.result.workspacePromptRuns,
    workspaceFollowUpResults: args.followUpResults ?? args.result.workspaceFollowUpResults,
    workspaceSections: args.sections,
    workspaceItems: args.items
  };
}
