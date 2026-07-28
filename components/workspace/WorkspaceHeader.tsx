"use client";

import { useCallback, useMemo, useState } from "react";
import { openCreateWorkspace } from "@/components/dashboard/DashboardModals";
import { useProfile } from "@/components/profile/useProfile";
import { WorkspaceTabNav, type WorkspaceTabAction, type WorkspaceTabId } from "@/components/workspace/WorkspaceTabNav";
import { type RedefinedResult } from "@/lib/redefined";
import { getProjects, renameWorkspaceRecord } from "@/lib/journey-store";
import type { JourneyEvent } from "@/lib/workspace-types";

type WorkspaceHeaderProps = {
  result: RedefinedResult;
  recordId?: string;
  activeTab: WorkspaceTabId;
  onTabChange: (tab: WorkspaceTabId) => void;
  onExportWorkspace?: () => void;
  onResultChange?: (result: RedefinedResult) => void;
};

type DisplayStatus = "empty" | "running" | "completed" | "error";

const DISPLAY_STATUS: Record<string, DisplayStatus> = {
  empty: "empty",
  awaiting_first_prompt: "empty",
  running: "running",
  completed: "completed",
  error: "error"
};

export function WorkspaceHeader({
  result,
  recordId,
  activeTab,
  onTabChange,
  onExportWorkspace,
  onResultChange
}: WorkspaceHeaderProps) {
  const { profile } = useProfile();
  const meta = result.workspaceMeta;
  const journey = useMemo<JourneyEvent[]>(() => result.workspaceJourney ?? [], [result]);
  const project = meta?.projectId
    ? getProjects(profile?.id).find((item) => item.id === meta.projectId) ?? null
    : null;
  const [workspaceName, setWorkspaceName] = useState(meta?.workspaceName ?? result.title);
  const [draftName, setDraftName] = useState(workspaceName);
  const [isRenaming, setIsRenaming] = useState(false);

  const saveRename = useCallback(() => {
    if (!meta) return;

    const nextName = draftName.trim();
    if (!nextName || nextName === workspaceName) {
      setDraftName(workspaceName);
      setIsRenaming(false);
      return;
    }

    const updated = renameWorkspaceRecord({
      recordId,
      workspaceId: meta.workspaceId,
      workspaceName: nextName,
      persistence: meta.persistence,
      profileId: profile?.id
    });

    const now = new Date().toISOString();
    const renameEvent: JourneyEvent = {
      id: `event-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      eventType: "workspace_renamed",
      title: "Workspace renamed",
      description: `Renamed workspace to ${nextName}.`,
      timestamp: now
    };
    const fallbackResult: RedefinedResult = {
      ...result,
      workspaceMeta: {
        ...meta,
        workspaceName: nextName,
        updatedAt: now
      },
      workspaceJourney: [...journey, renameEvent]
    };

    setWorkspaceName(nextName);
    setIsRenaming(false);
    onResultChange?.(updated ?? fallbackResult);
  }, [draftName, journey, meta, onResultChange, profile?.id, recordId, result, workspaceName]);

  if (!meta) return null;

  const status = DISPLAY_STATUS[meta.status ?? "completed"] ?? "completed";
  const mode = meta.mode;
  const isSaved = meta.persistence === "local_profile" || meta.persistence === "cloud_profile";

  const tabActions: WorkspaceTabAction[] = [
    {
      key: "rename",
      label: "Rename",
      icon: (
        <svg viewBox="0 0 20 20"><path d="M4 13.5 12.5 5l2.5 2.5L6.5 16H4z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /></svg>
      ),
      onClick: () => {
        setDraftName(workspaceName);
        setIsRenaming(true);
      }
    },
    {
      key: "new-workspace",
      label: "New workspace",
      icon: (
        <svg viewBox="0 0 20 20"><path d="M10 4v12M4 10h12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
      ),
      onClick: () => openCreateWorkspace()
    },
    {
      key: "create-related",
      label: "Create related workspace",
      icon: (
        <svg viewBox="0 0 20 20"><circle cx="5" cy="5" r="2" fill="none" stroke="currentColor" strokeWidth="1.6" /><circle cx="5" cy="15" r="2" fill="none" stroke="currentColor" strokeWidth="1.6" /><circle cx="15" cy="9" r="2" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M5 7v6M5 11c0-3 5-1 8-3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
      ),
      onClick: () => openCreateWorkspace({ destinationId: meta.projectId })
    },
    {
      key: "export",
      label: "Export workspace",
      icon: (
        <svg viewBox="0 0 20 20"><path d="M10 3v9m0 0 3-3m-3 3-3-3M4 16h12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
      ),
      onClick: () => onExportWorkspace?.()
    },
    ...(meta.mode === "artifact"
      ? [{ key: "print", label: "Print / Export PDF", onClick: () => window.print() }]
      : []),
    ...(!isSaved ? [{ key: "save-profile", label: "Save to profile", href: "/signup?next=save" }] : [])
  ];

  return (
    <header className={`workspace-header mode-${mode}`}>
      <div className="workspace-header-top">
        <div className="workspace-meta-block">
          <p className="workspace-eyebrow">Workspace</p>
          <div className="workspace-meta-row">
            <span>Project: {project?.name ?? "Unassigned"}</span>
          </div>
        </div>

        <div className="workspace-header-tabs">
          <WorkspaceTabNav
            result={result}
            activeTab={activeTab}
            onChange={onTabChange}
            actions={tabActions}
          />
        </div>
      </div>

      <div className="workspace-title-block">
        {isRenaming ? (
          <input
            className="workspace-rename-input-inline"
            value={draftName}
            autoFocus
            onChange={(event) => setDraftName(event.target.value)}
            onBlur={saveRename}
            onKeyDown={(event) => {
              if (event.key === "Enter") saveRename();
              if (event.key === "Escape") {
                setDraftName(workspaceName);
                setIsRenaming(false);
              }
            }}
          />
        ) : (
          <h1>{workspaceName}</h1>
        )}

        {meta.workspaceSubtitle ? <p>{meta.workspaceSubtitle}</p> : null}

        <div className="workspace-badges">
          <span className={`status-badge status-${status}`}>{status.toUpperCase()}</span>
          <span className={`path-badge path-${mode}`}>PATH: {mode.toUpperCase()}</span>
          {isSaved ? <span className="saved-badge">SAVED</span> : null}
        </div>
      </div>
    </header>
  );
}
