import {
  getProfileJourneyRecords,
  getTemporaryJourneyRecords,
  type ProfileJourneyRecord,
  type TemporaryJourneyRecord
} from "@/lib/journey-store";
import type { RedefinedMode } from "@/lib/redefined";
import type { WorkspaceNarration } from "@/lib/workspace-types";

const ARCHIVED_KEY = "docredefined.archivedAudioGuides";

export type AudioGuideStatus = "ready" | "transcript_only" | "generating" | "failed" | "missing";

export type AudioGuideItem = {
  id: string;
  recordId: string;
  title: string;
  mode: RedefinedMode;
  transcript: string;
  audioUrl?: string;
  audioBase64?: string;
  mimeType?: string;
  durationSeconds?: number;
  status: AudioGuideStatus;
  sourceWorkspaceId: string;
  sourceWorkspaceName: string;
  projectId?: string;
  createdAt: string;
  updatedAt: string;
  persistence: "temporary" | "local_profile";
  href: string;
};

function statusOf(narration: WorkspaceNarration): AudioGuideStatus {
  if (narration.audioUrl || narration.audioBase64) return "ready";
  if (narration.script && narration.script.trim()) return "transcript_only";
  return "missing";
}

function recordToItems(
  record: ProfileJourneyRecord | TemporaryJourneyRecord,
  persistence: "temporary" | "local_profile"
): AudioGuideItem[] {
  const meta = record.workspaceMeta ?? record.result.workspaceMeta;
  const sourceWorkspaceId = meta?.workspaceId ?? record.id;
  const sourceWorkspaceName = meta?.workspaceName ?? record.title;
  const projectId = meta?.projectId;
  const href = `/workspaces/${encodeURIComponent(sourceWorkspaceId)}`;

  const mode = meta?.mode ?? record.result.mode ?? record.mode;
  const guides = record.audioGuides ?? record.result.workspaceAudioGuides ?? [];
  return guides.map((narration) => ({
    id: narration.id,
    recordId: record.id,
    title: narration.title,
    mode,
    transcript: narration.script ?? "",
    audioUrl: narration.audioUrl,
    audioBase64: narration.audioBase64,
    mimeType: narration.mimeType,
    durationSeconds: narration.durationEstimateSeconds,
    status: statusOf(narration),
    sourceWorkspaceId,
    sourceWorkspaceName,
    projectId,
    createdAt: narration.generatedAt,
    updatedAt: narration.generatedAt,
    persistence,
    href
  }));
}

/** All audio guides across the owner's workspaces, newest first. */
export function getAudioGuideItems(profileId?: string): AudioGuideItem[] {
  const items = profileId
    ? getProfileJourneyRecords(profileId).flatMap((record) => recordToItems(record, "local_profile"))
    : getTemporaryJourneyRecords().flatMap((record) => recordToItems(record, "temporary"));

  return items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getArchivedAudioGuideIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(ARCHIVED_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export function toggleArchivedAudioGuide(audioGuideId: string): string[] {
  const current = getArchivedAudioGuideIds();
  const next = current.includes(audioGuideId)
    ? current.filter((id) => id !== audioGuideId)
    : [...current, audioGuideId];
  try {
    window.localStorage.setItem(ARCHIVED_KEY, JSON.stringify(next));
  } catch {
    // archive state is best effort only
  }
  return next;
}

/** Returns a playable source for the guide, or undefined if no audio exists. */
export function audioGuideSource(item: AudioGuideItem): string | undefined {
  if (item.audioUrl) return item.audioUrl;
  if (item.audioBase64) return `data:${item.mimeType ?? "audio/mpeg"};base64,${item.audioBase64}`;
  return undefined;
}

function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 60) || "audio-guide"
  );
}

export function audioGuideFilename(item: AudioGuideItem): string {
  const ext = item.mimeType?.includes("wav")
    ? "wav"
    : item.mimeType?.includes("webm")
      ? "webm"
      : "mp3";
  return `${slugify(item.title)}.${ext}`;
}

export function transcriptFilename(item: AudioGuideItem): string {
  return `${slugify(item.title)}-transcript.txt`;
}

export function formatDuration(seconds?: number): string | null {
  if (!seconds || seconds <= 0) return null;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  if (mins <= 0) return `${secs}s`;
  return `${mins} min`;
}
