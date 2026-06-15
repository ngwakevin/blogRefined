import { createHash } from "crypto";
import { callAIProvider } from "@/lib/ai-provider";
import type { RedefinedResult } from "@/lib/redefined";
import type { NarrationMode, WorkspaceMeta, WorkspaceNarration } from "@/lib/workspace-types";

export type NarrationAudio = {
  audioBase64?: string;
  audioUrl?: string;
  mimeType: "audio/mpeg" | "audio/wav";
};

type GenerateWorkspaceNarrationScriptArgs = {
  originalPrompt: string;
  result: RedefinedResult;
  workspaceMeta?: WorkspaceMeta;
  narrationMode?: NarrationMode;
};

type NarrationSource = {
  originalPrompt: string;
  mode: RedefinedResult["mode"];
  title: string;
  summary: string;
  workspaceMeta?: Partial<WorkspaceMeta>;
  content: Record<string, unknown>;
  currentBranch?: unknown;
  nextActions?: unknown;
};

export function defaultNarrationModeForResult(mode: RedefinedResult["mode"]): NarrationMode {
  if (mode === "build") return "step_by_step";
  if (mode === "fix") return "incident_briefing";
  if (mode === "artifact") return "output_review";
  return "guided_explanation";
}

export function createWorkspaceNarrationHash(args: {
  originalPrompt: string;
  result: RedefinedResult;
  workspaceMeta?: WorkspaceMeta;
}): string {
  const source = buildNarrationSource(args);

  return createHash("sha256")
    .update(stableStringify({
      originalPrompt: source.originalPrompt,
      mode: source.mode,
      title: source.title,
      summary: source.summary,
      content: source.content,
      currentBranch: source.currentBranch,
      updatedAt: args.workspaceMeta?.updatedAt ?? args.result.workspaceMeta?.updatedAt
    }))
    .digest("hex");
}

export async function generateWorkspaceNarrationScript(
  args: GenerateWorkspaceNarrationScriptArgs
): Promise<{
  title: string;
  script: string;
  durationEstimateSeconds?: number;
}> {
  const narrationMode = args.narrationMode ?? defaultNarrationModeForResult(args.result.mode);
  const source = buildNarrationSource(args);
  const aiText = await callAIProvider({
    systemPrompt: buildWorkspaceNarrationSystemPrompt(),
    userPrompt: JSON.stringify({
      narrationMode,
      source
    })
  });
  const parsed = parseNarrationResponse(aiText);

  return {
    title: parsed.title || buildNarrationTitle(args.result),
    script: parsed.script,
    durationEstimateSeconds: parsed.durationEstimateSeconds
  };
}

export async function generateNarrationAudio(args: {
  script: string;
  voice?: string;
  format?: "mp3" | "wav";
}): Promise<NarrationAudio> {
  const apiKey = process.env.AI_API_KEY;
  const model = process.env.AI_TTS_MODEL ?? "gpt-4o-mini-tts";
  const format = args.format ?? "mp3";
  const mimeType = format === "wav" ? "audio/wav" : "audio/mpeg";
  const voice = args.voice ?? process.env.AI_TTS_VOICE ?? "alloy";

  if (!apiKey) {
    throw new Error("AI provider is not configured");
  }

  try {
    return await requestSpeechAudio({
      apiKey,
      model,
      voice,
      script: args.script,
      format,
      mimeType,
      includeInstructions: true
    });
  } catch (primaryError) {
    if (model === "tts-1" && voice === "alloy") throw primaryError;

    return requestSpeechAudio({
      apiKey,
      model: "tts-1",
      voice: "alloy",
      script: args.script,
      format,
      mimeType,
      includeInstructions: false
    });
  }
}

async function requestSpeechAudio(args: {
  apiKey: string;
  model: string;
  voice: string;
  script: string;
  format: "mp3" | "wav";
  mimeType: "audio/mpeg" | "audio/wav";
  includeInstructions: boolean;
}): Promise<NarrationAudio> {
  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: args.model,
      voice: args.voice,
      input: args.script,
      ...(args.includeInstructions
        ? {
            instructions: "Speak like a calm, clear Doc/ReDefined guide. Use natural pacing and make transitions easy to follow."
          }
        : {}),
      response_format: args.format
    })
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(
      `TTS request failed with ${response.status}${errorBody ? `: ${errorBody.slice(0, 300)}` : ""}`
    );
  }

  const audioBuffer = Buffer.from(await response.arrayBuffer());

  return {
    audioBase64: audioBuffer.toString("base64"),
    mimeType: args.mimeType
  };
}

