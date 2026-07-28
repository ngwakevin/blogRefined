import {
  getPendingWorkspaces,
  getProfileJourneyRecords,
  getTemporaryJourneyRecords,
  type ProfileJourneyRecord,
  type TemporaryJourneyRecord
} from "@/lib/journey-store";
import type { RedefinedMode } from "@/lib/redefined";
import type {
  JourneyEvent,
  PendingWorkspaceShell,
  WorkspaceProject
} from "@/lib/workspace-types";

const STARRED_KEY = "docredefined.starredWorkspaces";

export type DashboardRecord = {
  recordId: string;
  workspaceId: string;
  name: string;
  subtitle: string;
  mode: RedefinedMode;
  updatedAt: string;
  createdAt: string;
  audioCount: number;
  audioReady: boolean;
  artifactCount: number;
  promptRunCount: number;
  branchCount: number;
  projectId?: string;
  persistence: "temporary" | "local_profile";
  pending?: boolean;
  href: string;
};

export const MODE_META: Record<
  RedefinedMode,
  { label: string; color: string; soft: string; fg: "dark" | "light" }
> = {
  understand: { label: "Understand", color: "#b2a5ff", soft: "#ded7fb", fg: "light" },
  build: { label: "Build", color: "#38b6ff", soft: "#d3ecff", fg: "light" },
  fix: { label: "Fix", color: "#f5b800", soft: "#fbeab8", fg: "dark" },
  artifact: { label: "Artifact", color: "#00bf63", soft: "#cdf3de", fg: "light" }
};

export const PROJECT_COLORS: Record<NonNullable<WorkspaceProject["color"]>, string> = {
  purple: "#b2a5ff",
  blue: "#38b6ff",
  yellow: "#f5b800",
  green: "#00bf63",
  dark: "#111827"
};

function toDashboardRecord(
  record: ProfileJourneyRecord | TemporaryJourneyRecord,
  persistence: "temporary" | "local_profile"
): DashboardRecord {
  const meta = record.workspaceMeta ?? record.result.workspaceMeta;
  const audioGuides = record.audioGuides ?? record.result.workspaceAudioGuides ?? [];
  const workspaceId = meta?.workspaceId ?? record.id;

  return {
    recordId: record.id,
    workspaceId,
    name: meta?.workspaceName ?? record.title,
    subtitle: meta?.workspaceSubtitle ?? record.originalPrompt,
    mode: record.mode,
    updatedAt: record.updatedAt,
    createdAt: record.createdAt,
    audioCount: audioGuides.length,
    audioReady: audioGuides.some((guide) => guide.audioBase64 || guide.audioUrl),
    artifactCount: (record.result.workspaceArtifacts ?? record.artifacts ?? []).length,
    promptRunCount: (record.result.workspacePromptRuns ?? []).length,
    branchCount: (record.branches ?? record.result.workspaceBranches ?? []).length,
    projectId: meta?.projectId,
    persistence,
    href: `/workspaces/${encodeURIComponent(workspaceId)}`
  };
}

function pendingToDashboardRecord(shell: PendingWorkspaceShell): DashboardRecord {
  const mode: RedefinedMode = shell.preferredMode === "auto" ? "understand" : shell.preferredMode;
  return {
    recordId: shell.workspaceId,
    workspaceId: shell.workspaceId,
    name: shell.workspaceName,
    subtitle: "Empty workspace · awaiting first prompt",
    mode,
    updatedAt: shell.createdAt,
    createdAt: shell.createdAt,
    audioCount: 0,
    audioReady: false,
    artifactCount: 0,
    promptRunCount: 0,
    branchCount: 0,
    projectId: shell.projectId,
    persistence: shell.persistence,
    pending: true,
    href: `/workspaces/${encodeURIComponent(shell.workspaceId)}`
  };
}

