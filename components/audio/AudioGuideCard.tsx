"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { showToast } from "@/components/Toast";
import { relativeTime } from "@/lib/dashboard-store";
import {
  audioGuideFilename,
  audioGuideSource,
  formatDuration,
  transcriptFilename,
  type AudioGuideItem,
  type AudioGuideStatus
} from "@/lib/audio-library";
import type { RedefinedMode } from "@/lib/redefined";

const STATUS_LABEL: Record<AudioGuideStatus, string> = {
  ready: "Ready",
  transcript_only: "Transcript only",
  generating: "Generating…",
  failed: "Failed",
  missing: "No audio"
};

const MODE_CARD: Record<RedefinedMode, { color: string; fg: "light" | "dark" }> = {
  understand: { color: "#b2a5ff", fg: "light" },
  build: { color: "#38b6ff", fg: "light" },
  fix: { color: "#f5b800", fg: "dark" },
  artifact: { color: "#00bf63", fg: "light" }
};

type AudioGuideCardProps = {
  item: AudioGuideItem;
  projectName?: string;
  archived?: boolean;
  onArchive: () => void;
  onDelete: () => void;
};

function clock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function AudioGuideCard({
  item,
  projectName,
  archived,
  onArchive,
  onDelete
}: AudioGuideCardProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const toolsRef = useRef<HTMLDivElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(item.durationSeconds ?? 0);
  const [showTranscript, setShowTranscript] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const src = audioGuideSource(item);
  const durationLabel = formatDuration(item.durationSeconds);
  const card = MODE_CARD[item.mode] ?? MODE_CARD.understand;

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onDoc = (event: MouseEvent) => {
      if (!toolsRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) audio.pause();
    else void audio.play();
  };

  const handleDownloadAudio = () => {
    if (!src) return;
    const anchor = document.createElement("a");
    anchor.href = src;
    anchor.download = audioGuideFilename(item);
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  };

  const handleDownloadTranscript = () => {
    const content = `# ${item.title}\n\nSource: ${item.sourceWorkspaceName}\n\n${item.transcript}`;
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = transcriptFilename(item);
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleCopyTranscript = async () => {
    try {
      await navigator.clipboard.writeText(item.transcript);
      showToast({ title: "Transcript copied" });
    } catch {
      showToast({ title: "Copy failed", message: "Clipboard is unavailable." });
    }
  };

  const generateLabel = item.status === "transcript_only" ? "Regenerate in workspace" : "Generate in workspace";

  return (
    <article
      className={`audio-card${item.status === "failed" ? " is-failed" : ""}`}
      data-status={item.status}
      data-fg={card.fg}
      style={{ "--audio-color": card.color } as CSSProperties}
    >
      <div className="audio-card-top">
        <span className="audio-card-eyebrow">Audio Guide</span>
        <div className="audio-card-tools" ref={toolsRef}>
          <span className={`audio-status-pill is-${item.status}`}>{STATUS_LABEL[item.status]}</span>
          <button
            type="button"
            className="audio-more"
            aria-label="More actions"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            &#8942;
          </button>
          {menuOpen ? (
            <div className="audio-menu" role="menu">
              <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onArchive(); }}>
                {archived ? "Unarchive" : "Archive"}
              </button>
              <button
                type="button"
                role="menuitem"
                className="danger"
                onClick={() => { setMenuOpen(false); onDelete(); }}
              >
                Delete
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <h3 className="audio-card-title">{item.title}</h3>
      <p className="audio-card-meta">
        Source: {item.sourceWorkspaceName}
        {projectName ? ` · ${projectName}` : ""}
      </p>
      <p className="audio-card-sub">
        Created {relativeTime(item.createdAt)}
        {durationLabel ? ` · ${durationLabel}` : ""}
        {archived ? " · Archived" : ""}
      </p>

      {src ? (
        <>
          <div className="audio-player">
            <button
              type="button"
              className="audio-play"
              aria-label={playing ? "Pause" : "Play"}
              onClick={togglePlay}
            >
              {playing ? (
                <svg viewBox="0 0 20 20" aria-hidden="true">
                  <rect x="5" y="4" width="3.5" height="12" rx="1" />
                  <rect x="11.5" y="4" width="3.5" height="12" rx="1" />
                </svg>
              ) : (
                <svg viewBox="0 0 20 20" aria-hidden="true">
                  <path d="M6 4.5v11l9-5.5z" />
                </svg>
              )}
            </button>
            <input
              type="range"
              className="audio-progress"
              min={0}
              max={duration || 0}
              step={0.1}
              value={current}
              aria-label="Seek"
              onChange={(event) => {
                const audio = audioRef.current;
                if (!audio) return;
                audio.currentTime = Number(event.target.value);
                setCurrent(audio.currentTime);
              }}
            />
            <span className="audio-time">
              {clock(current)} / {clock(duration)}
            </span>
            <audio
              ref={audioRef}
              src={src}
              preload="metadata"
              onLoadedMetadata={(event) =>
                setDuration(event.currentTarget.duration || item.durationSeconds || 0)
              }
              onTimeUpdate={(event) => setCurrent(event.currentTarget.currentTime)}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onEnded={() => {
                setPlaying(false);
                setCurrent(0);
              }}
            />
          </div>
        </>
      ) : (
        <div className="audio-state">
          <Link className="audio-generate" href={item.href}>
            {generateLabel}
          </Link>
        </div>
      )}

      <div className="audio-card-actions">
        <button
          type="button"
          disabled={!item.transcript}
          onClick={() => setShowTranscript((value) => !value)}
        >
          {showTranscript ? "Hide transcript" : "Transcript"}
        </button>
        <button type="button" disabled={!src} onClick={handleDownloadAudio}>
          Download audio
        </button>
        <Link className="audio-open" href={item.href}>
          Open workspace
        </Link>
      </div>

      {showTranscript ? (
        <div className="audio-transcript">
          <div className="audio-transcript-head">
            <strong>{item.title}</strong>
            <div className="audio-transcript-actions">
              <button type="button" onClick={() => void handleCopyTranscript()}>Copy</button>
              <button type="button" onClick={handleDownloadTranscript}>Download .txt</button>
              <button type="button" onClick={() => setShowTranscript(false)}>Close</button>
            </div>
          </div>
          <p>{item.transcript || "No transcript available."}</p>
        </div>
      ) : null}
    </article>
  );
}
