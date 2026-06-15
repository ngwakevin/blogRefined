"use client";

import { useMemo, useRef, useState } from "react";
import type { RedefinedResult } from "@/lib/redefined";
import type { WorkspaceMeta, WorkspaceNarration } from "@/lib/workspace-types";

type WorkspaceAudioGuideProps = {
  result: RedefinedResult;
  workspaceMeta?: WorkspaceMeta;
  originalPrompt: string;
  initialNarration?: WorkspaceNarration;
  onNarrationGenerated?: (narration: WorkspaceNarration) => void;
};

type NarrationResponse = {
  narration?: WorkspaceNarration;
  warning?: "audio_generation_failed";
  error?: string;
};

type AudioGuideState = "idle" | "generating" | "ready" | "playing" | "paused" | "error";
type DownloadState = "idle" | "downloading" | "downloaded" | "error";

export function WorkspaceAudioGuide({
  result,
  workspaceMeta,
  originalPrompt,
  initialNarration,
  onNarrationGenerated
}: WorkspaceAudioGuideProps) {
  const [narration, setNarration] = useState<WorkspaceNarration | null>(initialNarration ?? null);
  const [sourceKeyAtGeneration, setSourceKeyAtGeneration] = useState<string | null>(
    initialNarration ? buildClientNarrationSourceKey(result, workspaceMeta, originalPrompt) : null
  );
  const [guideState, setGuideState] = useState<AudioGuideState>(
    initialNarration ? "ready" : "idle"
  );
  const [showTranscript, setShowTranscript] = useState(false);
  const [warning, setWarning] = useState<"audio_generation_failed" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloadState, setDownloadState] = useState<DownloadState>("idle");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const sourceKey = useMemo(
    () => buildClientNarrationSourceKey(result, workspaceMeta, originalPrompt),
    [originalPrompt, result, workspaceMeta]
  );
  const resultChanged = Boolean(narration && sourceKeyAtGeneration && sourceKeyAtGeneration !== sourceKey);
  const hasAudio = Boolean(narration?.audioUrl || narration?.audioBase64);

  async function requestNarration() {
    setGuideState("generating");
    audioRef.current?.pause();
    setError(null);
    setWarning(null);
    setDownloadState("idle");

    try {
      const response = await fetch("/api/voice/narrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: workspaceMeta?.workspaceId,
          originalPrompt,
          result,
          workspaceMeta
        })
      });
      const payload = await response.json() as NarrationResponse;

      if (!response.ok || !payload.narration) {
        throw new Error(payload.error ?? "Narration generation failed");
      }

      setNarration(payload.narration);
      setSourceKeyAtGeneration(sourceKey);
      setWarning(payload.warning ?? null);
      setShowTranscript(false);
      setGuideState("ready");
      onNarrationGenerated?.(payload.narration);
    } catch (requestError) {
      console.error("Workspace audio guide request failed:", requestError);
      setError("Could not prepare the audio guide.");
      setGuideState("error");
    }
  }

  function togglePlayback() {
    const audio = audioRef.current;

    if (!audio) return;

    if (guideState === "playing") {
      audio.pause();
      setGuideState("paused");
      return;
    }

    void audio.play();
    setGuideState("playing");
  }

  function restartPlayback() {
    const audio = audioRef.current;

    if (!audio) return;

    audio.currentTime = 0;
    void audio.play();
    setGuideState("playing");
  }

  function handleDownloadAudio() {
    if (!narration) return;

    setDownloadState("downloading");

    try {
      downloadNarrationAudio(narration, workspaceMeta);
      setDownloadState("downloaded");
      window.setTimeout(() => setDownloadState("idle"), 2200);
    } catch (downloadError) {
      console.error("Audio guide download failed:", downloadError);
      setDownloadState("error");
    }
  }

  const audioSource = narration?.audioUrl
    ?? (narration?.audioBase64 ? `data:${narration.mimeType ?? "audio/mpeg"};base64,${narration.audioBase64}` : undefined);
  const primaryLabel = guideState === "generating"
    ? "Preparing guide..."
    : hasAudio && !resultChanged
      ? guideState === "playing"
        ? "Pause"
        : "Play audio"
      : narration
        ? "Regenerate audio"
        : "Audio guide";
  const statusText = getAudioGuideStatus({
    narration,
    guideState,
    hasAudio,
    resultChanged,
    warning
  });

  return (
    <section className="workspace-audio-guide" aria-label="Audio guide">
      <div className="workspace-audio-guide-main">
        <div>
          <p className="workspace-audio-eyebrow">Audio guide</p>
          <p className="workspace-audio-status">{statusText}</p>
        </div>

        <div className="workspace-audio-actions">
          <button
            type="button"
            className="workspace-audio-primary"
            disabled={guideState === "generating"}
            onClick={hasAudio && narration && !resultChanged ? togglePlayback : requestNarration}
          >
            {primaryLabel}
          </button>
          {hasAudio && !resultChanged ? (
            <button
              type="button"
              className="workspace-audio-secondary"
              onClick={restartPlayback}
            >
              Restart
            </button>
          ) : null}
          {narration && hasAudio && !resultChanged ? (
            <button
              type="button"
              className="workspace-audio-secondary"
              onClick={handleDownloadAudio}
              disabled={downloadState === "downloading"}
            >
              {downloadState === "downloading"
                ? "Downloading..."
                : downloadState === "downloaded"
                  ? "Downloaded"
                  : downloadState === "error"
                    ? "Download failed"
                    : "Download audio"}
            </button>
          ) : null}
          {narration && !resultChanged ? (
            <button
              type="button"
              className="workspace-audio-secondary"
              onClick={() => setShowTranscript((current) => !current)}
            >
              {showTranscript ? "Hide transcript" : "View transcript"}
            </button>
          ) : null}
          {narration && !resultChanged && hasAudio ? (
            <button
              type="button"
              className="workspace-audio-secondary"
              onClick={requestNarration}
              disabled={guideState === "generating"}
            >
              Regenerate guide
            </button>
          ) : null}
        </div>
      </div>

      {audioSource ? (
        <audio
          ref={audioRef}
          src={audioSource}
          onEnded={() => setGuideState("ready")}
          onPause={() => {
            if (guideState === "playing") setGuideState("paused");
          }}
          onPlay={() => setGuideState("playing")}
        />
      ) : null}

      {error ? <p className="workspace-audio-error">{error}</p> : null}
      {downloadState === "error" ? (
        <p className="workspace-audio-error">Download failed.</p>
      ) : null}

      {warning === "audio_generation_failed" && narration ? (
        <p className="workspace-audio-error">
          Audio generation failed. The transcript is available as a fallback.
        </p>
      ) : null}

      {showTranscript && narration ? (
        <div className="workspace-audio-script">
          <div className="workspace-audio-script-topline">
            <h3>{narration.title}</h3>
            {narration.durationEstimateSeconds ? (
              <span>{Math.ceil(narration.durationEstimateSeconds / 60)} min</span>
            ) : null}
          </div>
          <p>{narration.script}</p>
        </div>
      ) : null}
    </section>
  );
}