function buildWorkspaceNarrationSystemPrompt(): string {
  return `You are Doc/ReDefined's audio guide writer.

Return only valid JSON. Do not return markdown. Do not wrap JSON in code fences.

Create a natural spoken narration script from the structured workspace result.
Use the workspace result as the source of truth.
Do not create a separate answer or new workspace.
Do not read UI labels mechanically.
Do not mention cards, buttons, tabs, JSON, fields, or schema names.
Make the script easier to listen to than reading the page.
Connect one concept, step, branch, or output to the next.
Write in second person where useful.
Keep the script between 180 and 420 words.

Return JSON with exactly:
{
  "title": "short narration title",
  "script": "spoken narration script",
  "durationEstimateSeconds": 90
}

Lens rules:
- guided_explanation: sound like a clear teacher. Use the mental model, include one misconception, include one example, and end with what the user can do next.
- step_by_step: sound like a build coach. Explain the build objective, mention missing inputs, walk through the build flow, explain the first next action, and end with the artifact option.
- incident_briefing: sound like an incident briefing. Summarize the issue, explain the top likely branch, tell the user what to check first, mention evidence needed, and do not over-explain.
- output_review: summarize what was created, mention assumptions or placeholders, explain how to use or export it, and suggest the next refinement.`;
}

function parseNarrationResponse(aiText: string): {
  title: string;
  script: string;
  durationEstimateSeconds?: number;
} {
  const parsed = JSON.parse(aiText) as Record<string, unknown>;
  const script = typeof parsed.script === "string" ? parsed.script.trim() : "";

  if (script.length < 120) {
    throw new Error("Narration script is missing or too short.");
  }

  return {
    title: typeof parsed.title === "string" ? parsed.title.trim() : "",
    script,
    durationEstimateSeconds: typeof parsed.durationEstimateSeconds === "number"
      ? Math.max(20, Math.round(parsed.durationEstimateSeconds))
      : estimateDurationSeconds(script)
  };
}

function buildNarrationTitle(result: RedefinedResult): string {
  if (result.mode === "fix") return `${result.title} briefing`;
  if (result.mode === "artifact") return `${result.title} review`;
  return `${result.title} audio guide`;
}

function estimateDurationSeconds(script: string): number {
  const words = script.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(20, Math.round((words / 150) * 60));
}

function buildNarrationSource(args: {
  originalPrompt: string;
  result: RedefinedResult;
  workspaceMeta?: WorkspaceMeta;
}): NarrationSource {
  const { result } = args;
  const workspaceMeta = args.workspaceMeta ?? result.workspaceMeta;

  return {
    originalPrompt: args.originalPrompt,
    mode: result.mode,
    title: result.title,
    summary: result.summary,
    workspaceMeta: workspaceMeta ? {
      workspaceId: workspaceMeta.workspaceId,
      workspaceName: workspaceMeta.workspaceName,
      workspaceSubtitle: workspaceMeta.workspaceSubtitle,
      mode: workspaceMeta.mode,
      domain: workspaceMeta.domain,
      workspaceType: workspaceMeta.workspaceType,
      currentBranchId: workspaceMeta.currentBranchId,
      updatedAt: workspaceMeta.updatedAt
    } : undefined,
    content: contentForMode(result),
    currentBranch: currentBranchForResult(result, workspaceMeta),
    nextActions: result.nextActions ?? result.buildNextActions ?? result.actions
  };
}

function contentForMode(result: RedefinedResult): Record<string, unknown> {
  if (result.mode === "understand") {
    return {
      mentalModel: result.mentalModel,
      coreBuildingBlocks: result.coreBuildingBlocks,
      misconceptions: result.misconceptions,
      realWorldExample: result.realWorldExample,
      decisionQuestions: result.decisionQuestions,
      blindSpot: result.blindSpot,
      resultGuide: result.resultGuide
    };
  }

  if (result.mode === "build") {
    return {
      workspaceType: result.workspaceType,
      requiredInputs: result.requiredInputs,
      buildFlow: result.buildFlow,
      draftingSteps: result.draftingSteps,
      sectionBlueprint: result.sectionBlueprint,
      qualityChecklist: result.qualityChecklist,
      nextActions: result.buildNextActions
    };
  }

  if (result.mode === "fix") {
    return {
      diagnosis: result.diagnosis,
      issueMap: result.issueMap,
      failureBranches: result.failureBranches,
      evidenceBranches: result.evidenceBranches,
      quickTests: result.quickTests,
      pathUpdate: result.pathUpdate,
      causalGraph: result.causalGraph,
      diagnosticTerminal: result.diagnosticTerminal
    };
  }

  return {
    workspaceType: result.workspaceType,
    sourceContext: result.sourceContext,
    missingDetails: result.missingDetails,
    outline: result.outline,
    artifactPreview: result.artifactPreview,
    formatOptions: result.formatOptions,
    exportActions: result.exportActions
  };
}

function currentBranchForResult(result: RedefinedResult, workspaceMeta?: WorkspaceMeta) {
  const branchId = result.activeEvidenceBranchId ?? workspaceMeta?.currentBranchId;

  if (branchId && result.evidenceBranches?.length) {
    return result.evidenceBranches.find((branch) => branch.id === branchId);
  }

  if (branchId && result.workspaceBranches?.length) {
    return result.workspaceBranches.find((branch) => branch.id === branchId);
  }

  return result.evidenceBranches?.find((branch) => branch.status === "active")
    ?? result.workspaceBranches?.find((branch) => branch.status === "active");
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortForStableStringify(value));
}

function sortForStableStringify(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortForStableStringify);

  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        const child = (value as Record<string, unknown>)[key];
        if (child !== undefined) acc[key] = sortForStableStringify(child);
        return acc;
      }, {});
  }

  return value;
}
