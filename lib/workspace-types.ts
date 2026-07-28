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
  sourceResultId?: string;
  sourceRunId?: string;
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

export type WorkspacePreferredMode = "auto" | RedefinedMode;

export type WorkspaceStatus =
  | "empty"
  | "awaiting_first_prompt"
  | "running"
  | "completed"
  | "error";

export type WorkspaceSectionType =
  | "overview"
  | "prompt_runs"
  | "notes"
  | "evidence"
  | "checks"
  | "commands"
  | "runbook"
  | "plan"
  | "decisions"
  | "outputs"
  | "drafts"
  | "exports"
  | "mental_model"
  | "examples"
  | "artifact"
  | "custom";

export type WorkspaceSection = {
  id: string;
  workspaceId: string;
  title: string;
  description?: string;
  type: WorkspaceSectionType;
  itemIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type WorkspaceItem = {
  id: string;
  workspaceId: string;
  sectionId?: string;
  type:
    | "prompt_run"
    | "result"
    | "artifact"
    | "note"
    | "audio_guide"
    | "evidence"
    | "command"
    | "decision";
  sourceId?: string;
  createdAt: string;
};

export type PendingWorkspaceShell = {
  workspaceId: string;
  workspaceName: string;
  projectId?: string;
  preferredMode: WorkspacePreferredMode;
  status: WorkspaceStatus;
  sections: WorkspaceSection[];
  items: WorkspaceItem[];
  artifacts: WorkspaceArtifact[];
  audioGuides: WorkspaceNarration[];
  journey: JourneyEvent[];
  originalPrompt?: string;
  terminalPrefill?: string;
  autoRunFirstPrompt?: boolean;
  createdFrom: "dashboard" | "dashboard_quick_prompt" | "project" | "create_project";
  persistence: "temporary" | "local_profile";
  profileId?: string;
  createdAt: string;
  updatedAt: string;
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
  preferredMode?: WorkspacePreferredMode;
  status?: WorkspaceStatus;
  createdFrom?: "dashboard" | "dashboard_quick_prompt" | "project" | "create_project";
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
    | "workspace_renamed"
    | "first_prompt_started"
    | "first_prompt_completed"
    | "follow_up_prompt_started"
    | "follow_up_prompt_completed"
    | "follow_up_prompt_failed"
    | "prompt_failed"
    | "workspace_moved_to_project"
    | "section_created"
    | "section_renamed"
    | "section_deleted"
    | "workspace_archived"
    | "workspace_restored";
  title: string;
  description: string;
  timestamp: string;
  branchId?: string;
  artifactId?: string;
  audioGuideId?: string;
  promptRunId?: string;
  resultId?: string;
  sectionId?: string;
};

export type WorkspacePromptRunStatus = "running" | "completed" | "failed" | "cancelled";

/** A single prompt entered inside a workspace (the first run, or any follow-up). */
export type WorkspacePromptRun = {
  id: string;
  workspaceId: string;
  prompt: string;
  mode: WorkspacePreferredMode;
  action?: string;
  status: WorkspacePromptRunStatus;
  resultId?: string;
  sectionId?: string;
  createdAt: string;
  completedAt?: string;
};

export type WorkspaceArtifactType =
  | "ticket"
  | "runbook"
  | "business_plan"
  | "checklist"
  | "summary"
  | "code"
  | "document";

export type WorkspaceArtifact = {
  id: string;
  name: string;
  artifactType: WorkspaceArtifactType;
  /** Human label for sub-types that map onto `document` (e.g. "Architecture document"). */
  displayType?: string;
  sourceMode: RedefinedMode;
  sourceBranchId?: string;
  workspaceId?: string;
  projectId?: string;
  sourceResultId?: string;
  sourceRunId?: string;
  /** Generated artifact body, present for user-generated artifacts. */
  content?: string;
  format?: "markdown" | "text";
  instructions?: string;
  createdAt: string;
  updatedAt: string;
};
