import { NextResponse } from "next/server";
import type { RedefinedResult } from "@/lib/redefined";
import type { WorkspaceMeta } from "@/lib/workspace-types";
import {
  createWorkspaceNarrationHash,
  defaultNarrationModeForResult,
  generateNarrationAudio,
  generateWorkspaceNarrationScript,
} from "@/lib/workspace-narration";
import type { NarrationMode, WorkspaceNarration } from "@/lib/workspace-types";

const narrationCache = new Map<string, WorkspaceNarration>();

const validNarrationModes: NarrationMode[] = [
  "guided_explanation",
  "step_by_step",
  "incident_briefing",
  "output_review"
];

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  if (!body?.originalPrompt || typeof body.originalPrompt !== "string") {
    return NextResponse.json({ error: "Missing originalPrompt" }, { status: 400 });
  }

  if (!body?.result || typeof body.result !== "object") {
    return NextResponse.json({ error: "Missing result" }, { status: 400 });
  }

  const result = body.result as RedefinedResult;
  const workspaceMeta = body.workspaceMeta && typeof body.workspaceMeta === "object"
    ? body.workspaceMeta as WorkspaceMeta
    : result.workspaceMeta;

  if (!result.mode || !result.title || !result.summary) {
    return NextResponse.json({ error: "Invalid result" }, { status: 400 });
  }

  const narrationMode = validNarrationModes.includes(body.narrationMode)
    ? body.narrationMode as NarrationMode
    : defaultNarrationModeForResult(result.mode);
  const audioFormat = body.format === "wav" ? "wav" : "mp3";
  const voice = typeof body.voice === "string" && body.voice.trim()
    ? body.voice.trim()
    : undefined;
  const sourceResultHash = createWorkspaceNarrationHash({
    originalPrompt: body.originalPrompt,
    result,
    workspaceMeta
  });
  const cacheKey = [
    body.workspaceId ?? workspaceMeta?.workspaceId ?? result.id,
    narrationMode,
    voice ?? "default",
    audioFormat,
    sourceResultHash
  ].join(":");
  const cached = narrationCache.get(cacheKey);

  if (cached?.sourceResultHash === sourceResultHash) {
    return NextResponse.json({ narration: cached });
  }

  try {
    const generated = await generateWorkspaceNarrationScript({
      originalPrompt: body.originalPrompt,
      result,
      workspaceMeta,
      narrationMode
    });
    let warning: "audio_generation_failed" | undefined;
    let audio: Awaited<ReturnType<typeof generateNarrationAudio>> | undefined;

    try {
      audio = await generateNarrationAudio({
        script: generated.script,
        voice,
        format: audioFormat
      });
    } catch (audioError) {
      warning = "audio_generation_failed";
      console.error("Workspace narration audio generation failed:", audioError);
    }

    const narration: WorkspaceNarration = {
      id: `narration-${Date.now().toString(36)}`,
      ...generated,
      ...audio,
      sourceResultHash,
      narrationMode,
      audioPersisted: Boolean(audio?.audioBase64 || audio?.audioUrl),
      generatedAt: new Date().toISOString()
    };

    narrationCache.set(cacheKey, narration);
    return NextResponse.json({ narration, warning });
  } catch (error) {
    console.error("Workspace narration generation failed:", error);
    return NextResponse.json({ error: "Narration generation failed" }, { status: 500 });
  }
}
