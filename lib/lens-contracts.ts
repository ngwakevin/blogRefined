import { buildLocalRedefinedResult } from "@/lib/redefined";
import {
  ArtifactWorkspaceResultSchema,
  BuildWorkspaceResultSchema,
  FixWorkspaceResultSchema,
  UnderstandWorkspaceResultSchema
} from "@/lib/schemas";
import type { ClassificationResult, RedefinedMode, RedefinedResult } from "@/lib/redefined";
import { normalizeUnderstandResult } from "@/lib/understand";
import type { ZodType } from "zod";

/**
 * Lens Contract system.
 *
 * The saved workspace path is the single source of truth for which lens renders. The AI's
 * classification or the raw result shape must NEVER override it. Each lens declares:
 *  - schema:           the strict shape its renderer expects
 *  - forbiddenFields:  result keys that belong to a different lens (used for mismatch warnings)
 *  - matches:          a tolerant predicate — does this result already satisfy the lens shape?
 *  - normalize:        a fallback that coerces any result into this lens's shape
 *  - instruction:      the strict generation instruction for the AI layer
 *
 * Renderer bindings live in the client layer (WorkspaceTraceTabs) so this module stays free of
 * JSX and can be imported from server code (e.g. the /api/redefine route) without pulling in
 * client components.
 */
export type LensId = RedefinedMode;

export type LensContract = {
  label: string;
  schema: ZodType;
  /** Result keys that indicate a foreign lens leaked into this one. */
  forbiddenFields: Array<keyof RedefinedResult>;
  /** Tolerant shape check: does the raw result already satisfy this lens? */
  matches: (result: RedefinedResult) => boolean;
  /** Coerce any (wrong-shaped) result into this lens, preserving identity + workspace context. */
  normalize: (args: { rawResult: RedefinedResult; originalPrompt?: string }) => RedefinedResult;
  /** Strict generation instruction for the AI layer. */
  instruction: string;
};

function promptOf(raw: RedefinedResult, originalPrompt?: string): string {
  return (
    originalPrompt ??
    raw.originalPrompt ??
    raw.workspaceMeta?.originalPrompt ??
    raw.title ??
    ""
  );
}

function classificationFor(raw: RedefinedResult, lens: LensId, prompt: string): ClassificationResult {
  return {
    confidence: raw.classification?.confidence ?? 0.4,
    source: "fallback",
    reason: `Normalized to ${lens} from a non-${lens} result shape.`,
    topic: raw.classification?.topic ?? raw.title ?? prompt,
    mode: lens
  };
}

/** Re-attach identity + workspace context onto a freshly-synthesized lens result. */
function preserveContext(
  base: RedefinedResult,
  raw: RedefinedResult,
  lens: LensId,
  prompt: string,
  classification: ClassificationResult
): RedefinedResult {
  return {
    ...base,
    id: raw.id,
    promptRunId: raw.promptRunId,
    mode: lens,
    classification,
    title: raw.title || base.title,
    summary: raw.summary || base.summary,
    originalPrompt: prompt,
    domain: raw.domain || base.domain,
    resultGuide: raw.resultGuide ?? base.resultGuide,
    workspaceMeta: raw.workspaceMeta,
    workspaceBranches: raw.workspaceBranches,
    workspaceJourney: raw.workspaceJourney,
    workspaceArtifacts: raw.workspaceArtifacts,
    workspaceAudioGuides: raw.workspaceAudioGuides,
    workspaceSections: raw.workspaceSections,
    workspaceItems: raw.workspaceItems,
    workspacePromptRuns: raw.workspacePromptRuns,
    workspaceFollowUpResults: raw.workspaceFollowUpResults
  };
}

function normalizeToFix(raw: RedefinedResult, originalPrompt?: string): RedefinedResult {
  const prompt = promptOf(raw, originalPrompt);
  const classification = classificationFor(raw, "fix", prompt);
  const fix = buildLocalRedefinedResult(prompt, classification);
  const base = preserveContext(fix, raw, "fix", prompt, classification);

  // Preserve any genuine diagnostic fields the raw result happened to carry.
  return {
    ...base,
    issueMap: raw.issueMap ?? fix.issueMap,
    diagnosis: raw.diagnosis ?? fix.diagnosis,
    diagnosticTerminal: raw.diagnosticTerminal ?? fix.diagnosticTerminal,
    failureBranches: raw.failureBranches ?? fix.failureBranches,
    quickTests: raw.quickTests ?? fix.quickTests,
    decisionPath: raw.decisionPath ?? fix.decisionPath,
    pathUpdate: raw.pathUpdate ?? fix.pathUpdate,
    scratchpad: raw.scratchpad ?? fix.scratchpad,
    timeline: raw.timeline ?? fix.timeline,
    artifacts: raw.artifacts ?? fix.artifacts
  };
}

