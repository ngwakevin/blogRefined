import {
  getProfileJourneyRecords,
  getTemporaryJourneyRecords,
  type ProfileJourneyRecord,
  type TemporaryJourneyRecord
} from "@/lib/journey-store";
import type { RedefinedMode } from "@/lib/redefined";
import type { JourneyEvent, WorkspaceProject } from "@/lib/workspace-types";

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
  branchCount: number;
  projectId?: string;
  persistence: "temporary" | "local_profile";
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
    artifactCount: (record.artifacts ?? record.result.workspaceArtifacts ?? []).length,
    branchCount: (record.branches ?? record.result.workspaceBranches ?? []).length,
    projectId: meta?.projectId,
    persistence,
    href: `/workspaces/${encodeURIComponent(workspaceId)}`
  };
}

export function getDashboardRecords(profileId?: string): DashboardRecord[] {
  const records = profileId
    ? getProfileJourneyRecords(profileId).map((record) => toDashboardRecord(record, "local_profile"))
    : getTemporaryJourneyRecords().map((record) => toDashboardRecord(record, "temporary"));

  return records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
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

export function projectModeMix(project: WorkspaceProject, records: DashboardRecord[]): RedefinedMode[] {
  const modes = records
    .filter(
      (record) =>
        record.projectId === project.id || project.workspaceIds.includes(record.workspaceId)
    )
    .map((record) => record.mode);

  return [...new Set(modes)];
}
