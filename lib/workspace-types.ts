import type { RedefinedMode } from "@/lib/redefined";

export type WorkspaceOwnerType = "guest" | "local_profile" | "signed_in";
export type WorkspacePersistence = "temporary" | "local_profile" | "cloud_profile" | "unsaved";

export type WorkspaceProject = {
  id: string;
  name: string;
  description?: string;
  color?: "blue" | "green" | "yellow" | "purple" | "dark";
  projectType?: "system" | "default" | "custom";
  pinned?: boolean;
  workspaceIds: string[];
  ownerType: WorkspaceOwnerType;
  profileId?: string;
  createdAt: string;
  updatedAt: string;
};

export type NarrationMode =
  | "guided_explanation"
  | "step_by_step"
  | "incident_briefing"
  | "output_review";

export type WorkspaceNarration = {
  id: string;
  title: string;
  script: string;
  audioUrl?: string;
  audioBase64?: string;
  mimeType?: "audio/mpeg" | "audio/wav" | "audio/webm" | string;
  durationEstimateSeconds?: number;
  sourceResultHash: string;
  narrationMode: NarrationMode;
  audioPersisted?: boolean;
  generatedAt: string;
};

export type UserWorkspaceState = {
  state:
    | "profile"
    | "guest_empty"
    | "guest_normal"
    | "guest_near_limit"
    | "guest_grace"
    | "guest_hard_limit"
    | "guest_with_temp_workspaces"
    | "guest_limit_reached"
    | "profile_local"
    | "signed_in";
  ownerType: WorkspaceOwnerType;
  persistence: WorkspacePersistence;
  tempCount: number;
  tempLimit: number;
  graceLimit: number;
  hardLimit: number;
  remainingNormal: number;
  remainingGrace: number;
  profileName?: string;
};

export type PromptRunContext = {
  source: "dashboard" | "project" | "workspace";
  projectId?: string;
  projectName?: string;
  sourceWorkspaceId?: string;
  sourceWorkspaceName?: string;
  persistence: "temporary" | "local_profile" | "cloud_profile" | "unsaved";
};

export type WorkspaceMeta = {
  workspaceId: string;
  workspaceName: string;
  workspaceSubtitle: string;
  mode: RedefinedMode;
  domain: string;
  workspaceType?: string;
  originalPrompt: string;
  currentBranchId?: string;
  projectId?: string;
  createdFromWorkspaceId?: string;
  ownerType: WorkspaceOwnerType;
  persistence: WorkspacePersistence;
  tempIndex?: number;
  tempLimit?: number;
  createdAt: string;
  updatedAt: string;
};

export type WorkspaceBranch = {
  id: string;
  name: string;
  mode: RedefinedMode;
  branchType:
    | "main"
    | "learning"
    | "investigation"
    | "implementation"
    | "artifact_version"
    | "comparison"
    | "verification";
  status: "active" | "new" | "confirmed" | "dismissed" | "archived";
  confidence?: number;
  summary: string;
  sourcePrompt?: string;
  createdAt: string;
  updatedAt: string;
};

export type JourneyEvent = {
  id: string;
  eventType:
    | "workspace_created"
    | "branch_created"
    | "branch_updated"
    | "branch_confirmed"
    | "artifact_created"
    | "audio_guide_created"
    | "audio_guide_regenerated"
    | "workspace_added_to_project"
    | "workspace_removed_from_project"
    | "workspace_migrated"
    | "mode_changed"
    | "user_refined"
    | "ai_repaired"
    | "workspace_renamed";
  title: string;
  description: string;
  timestamp: string;
  branchId?: string;
  artifactId?: string;
};

export type WorkspaceArtifact = {
  id: string;
  name: string;
  artifactType:
    | "ticket"
    | "runbook"
    | "business_plan"
    | "checklist"
    | "summary"
    | "code"
    | "document";
  sourceMode: RedefinedMode;
  sourceBranchId?: string;
  createdAt: string;
  updatedAt: string;
};
