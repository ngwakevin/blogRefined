"use client";

import { useMemo, useRef, useState } from "react";
import { promptUpgrade } from "@/components/billing/UpgradeModal";
import { canCreateAudioGuide, getAccount, incrementUsage } from "@/lib/account-store";
import type { RedefinedResult } from "@/lib/redefined";
import type { WorkspaceMeta, WorkspaceNarration } from "@/lib/workspace-types";

type WorkspaceAudioGuideProps = {
  result: RedefinedResult;
  workspaceMeta?: WorkspaceMeta;
  originalPrompt: string;
  initialNarration?: WorkspaceNarration;
  onNarrationGenerated?: (narration: WorkspaceNarration) => void;
  variant?: "full" | "compact";
  compactIdleLabel?: string;
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
  onNarrationGenerated,
  variant = "full",
  compactIdleLabel
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
  const statusChip = getAudioGuideStatusChip({
    narration,
    guideState,
    hasAudio,
    resultChanged,
    warning
  });

  async function requestNarration() {
    const account = getAccount();
    const gate = canCreateAudioGuide(account);
    if (!gate.allowed) {
      promptUpgrade("Audio guide limit reached", gate, account.currentPlanId);
      return;
    }

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
      incrementUsage("audioGuidesThisMonth");
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
        ? "Regenerate guide"
        : "Generate audio guide";
  const statusText = getAudioGuideStatus({
    narration,
    guideState,
    hasAudio,
    resultChanged,
    warning
  });

  if (variant === "compact") {
    return (
      <section className="diagnosis-audio-pill" aria-label="Audio guide">
        <span>Audio guide</span>
        <button
          type="button"
          disabled={guideState === "generating"}
          onClick={hasAudio && narration && !resultChanged ? togglePlayback : requestNarration}
        >
          {compactIdleLabel && !narration && guideState === "idle" ? compactIdleLabel : primaryLabel}
        </button>
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
        {error ? <small>{error}</small> : null}
        {warning === "audio_generation_failed" && narration ? (
          <small>Transcript ready. Audio failed.</small>
        ) : null}
      </section>
    );
  }

  return (
    <section className="workspace-audio-guide" aria-label="Audio guide">
      <div className="workspace-audio-guide-head">
        <div className="workspace-audio-guide-copy">
          <p className="workspace-audio-eyebrow">AUDIO GUIDE</p>
          <h3>Listen to this workspace</h3>
          <p className="workspace-audio-description">
            Turn this workspace into a narrated walkthrough you can play anytime.
          </p>
        </div>
        <span className={`workspace-audio-status-chip state-${guideState}`}>
          {statusChip}
        </span>
      </div>

      <p className="workspace-audio-status">{statusText}</p>

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
          <button type="button" className="workspace-audio-secondary" onClick={restartPlayback}>
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
                  : "Download"}
          </button>
        ) : null}
        {narration && !resultChanged ? (
          <button
            type="button"
            className="workspace-audio-secondary"
            onClick={() => setShowTranscript((current) => !current)}
          >
            {showTranscript ? "Hide transcript" : "Transcript"}
          </button>
        ) : null}
        {narration && !resultChanged && hasAudio ? (
          <button
            type="button"
            className="workspace-audio-secondary"
            onClick={requestNarration}
            disabled={guideState === "generating"}
          >
            Regenerate
          </button>
        ) : null}
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

function getAudioGuideStatusChip(args: {
  narration: WorkspaceNarration | null;
  guideState: AudioGuideState;
  hasAudio: boolean;
  resultChanged: boolean;
  warning: "audio_generation_failed" | null;
}): string {
  if (args.guideState === "generating") return "Generating";
  if (args.resultChanged) return "Out of date";
  if (!args.narration) return "Not generated";
  if (args.warning === "audio_generation_failed" || !args.hasAudio) return "Transcript only";

  const minutes = args.narration.durationEstimateSeconds
    ? Math.max(1, Math.ceil(args.narration.durationEstimateSeconds / 60))
    : 2;

  return args.guideState === "playing" || args.guideState === "paused"
    ? `Ready · ${minutes} min`
    : `Ready · ${minutes} min`;
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