function normalizeToUnderstand(raw: RedefinedResult, originalPrompt?: string): RedefinedResult {
  const prompt = promptOf(raw, originalPrompt);
  return normalizeUnderstandResult(raw, prompt);
}

function normalizeToBuild(raw: RedefinedResult, originalPrompt?: string): RedefinedResult {
  const prompt = promptOf(raw, originalPrompt);
  const classification = classificationFor(raw, "build", prompt);
  const build = buildLocalRedefinedResult(prompt, classification);
  const base = preserveContext(build, raw, "build", prompt, classification);

  return {
    ...base,
    workspaceType: raw.workspaceType ?? build.workspaceType,
    requiredInputs: raw.requiredInputs ?? build.requiredInputs,
    buildFlow: raw.buildFlow ?? build.buildFlow,
    draftingSteps: raw.draftingSteps ?? build.draftingSteps,
    sectionBlueprint: raw.sectionBlueprint ?? build.sectionBlueprint,
    qualityChecklist: raw.qualityChecklist ?? build.qualityChecklist,
    buildNextActions: raw.buildNextActions ?? build.buildNextActions
  };
}

function normalizeToArtifact(raw: RedefinedResult, originalPrompt?: string): RedefinedResult {
  const prompt = promptOf(raw, originalPrompt);
  const classification = classificationFor(raw, "artifact", prompt);
  const artifact = buildLocalRedefinedResult(prompt, classification);
  const base = preserveContext(artifact, raw, "artifact", prompt, classification);

  return {
    ...base,
    workspaceType: raw.workspaceType ?? artifact.workspaceType ?? "generic_artifact",
    sourceContext: raw.sourceContext ?? artifact.sourceContext,
    missingDetails: raw.missingDetails ?? artifact.missingDetails,
    outline: raw.outline ?? artifact.outline,
    artifactPreview: raw.artifactPreview ?? artifact.artifactPreview
  };
}

export const LENS_CONTRACTS: Record<LensId, LensContract> = {
  understand: {
    label: "Understand",
    schema: UnderstandWorkspaceResultSchema,
    forbiddenFields: [
      "diagnosis",
      "issueMap",
      "failureBranches",
      "diagnosticTerminal",
      "evidenceBranches",
      "quickTests",
      "scratchpad",
      "pathUpdate",
      "causalGraph",
      "artifactPreview"
    ],
    matches: (r) => Boolean(
      r.conceptSnapshot
      && r.mentalModel?.flow?.length
      && (r.buildingBlocks?.length ?? 0) > 0
    ),
    normalize: ({ rawResult, originalPrompt }) => normalizeToUnderstand(rawResult, originalPrompt),
    instruction:
      "The selected lens is Understand. Produce a learning result only: concept snapshot, mental model, core building blocks, common assumptions/misconceptions, analogy, real-world example, and questions. Do not include diagnostic terminal, failure branches, incident actions, or build/artifact sections."
  },
  fix: {
    label: "Fix",
    schema: FixWorkspaceResultSchema,
    forbiddenFields: [
      "mentalModel",
      "coreBuildingBlocks",
      "misconceptions",
      "realWorldExample",
      "decisionQuestions",
      "userLevelCheck",
      "analogySwitcher",
      "thinkingSparks",
      "shareableInsight",
      "blindSpot",
      "conceptConfidenceMap",
      "teachBack"
    ],
    matches: (r) => Boolean(r.diagnosis && r.issueMap && r.diagnosticTerminal),
    normalize: ({ rawResult, originalPrompt }) => normalizeToFix(rawResult, originalPrompt),
    instruction:
      "The selected lens is Fix. Produce a diagnostic result only: current diagnosis, failure branches, evidence needed, checks, commands, decision matrix, and next best action. Do not include learning-only sections such as mental model, concept snapshot, test-your-understanding, or shareable insight."
  },
  build: {
    label: "Build",
    schema: BuildWorkspaceResultSchema,
    forbiddenFields: [
      "mentalModel",
      "coreBuildingBlocks",
      "thinkingSparks",
      "shareableInsight",
      "diagnosis",
      "diagnosticTerminal",
      "failureBranches"
    ],
    matches: (r) => Boolean((r.buildFlow?.length ?? 0) > 0 || (r.sectionBlueprint?.length ?? 0) > 0),
    normalize: ({ rawResult, originalPrompt }) => normalizeToBuild(rawResult, originalPrompt),
    instruction:
      "The selected lens is Build. Produce an implementation result only: objective, required inputs, architecture/section blueprint, phases, drafting steps, decisions, quality checklist, and next actions. Do not include quiz-style learning sections or diagnostic cockpit sections."
  },
  artifact: {
    label: "Artifact",
    schema: ArtifactWorkspaceResultSchema,
    forbiddenFields: [
      "diagnosis",
      "diagnosticTerminal",
      "failureBranches",
      "mentalModel",
      "thinkingSparks",
      "coreBuildingBlocks"
    ],
    matches: (r) =>
      Boolean(
        r.artifactPreview ||
          (r.outline?.length ?? 0) > 0 ||
          (r.missingDetails?.length ?? 0) > 0 ||
          r.sourceContext
      ),
    normalize: ({ rawResult, originalPrompt }) => normalizeToArtifact(rawResult, originalPrompt),
    instruction:
      "The selected lens is Artifact. Produce a document/artifact result only: source context, structure/outline, draft, missing inputs, and export-ready format. Do not include troubleshooting cockpit sections unless the artifact type is a runbook."
  }
};