function downloadNarrationAudio(
  narration: WorkspaceNarration,
  workspaceMeta: WorkspaceMeta | undefined
) {
  const mimeType = narration.mimeType || "audio/mpeg";
  const filename = createAudioDownloadFilename(
    workspaceMeta,
    narration,
    extensionFromMimeType(mimeType)
  );

  if (narration.audioUrl) {
    triggerAnchorDownload(narration.audioUrl, filename);
    return;
  }

  if (narration.audioBase64) {
    const byteCharacters = atob(narration.audioBase64);
    const byteNumbers = new Array<number>(byteCharacters.length);

    for (let i = 0; i < byteCharacters.length; i += 1) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }

    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: mimeType });
    const objectUrl = URL.createObjectURL(blob);

    triggerAnchorDownload(objectUrl, filename);
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    return;
  }

  throw new Error("No audio available to download.");
}

function triggerAnchorDownload(href: string, filename: string) {
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

function createAudioDownloadFilename(
  workspaceMeta: WorkspaceMeta | undefined,
  narration: WorkspaceNarration,
  extension: string
) {
  const base = workspaceMeta?.workspaceName || narration.title || "doc-redefined-workspace";
  const safeBase = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80) || "doc-redefined-workspace";
  const date = new Date().toISOString().slice(0, 10);

  return `${safeBase}-audio-guide-${date}.${extension}`;
}

function extensionFromMimeType(mimeType: string) {
  if (mimeType.includes("wav")) return "wav";
  if (mimeType.includes("webm")) return "webm";
  return "mp3";
}

function getAudioGuideStatus(args: {
  narration: WorkspaceNarration | null;
  guideState: AudioGuideState;
  hasAudio: boolean;
  resultChanged: boolean;
  warning: "audio_generation_failed" | null;
}): string {
  if (args.guideState === "generating") return "Preparing guide...";
  if (args.resultChanged) return "Workspace changed. Regenerate the guide for the latest result.";
  if (!args.narration) return "Generate a spoken walkthrough from this workspace.";
  if (args.warning === "audio_generation_failed" || !args.hasAudio) {
    return "Audio was not available. Transcript fallback is ready.";
  }

  const minutes = args.narration.durationEstimateSeconds
    ? Math.max(1, Math.ceil(args.narration.durationEstimateSeconds / 60))
    : 2;

  if (args.guideState === "playing") return `${minutes} min guided explanation playing.`;
  if (args.guideState === "paused") return `${minutes} min guided explanation paused.`;
  return `${minutes} min guided explanation.`;
}

function buildClientNarrationSourceKey(
  result: RedefinedResult,
  workspaceMeta: WorkspaceMeta | undefined,
  originalPrompt: string
): string {
  return JSON.stringify({
    originalPrompt,
    mode: result.mode,
    title: result.title,
    summary: result.summary,
    updatedAt: workspaceMeta?.updatedAt ?? result.workspaceMeta?.updatedAt,
    content: {
      mentalModel: result.mentalModel,
      coreBuildingBlocks: result.coreBuildingBlocks,
      misconceptions: result.misconceptions,
      realWorldExample: result.realWorldExample,
      requiredInputs: result.requiredInputs,
      buildFlow: result.buildFlow,
      diagnosis: result.diagnosis,
      failureBranches: result.failureBranches,
      evidenceBranches: result.evidenceBranches,
      pathUpdate: result.pathUpdate,
      outline: result.outline,
      artifactPreview: result.artifactPreview
    }
  });
}
