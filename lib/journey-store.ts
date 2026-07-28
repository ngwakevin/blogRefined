import type { RedefinedResult } from "@/lib/redefined";
import type {
  JourneyEvent,
  PendingWorkspaceShell,
  WorkspaceArtifact,
  WorkspaceBranch,
  WorkspaceMeta,
  WorkspaceNarration,
  WorkspacePreferredMode,
  WorkspaceProject,
  WorkspaceSection
} from "@/lib/workspace-types";

const TEMP_JOURNEY_KEY = "docredefined.tempJourney";
const TEMP_JOURNEY_LIST_KEY = "docredefined.tempJourneys";
const TEMP_PROJECT_LIST_KEY = "docredefined.tempProjects";
const PROFILE_JOURNEY_LIST_KEY = "docredefined.profileJourneys";
const PROFILE_PROJECT_LIST_KEY = "docredefined.profileProjects";
const ACTIVE_PROFILE_JOURNEY_KEY = "docredefined.profileJourney";
const TEMP_JOURNEY_LIMIT = 7;
const PENDING_WORKSPACE_KEY = "docredefined.pendingWorkspaces";
const PROFILE_PROMPT_DISMISSED_KEY = "docredefined.profilePromptDismissed";
const MAX_PERSISTED_AUDIO_BASE64_LENGTH = 1_500_000;

const memoryStore = new Map<string, RedefinedResult>();

export type TemporaryJourneyRecord = {
  id: string;
  title: string;
  originalPrompt: string;
  mode: "fix" | "understand" | "build" | "artifact";
  result: RedefinedResult;
  workspaceMeta?: WorkspaceMeta;
  branches?: WorkspaceBranch[];
  journey?: JourneyEvent[];
  artifacts?: WorkspaceArtifact[];
  audioGuides?: WorkspaceNarration[];
  createdAt: string;
  updatedAt: string;
};

export type GuestLimitState = {
  count: number;
  limit: number;
  hasReachedLimit: boolean;
  shouldShowSoftReminder: boolean;
  shouldShowLimitReminder: boolean;
  shouldShowProfilePrompt: boolean;
};

export type ProfileJourneyRecord = {
  id: string;
  profileId: string;
  title: string;
  originalPrompt: string;
  mode: "fix" | "understand" | "build" | "artifact";
  result: RedefinedResult;
  workspaceMeta?: WorkspaceMeta;
  branches?: WorkspaceBranch[];
  journey?: JourneyEvent[];
  artifacts?: WorkspaceArtifact[];
  audioGuides?: WorkspaceNarration[];
  createdAt: string;
  updatedAt: string;
  source?: "ai" | "repaired" | "fallback" | "local";
  sourceTemporaryId?: string;
};

export async function saveJourney(result: RedefinedResult): Promise<{ id: string }> {
  const id = `journey-${Date.now().toString(36)}`;
  memoryStore.set(id, result);
  return { id };
}

export async function updateJourney(id: string, result: RedefinedResult): Promise<void> {
  memoryStore.set(id, result);
}

export async function getJourney(id: string): Promise<RedefinedResult | null> {
  return memoryStore.get(id) ?? null;
}

