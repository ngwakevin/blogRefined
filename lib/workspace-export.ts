import { getProjects } from "@/lib/journey-store";
import type { RedefinedResult, WorkspaceFollowUpResult } from "@/lib/redefined";
import type {
  JourneyEvent,
  WorkspaceArtifact,
  WorkspaceNarration,
  WorkspaceItem,
  WorkspacePromptRun,
  WorkspaceSection
} from "@/lib/workspace-types";

export type WorkspaceExportFormat = "markdown" | "json";

export type WorkspaceExportPackage = {
  workspaceName: string;
  markdown: string;
  jsonText: string;
  markdownFilename: string;
  jsonFilename: string;
  projectName: string;
  exportData: WorkspaceExportData;
};

export type WorkspaceExportData = {
  generatedBy: string;
  exportedAt: string;
  workspace: {
    id: string;
    name: string;
    subtitle?: string;
    mode: string;
    path: string;
    status: string;
    projectId?: string;
    projectName?: string;
    createdAt?: string;
    updatedAt?: string;
    originalPrompt?: string;
    persistence?: string;
    ownerType?: string;
    domain?: string;
    workspaceType?: string;
    branches?: RedefinedResult["workspaceBranches"];
  };
  project?: {
    id: string;
    name: string;
    color?: string;
    pinned?: boolean;
    description?: string;
  };
  sections: WorkspaceSection[];
  items: WorkspaceItem[];
  promptRuns: WorkspacePromptRun[];
  results: WorkspaceResultExport[];
  artifacts: WorkspaceArtifactExport[];
  audioGuides: WorkspaceNarrationExport[];
  timeline: JourneyEvent[];
};

export type WorkspaceResultExport = {
  kind: "main" | "follow_up";
  id: string;
  title: string;
  summary: string;
  mode: RedefinedResult["mode"];
  promptRunId?: string;
  sectionId?: string;
  createdAt?: string;
  preview: string;
  result: Record<string, unknown>;
};

export type WorkspaceArtifactExport = {
  id: string;
  name: string;
  type: string;
  createdAt: string;
  updatedAt?: string;
  sourceResultId?: string;
  sourceRunId?: string;
  projectId?: string;
  workspaceId?: string;
  content?: string;
  instructions?: string;
  format?: string;
};

export type WorkspaceNarrationExport = {
  id: string;
  title: string;
  script: string;
  generatedAt: string;
  sourceResultHash: string;
  sourceResultId?: string;
  sourceRunId?: string;
  narrationMode: string;
  durationEstimateSeconds?: number;
  mimeType?: string;
  audioPersisted?: boolean;
};

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}

