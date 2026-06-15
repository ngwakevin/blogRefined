"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { MODE_META, relativeTime, type DashboardRecord } from "@/lib/dashboard-store";
import type { WorkspaceProject } from "@/lib/workspace-types";

type WorkspaceCardProps = {
  record: DashboardRecord;
  starred: boolean;
  projects: WorkspaceProject[];
  compact?: boolean;
  onToggleStar: (workspaceId: string) => void;
  onRename: (record: DashboardRecord) => void;
  onDuplicate: (record: DashboardRecord) => void;
  onDelete: (record: DashboardRecord) => void;
  onMove: (record: DashboardRecord, projectId: string | null) => void;
};

export function WorkspaceCard({
  record,
  starred,
  projects,
  compact = false,
  onToggleStar,
  onRename,
  onDuplicate,
  onDelete,
  onMove
}: WorkspaceCardProps) {
  const meta = MODE_META[record.mode];
  const [menuOpen, setMenuOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return undefined;

    const onDocClick = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
        setMoveOpen(false);
      }
    };

    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [menuOpen]);

  return (
    <article
      className={`dash-ws-card${compact ? " compact" : ""}`}
      data-fg={meta.fg}
      style={{ "--ws-color": meta.color } as React.CSSProperties}
    >
      <div className="dash-ws-top">
        <span className="dash-ws-badge">
          {meta.label}
          {starred ? <span className="dash-ws-badge-star" aria-label="Starred">★</span> : null}
        </span>
        <div className="dash-ws-tools" ref={menuRef}>
          <button
            type="button"
            className="dash-ws-menu-btn"
            aria-label="Workspace actions"
            aria-expanded={menuOpen}
            onClick={() => {
              setMenuOpen((open) => !open);
              setMoveOpen(false);
            }}
          >
            &#8942;
          </button>

          {menuOpen ? (
            <div className="dash-ws-menu" role="menu">
              <Link href={record.href} role="menuitem" onClick={() => setMenuOpen(false)}>
                Open
              </Link>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  onToggleStar(record.workspaceId);
                }}
              >
                {starred ? "Unstar" : "Star"}
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  onRename(record);
                }}
              >
                Rename
              </button>
              <button
                type="button"
                role="menuitem"
                aria-expanded={moveOpen}
                onClick={() => setMoveOpen((open) => !open)}
              >
                Move to project &rsaquo;
              </button>
              {moveOpen ? (
                <div className="dash-ws-submenu">
                  {projects.length === 0 ? (
                    <span className="dash-ws-submenu-empty">No projects yet</span>
                  ) : (
                    projects.map((project) => (
                      <button
                        key={project.id}
                        type="button"
                        disabled={record.projectId === project.id}
                        onClick={() => {
                          setMenuOpen(false);
                          setMoveOpen(false);
                          onMove(record, project.id);
                        }}
                      >
                        {project.name}
                      </button>
                    ))
                  )}
                  {record.projectId ? (
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        setMoveOpen(false);
                        onMove(record, null);
                      }}
                    >
                      Remove from project
                    </button>
                  ) : null}
                </div>
              ) : null}
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  onDuplicate(record);
                }}
              >
                Duplicate
              </button>
              <button
                type="button"
                role="menuitem"
                className="danger"
                onClick={() => {
                  setMenuOpen(false);
                  onDelete(record);
                }}
              >
                Delete
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <Link href={record.href} className="dash-ws-body">
        <h3>{record.name}</h3>
        <p>{record.subtitle}</p>

        <span className="dash-ws-divider" aria-hidden="true" />
        <span className="dash-ws-updated">Updated {relativeTime(record.updatedAt)}</span>

        <span className="dash-ws-stats">
          <span className="dash-ws-stat">
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <rect x="8" y="2.5" width="4" height="9" rx="2" />
              <path d="M5 9.5a5 5 0 0 0 10 0M10 14.5V17" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            {record.audioCount} Audio
          </span>
          <span className="dash-ws-stat">
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="M5 2.5h7l3 3v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
              <path d="M7 9h6M7 12h4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            {record.artifactCount} Artifact{record.artifactCount === 1 ? "" : "s"}
          </span>
          {record.branchCount > 0 ? (
            <span className="dash-ws-stat">
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <circle cx="6" cy="5" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
                <circle cx="6" cy="15" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
                <circle cx="14" cy="9" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
                <path d="M6 7.2v5.6M6 11c0-3 5-1 8-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
              {record.branchCount} Branch{record.branchCount === 1 ? "" : "es"}
            </span>
          ) : null}
        </span>
      </Link>
    </article>
  );
}
