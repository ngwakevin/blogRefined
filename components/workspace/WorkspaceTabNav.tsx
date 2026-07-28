"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { RedefinedResult } from "@/lib/redefined";

/** Header actions folded into the More menu (rename, export, create related, …). */
export type WorkspaceTabAction = {
  key: string;
  label: string;
  icon?: ReactNode;
  onClick?: () => void;
  href?: string;
};

export type WorkspaceTabId =
  | "workspace"
  | "result-guide"
  | "prompt-runs"
  | "artifacts"
  | "audio-guides"
  | "timeline";

/** Tab labels (UI only — ids/state/routes are unchanged). */
const TAB_LABEL: Record<WorkspaceTabId, string> = {
  workspace: "Workspace",
  "result-guide": "Guide",
  "prompt-runs": "Work Log",
  artifacts: "Artifacts",
  "audio-guides": "Audio Guides",
  timeline: "Timeline"
};

/** Primary tabs stay visible; the rest collapse into a More dropdown. */
const PRIMARY_TABS: WorkspaceTabId[] = ["workspace", "result-guide", "prompt-runs"];
const MORE_TABS: WorkspaceTabId[] = ["artifacts", "audio-guides", "timeline"];

/** Count-chip tone per tab, matching the rest of the app's color system. */
const TAB_TONE: Record<WorkspaceTabId, string> = {
  workspace: "neutral",
  "result-guide": "purple",
  "prompt-runs": "blue",
  artifacts: "green",
  "audio-guides": "yellow",
  timeline: "neutral"
};

/** Active-tab accent driven by the workspace mode. */
const MODE_ACCENT: Record<RedefinedResult["mode"], { color: string; fg: "light" | "dark" }> = {
  understand: { color: "#b2a5ff", fg: "light" },
  build: { color: "#38b6ff", fg: "light" },
  fix: { color: "#f5b800", fg: "dark" },
  artifact: { color: "#00bf63", fg: "light" }
};

type WorkspaceTabNavProps = {
  result: RedefinedResult;
  activeTab: WorkspaceTabId;
  onChange: (tab: WorkspaceTabId) => void;
  actions?: WorkspaceTabAction[];
};

export function WorkspaceTabNav({ result, activeTab, onChange, actions = [] }: WorkspaceTabNavProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!moreOpen) return undefined;
    const onDoc = (event: MouseEvent) => {
      if (!moreRef.current?.contains(event.target as Node)) setMoreOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [moreOpen]);

  const tabCounts: Record<WorkspaceTabId, number> = {
    workspace: 0,
    "result-guide": result.resultGuide ? 1 : 0,
    "prompt-runs": (result.workspacePromptRuns ?? []).length,
    artifacts: (result.workspaceArtifacts ?? []).length,
    "audio-guides": (result.workspaceAudioGuides ?? []).length,
    timeline: (result.workspaceJourney ?? []).length
  };

  return (
    <nav
      className="workspace-tab-bar"
      role="tablist"
      aria-label="Workspace views"
      data-fg={MODE_ACCENT[result.mode].fg}
      style={{ "--ws-accent": MODE_ACCENT[result.mode].color } as CSSProperties}
    >
      {PRIMARY_TABS.map((id) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={activeTab === id}
          className={`workspace-tab${activeTab === id ? " is-active" : ""}`}
          onClick={() => onChange(id)}
        >
          <span>{TAB_LABEL[id]}</span>
          {id !== "prompt-runs" && tabCounts[id] > 0 ? (
            <em className={`workspace-tab-count tone-${TAB_TONE[id]}`}>{tabCounts[id]}</em>
          ) : null}
        </button>
      ))}

      <div className="workspace-tab-more" ref={moreRef}>
        <button
          type="button"
          className={`workspace-tab${MORE_TABS.includes(activeTab) ? " is-active" : ""}`}
          aria-haspopup="menu"
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen((open) => !open)}
        >
          <span>More</span>
          <span className="workspace-tab-caret" aria-hidden="true">▾</span>
        </button>

        {moreOpen ? (
          <div className="workspace-tab-menu" role="menu">
            {MORE_TABS.map((id) => (
              <button
                key={id}
                type="button"
                role="menuitemradio"
                aria-checked={activeTab === id}
                className={`workspace-tab-menu-item${activeTab === id ? " active" : ""}`}
                onClick={() => {
                  onChange(id);
                  setMoreOpen(false);
                }}
              >
                <span>{TAB_LABEL[id]}</span>
                {tabCounts[id] > 0 ? (
                  <em className={`workspace-tab-count tone-${TAB_TONE[id]}`}>{tabCounts[id]}</em>
                ) : null}
              </button>
            ))}

            {actions.length > 0 ? (
              <>
                <span className="workspace-tab-menu-sep" role="separator" />
                <p className="workspace-tab-menu-label">Workspace actions</p>
                {actions.map((action) =>
                  action.href ? (
                    <a
                      key={action.key}
                      role="menuitem"
                      href={action.href}
                      className="workspace-tab-menu-item is-action"
                      onClick={() => setMoreOpen(false)}
                    >
                      {action.icon ? <span className="workspace-tab-menu-ico" aria-hidden="true">{action.icon}</span> : null}
                      <span>{action.label}</span>
                    </a>
                  ) : (
                    <button
                      key={action.key}
                      type="button"
                      role="menuitem"
                      className="workspace-tab-menu-item is-action"
                      onClick={() => {
                        action.onClick?.();
                        setMoreOpen(false);
                      }}
                    >
                      {action.icon ? <span className="workspace-tab-menu-ico" aria-hidden="true">{action.icon}</span> : null}
                      <span>{action.label}</span>
                    </button>
                  )
                )}
              </>
            ) : null}
          </div>
        ) : null}
      </div>
    </nav>
  );
}
