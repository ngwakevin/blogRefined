import type { RedefinedResult } from "@/lib/redefined";
import type {
  JourneyEvent,
  UserWorkspaceState,
  WorkspaceArtifact,
  WorkspaceBranch,
  WorkspaceMeta,
  WorkspacePersistence
} from "@/lib/workspace-types";
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
}): WorkspaceMeta {
  const now = new Date().toISOString();
  const identity = generateWorkspaceIdentity(args.result, args.prompt);
  const persistence = args.persistence ?? args.userState.persistence;
  const nextTempIndex =
    args.userState.ownerType === "guest" && persistence === "temporary"
      ? Math.min(args.userState.tempCount + 1, args.userState.tempLimit)
      : undefined;

  return {
    workspaceId: createWorkspaceId("workspace"),
    workspaceName: identity.workspaceName,
    workspaceSubtitle: identity.workspaceSubtitle,
    mode: args.result.mode,
    domain: args.result.domain || args.result.classification?.topic || "General",
    workspaceType: args.result.workspaceType,
    originalPrompt: args.prompt,
    currentBranchId: args.currentBranchId,
    projectId: args.projectId,
    createdFromWorkspaceId: args.createdFromWorkspaceId,
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
}): RedefinedResult {
  return {
    ...args.result,
    workspaceMeta: args.workspaceMeta,
    workspaceBranches: args.branches,
    workspaceJourney: args.journey,
    workspaceArtifacts: args.artifacts
  };
}