/**
 * Resolve the lens to render. Workspace path wins; then prompt-run path; then result mode; then
 * a safe default. Once a workspace path exists, neither AI classification nor result shape may
 * override it.
 */
export function resolveLensPath(args: {
  workspacePath?: RedefinedMode | null;
  promptRunPath?: RedefinedMode | null;
  resultMode?: RedefinedMode | null;
  fallback?: LensId;
}): LensId {
  return (
    args.workspacePath ??
    args.promptRunPath ??
    args.resultMode ??
    args.fallback ??
    "understand"
  );
}

/** Result keys that belong to a foreign lens (used for development mismatch warnings). */
export function detectForbiddenSections(result: RedefinedResult, lens: LensId): string[] {
  return LENS_CONTRACTS[lens].forbiddenFields.filter((field) => {
    const value = result[field];
    return Array.isArray(value) ? value.length > 0 : value != null;
  }) as string[];
}

/**
 * Foreign-lens keys to look for in RAW AI output, BEFORE schema parsing strips unknown keys.
 * Unlike `forbiddenFields` (typed `RedefinedResult` keys), this also covers the conceptual section
 * names a model might emit (e.g. `conceptSnapshot`, `testYourUnderstanding`) that never survive the
 * schema and so would otherwise be invisible to post-parse detection.
 */
export const RAW_FORBIDDEN_FIELDS: Record<LensId, string[]> = {
  understand: [
    "failureBranches",
    "diagnosticTerminal",
    "incidentBrief",
    "evidenceInput",
    "diagnosis",
    "issueMap",
    "quickTests",
    "scratchpad",
    "pathUpdate",
    "implementationPhases",
    "artifactPreview",
    "exportSurface"
  ],
  fix: [
    "conceptSnapshot",
    "mentalModel",
    "testYourUnderstanding",
    "shareableInsight",
    "thinkingSparks",
    "coreBuildingBlocks",
    "misconceptions",
    "realWorldExample"
  ],
  build: [
    "testYourUnderstanding",
    "conceptSnapshot",
    "shareableInsight",
    "mentalModel",
    "diagnosis",
    "diagnosticTerminal",
    "failureBranches"
  ],
  artifact: [
    "failureBranches",
    "diagnosticTerminal",
    "learningQuiz",
    "thinkingSparks",
    "diagnosis",
    "mentalModel"
  ]
};

/**
 * Detect foreign-lens sections on raw, unparsed AI output (a plain object) for the selected lens.
 * Runs before schema validation so attempted lens drift is visible even when the schema would
 * strip the offending keys.
 */
export function detectRawForbiddenSections(rawOutput: unknown, lens: LensId): string[] {
  if (!rawOutput || typeof rawOutput !== "object") return [];
  const obj = rawOutput as Record<string, unknown>;
  return RAW_FORBIDDEN_FIELDS[lens].filter((field) => {
    const value = obj[field];
    if (value == null) return false;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === "object") return Object.keys(value as object).length > 0;
    return Boolean(value);
  });
}

/**
 * Given a raw result and the authoritative lens, return the result that should be rendered.
 * If the raw result already satisfies the lens, it is returned unchanged; otherwise it is
 * normalized into the lens fallback. Never returns a different lens than requested.
 */
export function coerceResultToLens(
  result: RedefinedResult,
  lens: LensId,
  originalPrompt?: string
): { result: RedefinedResult; normalized: boolean; forbidden: string[] } {
  const contract = LENS_CONTRACTS[lens] ?? LENS_CONTRACTS.understand;
  const forbidden = detectForbiddenSections(result, lens);

  if (contract.matches(result) && forbidden.length === 0) {
    return { result, normalized: false, forbidden };
  }

  return {
    result: contract.normalize({ rawResult: result, originalPrompt }),
    normalized: true,
    forbidden
  };
}