export function convertTemporaryJourneysToProfile(profileId: string): {
  convertedCount: number;
  convertedProjectCount: number;
} {
  const temporaryRecords = readTemporaryJourneyRecords();
  const temporaryProjects = readTemporaryProjectRecords();
  const existingProfileRecords = readProfileJourneyRecords();
  const existingProfileProjects = readProfileProjectRecords(profileId);
  const existingProfileIds = new Set(existingProfileRecords.map((record) => record.id));
  const existingTemporaryIds = new Set(
    existingProfileRecords
      .filter((record) => record.profileId === profileId)
      .map((record) => record.sourceTemporaryId)
      .filter(Boolean)
  );

  const convertedRecords = temporaryRecords
    .filter((record) => {
      const profileJourneyId = `profile-${record.id}`;
      return !existingProfileIds.has(profileJourneyId) && !existingTemporaryIds.has(record.id);
    })
    .map((record): ProfileJourneyRecord => {
      const now = new Date().toISOString();
      const workspaceMeta = record.workspaceMeta
        ? {
            ...record.workspaceMeta,
            ownerType: "local_profile" as const,
            persistence: "local_profile" as const,
            updatedAt: now
          }
        : undefined;
      const migratedEvent: JourneyEvent = {
        id: `event-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        eventType: "workspace_migrated",
        title: "Workspace moved to profile",
        description: "Temporary workspace was saved to your profile.",
        timestamp: now
      };
      const journey = [...(record.journey ?? record.result.workspaceJourney ?? []), migratedEvent];

      return {
        id: `profile-${record.id}`,
        profileId,
        title: record.title,
        originalPrompt: record.originalPrompt,
        mode: record.mode,
        result: {
          ...record.result,
          workspaceMeta,
          workspaceJourney: journey,
          workspaceAudioGuides: record.audioGuides ?? record.result.workspaceAudioGuides ?? []
        },
        workspaceMeta,
        branches: record.branches,
        journey,
        artifacts: record.artifacts,
        audioGuides: record.audioGuides ?? record.result.workspaceAudioGuides ?? [],
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        source: "local",
        sourceTemporaryId: record.id
      };
    });

  writeProfileJourneyRecords([...existingProfileRecords, ...convertedRecords]);
  writeProfileProjectRecords([
    ...readProfileProjectRecords(),
    ...temporaryProjects
      .filter((project) => !existingProfileProjects.some((existing) => existing.id === project.id))
      .map((project): WorkspaceProject => ({
        ...project,
        ownerType: "local_profile",
        profileId,
        updatedAt: new Date().toISOString()
      }))
  ]);
  writeTemporaryProjectRecords([]);
  clearTemporaryJourneyRecords();

  // Default projects exist for every profile; ungrouped migrated workspaces
  // are backfilled into My Workspaces inside ensureDefaultProjects.
  ensureDefaultProjects(profileId);

  return {
    convertedCount: convertedRecords.length,
    convertedProjectCount: temporaryProjects.length
  };
}

function canUseStorage(storage: "local" | "session"): boolean {
  if (typeof window === "undefined") return false;

  try {
    const target = storage === "local" ? window.localStorage : window.sessionStorage;
    const testKey = "docredefined.storageTest";
    target.setItem(testKey, "1");
    target.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

function createTemporaryJourneyId(): string {
  return `temp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function readTemporaryJourneyRecords(): TemporaryJourneyRecord[] {
  if (!canUseStorage("local")) return [];

  try {
    const raw = window.localStorage.getItem(TEMP_JOURNEY_LIST_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter((record): record is TemporaryJourneyRecord => {
      return (
        Boolean(record) &&
        typeof record.id === "string" &&
        typeof record.title === "string" &&
        typeof record.originalPrompt === "string" &&
        typeof record.createdAt === "string" &&
        typeof record.updatedAt === "string" &&
        Boolean(record.result)
      );
    });
  } catch {
    return [];
  }
}

function readProfileJourneyRecords(): ProfileJourneyRecord[] {
  if (!canUseStorage("local")) return [];

  try {
    const raw = window.localStorage.getItem(PROFILE_JOURNEY_LIST_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter((record): record is ProfileJourneyRecord => {
      return (
        Boolean(record) &&
        typeof record.id === "string" &&
        typeof record.profileId === "string" &&
        typeof record.title === "string" &&
        typeof record.originalPrompt === "string" &&
        typeof record.createdAt === "string" &&
        typeof record.updatedAt === "string" &&
        Boolean(record.result)
      );
    });
  } catch {
    return [];
  }
}

function readTemporaryProjectRecords(): WorkspaceProject[] {
  if (!canUseStorage("local")) return [];

  try {
    const raw = window.localStorage.getItem(TEMP_PROJECT_LIST_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter((project): project is WorkspaceProject => {
      return (
        Boolean(project) &&
        typeof project.id === "string" &&
        typeof project.name === "string" &&
        Array.isArray(project.workspaceIds) &&
        typeof project.createdAt === "string" &&
        typeof project.updatedAt === "string"
      );
    });
  } catch {
    return [];
  }
}

function readProfileProjectRecords(profileId?: string): WorkspaceProject[] {
  if (!canUseStorage("local")) return [];

  try {
    const raw = window.localStorage.getItem(PROFILE_PROJECT_LIST_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const projects = parsed.filter((project): project is WorkspaceProject => {
      return (
        Boolean(project) &&
        typeof project.id === "string" &&
        typeof project.name === "string" &&
        Array.isArray(project.workspaceIds) &&
        typeof project.createdAt === "string" &&
        typeof project.updatedAt === "string"
      );
    });

    return profileId ? projects.filter((project) => project.profileId === profileId) : projects;
  } catch {
    return [];
  }
}

function writeTemporaryJourneyRecords(records: TemporaryJourneyRecord[]): void {
  if (!canUseStorage("local")) return;

  try {
    window.localStorage.setItem(TEMP_JOURNEY_LIST_KEY, JSON.stringify(records));
  } catch {
    // Local temporary storage is best effort only.
  }
}

function writeProfileJourneyRecords(records: ProfileJourneyRecord[]): void {
  if (!canUseStorage("local")) return;

  try {
    window.localStorage.setItem(PROFILE_JOURNEY_LIST_KEY, JSON.stringify(records));
  } catch {
    // Local MVP profile journey storage is best effort only.
  }
}

function writeTemporaryProjectRecords(projects: WorkspaceProject[]): void {
  if (!canUseStorage("local")) return;

  try {
    window.localStorage.setItem(TEMP_PROJECT_LIST_KEY, JSON.stringify(projects));
  } catch {
    // Local temporary storage is best effort only.
  }
}

function writeProfileProjectRecords(projects: WorkspaceProject[]): void {
  if (!canUseStorage("local")) return;

  try {
    window.localStorage.setItem(PROFILE_PROJECT_LIST_KEY, JSON.stringify(projects));
  } catch {
    // Local MVP profile project storage is best effort only.
  }
}

function setActiveTemporaryJourneyId(id: string): void {
  if (!canUseStorage("local")) return;

  try {
    window.localStorage.setItem(TEMP_JOURNEY_KEY, id);
  } catch {
    // Local temporary storage is best effort only.
  }
}

function getActiveTemporaryJourneyId(): string | null {
  if (!canUseStorage("local")) return null;

  try {
    return window.localStorage.getItem(TEMP_JOURNEY_KEY);
  } catch {
    return null;
  }
}

function setActiveProfileJourneyId(id: string): void {
  if (!canUseStorage("local")) return;

  try {
    window.localStorage.setItem(ACTIVE_PROFILE_JOURNEY_KEY, id);
  } catch {
    // Local MVP profile journey state is best effort only.
  }
}

function getActiveProfileJourneyId(): string | null {
  if (!canUseStorage("local")) return null;

  try {
    return window.localStorage.getItem(ACTIVE_PROFILE_JOURNEY_KEY);
  } catch {
    return null;
  }
}

export function saveTemporaryJourneyRecord(
  result: RedefinedResult
): TemporaryJourneyRecord {
  const now = new Date().toISOString();
  const record: TemporaryJourneyRecord = {
    id: createTemporaryJourneyId(),
    title: result.workspaceMeta?.workspaceName ?? result.title,
    originalPrompt: result.originalPrompt ?? result.title,
    mode: result.mode,
    result,
    workspaceMeta: result.workspaceMeta,
    branches: result.workspaceBranches,
    journey: result.workspaceJourney,
    artifacts: result.workspaceArtifacts,
    audioGuides: result.workspaceAudioGuides ?? [],
    createdAt: now,
    updatedAt: now
  };

  const records = [...readTemporaryJourneyRecords(), record];
  writeTemporaryJourneyRecords(records);
  setActiveTemporaryJourneyId(record.id);

  return record;
}

export function updateTemporaryJourney(journeyId: string, result: RedefinedResult): void {
  const now = new Date().toISOString();
  const records = readTemporaryJourneyRecords().map((record) => {
    if (record.id !== journeyId) return record;

    return {
      ...record,
      title: result.workspaceMeta?.workspaceName ?? result.title,
      originalPrompt: result.originalPrompt ?? record.originalPrompt,
      result,
      workspaceMeta: result.workspaceMeta ?? record.workspaceMeta,
      branches: result.workspaceBranches ?? record.branches,
      journey: result.workspaceJourney ?? record.journey,
      artifacts: result.workspaceArtifacts ?? record.artifacts,
      audioGuides: result.workspaceAudioGuides ?? record.audioGuides ?? [],
      updatedAt: now
    };
  });

  writeTemporaryJourneyRecords(records);
}

/**
 * Persists an updated workspace result to whichever store owns it. Used by
 * follow-up prompt runs so new prompt runs/results survive a page reload.
 */
export function persistWorkspaceResult(args: {
  result: RedefinedResult;
  recordId?: string;
  profileId?: string;
}): void {
  const persistence = args.result.workspaceMeta?.persistence;

  if (persistence === "local_profile" && args.profileId) {
    if (args.recordId) updateProfileJourney(args.recordId, args.result);
    else updateActiveProfileJourney(args.result);
    return;
  }

  if (persistence === "temporary") {
    if (args.recordId) updateTemporaryJourney(args.recordId, args.result);
    else updateActiveTemporaryJourney(args.result);
    return;
  }

  // "unsaved" / "cloud_profile": nothing to persist locally; the in-memory
  // result still updates through the component's onResultChange handler.
}

export function updateActiveTemporaryJourney(result: RedefinedResult): void {
  const activeId = getActiveTemporaryJourneyId();
  if (!activeId) return;

  const now = new Date().toISOString();
  const records = readTemporaryJourneyRecords().map((record) => {
    if (record.id !== activeId) return record;

    return {
      ...record,
      title: result.workspaceMeta?.workspaceName ?? result.title,
      originalPrompt: result.originalPrompt ?? record.originalPrompt,
      result,
      workspaceMeta: result.workspaceMeta ?? record.workspaceMeta,
      branches: result.workspaceBranches ?? record.branches,
      journey: result.workspaceJourney ?? record.journey,
      artifacts: result.workspaceArtifacts ?? record.artifacts,
      audioGuides: result.workspaceAudioGuides ?? record.audioGuides ?? [],
      updatedAt: now
    };
  });

  writeTemporaryJourneyRecords(records);
}

export function saveProfileJourneyRecord(args: {
  profileId: string;
  result: RedefinedResult;
  source?: ProfileJourneyRecord["source"];
}): ProfileJourneyRecord {
  const now = new Date().toISOString();
  const record: ProfileJourneyRecord = {
    id: `profile-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    profileId: args.profileId,
    title: args.result.workspaceMeta?.workspaceName ?? args.result.title,
    originalPrompt: args.result.originalPrompt ?? args.result.title,
    mode: args.result.mode,
    result: args.result,
    workspaceMeta: args.result.workspaceMeta,
    branches: args.result.workspaceBranches,
    journey: args.result.workspaceJourney,
    artifacts: args.result.workspaceArtifacts,
    audioGuides: args.result.workspaceAudioGuides ?? [],
    createdAt: now,
    updatedAt: now,
    source: args.source ?? "local"
  };

  writeProfileJourneyRecords([...readProfileJourneyRecords(), record]);
  setActiveProfileJourneyId(record.id);
  return record;
}

export function saveProfileJourney(
  result: RedefinedResult,
  profileId: string,
  source?: ProfileJourneyRecord["source"]
): ProfileJourneyRecord {
  return saveProfileJourneyRecord({
    profileId,
    result,
    source
  });
}

export function saveOrUpdateProfileJourney(
  result: RedefinedResult,
  profileId: string,
  source?: ProfileJourneyRecord["source"]
): ProfileJourneyRecord {
  const activeId = getActiveProfileJourneyId();
  const activeRecord = activeId ? getProfileJourneyRecord(profileId, activeId) : null;

  if (activeRecord) {
    updateProfileJourney(activeRecord.id, result);
    return {
      ...activeRecord,
      title: result.workspaceMeta?.workspaceName ?? result.title,
      originalPrompt: result.originalPrompt ?? activeRecord.originalPrompt,
      result,
      workspaceMeta: result.workspaceMeta ?? activeRecord.workspaceMeta,
      branches: result.workspaceBranches ?? activeRecord.branches,
      journey: result.workspaceJourney ?? activeRecord.journey,
      artifacts: result.workspaceArtifacts ?? activeRecord.artifacts,
      audioGuides: result.workspaceAudioGuides ?? activeRecord.audioGuides ?? [],
      source: source ?? activeRecord.source,
      updatedAt: new Date().toISOString()
    };
  }

  return saveProfileJourney(result, profileId, source);
}

export function updateProfileJourney(journeyId: string, result: RedefinedResult): void {
  const now = new Date().toISOString();
  const records = readProfileJourneyRecords().map((record) => {
    if (record.id !== journeyId) return record;

    return {
      ...record,
      title: result.workspaceMeta?.workspaceName ?? result.title,
      originalPrompt: result.originalPrompt ?? record.originalPrompt,
      result,
      workspaceMeta: result.workspaceMeta ?? record.workspaceMeta,
      branches: result.workspaceBranches ?? record.branches,
      journey: result.workspaceJourney ?? record.journey,
      artifacts: result.workspaceArtifacts ?? record.artifacts,
      audioGuides: result.workspaceAudioGuides ?? record.audioGuides ?? [],
      updatedAt: now
    };
  });

  writeProfileJourneyRecords(records);
}

export function updateActiveProfileJourney(result: RedefinedResult): void {
  const activeId = getActiveProfileJourneyId();
  if (!activeId) return;

  updateProfileJourney(activeId, result);
}

export function saveWorkspaceNarration(args: {
  recordId?: string;
  profileId?: string;
  result: RedefinedResult;
  narration: WorkspaceNarration;
}): RedefinedResult {
  const now = new Date().toISOString();
  const runId = args.narration.sourceRunId
    ?? args.result.promptRunId
    ?? (args.result.workspacePromptRuns ?? []).at(-1)?.id;
  const resultId = args.narration.sourceResultId
    ?? args.result.id
    ?? args.result.workspaceFollowUpResults?.at(-1)?.content.id
    ?? runId;
  const sanitizedNarration = sanitizeNarrationForStorage({
    ...args.narration,
    sourceRunId: runId,
    sourceResultId: resultId
  });
  const applyNarration = <T extends TemporaryJourneyRecord | ProfileJourneyRecord>(record: T): T => {
    const existingAudioGuides = record.audioGuides ?? record.result.workspaceAudioGuides ?? [];
    const isRegeneration = existingAudioGuides.some(
      (guide) => guide.sourceResultHash === sanitizedNarration.sourceResultHash
    );
    const audioGuides = [
      ...existingAudioGuides.filter(
        (guide) => guide.sourceResultHash !== sanitizedNarration.sourceResultHash
      ),
      sanitizedNarration
    ];
    const existingJourney = record.journey ?? record.result.workspaceJourney ?? [];
    const event: JourneyEvent = {
      id: `event-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      eventType: isRegeneration ? "audio_guide_regenerated" : "audio_guide_created",
      title: isRegeneration ? "Audio guide regenerated" : "Audio guide created",
      description: isRegeneration
        ? "A listenable workspace guide was regenerated."
        : "A listenable workspace guide was generated.",
      timestamp: now,
      audioGuideId: sanitizedNarration.id,
      promptRunId: sanitizedNarration.sourceRunId,
      resultId: sanitizedNarration.sourceResultId
    };
    const workspaceMeta = record.workspaceMeta ?? record.result.workspaceMeta;
    const updatedMeta = workspaceMeta
      ? {
          ...workspaceMeta,
          updatedAt: now
        }
      : undefined;
    const updatedJourney = [...existingJourney, event];
    const updatedResult: RedefinedResult = {
      ...record.result,
      workspaceMeta: updatedMeta,
      workspaceJourney: updatedJourney,
      workspaceBranches: record.branches ?? record.result.workspaceBranches,
      workspaceArtifacts: record.artifacts ?? record.result.workspaceArtifacts,
      workspaceAudioGuides: audioGuides
    };

    return {
      ...record,
      result: updatedResult,
      workspaceMeta: updatedMeta,
      journey: updatedJourney,
      audioGuides,
      updatedAt: now
    };
  };

  const persistence = args.result.workspaceMeta?.persistence;
  const workspaceId = args.result.workspaceMeta?.workspaceId;

  if (persistence === "temporary") {
    let updatedResult: RedefinedResult | null = null;
    const records = readTemporaryJourneyRecords().map((record) => {
      const matches =
        record.id === args.recordId ||
        record.workspaceMeta?.workspaceId === workspaceId ||
        record.result.workspaceMeta?.workspaceId === workspaceId;
      if (!matches) return record;
      const updated = applyNarration(record);
      updatedResult = updated.result;
      return updated;
    });

    writeTemporaryJourneyRecords(records);
    if (updatedResult) return buildRuntimeResultWithNarration(args.result, args.narration, now);
  }

  if (persistence === "local_profile" && args.profileId) {
    let updatedResult: RedefinedResult | null = null;
    const records = readProfileJourneyRecords().map((record) => {
      const matches =
        record.profileId === args.profileId &&
        (record.id === args.recordId ||
          record.workspaceMeta?.workspaceId === workspaceId ||
          record.result.workspaceMeta?.workspaceId === workspaceId);
      if (!matches) return record;
      const updated = applyNarration(record);
      updatedResult = updated.result;
      return updated;
    });

    writeProfileJourneyRecords(records);
    if (updatedResult) return buildRuntimeResultWithNarration(args.result, args.narration, now);
  }

  const existingAudioGuides = args.result.workspaceAudioGuides ?? [];
  const isRegeneration = existingAudioGuides.some(
    (guide) => guide.sourceResultHash === sanitizedNarration.sourceResultHash
  );
  const event: JourneyEvent = {
    id: `event-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    eventType: isRegeneration ? "audio_guide_regenerated" : "audio_guide_created",
    title: isRegeneration ? "Audio guide regenerated" : "Audio guide created",
    description: isRegeneration
      ? "A listenable workspace guide was regenerated."
      : "A listenable workspace guide was generated.",
    timestamp: now,
    audioGuideId: sanitizedNarration.id,
    promptRunId: sanitizedNarration.sourceRunId,
    resultId: sanitizedNarration.sourceResultId
  };
  const updatedMeta = args.result.workspaceMeta
    ? {
        ...args.result.workspaceMeta,
        updatedAt: now
      }
    : undefined;

  return {
    ...args.result,
    workspaceMeta: updatedMeta,
    workspaceJourney: [...(args.result.workspaceJourney ?? []), event],
    workspaceAudioGuides: [
      ...existingAudioGuides.filter(
        (guide) => guide.sourceResultHash !== sanitizedNarration.sourceResultHash
      ),
      sanitizedNarration
    ]
  };
}

function buildRuntimeResultWithNarration(
  result: RedefinedResult,
  narration: WorkspaceNarration,
  timestamp: string
): RedefinedResult {
  const existingAudioGuides = result.workspaceAudioGuides ?? [];
  const isRegeneration = existingAudioGuides.some(
    (guide) => guide.sourceResultHash === narration.sourceResultHash
  );
  const event: JourneyEvent = {
    id: `event-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    eventType: isRegeneration ? "audio_guide_regenerated" : "audio_guide_created",
    title: isRegeneration ? "Audio guide regenerated" : "Audio guide created",
    description: isRegeneration
      ? "A listenable workspace guide was regenerated."
      : "A listenable workspace guide was generated.",
    timestamp,
    audioGuideId: narration.id,
    promptRunId: narration.sourceRunId,
    resultId: narration.sourceResultId
  };

  return {
    ...result,
    workspaceMeta: result.workspaceMeta
      ? {
          ...result.workspaceMeta,
          updatedAt: timestamp
        }
      : undefined,
    workspaceJourney: [...(result.workspaceJourney ?? []), event],
    workspaceAudioGuides: [
      ...existingAudioGuides.filter(
        (guide) => guide.sourceResultHash !== narration.sourceResultHash
      ),
      sanitizeNarrationForStorage(narration)
    ]
  };
}

function sanitizeNarrationForStorage(narration: WorkspaceNarration): WorkspaceNarration {
  if (
    narration.audioBase64 &&
    narration.audioBase64.length > MAX_PERSISTED_AUDIO_BASE64_LENGTH
  ) {
    const { audioBase64: _audioBase64, audioUrl: _audioUrl, ...metadataOnly } = narration;
    return {
      ...metadataOnly,
      audioPersisted: false
    };
  }

  return {
    ...narration,
    audioPersisted: Boolean(narration.audioBase64 || narration.audioUrl)
  };
}

export function getTemporaryJourneyRecords(): TemporaryJourneyRecord[] {
  return readTemporaryJourneyRecords();
}

export function getTemporaryJourneyRecord(id: string): TemporaryJourneyRecord | null {
  return getTemporaryJourneyRecords().find((record) => record.id === id) ?? null;
}

export function getProfileJourneyRecords(profileId: string): ProfileJourneyRecord[] {
  return readProfileJourneyRecords().filter((record) => record.profileId === profileId);
}

export function getProfileJourneyRecord(
  profileId: string,
  journeyId: string
): ProfileJourneyRecord | null {
  return getProfileJourneyRecords(profileId).find((record) => record.id === journeyId) ?? null;
}

export function activateProfileJourney(journeyId: string): void {
  setActiveProfileJourneyId(journeyId);
}

export function activateTemporaryJourney(journeyId: string): void {
  setActiveTemporaryJourneyId(journeyId);
}

export function getProjects(profileId?: string): WorkspaceProject[] {
  return profileId ? readProfileProjectRecords(profileId) : readTemporaryProjectRecords();
}

/* ── pending workspace shells (created before the first prompt runs) ─────── */

function readPendingWorkspaces(): PendingWorkspaceShell[] {
  if (!canUseStorage("local")) return [];
  try {
    const raw = window.localStorage.getItem(PENDING_WORKSPACE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter(
          (item): item is PendingWorkspaceShell =>
            Boolean(item) &&
            typeof item.workspaceId === "string" &&
            typeof item.workspaceName === "string" &&
            Array.isArray(item.sections)
        )
      : [];
  } catch {
    return [];
  }
}

function writePendingWorkspaces(shells: PendingWorkspaceShell[]): void {
  if (!canUseStorage("local")) return;
  try {
    window.localStorage.setItem(PENDING_WORKSPACE_KEY, JSON.stringify(shells));
  } catch {
    // Pending shell storage is best effort only.
  }
}

export function createWorkspaceShell(args: {
  workspaceName: string;
  preferredMode?: WorkspacePreferredMode;
  projectId?: string;
  createdFrom: PendingWorkspaceShell["createdFrom"];
  sections: Array<{ title: string; type: WorkspaceSection["type"] }>;
  terminalPrefill?: string;
  autoRunFirstPrompt?: boolean;
  profileId?: string;
}): PendingWorkspaceShell {
  const now = new Date().toISOString();
  const workspaceId = `workspace-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const sections: WorkspaceSection[] = args.sections.map((template, index) => ({
    id: `section-${Date.now().toString(36)}-${index}-${Math.random().toString(36).slice(2, 6)}`,
    workspaceId,
    title: template.title,
    type: template.type,
    itemIds: [],
    createdAt: now,
    updatedAt: now
  }));
  const workspaceCreatedEvent: JourneyEvent = {
    id: `event-${Date.now().toString(36)}-workspace-created`,
    eventType: "workspace_created",
    title: "Workspace created",
    description:
      args.createdFrom === "dashboard_quick_prompt"
        ? "Workspace was created from the dashboard quick prompt."
        : "Workspace shell was created.",
    timestamp: now
  };

  const shell: PendingWorkspaceShell = {
    workspaceId,
    workspaceName: args.workspaceName.trim(),
    projectId: args.projectId,
    preferredMode: args.preferredMode ?? "auto",
    status: "awaiting_first_prompt",
    sections,
    items: [],
    artifacts: [],
    audioGuides: [],
    journey: [workspaceCreatedEvent],
    originalPrompt: args.terminalPrefill?.trim() || undefined,
    terminalPrefill: args.terminalPrefill?.trim() || undefined,
    autoRunFirstPrompt: args.autoRunFirstPrompt,
    createdFrom: args.createdFrom,
    persistence: args.profileId ? "local_profile" : "temporary",
    profileId: args.profileId,
    createdAt: now,
    updatedAt: now
  };

  writePendingWorkspaces([...readPendingWorkspaces(), shell]);

  // Reserve the workspace in its project immediately so counts reflect it.
  if (args.projectId) {
    assignWorkspaceToProjectSilently(shell.workspaceId, args.projectId, args.profileId);
  }

  return shell;
}

export function updatePendingWorkspaceSections(
  workspaceId: string,
  sections: WorkspaceSection[]
): void {
  writePendingWorkspaces(
    readPendingWorkspaces().map((shell) =>
      shell.workspaceId === workspaceId ? { ...shell, sections } : shell
    )
  );
}

export function updatePendingWorkspace(
  workspaceId: string,
  patch: Partial<
    Pick<
      PendingWorkspaceShell,
      | "workspaceName"
      | "preferredMode"
      | "status"
      | "sections"
      | "items"
      | "artifacts"
      | "audioGuides"
      | "journey"
      | "originalPrompt"
      | "terminalPrefill"
      | "autoRunFirstPrompt"
    >
  >
): PendingWorkspaceShell | null {
  let updated: PendingWorkspaceShell | null = null;
  const now = new Date().toISOString();
  writePendingWorkspaces(
    readPendingWorkspaces().map((shell) => {
      if (shell.workspaceId !== workspaceId) return shell;
      updated = { ...shell, ...patch, updatedAt: now };
      return updated;
    })
  );
  return updated;
}

export function movePendingWorkspace(
  workspaceId: string,
  projectId: string,
  profileId?: string
): void {
  const update = (projects: WorkspaceProject[]) =>
    projects.map((project) => {
      const filtered = project.workspaceIds.filter((id) => id !== workspaceId);
      if (project.id === projectId) {
        return { ...project, workspaceIds: [...new Set([...filtered, workspaceId])] };
      }
      return filtered.length !== project.workspaceIds.length
        ? { ...project, workspaceIds: filtered }
        : project;
    });

  if (profileId) writeProfileProjectRecords(update(readProfileProjectRecords()));
  else writeTemporaryProjectRecords(update(readTemporaryProjectRecords()));

  writePendingWorkspaces(
    readPendingWorkspaces().map((shell) =>
      shell.workspaceId === workspaceId ? { ...shell, projectId } : shell
    )
  );
}

export function getPendingWorkspace(workspaceId: string): PendingWorkspaceShell | null {
  const decoded = decodeURIComponent(workspaceId);
  return (
    readPendingWorkspaces().find(
      (shell) => shell.workspaceId === decoded || shell.workspaceId === workspaceId
    ) ?? null
  );
}

/** All empty (awaiting-first-prompt) workspace shells for the current owner. */
export function getPendingWorkspaces(profileId?: string): PendingWorkspaceShell[] {
  return readPendingWorkspaces().filter((shell) =>
    profileId ? shell.profileId === profileId : !shell.profileId
  );
}

export function removePendingWorkspace(workspaceId: string): void {
  writePendingWorkspaces(
    readPendingWorkspaces().filter((shell) => shell.workspaceId !== workspaceId)
  );
}

const LEGACY_SYSTEM_PROJECT_NAMES = ["Doc/ReDefined Docs", "Learn Doc/ReDefined"];

function isLegacySystemProject(project: WorkspaceProject): boolean {
  return (
    project.projectType === "system" || LEGACY_SYSTEM_PROJECT_NAMES.includes(project.name)
  );
}

export function ensureDefaultProjects(profileId?: string): {
  myWorkspaces: WorkspaceProject | null;
} {
  if (!profileId) {
    const myTemp =
      readTemporaryProjectRecords().find(
        (project) => project.projectType === "default" || project.name === "My Workspaces"
      ) ?? null;
    return { myWorkspaces: myTemp };
  }

  const now = new Date().toISOString();
  let projects = readProfileProjectRecords();

  // Migration: product learning is not a user project. Remove legacy system
  // projects and release any workspaces that pointed at them.
  const legacyIds = projects
    .filter((project) => project.profileId === profileId && isLegacySystemProject(project))
    .map((project) => project.id);
  if (legacyIds.length > 0) {
    projects = projects.filter((project) => !legacyIds.includes(project.id));
    writeProfileJourneyRecords(
      readProfileJourneyRecords().map((record) => {
        if (record.profileId !== profileId) return record;
        const meta = record.workspaceMeta ?? record.result.workspaceMeta;
        if (!meta?.projectId || !legacyIds.includes(meta.projectId)) return record;
        const nextMeta = { ...meta, projectId: undefined };
        return {
          ...record,
          workspaceMeta: nextMeta,
          result: { ...record.result, workspaceMeta: nextMeta }
        };
      })
    );
  }

  const mine = projects.filter((project) => project.profileId === profileId);

  let myWorkspaces =
    mine.find(
      (project) => project.projectType === "default" || project.name === "My Workspaces"
    ) ?? null;
  if (!myWorkspaces) {
    myWorkspaces = {
      id: `project-my-${profileId}`,
      name: "My Workspaces",
      description: "Your personal workspaces",
      color: "blue",
      projectType: "default",
      workspaceIds: [],
      ownerType: "local_profile",
      profileId,
      createdAt: now,
      updatedAt: now
    };
    projects = [...projects, myWorkspaces];
  } else if (myWorkspaces.projectType !== "default") {
    myWorkspaces = { ...myWorkspaces, projectType: "default" };
    projects = projects.map((project) =>
      project.id === myWorkspaces!.id ? myWorkspaces! : project
    );
  }

  // Backfill: ungrouped profile workspaces belong to My Workspaces (silent, no events).
  const records = readProfileJourneyRecords();
  const hasUngrouped = records.some((record) => {
    if (record.profileId !== profileId) return false;
    const meta = record.workspaceMeta ?? record.result.workspaceMeta;
    return Boolean(meta) && !meta?.projectId;
  });

  if (hasUngrouped) {
    const ids = new Set(myWorkspaces.workspaceIds);
    const updatedRecords = records.map((record) => {
      if (record.profileId !== profileId) return record;
      const meta = record.workspaceMeta ?? record.result.workspaceMeta;
      if (!meta || meta.projectId) return record;
      ids.add(meta.workspaceId);
      const nextMeta = { ...meta, projectId: myWorkspaces!.id };
      return {
        ...record,
        workspaceMeta: nextMeta,
        result: { ...record.result, workspaceMeta: nextMeta }
      };
    });
    writeProfileJourneyRecords(updatedRecords);
    myWorkspaces = { ...myWorkspaces, workspaceIds: [...ids] };
    projects = projects.map((project) =>
      project.id === myWorkspaces!.id ? myWorkspaces! : project
    );
  }

  writeProfileProjectRecords(projects);
  return { myWorkspaces };
}

export function assignWorkspaceToProjectSilently(
  workspaceId: string,
  projectId: string,
  profileId?: string
): void {
  const update = (projects: WorkspaceProject[]) =>
    projects.map((project) =>
      project.id === projectId
        ? { ...project, workspaceIds: [...new Set([...project.workspaceIds, workspaceId])] }
        : project
    );

  if (profileId) {
    writeProfileProjectRecords(update(readProfileProjectRecords()));
    return;
  }
  writeTemporaryProjectRecords(update(readTemporaryProjectRecords()));
}

export function saveProject(project: WorkspaceProject): WorkspaceProject {
  if (project.ownerType === "local_profile") {
    writeProfileProjectRecords([
      ...readProfileProjectRecords().filter((item) => item.id !== project.id),
      project
    ]);
    return project;
  }

  writeTemporaryProjectRecords([
    ...readTemporaryProjectRecords().filter((item) => item.id !== project.id),
    project
  ]);
  return project;
}

export function createProject(args: {
  name: string;
  description?: string;
  color?: WorkspaceProject["color"];
  pinned?: boolean;
  profileId?: string;
}): WorkspaceProject {
  const now = new Date().toISOString();
  return saveProject({
    id: `project-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name: args.name.trim() || "Untitled project",
    description: args.description?.trim() || undefined,
    color: args.color ?? "blue",
    projectType: "custom",
    pinned: args.pinned ?? true,
    workspaceIds: [],
    ownerType: args.profileId ? "local_profile" : "guest",
    profileId: args.profileId,
    createdAt: now,
    updatedAt: now
  });
}

export function updateProject(project: WorkspaceProject): WorkspaceProject {
  const existing = (project.profileId
    ? readProfileProjectRecords()
    : readTemporaryProjectRecords()
  ).find((item) => item.id === project.id);

  // System projects keep their name.
  const name = existing?.projectType === "system" ? existing.name : project.name;

  return saveProject({
    ...project,
    name,
    updatedAt: new Date().toISOString()
  });
}

export function deleteProject(projectId: string, profileId?: string): void {
  const projects = profileId ? readProfileProjectRecords() : readTemporaryProjectRecords();
  const target = projects.find((project) => project.id === projectId);
  if (target?.projectType === "system" || target?.projectType === "default") return;
  const nextProjects = projects.filter((project) => {
    if (project.id !== projectId) return true;
    if (profileId && project.profileId !== profileId) return true;
    return false;
  });

  if (profileId) {
    writeProfileProjectRecords(nextProjects);
    writeProfileJourneyRecords(
      readProfileJourneyRecords().map((record) =>
        record.profileId === profileId && record.workspaceMeta?.projectId === projectId
          ? withProject(record, undefined, "workspace_removed_from_project")
          : record
      )
    );
    return;
  }

  writeTemporaryProjectRecords(nextProjects);
  writeTemporaryJourneyRecords(
    readTemporaryJourneyRecords().map((record) =>
      record.workspaceMeta?.projectId === projectId
        ? withProject(record, undefined, "workspace_removed_from_project")
        : record
    )
  );
}

export function addWorkspaceToProject(workspaceId: string, projectId: string, profileId?: string): RedefinedResult | null {
  const now = new Date().toISOString();

  if (profileId) {
    const projects = readProfileProjectRecords();
    writeProfileProjectRecords(projects.map((project) =>
      project.id === projectId && project.profileId === profileId
        ? {
            ...project,
            workspaceIds: [...new Set([...project.workspaceIds, workspaceId])],
            updatedAt: now
          }
        : project
    ));

    let updatedResult: RedefinedResult | null = null;
    writeProfileJourneyRecords(readProfileJourneyRecords().map((record) => {
      const matches = record.profileId === profileId && record.workspaceMeta?.workspaceId === workspaceId;
      if (!matches) return record;
      const updated = withProject(record, projectId, "workspace_added_to_project");
      updatedResult = updated.result;
      return updated;
    }));
    return updatedResult;
  }

  writeTemporaryProjectRecords(readTemporaryProjectRecords().map((project) =>
    project.id === projectId
      ? {
          ...project,
          workspaceIds: [...new Set([...project.workspaceIds, workspaceId])],
          updatedAt: now
        }
      : project
  ));

  let updatedResult: RedefinedResult | null = null;
  writeTemporaryJourneyRecords(readTemporaryJourneyRecords().map((record) => {
    const matches = record.workspaceMeta?.workspaceId === workspaceId;
    if (!matches) return record;
    const updated = withProject(record, projectId, "workspace_added_to_project");
    updatedResult = updated.result;
    return updated;
  }));
  return updatedResult;
}

export function moveWorkspacesToProject(
  workspaceIds: string[],
  targetProjectId: string,
  profileId?: string
): void {
  if (workspaceIds.length === 0) return;
  const ids = new Set(workspaceIds);
  const now = new Date().toISOString();

  const updateProjects = (projects: WorkspaceProject[]) =>
    projects.map((project) => {
      const filtered = project.workspaceIds.filter((id) => !ids.has(id));
      if (project.id === targetProjectId) {
        return {
          ...project,
          workspaceIds: [...new Set([...filtered, ...workspaceIds])],
          updatedAt: now
        };
      }
      return filtered.length !== project.workspaceIds.length
        ? { ...project, workspaceIds: filtered, updatedAt: now }
        : project;
    });

  if (profileId) {
    writeProfileProjectRecords(updateProjects(readProfileProjectRecords()));
    writeProfileJourneyRecords(
      readProfileJourneyRecords().map((record) => {
        if (record.profileId !== profileId) return record;
        const meta = record.workspaceMeta ?? record.result.workspaceMeta;
        if (!meta || !ids.has(meta.workspaceId) || meta.projectId === targetProjectId) return record;
        return withProject(record, targetProjectId, "workspace_added_to_project");
      })
    );
    return;
  }

  writeTemporaryProjectRecords(updateProjects(readTemporaryProjectRecords()));
  writeTemporaryJourneyRecords(
    readTemporaryJourneyRecords().map((record) => {
      const meta = record.workspaceMeta ?? record.result.workspaceMeta;
      if (!meta || !ids.has(meta.workspaceId) || meta.projectId === targetProjectId) return record;
      return withProject(record, targetProjectId, "workspace_added_to_project");
    })
  );
}

export function removeWorkspaceFromProject(workspaceId: string, projectId: string, profileId?: string): RedefinedResult | null {
  if (profileId) {
    writeProfileProjectRecords(readProfileProjectRecords().map((project) =>
      project.id === projectId && project.profileId === profileId
        ? {
            ...project,
            workspaceIds: project.workspaceIds.filter((id) => id !== workspaceId),
            updatedAt: new Date().toISOString()
          }
        : project
    ));
    let updatedResult: RedefinedResult | null = null;
    writeProfileJourneyRecords(readProfileJourneyRecords().map((record) => {
      const matches = record.profileId === profileId && record.workspaceMeta?.workspaceId === workspaceId;
      if (!matches) return record;
      const updated = withProject(record, undefined, "workspace_removed_from_project");
      updatedResult = updated.result;
      return updated;
    }));
    return updatedResult;
  }

  writeTemporaryProjectRecords(readTemporaryProjectRecords().map((project) =>
    project.id === projectId
      ? {
          ...project,
          workspaceIds: project.workspaceIds.filter((id) => id !== workspaceId),
          updatedAt: new Date().toISOString()
        }
      : project
  ));
  let updatedResult: RedefinedResult | null = null;
  writeTemporaryJourneyRecords(readTemporaryJourneyRecords().map((record) => {
    const matches = record.workspaceMeta?.workspaceId === workspaceId;
    if (!matches) return record;
    const updated = withProject(record, undefined, "workspace_removed_from_project");
    updatedResult = updated.result;
    return updated;
  }));
  return updatedResult;
}

function withProject<T extends TemporaryJourneyRecord | ProfileJourneyRecord>(
  record: T,
  projectId: string | undefined,
  eventType: "workspace_added_to_project" | "workspace_removed_from_project"
): T {
  const now = new Date().toISOString();
  const existingMeta = record.workspaceMeta ?? record.result.workspaceMeta;
  const existingJourney = record.journey ?? record.result.workspaceJourney ?? [];
  const workspaceMeta = existingMeta
    ? {
        ...existingMeta,
        projectId,
        updatedAt: now
      }
    : undefined;
  const event: JourneyEvent = {
    id: `event-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    eventType,
    title: eventType === "workspace_added_to_project" ? "Workspace added to project" : "Workspace removed from project",
    description: eventType === "workspace_added_to_project"
      ? "Workspace was grouped under a project."
      : "Workspace was removed from its project.",
    timestamp: now
  };
  const workspaceJourney = [...existingJourney, event];

  return {
    ...record,
    result: {
      ...record.result,
      workspaceMeta,
      workspaceJourney,
      workspaceBranches: record.branches ?? record.result.workspaceBranches,
      workspaceArtifacts: record.artifacts ?? record.result.workspaceArtifacts,
      workspaceAudioGuides: record.audioGuides ?? record.result.workspaceAudioGuides
    },
    workspaceMeta,
    journey: workspaceJourney,
    updatedAt: now
  };
}

export function getGuestLimitState(): GuestLimitState {
  const count = getTemporaryJourneyRecords().length;

  return {
    count,
    limit: TEMP_JOURNEY_LIMIT,
    hasReachedLimit: count >= TEMP_JOURNEY_LIMIT,
    shouldShowSoftReminder: count === TEMP_JOURNEY_LIMIT - 1,
    shouldShowLimitReminder: count >= TEMP_JOURNEY_LIMIT,
    shouldShowProfilePrompt: false
  };
}

export function clearTemporaryJourneyRecords(): void {
  writeTemporaryJourneyRecords([]);
  writeTemporaryProjectRecords([]);
  if (!canUseStorage("local")) return;

  try {
    window.localStorage.removeItem(TEMP_JOURNEY_KEY);
  } catch {
    // Local temporary storage is best effort only.
  }
}

export function renameWorkspaceRecord(args: {
  recordId?: string;
  workspaceId: string;
  workspaceName: string;
  persistence: WorkspaceMeta["persistence"];
  profileId?: string;
}): RedefinedResult | null {
  const now = new Date().toISOString();
  const applyRename = <T extends TemporaryJourneyRecord | ProfileJourneyRecord>(record: T): T => {
    const existingMeta = record.workspaceMeta ?? record.result.workspaceMeta;
    const existingJourney = record.journey ?? record.result.workspaceJourney ?? [];
    const updatedMeta = existingMeta
      ? {
          ...existingMeta,
          workspaceName: args.workspaceName,
          updatedAt: now
        }
      : undefined;
    const renameEvent: JourneyEvent = {
      id: `event-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      eventType: "workspace_renamed",
      title: "Workspace renamed",
      description: `Renamed workspace to ${args.workspaceName}.`,
      timestamp: now
    };
    const updatedJourney = [...existingJourney, renameEvent];
    const updatedResult = {
      ...record.result,
      workspaceMeta: updatedMeta,
      workspaceJourney: updatedJourney,
      workspaceBranches: record.branches ?? record.result.workspaceBranches,
      workspaceArtifacts: record.artifacts ?? record.result.workspaceArtifacts,
      workspaceAudioGuides: record.audioGuides ?? record.result.workspaceAudioGuides
    };

    return {
      ...record,
      title: args.workspaceName,
      result: updatedResult,
      workspaceMeta: updatedMeta,
      journey: updatedJourney,
      updatedAt: now
    };
  };

  if (args.persistence === "temporary") {
    let updatedResult: RedefinedResult | null = null;
    const records = readTemporaryJourneyRecords().map((record) => {
      const matches =
        record.id === args.recordId ||
        record.workspaceMeta?.workspaceId === args.workspaceId ||
        record.result.workspaceMeta?.workspaceId === args.workspaceId;
      if (!matches) return record;
      const updated = applyRename(record);
      updatedResult = updated.result;
      return updated;
    });
    writeTemporaryJourneyRecords(records);
    return updatedResult;
  }

  if (args.persistence === "local_profile" && args.profileId) {
    let updatedResult: RedefinedResult | null = null;
    const records = readProfileJourneyRecords().map((record) => {
      const matches =
        record.profileId === args.profileId &&
        (record.id === args.recordId ||
          record.workspaceMeta?.workspaceId === args.workspaceId ||
          record.result.workspaceMeta?.workspaceId === args.workspaceId);
      if (!matches) return record;
      const updated = applyRename(record);
      updatedResult = updated.result;
      return updated;
    });
    writeProfileJourneyRecords(records);
    return updatedResult;
  }

  return null;
}

export function deleteWorkspaceRecord(args: {
  recordId: string;
  persistence: WorkspaceMeta["persistence"];
  profileId?: string;
}): void {
  if (args.persistence === "local_profile" && args.profileId) {
    const records = readProfileJourneyRecords();
    const target = records.find(
      (record) => record.id === args.recordId && record.profileId === args.profileId
    );
    const workspaceId = target?.workspaceMeta?.workspaceId ?? target?.result.workspaceMeta?.workspaceId;

    writeProfileJourneyRecords(records.filter((record) => record !== target));
    if (workspaceId) {
      writeProfileProjectRecords(
        readProfileProjectRecords().map((project) => ({
          ...project,
          workspaceIds: project.workspaceIds.filter((id) => id !== workspaceId)
        }))
      );
    }
    return;
  }

  const records = readTemporaryJourneyRecords();
  const target = records.find((record) => record.id === args.recordId);
  const workspaceId = target?.workspaceMeta?.workspaceId ?? target?.result.workspaceMeta?.workspaceId;

  writeTemporaryJourneyRecords(records.filter((record) => record !== target));
  if (workspaceId) {
    writeTemporaryProjectRecords(
      readTemporaryProjectRecords().map((project) => ({
        ...project,
        workspaceIds: project.workspaceIds.filter((id) => id !== workspaceId)
      }))
    );
  }
}

export function deleteLibraryArtifact(args: {
  recordId: string;
  artifactId: string;
  origin: "artifact" | "follow_up";
  persistence: "temporary" | "local_profile";
  profileId?: string;
}): void {
  const now = new Date().toISOString();
  const apply = <T extends TemporaryJourneyRecord | ProfileJourneyRecord>(record: T): T => {
    if (args.origin === "artifact") {
      const workspaceArtifacts = (record.result.workspaceArtifacts ?? record.artifacts ?? []).filter(
        (artifact) => artifact.id !== args.artifactId
      );
      return {
        ...record,
        artifacts: (record.artifacts ?? []).filter((artifact) => artifact.id !== args.artifactId),
        result: { ...record.result, workspaceArtifacts },
        updatedAt: now
      };
    }

    const workspaceFollowUpResults = (record.result.workspaceFollowUpResults ?? []).filter(
      (followUp) => followUp.id !== args.artifactId
    );
    return {
      ...record,
      result: { ...record.result, workspaceFollowUpResults },
      updatedAt: now
    };
  };

  if (args.persistence === "local_profile" && args.profileId) {
    writeProfileJourneyRecords(
      readProfileJourneyRecords().map((record) =>
        record.id === args.recordId && record.profileId === args.profileId ? apply(record) : record
      )
    );
    return;
  }

  writeTemporaryJourneyRecords(
    readTemporaryJourneyRecords().map((record) =>
      record.id === args.recordId ? apply(record) : record
    )
  );
}

export function deleteAudioGuide(args: {
  recordId: string;
  audioGuideId: string;
  persistence: "temporary" | "local_profile";
  profileId?: string;
}): void {
  const now = new Date().toISOString();
  const apply = <T extends TemporaryJourneyRecord | ProfileJourneyRecord>(record: T): T => {
    const guides = (record.result.workspaceAudioGuides ?? record.audioGuides ?? []).filter(
      (narration) => narration.id !== args.audioGuideId
    );
    return {
      ...record,
      audioGuides: (record.audioGuides ?? []).filter(
        (narration) => narration.id !== args.audioGuideId
      ),
      result: { ...record.result, workspaceAudioGuides: guides },
      updatedAt: now
    };
  };

  if (args.persistence === "local_profile" && args.profileId) {
    writeProfileJourneyRecords(
      readProfileJourneyRecords().map((record) =>
        record.id === args.recordId && record.profileId === args.profileId ? apply(record) : record
      )
    );
    return;
  }

  writeTemporaryJourneyRecords(
    readTemporaryJourneyRecords().map((record) =>
      record.id === args.recordId ? apply(record) : record
    )
  );
}

export function duplicateWorkspaceRecord(args: {
  recordId: string;
  persistence: WorkspaceMeta["persistence"];
  profileId?: string;
}): TemporaryJourneyRecord | ProfileJourneyRecord | null {
  const now = new Date().toISOString();
  const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  const cloneRecord = <T extends TemporaryJourneyRecord | ProfileJourneyRecord>(
    record: T,
    newId: string
  ): T => {
    const existingMeta = record.workspaceMeta ?? record.result.workspaceMeta;
    const workspaceMeta = existingMeta
      ? {
          ...existingMeta,
          workspaceId: `${existingMeta.workspaceId}-copy-${suffix}`,
          workspaceName: `${existingMeta.workspaceName} (copy)`,
          createdAt: now,
          updatedAt: now
        }
      : undefined;
    const duplicatedEvent: JourneyEvent = {
      id: `event-${suffix}`,
      eventType: "workspace_created",
      title: "Workspace duplicated",
      description: "Workspace was duplicated from an existing workspace.",
      timestamp: now
    };
    const journey = [...(record.journey ?? record.result.workspaceJourney ?? []), duplicatedEvent];

    return {
      ...record,
      id: newId,
      title: `${record.title} (copy)`,
      result: {
        ...record.result,
        workspaceMeta,
        workspaceJourney: journey
      },
      workspaceMeta,
      journey,
      createdAt: now,
      updatedAt: now
    };
  };

  if (args.persistence === "local_profile" && args.profileId) {
    const source = readProfileJourneyRecords().find(
      (record) => record.id === args.recordId && record.profileId === args.profileId
    );
    if (!source) return null;
    const copy = cloneRecord(source, `profile-${suffix}`);
    writeProfileJourneyRecords([...readProfileJourneyRecords(), copy]);
    return copy;
  }

  const source = readTemporaryJourneyRecords().find((record) => record.id === args.recordId);
  if (!source) return null;
  const copy = cloneRecord(source, `temp-${suffix}`);
  writeTemporaryJourneyRecords([...readTemporaryJourneyRecords(), copy]);
  return copy;
}

export function dismissProfilePromptForSession(): void {
  if (!canUseStorage("session")) return;

  try {
    window.sessionStorage.setItem(PROFILE_PROMPT_DISMISSED_KEY, "true");
  } catch {
    // Session prompt dismissal is best effort only.
  }
}

export function hasDismissedProfilePromptForSession(): boolean {
  if (!canUseStorage("session")) return false;

  try {
    return window.sessionStorage.getItem(PROFILE_PROMPT_DISMISSED_KEY) === "true";
  } catch {
    return false;
  }
}