export function getDashboardRecords(profileId?: string): DashboardRecord[] {
  const saved = profileId
    ? getProfileJourneyRecords(profileId).map((record) => toDashboardRecord(record, "local_profile"))
    : getTemporaryJourneyRecords().map((record) => toDashboardRecord(record, "temporary"));

  // Empty workspaces live in the pending-shell store until their first prompt runs.
  // Surface them on the dashboard too, deduped against any saved record.
  const savedIds = new Set(saved.map((record) => record.workspaceId));
  const pending = getPendingWorkspaces(profileId)
    .filter((shell) => !savedIds.has(shell.workspaceId))
    .map(pendingToDashboardRecord);

  return [...saved, ...pending].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export type DashboardActivityItem = {
  id: string;
  eventType: JourneyEvent["eventType"];
  title: string;
  description: string;
  timestamp: string;
  workspaceName: string;
  href: string;
};

export function getDashboardActivity(profileId?: string, limit = 8): DashboardActivityItem[] {
  const source: Array<ProfileJourneyRecord | TemporaryJourneyRecord> = profileId
    ? getProfileJourneyRecords(profileId)
    : getTemporaryJourneyRecords();

  return source
    .flatMap((record) => {
      const meta = record.workspaceMeta ?? record.result.workspaceMeta;
      const workspaceId = meta?.workspaceId ?? record.id;
      const events = record.journey ?? record.result.workspaceJourney ?? [];
      return events.map((event) => ({
        id: `${record.id}-${event.id}`,
        eventType: event.eventType,
        title: event.title,
        description: event.description,
        timestamp: event.timestamp,
        workspaceName: meta?.workspaceName ?? record.title,
        href: `/workspaces/${encodeURIComponent(workspaceId)}`
      }));
    })
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, limit);
}