function formatDateTime(value?: string): string {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function truncate(text: string, max = 260): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function getProjectName(result: RedefinedResult, profileId?: string): string {
  const projects = getProjects(profileId);
  const projectId = result.workspaceMeta?.projectId;
  return projectId ? projects.find((project) => project.id === projectId)?.name ?? "Unassigned" : "Unassigned";
}

function getProject(result: RedefinedResult, profileId?: string) {
  const projectId = result.workspaceMeta?.projectId;
  if (!projectId) return null;
  return getProjects(profileId).find((project) => project.id === projectId) ?? null;
}

function stripWorkspaceCollections(result: RedefinedResult): Record<string, unknown> {
  const clone = structuredClone(result) as Record<string, unknown>;
  delete clone.workspaceFollowUpResults;
  delete clone.workspacePromptRuns;
  delete clone.workspaceJourney;
  delete clone.workspaceArtifacts;
  delete clone.workspaceAudioGuides;
  delete clone.workspaceSections;
  delete clone.workspaceItems;
  return clone;
}

function buildPreview(result: RedefinedResult): string {
  const pieces = [
    result.summary,
    result.artifactPreview?.body,
    result.diagnosticTerminal?.commands?.map((command) => command.command).join("\n"),
    result.realWorldExample?.explanation,
    result.resultGuide?.differentiation.description
  ].filter(Boolean) as string[];
  return truncate(pieces.join("\n\n") || result.title || "No preview available");
}

function buildResultExports(result: RedefinedResult): WorkspaceResultExport[] {
  const followUps = result.workspaceFollowUpResults ?? [];
  const mainResult: WorkspaceResultExport = {
    kind: "main",
    id: result.id,
    title: result.title,
    summary: result.summary ?? "",
    mode: result.mode,
    promptRunId: result.promptRunId,
    preview: buildPreview(result),
    result: stripWorkspaceCollections(result)
  };

  const followUpResults: WorkspaceResultExport[] = followUps.map((entry): WorkspaceResultExport => ({
    kind: "follow_up",
    id: entry.content.id,
    title: entry.title,
    summary: entry.summary,
    mode: entry.mode,
    promptRunId: entry.promptRunId,
    sectionId: entry.sectionId,
    createdAt: entry.createdAt,
    preview: buildPreview(entry.content),
    result: stripWorkspaceCollections(entry.content)
  }));

  return [mainResult, ...followUpResults];
}

function resolveResultByRunId(result: RedefinedResult, runId?: string): RedefinedResult | null {
  if (!runId) return null;
  if (result.promptRunId === runId) return result;
  const match = (result.workspaceFollowUpResults ?? []).find((entry) => entry.promptRunId === runId);
  return match?.content ?? null;
}

function sanitizeArtifacts(artifacts: WorkspaceArtifact[] = []): WorkspaceArtifactExport[] {
  return artifacts.map((artifact) => ({
    id: artifact.id,
    name: artifact.name,
    type: artifact.displayType ?? artifact.artifactType,
    createdAt: artifact.createdAt,
    updatedAt: artifact.updatedAt,
    sourceResultId: artifact.sourceResultId,
    sourceRunId: artifact.sourceRunId,
    projectId: artifact.projectId,
    workspaceId: artifact.workspaceId,
    content: artifact.content,
    instructions: artifact.instructions,
    format: artifact.format
  }));
}

function sanitizeAudioGuides(guides: WorkspaceNarration[] = []): WorkspaceNarrationExport[] {
  return guides.map((guide) => ({
    id: guide.id,
    title: guide.title,
    script: guide.script,
    generatedAt: guide.generatedAt,
    sourceResultHash: guide.sourceResultHash,
    sourceResultId: guide.sourceResultId,
    sourceRunId: guide.sourceRunId,
    narrationMode: guide.narrationMode,
    durationEstimateSeconds: guide.durationEstimateSeconds,
    mimeType: guide.mimeType,
    audioPersisted: guide.audioPersisted
  }));
}

function getLinkedItems(
  section: WorkspaceSection,
  items: WorkspaceItem[],
  exportData: WorkspaceExportData
): string[] {
  const linked = items.filter((item) => item.sectionId === section.id);
  if (linked.length === 0) return [];

  return linked.map((item) => {
    if (item.type === "artifact") {
      const artifact = exportData.artifacts.find((entry) => entry.id === item.sourceId);
      return artifact ? `Artifact: ${artifact.name}` : "Artifact";
    }
    if (item.type === "audio_guide") {
      const guide = exportData.audioGuides.find((entry) => entry.id === item.sourceId);
      return guide ? `Audio guide: ${guide.title}` : "Audio guide";
    }
    if (item.type === "prompt_run") {
      const run = exportData.promptRuns.find((entry) => entry.id === item.sourceId);
      return run ? `Prompt run: ${truncate(run.prompt, 42)}` : "Prompt run";
    }
    if (item.type === "result") {
      const match = exportData.results.find((entry) => entry.id === item.sourceId);
      return match ? `Result: ${match.title}` : "Result";
    }
    return item.type.replace("_", " ");
  });
}

function getResultContent(result: RedefinedResult | WorkspaceResultExport): string {
  if ("preview" in result) {
    return result.summary || result.preview || "No result available.";
  }
  return result.summary || buildPreview(result) || "No result available.";
}

function buildMarkdown(result: RedefinedResult, exportData: WorkspaceExportData): string {
  const lines: string[] = [];
  const workspace = exportData.workspace;
  const latestResult = [...exportData.results].reverse().find((entry) => entry.kind === "follow_up") ?? exportData.results[0];

  lines.push(`# ${workspace.name}`);
  lines.push("");
  lines.push(`Project: ${workspace.projectName ?? "Unassigned"}`);
  lines.push(`Status: ${workspace.status}`);
  lines.push(`Path: ${workspace.mode}`);
  lines.push(`Created: ${formatDateTime(workspace.createdAt)}`);
  lines.push(`Updated: ${formatDateTime(workspace.updatedAt)}`);
  lines.push("");
  lines.push("## Overview");
  lines.push("");
  lines.push(workspace.subtitle?.trim() || "No workspace description available.");
  if (latestResult?.summary) {
    lines.push("");
    lines.push("Latest result summary:");
    lines.push("");
    lines.push(latestResult.summary);
  }
  lines.push("");

  lines.push("## Sections");
  lines.push("");
  if (exportData.sections.length === 0) {
    lines.push("No sections available.");
  } else {
    exportData.sections.forEach((section) => {
      lines.push(`- ${section.title}${section.description ? ` — ${section.description}` : ""}`);
      const linkedItems = getLinkedItems(section, exportData.items, exportData);
      if (linkedItems.length > 0) {
        linkedItems.forEach((item) => lines.push(`  - ${item}`));
      }
    });
  }
  lines.push("");

  lines.push("## Prompt Runs");
  lines.push("");
  if (exportData.promptRuns.length === 0) {
    lines.push("No prompt runs available.");
  } else {
    exportData.promptRuns.forEach((run, index) => {
      const matchingResult = resolveResultByRunId(result, run.id)
        ?? exportData.results.find((entry) => entry.promptRunId === run.id);
      const linkedArtifacts = exportData.artifacts.filter(
        (artifact) => artifact.sourceRunId === run.id || artifact.sourceResultId === matchingResult?.id
      );
      const linkedGuides = exportData.audioGuides.filter(
        (guide) => guide.sourceRunId === run.id || guide.sourceResultId === matchingResult?.id
      );
      lines.push(`### Prompt ${index + 1}: ${truncate(run.prompt.split("\n")[0] || run.prompt, 72)}`);
      lines.push(`Status: ${run.status}`);
      lines.push(`Mode: ${run.mode}`);
      lines.push(`Created: ${formatDateTime(run.createdAt)}`);
      if (run.completedAt) lines.push(`Completed: ${formatDateTime(run.completedAt)}`);
      if (run.sectionId) {
        const section = exportData.sections.find((entry) => entry.id === run.sectionId);
        if (section) lines.push(`Section: ${section.title}`);
      }
      lines.push("");
      lines.push("Prompt:");
      lines.push("");
      lines.push(run.prompt);
      lines.push("");
      lines.push("Result summary:");
      lines.push("");
      if (!matchingResult) {
        lines.push("Result unavailable");
      } else if (run.status === "failed") {
        lines.push(`Error: ${getResultContent(matchingResult) || "Unable to generate result."}`);
      } else {
        lines.push(getResultContent(matchingResult));
      }
      if (linkedArtifacts.length > 0) {
        lines.push("");
        lines.push("Linked artifacts:");
        linkedArtifacts.forEach((artifact) => lines.push(`- ${artifact.name}`));
      }
      if (linkedGuides.length > 0) {
        lines.push("");
        lines.push("Linked audio guides:");
        linkedGuides.forEach((guide) => lines.push(`- ${guide.title}`));
      }
      lines.push("");
    });
  }

  lines.push("## Results");
  lines.push("");
  if (exportData.results.length === 0) {
    lines.push("No results available.");
  } else {
    exportData.results.forEach((entry) => {
      lines.push(`### ${entry.title}`);
      lines.push("");
      lines.push(`Source prompt run: ${entry.promptRunId ?? "N/A"}`);
      lines.push(`Mode: ${entry.mode}`);
      if (entry.sectionId) {
        const section = exportData.sections.find((item) => item.id === entry.sectionId);
        if (section) lines.push(`Section: ${section.title}`);
      }
      lines.push(`Created: ${formatDateTime(entry.createdAt)}`);
      lines.push("");
      lines.push("Content:");
      lines.push("");
      lines.push(entry.summary || entry.preview || JSON.stringify(entry.result, null, 2));
      lines.push("");
    });
  }

  lines.push("## Artifacts");
  lines.push("");
  if (exportData.artifacts.length === 0) {
    lines.push("No artifacts available.");
  } else {
    exportData.artifacts.forEach((artifact) => {
      lines.push(`### ${artifact.name}`);
      lines.push("");
      lines.push(`Type: ${artifact.type}`);
      lines.push(`Created: ${formatDateTime(artifact.createdAt)}`);
      if (artifact.sourceRunId) lines.push(`Source prompt run: ${artifact.sourceRunId}`);
      if (artifact.sourceResultId) lines.push(`Source result: ${artifact.sourceResultId}`);
      lines.push("");
      lines.push("Content:");
      lines.push("");
      lines.push(artifact.content || "No artifact content available.");
      lines.push("");
    });
  }
  lines.push("");

  lines.push("## Audio Guides");
  lines.push("");
  if (exportData.audioGuides.length === 0) {
    lines.push("No audio guides available.");
  } else {
    exportData.audioGuides.forEach((guide) => {
      lines.push(`### ${guide.title}`);
      lines.push("");
      lines.push(`Status: ${guide.audioPersisted ? "ready" : "transcript_only"}`);
      lines.push(`Created: ${formatDateTime(guide.generatedAt)}`);
      if (guide.durationEstimateSeconds) lines.push(`Duration: ${guide.durationEstimateSeconds}s`);
      if (guide.sourceRunId) lines.push(`Source prompt run: ${guide.sourceRunId}`);
      if (guide.sourceResultId) lines.push(`Source result: ${guide.sourceResultId}`);
      lines.push("");
      lines.push("Transcript:");
      lines.push("");
      lines.push(guide.script || "No transcript available.");
      lines.push("");
    });
  }
  lines.push("");

  lines.push("## Timeline");
  lines.push("");
  if (exportData.timeline.length === 0) {
    lines.push("No timeline activity available.");
  } else {
    exportData.timeline.forEach((event) => {
      const refs = [
        event.promptRunId ? `Prompt run ${event.promptRunId}` : null,
        event.artifactId ? `Artifact ${event.artifactId}` : null,
        event.audioGuideId ? `Audio guide ${event.audioGuideId}` : null,
        event.sectionId ? `Section ${event.sectionId}` : null
      ].filter(Boolean);
      lines.push(`- ${formatDateTime(event.timestamp)} — ${event.title}: ${event.description}${refs.length > 0 ? ` (${refs.join(", ")})` : ""}`);
    });
  }
  lines.push("");
  lines.push("## Source");
  lines.push("");
  lines.push("Generated by Doc/ReDefined");

  return lines.join("\n");
}

export function buildWorkspaceExportPackage(args: {
  result: RedefinedResult;
  profileId?: string;
}): WorkspaceExportPackage {
  const workspaceName = args.result.workspaceMeta?.workspaceName ?? args.result.title;
  const projectName = getProjectName(args.result, args.profileId);
  const project = getProject(args.result, args.profileId);
  const createdAt = args.result.workspaceMeta?.createdAt;
  const updatedAt = args.result.workspaceMeta?.updatedAt;
  const exportData: WorkspaceExportData = {
    generatedBy: "Doc/ReDefined",
    exportedAt: new Date().toISOString(),
    workspace: {
      id: args.result.workspaceMeta?.workspaceId ?? args.result.id,
      name: workspaceName,
      subtitle: args.result.workspaceMeta?.workspaceSubtitle,
      mode: args.result.mode,
      path: args.result.workspaceMeta?.preferredMode ?? args.result.mode,
      status: args.result.workspaceMeta?.status ?? "completed",
      projectId: args.result.workspaceMeta?.projectId,
      projectName,
      createdAt,
      updatedAt,
      originalPrompt: args.result.workspaceMeta?.originalPrompt ?? args.result.originalPrompt,
      persistence: args.result.workspaceMeta?.persistence,
      ownerType: args.result.workspaceMeta?.ownerType,
      domain: args.result.domain,
      workspaceType: args.result.workspaceType,
      branches: args.result.workspaceBranches
    },
    project: project
      ? {
          id: project.id,
          name: project.name,
          color: project.color,
          pinned: project.pinned,
          description: project.description
        }
      : undefined,
    sections: args.result.workspaceSections ?? [],
    items: args.result.workspaceItems ?? [],
    promptRuns: args.result.workspacePromptRuns ?? [],
    results: buildResultExports(args.result),
    artifacts: sanitizeArtifacts(args.result.workspaceArtifacts ?? []),
    audioGuides: sanitizeAudioGuides(args.result.workspaceAudioGuides ?? []),
    timeline: args.result.workspaceJourney ?? []
  };

  const markdown = buildMarkdown(args.result, exportData);
  const jsonText = JSON.stringify(exportData, null, 2);
  const slug = slugify(workspaceName) || "doc-redefined-workspace";

  return {
    workspaceName,
    markdown,
    jsonText,
    markdownFilename: `${slug}-workspace-export.md`,
    jsonFilename: `${slug}-workspace-export.json`,
    projectName,
    exportData
  };
}
