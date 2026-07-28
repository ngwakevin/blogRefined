"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { relativeTime } from "@/lib/dashboard-store";
import type { ArtifactTone } from "@/lib/artifact-generation";

const TONE_STYLE: Record<ArtifactTone, { color: string; fg: "light" | "dark" }> = {
  purple: { color: "#b2a5ff", fg: "light" },
  green: { color: "#00bf63", fg: "light" },
  yellow: { color: "#f5b800", fg: "dark" },
  blue: { color: "#38b6ff", fg: "light" },
  dark: { color: "#111827", fg: "light" }
};

export type ArtifactCardData = {
  id: string;
  href: string;
  title: string;
  typeLabel: string;
  tone: ArtifactTone;
  snippet: string;
  sourceName: string;
  projectName?: string;
  createdAt: string;
  archived?: boolean;
};

type ArtifactCardProps = {
  data: ArtifactCardData;
  onCopy: () => void;
  onDownload: () => void;
  onArchive?: () => void;
  onDelete: () => void;
};

export function ArtifactCard({ data, onCopy, onDownload, onArchive, onDelete }: ArtifactCardProps) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const toolsRef = useRef<HTMLDivElement>(null);
  const tone = TONE_STYLE[data.tone] ?? TONE_STYLE.purple;

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onDoc = (event: globalThis.MouseEvent) => {
      if (!toolsRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  const stop = (handler: () => void) => (event: MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
    handler();
  };

  const go = () => router.push(data.href);

  return (
    <article
      className="art-color-card"
      data-fg={tone.fg}
      style={{ "--art-color": tone.color } as CSSProperties}
      role="link"
      tabIndex={0}
      aria-label={`Open ${data.title}`}
      onClick={go}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          go();
        }
      }}
    >
      <div className="art-color-top">
        <span className="art-color-badge">
          {data.typeLabel}
          {data.archived ? <span className="art-color-archived">· Archived</span> : null}
        </span>

        <div className="art-color-tools" ref={toolsRef}>
          <button
            type="button"
            className="art-color-icon"
            aria-label="Copy artifact"
            title={copied ? "Copied" : "Copy"}
            onClick={stop(() => {
              onCopy();
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1600);
            })}
          >
            {copied ? (
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <path d="m5 10 3.5 3.5L15 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : (
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <rect x="7" y="7" width="9" height="9" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
                <path d="M13 7V5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v5a2 2 0 0 0 2 2h2" fill="none" stroke="currentColor" strokeWidth="1.6" />
              </svg>
            )}
          </button>
          <button
            type="button"
            className="art-color-icon"
            aria-label="Download artifact"
            title="Download"
            onClick={stop(onDownload)}
          >
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="M10 3v9m0 0 3.2-3.2M10 12 6.8 8.8M4 15h12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            type="button"
            className="art-color-icon"
            aria-label="More actions"
            aria-expanded={menuOpen}
            onClick={stop(() => setMenuOpen((open) => !open))}
          >
            &#8942;
          </button>

          {menuOpen ? (
            <div className="art-color-menu" role="menu">
              {onArchive ? (
                <button type="button" role="menuitem" onClick={stop(() => { setMenuOpen(false); onArchive(); })}>
                  {data.archived ? "Unarchive" : "Archive"}
                </button>
              ) : null}
              <button
                type="button"
                role="menuitem"
                className="danger"
                onClick={stop(() => { setMenuOpen(false); onDelete(); })}
              >
                Delete
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="art-color-body">
        <h3>{data.title}</h3>
        {data.snippet ? <p className="art-color-snippet">{data.snippet}</p> : null}

        <span className="art-color-divider" aria-hidden="true" />
        <div className="art-color-meta">
          <span>Source: {data.sourceName}{data.projectName ? ` · ${data.projectName}` : ""}</span>
          <span>Created {relativeTime(data.createdAt)}</span>
        </div>
      </div>
    </article>
  );
}
