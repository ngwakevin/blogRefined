import type { RedefinedResult } from "@/lib/redefined";
import type {
  JourneyEvent,
  WorkspaceArtifact,
  WorkspaceArtifactType,
  WorkspaceItem,
  WorkspaceSection
} from "@/lib/workspace-types";

export type ArtifactTypeOption = {
  id: string;
  label: string;
  artifactType: WorkspaceArtifactType;
  /** How to instruct the generator for this output. */
  instruction: string;
};

export const ARTIFACT_TYPE_OPTIONS: ArtifactTypeOption[] = [
  { id: "summary", label: "Summary", artifactType: "summary", instruction: "a concise summary that captures the key points" },
  { id: "runbook", label: "Runbook", artifactType: "runbook", instruction: "a step-by-step operational runbook" },
  { id: "checklist", label: "Checklist", artifactType: "checklist", instruction: "an actionable checklist" },
  { id: "ticket", label: "Ticket update", artifactType: "ticket", instruction: "a ticket update with status and next steps" },
  { id: "architecture", label: "Architecture document", artifactType: "document", instruction: "an architecture document describing components, flows, and decisions" },
  { id: "business_plan", label: "Business plan", artifactType: "business_plan", instruction: "a structured business plan" },
  { id: "training", label: "Training outline", artifactType: "document", instruction: "a training outline with modules and learning objectives" },
  { id: "implementation", label: "Implementation plan", artifactType: "document", instruction: "an implementation plan with phases, tasks, and milestones" }
];

export function artifactOptionById(id: string): ArtifactTypeOption {
  return ARTIFACT_TYPE_OPTIONS.find((option) => option.id === id) ?? ARTIFACT_TYPE_OPTIONS[0];
}

export type ArtifactTone = "purple" | "green" | "yellow" | "blue" | "dark";

/** Small-badge tone per artifact type (documents disambiguate via displayType). */
export function artifactTone(type: WorkspaceArtifactType, displayType?: string): ArtifactTone {
  switch (type) {
    case "summary":
      return "purple";
    case "checklist":
      return "green";
    case "runbook":
      return "yellow";
    case "ticket":
      return "blue";
    case "business_plan":
      return "green";
    case "code":
      return "dark";
    default: {
      const label = (displayType ?? "").toLowerCase();
      if (label.includes("implementation")) return "blue";
      if (label.includes("training")) return "purple";
      return "dark";
    }
  }
}

export const ARTIFACT_TYPE_LABELS: Record<WorkspaceArtifactType, string> = {
  ticket: "Ticket update",
  runbook: "Runbook",
  business_plan: "Business plan",
  checklist: "Checklist",
  summary: "Summary",
  code: "Code",
  document: "Document"
};

/** Default title from workspace name + artifact type, e.g. "Private Endpoint Concept Summary". */
export function buildArtifactTitle(workspaceName: string, option: ArtifactTypeOption): string {
  const base = workspaceName.trim() || "Workspace";
  const label = option.label;
  return base.toLowerCase().includes(label.toLowerCase()) ? base : `${base} ${label}`;
}

/** Builds the generation prompt from full workspace context so the output stays on-topic. */
export function buildArtifactInstruction(args: {
  result: RedefinedResult;
  option: ArtifactTypeOption;
  title: string;
  instructions?: string;
}): string {
  const { result, option, title, instructions } = args;
  const meta = result.workspaceMeta;
  const recentRuns = (result.workspacePromptRuns ?? [])
    .filter((run) => run.status === "completed")
    .slice(-4)
    .map((run) => run.prompt);

  const contextLines = [
    `Workspace: ${meta?.workspaceName ?? result.title}`,
    `Original request: ${meta?.originalPrompt ?? result.originalPrompt ?? result.title}`,
    `Current focus: ${result.title}`,
    result.summary ? `Workspace summary: ${result.summary}` : null,
    result.domain ? `Domain: ${result.domain}` : null,
    recentRuns.length > 0 ? `Follow-ups so far: ${recentRuns.join("; ")}` : null
  ].filter(Boolean) as string[];

  return [
    `Create ${option.instruction} as a reusable artifact titled "${title}".`,
    "Base it entirely on the existing workspace below and stay on the same topic.",
    "",
    contextLines.join("\n"),
    instructions?.trim() ? `\nExtra instructions: ${instructions.trim()}` : "",
    "",
    "Return well-structured markdown ready to copy or download."
  ]
    .filter((line) => line !== null)
    .join("\n");
}

let artifactCounter = 0;
export function newArtifactId(): string {
  artifactCounter += 1;
  return `artifact-${Date.now().toString(36)}-${artifactCounter}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Picks the section a new artifact should be filed under. */
function pickArtifactSection(sections: WorkspaceSection[]): WorkspaceSection | undefined {
  return (
    sections.find((section) => section.type === "artifact") ??
    sections.find((section) => section.type === "exports") ??
    sections.find((section) => section.type === "outputs") ??
    sections.find((section) => section.type === "drafts")
  );
}

/**
 * Adds a generated artifact to the workspace result: artifacts list, a section
 * item, and an `artifact_created` timeline event. Never touches the main result.
 */
export function applyArtifactToWorkspace(
  result: RedefinedResult,
  artifact: WorkspaceArtifact
): RedefinedResult {
  const now = artifact.createdAt;
  const section = pickArtifactSection(result.workspaceSections ?? []);

  let sections = result.workspaceSections;
  let items = result.workspaceItems;
  if (section) {
    const item: WorkspaceItem = {
      id: `item-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      workspaceId: artifact.workspaceId ?? result.workspaceMeta?.workspaceId ?? result.id,
      sectionId: section.id,
      type: "artifact",
      sourceId: artifact.id,
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
    id: `event-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    eventType: "artifact_created",
    title: "Artifact created",
    description: `Generated "${artifact.name}" (${artifact.displayType ?? artifact.artifactType}).`,
    timestamp: now,
    artifactId: artifact.id
  };

  return {
    ...result,
    workspaceArtifacts: [...(result.workspaceArtifacts ?? []), artifact],
    workspaceSections: sections,
    workspaceItems: items,
    workspaceJourney: [...(result.workspaceJourney ?? []), event],
    workspaceMeta: result.workspaceMeta
      ? { ...result.workspaceMeta, updatedAt: now }
      : result.workspaceMeta
  };
}

/** Filename for downloading an artifact, e.g. "private-endpoint-summary.md". */
export function artifactFilename(artifact: WorkspaceArtifact): string {
  const slug =
    artifact.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 60) || "artifact";
  const ext = artifact.format === "text" ? "txt" : "md";
  return `${slug}.${ext}`;
}

/** Full file content for an artifact download, including metadata header. */
export function artifactDownloadContent(
  artifact: WorkspaceArtifact,
  sourceWorkspaceName: string
): string {
  const created = new Date(artifact.createdAt).toLocaleDateString();
  return [
    `# ${artifact.name}`,
    "",
    `Type: ${artifact.displayType ?? artifact.artifactType}`,
    `Source workspace: ${sourceWorkspaceName}`,
    `Created: ${created}`,
    "",
    "---",
    "",
    artifact.content ?? ""
  ].join("\n");
}