export function getStarredWorkspaceIds(): string[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(STARRED_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export function toggleStarredWorkspace(workspaceId: string): string[] {
  const current = getStarredWorkspaceIds();
  const next = current.includes(workspaceId)
    ? current.filter((id) => id !== workspaceId)
    : [...current, workspaceId];

  try {
    window.localStorage.setItem(STARRED_KEY, JSON.stringify(next));
  } catch {
    // Starred state is best effort only.
  }

  return next;
}

export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";

  const diffMs = Date.now() - then;
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;

  const weeks = Math.round(days / 7);
  if (weeks < 5) return `${weeks}w ago`;

  return new Date(iso).toLocaleDateString();
}

export type ProjectColorKey = NonNullable<WorkspaceProject["color"]>;

export const PROJECT_COLOR_OPTIONS: Array<{
  value: ProjectColorKey;
  hex: string;
  label: string;
}> = [
  { value: "purple", hex: "#b2a5ff", label: "Learning / concepts" },
  { value: "blue", hex: "#38b6ff", label: "Build / engineering" },
  { value: "yellow", hex: "#f5b800", label: "Fix / investigations" },
  { value: "green", hex: "#00bf63", label: "Artifacts / outputs" },
  { value: "dark", hex: "#111827", label: "Operations / internal" }
];

export const PROJECT_TEMPLATES: Array<{
  id: string;
  label: string;
  name: string;
  description: string;
  color: ProjectColorKey;
}> = [
  { id: "blank", label: "Blank project", name: "", description: "", color: "blue" },
  {
    id: "cloud-training",
    label: "Cloud training",
    name: "Cloud Training",
    description: "Workspaces for cloud concepts, certifications, and hands-on labs.",
    color: "purple"
  },
  {
    id: "troubleshooting",
    label: "Troubleshooting",
    name: "Investigations",
    description: "Diagnose incidents, access issues, and failures with evidence trails.",
    color: "yellow"
  },
  {
    id: "business-planning",
    label: "Business planning",
    name: "Business Planning",
    description: "Draft business plans, strategy docs, and go-to-market outlines.",
    color: "green"
  },
  {
    id: "content-creation",
    label: "Content creation",
    name: "Content Studio",
    description: "Scripts, lessons, and content workspaces ready to ship.",
    color: "green"
  },
  {
    id: "documentation",
    label: "Documentation",
    name: "Documentation Hub",
    description: "Product guides, runbooks, and reference documentation.",
    color: "blue"
  }
];

export function pinnedProjects(projects: WorkspaceProject[]): WorkspaceProject[] {
  return projects.filter(
    (project) => project.projectType === "default" || project.pinned !== false
  );
}

import type { WorkspacePreferredMode, WorkspaceSectionType } from "@/lib/workspace-types";

export type SectionTemplate = { title: string; type: WorkspaceSectionType };

export const SECTION_DEFAULTS: Record<WorkspacePreferredMode, SectionTemplate[]> = {
  auto: [
    { title: "Overview", type: "overview" },
    { title: "Prompt Runs", type: "prompt_runs" },
    { title: "Notes", type: "notes" },
    { title: "Artifacts", type: "artifact" }
  ],
  understand: [
    { title: "Overview", type: "overview" },
    { title: "Mental Model", type: "mental_model" },
    { title: "Examples", type: "examples" },
    { title: "Notes", type: "notes" },
    { title: "Artifacts", type: "artifact" }
  ],
  build: [
    { title: "Overview", type: "overview" },
    { title: "Plan", type: "plan" },
    { title: "Decisions", type: "decisions" },
    { title: "Outputs", type: "outputs" },
    { title: "Artifacts", type: "artifact" }
  ],
  fix: [
    { title: "Overview", type: "overview" },
    { title: "Evidence", type: "evidence" },
    { title: "Checks", type: "checks" },
    { title: "Commands", type: "commands" },
    { title: "Runbook", type: "runbook" }
  ],
  artifact: [
    { title: "Overview", type: "overview" },
    { title: "Drafts", type: "drafts" },
    { title: "Exports", type: "exports" },
    { title: "Notes", type: "notes" }
  ]
};

export const LEARNING_FOLDER = {
  id: "doc-redefined-learning",
  name: "Doc/ReDefined Learning",
  description: "Product guides, tutorials, and examples",
  type: "learning",
  icon: "book",
  color: "purple"
} as const;

export function orderProjects(projects: WorkspaceProject[]): WorkspaceProject[] {
  const rank = (project: WorkspaceProject) =>
    project.projectType === "system" ? 0 : project.projectType === "default" ? 1 : 2;

  return [...projects].sort(
    (a, b) => rank(a) - rank(b) || b.updatedAt.localeCompare(a.updatedAt)
  );
}

export function projectWorkspaceCount(project: WorkspaceProject, records: DashboardRecord[]): number {
  const byMeta = records.filter((record) => record.projectId === project.id).length;
  return Math.max(byMeta, project.workspaceIds.length);
}

/** Per-mode workspace counts for a project, ordered Understand/Build/Fix/Artifact. */
export function projectModeBreakdown(
  project: WorkspaceProject,
  records: DashboardRecord[]
): Array<{ mode: RedefinedMode; count: number }> {
  const counts = new Map<RedefinedMode, number>();
  records
    .filter(
      (record) =>
        record.projectId === project.id || project.workspaceIds.includes(record.workspaceId)
    )
    .forEach((record) => counts.set(record.mode, (counts.get(record.mode) ?? 0) + 1));

  const order: RedefinedMode[] = ["understand", "build", "fix", "artifact"];
  return order
    .filter((mode) => (counts.get(mode) ?? 0) > 0)
    .map((mode) => ({ mode, count: counts.get(mode) ?? 0 }));
}

export function projectModeMix(project: WorkspaceProject, records: DashboardRecord[]): RedefinedMode[] {
  const modes = records
    .filter(
      (record) =>
        record.projectId === project.id || project.workspaceIds.includes(record.workspaceId)
    )
    .map((record) => record.mode);

  return [...new Set(modes)];
}
