"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { MODE_META, PROJECT_COLORS, relativeTime } from "@/lib/dashboard-store";
import type { RedefinedMode } from "@/lib/redefined";
import type { WorkspaceProject } from "@/lib/workspace-types";

const COLOR_FG: Record<NonNullable<WorkspaceProject["color"]>, "light" | "dark"> = {
  purple: "light",
  blue: "light",
  green: "light",
  yellow: "dark",
  dark: "light"
};

type ProjectCardProps = {
  project: WorkspaceProject;
  count: number;
  modeMix: Array<{ mode: RedefinedMode; count: number }>;
  onRename?: () => void;
  onDelete?: () => void;
};

export function ProjectCard({ project, count, modeMix, onRename, onDelete }: ProjectCardProps) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const toolsRef = useRef<HTMLDivElement>(null);
  const color = project.color ?? "blue";
  const fg = COLOR_FG[color];
  const href = `/projects/${encodeURIComponent(project.id)}`;
  const isDefault = project.projectType === "default";
  const hasTools = Boolean(onRename) || Boolean(onDelete);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onDoc = (event: globalThis.MouseEvent) => {
      if (!toolsRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  const stop = (handler?: () => void) => (event: MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
    handler?.();
  };

  const go = () => router.push(href);

  return (
    <article
      className="proj-color-card"
      data-fg={fg}
      style={{ "--proj-color": PROJECT_COLORS[color] } as CSSProperties}
      role="link"
      tabIndex={0}
      aria-label={`Open ${project.name}`}
      onClick={go}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          go();
        }
      }}
    >
      <div className="proj-color-top">
        <span className="proj-color-label">{isDefault ? "My Workspaces" : "Project"}</span>
        {hasTools ? (
          <div className="proj-color-tools" ref={toolsRef}>
            {onRename ? (
              <button type="button" className="proj-color-rename" onClick={stop(onRename)}>
                Rename
              </button>
            ) : null}
            {onDelete ? (
              <>
                <button
                  type="button"
                  className="proj-color-more"
                  aria-label="More actions"
                  aria-expanded={menuOpen}
                  onClick={stop(() => setMenuOpen((open) => !open))}
                >
                  &#8942;
                </button>
                {menuOpen ? (
                  <div className="proj-color-menu" role="menu">
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
              </>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="proj-color-body">
        <h3>{project.name}</h3>
        {project.description ? <p className="proj-color-desc">{project.description}</p> : null}

        <span className="proj-color-divider" aria-hidden="true" />
        <div className="proj-color-meta">
          <span>
            {count} workspace{count === 1 ? "" : "s"} · Updated {relativeTime(project.updatedAt)}
          </span>
          {modeMix.length > 0 ? (
            <span className="proj-color-mix">
              {modeMix.map((entry) => (
                <span key={entry.mode} className="proj-color-mix-item">
                  <i style={{ background: MODE_META[entry.mode].color }} aria-hidden="true" />
                  {MODE_META[entry.mode].label} {entry.count}
                </span>
              ))}
            </span>
          ) : null}
        </div>
      </div>
    </article>
  );
}
