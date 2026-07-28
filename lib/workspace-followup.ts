import type {
  RedefinedMode,
  RedefinedResult,
  WorkspaceFollowUpResult
} from "@/lib/redefined";
import type {
  JourneyEvent,
  WorkspaceItem,
  WorkspacePreferredMode,
  WorkspacePromptRun,
  WorkspaceSection,
  WorkspaceSectionType
} from "@/lib/workspace-types";

function id(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function resolveFollowUpMode(
  preferred: WorkspacePreferredMode,
  fallback: RedefinedMode
): RedefinedMode {
  return preferred === "auto" ? fallback : preferred;
}

/**
 * Builds a context-aware prompt so the API answers inside the workspace rather
 * than as a brand-new unrelated question. (e.g. "Add DNS commands" stays scoped
 * to the workspace topic.)
 */
export function buildFollowUpContextPrompt(args: {
  result: RedefinedResult;
  prompt: string;
  section?: WorkspaceSection;
}): string {
  const { result, prompt, section } = args;
  const meta = result.workspaceMeta;
  const recentRuns = (result.workspacePromptRuns ?? [])
    .filter((run) => run.status === "completed")
    .slice(-4)
    .map((run) => run.prompt);
  const artifacts = (result.workspaceArtifacts ?? []).map((artifact) => artifact.name);

  const contextLines = [
    `Workspace: ${meta?.workspaceName ?? result.title}`,
    meta?.projectId ? `This workspace belongs to an existing project.` : null,
    `Original request: ${meta?.originalPrompt ?? result.originalPrompt ?? result.title}`,
    `Current focus: ${result.title}`,
    result.summary ? `What the workspace covers so far: ${result.summary}` : null,
    result.domain ? `Domain: ${result.domain}` : null,
    section ? `The user is asking specifically about the "${section.title}" section.` : null,
    recentRuns.length > 0 ? `Previous follow-ups in this workspace: ${recentRuns.join("; ")}` : null,
    artifacts.length > 0 ? `Artifacts already created: ${artifacts.join(", ")}` : null
  ].filter(Boolean) as string[];

  return [
    "You are continuing work inside an existing Doc/ReDefined workspace.",
    "Use the workspace context below and stay on the same topic.",
    "",
    contextLines.join("\n"),
    "",
    `Follow-up request: ${prompt}`,
    "",
    "Answer specifically in the context of this workspace. Do not treat this as a new, unrelated question."
  ].join("\n");
}

/** Picks the section a follow-up result should be filed under. */
export function pickFollowUpSection(
  sections: WorkspaceSection[],
  options: { sectionId?: string; sectionHint?: WorkspaceSectionType; mode: RedefinedMode }
): WorkspaceSection | undefined {
  if (sections.length === 0) return undefined;

  if (options.sectionId) {
    const explicit = sections.find((section) => section.id === options.sectionId);
    if (explicit) return explicit;
  }

  if (options.sectionHint) {
    const hinted = sections.find((section) => section.type === options.sectionHint);
    if (hinted) return hinted;
  }

  const modeDefault: Record<RedefinedMode, WorkspaceSectionType> = {
    understand: "overview",
    build: "plan",
    fix: "overview",
    artifact: "drafts"
  };
  const byMode = sections.find((section) => section.type === modeDefault[options.mode]);
  if (byMode) return byMode;

  return (
    sections.find((section) => section.type === "prompt_runs") ??
    sections.find((section) => section.type === "overview") ??
    sections[0]
  );
}

/** Short, human title for a prompt run from the raw prompt text. */
export function followUpTitle(prompt: string): string {
  const firstLine = prompt.split("\n")[0].trim();
  return firstLine.length > 72 ? `${firstLine.slice(0, 69)}…` : firstLine;
}

/** Appends a running prompt run + a "started" timeline event. */
export function withPromptRunStarted(
  result: RedefinedResult,
  run: WorkspacePromptRun
): RedefinedResult {
  const event: JourneyEvent = {
    id: id("event"),
    eventType: "follow_up_prompt_started",
    title: "Follow-up prompt started",
    description: `Running "${followUpTitle(run.prompt)}" in this workspace.`,
    timestamp: run.createdAt,
    sectionId: run.sectionId,
    promptRunId: run.id
  };

  return {
    ...result,
    workspacePromptRuns: [...(result.workspacePromptRuns ?? []), run],
    workspaceJourney: [...(result.workspaceJourney ?? []), event],
    workspaceMeta: result.workspaceMeta
      ? { ...result.workspaceMeta, updatedAt: run.createdAt }
      : result.workspaceMeta
  };
}

/**
 * Marks the run completed, files the follow-up result into a section, and adds
 * a "completed" timeline event. Never overwrites the original first result.
 */
export function withPromptRunCompleted(
  result: RedefinedResult,
  args: {
    runId: string;
    followUp: WorkspaceFollowUpResult;
    section?: WorkspaceSection;
  }
): RedefinedResult {
  const now = new Date().toISOString();
  const { runId, followUp, section } = args;

  const runs = (result.workspacePromptRuns ?? []).map((run) =>
    run.id === runId
      ? {
          ...run,
          status: "completed" as const,
          resultId: followUp.content.id,
          sectionId: followUp.sectionId ?? run.sectionId,
          completedAt: now
        }
      : run
  );

  let sections = result.workspaceSections;
  let items = result.workspaceItems;
  if (section) {
    const item: WorkspaceItem = {
      id: id("item"),
      workspaceId: followUp.workspaceId,
      sectionId: section.id,
      type: "result",
      sourceId: followUp.id,
      createdAt: now
    };
    items = [...(result.workspaceItems ?? []), item];
    sections = (result.workspaceSections ?? []).map((entry) =>
      entry.id === section.id
        ? { ...entry, itemIds: [...entry.itemIds, item.id], updatedAt: now }
        : entry
    );
  }

  const event: JourneyEvent = {
    id: id("event"),
    eventType: "follow_up_prompt_completed",
    title: "Follow-up prompt completed",
    description: section
      ? `Added "${followUp.title}" to the ${section.title} section.`
      : `Added "${followUp.title}" to this workspace.`,
    timestamp: now,
    sectionId: section?.id,
    promptRunId: runId,
    resultId: followUp.content.id
  };

  return {
    ...result,
    workspacePromptRuns: runs,
    workspaceFollowUpResults: [...(result.workspaceFollowUpResults ?? []), followUp],
    workspaceSections: sections,
    workspaceItems: items,
    workspaceJourney: [...(result.workspaceJourney ?? []), event],
    workspaceMeta: result.workspaceMeta
      ? { ...result.workspaceMeta, updatedAt: now }
      : result.workspaceMeta
  };
}

/** Marks a run failed and records a "failed" timeline event. */
export function withPromptRunFailed(result: RedefinedResult, runId: string): RedefinedResult {
  const now = new Date().toISOString();
  const runs = (result.workspacePromptRuns ?? []).map((run) =>
    run.id === runId ? { ...run, status: "failed" as const, completedAt: now } : run
  );
  const failedRun = runs.find((run) => run.id === runId);
  const event: JourneyEvent = {
    id: id("event"),
    eventType: "follow_up_prompt_failed",
    title: "Follow-up prompt failed",
    description: failedRun
      ? `"${followUpTitle(failedRun.prompt)}" could not be generated.`
      : "A follow-up prompt could not be generated.",
    timestamp: now,
    promptRunId: failedRun?.id
  };

  return {
    ...result,
    workspacePromptRuns: runs,
    workspaceJourney: [...(result.workspaceJourney ?? []), event]
  };
}

export function newPromptRunId(): string {
  return id("run");
}

export function newFollowUpResultId(): string {
  return id("followup");
}
