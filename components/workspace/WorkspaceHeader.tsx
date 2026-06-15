"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { useProfile } from "@/components/profile/useProfile";
import { type RedefinedResult } from "@/lib/redefined";
import { getProjects, renameWorkspaceRecord } from "@/lib/journey-store";
import type {
  JourneyEvent,
  WorkspaceMeta
} from "@/lib/workspace-types";

type WorkspaceHeaderProps = {
  result: RedefinedResult;
  recordId?: string;
  onResultChange?: (result: RedefinedResult) => void;
};

export function WorkspaceHeader({ result, recordId, onResultChange }: WorkspaceHeaderProps) {
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

  const relatedParams = new URLSearchParams();
  relatedParams.set("fromWorkspaceId", meta.workspaceId);
  relatedParams.set("fromWorkspaceName", workspaceName);
  if (meta.projectId) relatedParams.set("projectId", meta.projectId);
  const relatedWorkspaceHref = `/new?${relatedParams.toString()}`;

  return (
    <section className="workspace-header workspace-header-minimal" aria-label="Workspace">
      <div className="workspace-header-main">
        <div>
          <p className="workspace-header-label workspace-eyebrow">Workspace</p>
          {project ? <p className="workspace-project-context">Project: {project.name}</p> : null}
          {meta.createdFromWorkspaceId ? (
            <p className="workspace-project-context workspace-created-from">
              Created from another workspace
            </p>
          ) : null}
          {isRenaming ? (
            <input
              className="workspace-rename-input"
              value={draftName}
              autoFocus
              onChange={(event) => setDraftName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") saveRename();
                if (event.key === "Escape") {
                  setDraftName(workspaceName);
                  setIsRenaming(false);
                }
              }}
            />
          ) : (
            <h2 className="workspace-title">{workspaceName}</h2>
          )}
          <p className="workspace-subtitle">{meta.workspaceSubtitle}</p>
          {meta.persistence === "unsaved" ? (
            <p className="workspace-save-state">Unsaved workspace</p>
          ) : meta.persistence === "local_profile" || meta.persistence === "cloud_profile" ? (
            <p className="workspace-save-state">Saved</p>
          ) : null}
        </div>

        {isRenaming ? (
          <div className="workspace-rename-actions">
            <button type="button" onClick={saveRename}>
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                setDraftName(workspaceName);
                setIsRenaming(false);
              }}
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="workspace-rename-button"
            onClick={() => {
              setDraftName(workspaceName);
              setIsRenaming(true);
            }}
          >
            Rename
          </button>
        )}
      </div>

      <div className="workspace-header-actions">
        <Link className="workspace-action-new" href="/">
          New workspace
        </Link>
        <Link className="workspace-action-secondary" href={relatedWorkspaceHref}>
          Create related workspace
        </Link>
        {meta.mode === "artifact" ? (
          <button className="workspace-action-secondary" type="button" onClick={() => window.print()}>
            Export
          </button>
        ) : null}
        {meta.persistence === "temporary" || meta.persistence === "unsaved" ? (
          <a className="workspace-action-secondary" href="/signup?next=save">
            Save to profile
          </a>
        ) : null}
      </div>
    </section>
  );
}
