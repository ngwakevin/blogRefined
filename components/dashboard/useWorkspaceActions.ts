"use client";

import { useCallback, useEffect, useState } from "react";
import { DASHBOARD_CHANGED_EVENT } from "@/components/dashboard/DashboardModals";
import { useProfile } from "@/components/profile/useProfile";
import {
  getDashboardActivity,
  getDashboardRecords,
  getStarredWorkspaceIds,
  orderProjects,
  toggleStarredWorkspace,
  type DashboardActivityItem,
  type DashboardRecord
} from "@/lib/dashboard-store";
import {
  deleteWorkspaceRecord,
  duplicateWorkspaceRecord,
  ensureDefaultProjects,
  getProjects,
  movePendingWorkspace,
  moveWorkspacesToProject,
  removePendingWorkspace,
  removeWorkspaceFromProject,
  renameWorkspaceRecord,
  updatePendingWorkspace
} from "@/lib/journey-store";
import type { WorkspaceProject } from "@/lib/workspace-types";

export function useWorkspaceActions() {
  const { profile } = useProfile();
  const [records, setRecords] = useState<DashboardRecord[]>([]);
  const [projects, setProjects] = useState<WorkspaceProject[]>([]);
  const [activity, setActivity] = useState<DashboardActivityItem[]>([]);
  const [starredIds, setStarredIds] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);

  const profileId = profile?.id;

  const refresh = useCallback(() => {
    if (profileId) ensureDefaultProjects(profileId);
    setRecords(getDashboardRecords(profileId));
    setProjects(orderProjects(getProjects(profileId)));
    setActivity(getDashboardActivity(profileId));
    setStarredIds(getStarredWorkspaceIds());
    setHydrated(true);
  }, [profileId]);

  useEffect(() => {
    const hydrationTimer = window.setTimeout(() => {
      refresh();
    }, 0);

    window.addEventListener(DASHBOARD_CHANGED_EVENT, refresh);

    return () => {
      window.clearTimeout(hydrationTimer);
      window.removeEventListener(DASHBOARD_CHANGED_EVENT, refresh);
    };
  }, [refresh]);

  const handleToggleStar = useCallback((workspaceId: string) => {
    setStarredIds(toggleStarredWorkspace(workspaceId));
  }, []);

  const handleRename = useCallback(
    (record: DashboardRecord) => {
      const nextName = window.prompt("Rename workspace", record.name)?.trim();
      if (!nextName || nextName === record.name) return;

      if (record.pending) {
        updatePendingWorkspace(record.workspaceId, { workspaceName: nextName });
      } else {
        renameWorkspaceRecord({
          recordId: record.recordId,
          workspaceId: record.workspaceId,
          workspaceName: nextName,
          persistence: record.persistence,
          profileId: profile?.id
        });
      }
      refresh();
    },
    [profile?.id, refresh]
  );

  const handleDuplicate = useCallback(
    (record: DashboardRecord) => {
      if (record.pending) return; // nothing to duplicate before a result exists
      duplicateWorkspaceRecord({
        recordId: record.recordId,
        persistence: record.persistence,
        profileId: profile?.id
      });
      refresh();
    },
    [profile?.id, refresh]
  );

  const handleDelete = useCallback(
    (record: DashboardRecord) => {
      const confirmed = window.confirm(
        `Delete "${record.name}"? This removes the workspace permanently.`
      );
      if (!confirmed) return;

      if (record.pending) {
        removePendingWorkspace(record.workspaceId);
      } else {
        deleteWorkspaceRecord({
          recordId: record.recordId,
          persistence: record.persistence,
          profileId: profile?.id
        });
      }
      refresh();
    },
    [profile?.id, refresh]
  );

  const handleMove = useCallback(
    (record: DashboardRecord, projectId: string | null) => {
      if (record.pending) {
        const target =
          projectId ??
          (record.projectId
            ? ensureDefaultProjects(profile?.id).myWorkspaces?.id ?? null
            : null);
        if (target && target !== record.projectId) {
          movePendingWorkspace(record.workspaceId, target, profile?.id);
        }
        refresh();
        return;
      }

      if (projectId) {
        // Single-target move (dedupes + removes from old project).
        moveWorkspacesToProject([record.workspaceId], projectId, profile?.id);
      } else if (record.projectId) {
        // Removing from a custom project returns it to My Workspaces (never orphaned).
        const myWorkspaces = ensureDefaultProjects(profile?.id).myWorkspaces;
        if (myWorkspaces && record.projectId !== myWorkspaces.id) {
          moveWorkspacesToProject([record.workspaceId], myWorkspaces.id, profile?.id);
        } else {
          removeWorkspaceFromProject(record.workspaceId, record.projectId, profile?.id);
        }
      }
      refresh();
    },
    [profile?.id, refresh]
  );

  return {
    profile,
    hydrated,
    records,
    projects,
    activity,
    starredIds,
    refresh,
    handleToggleStar,
    handleRename,
    handleDuplicate,
    handleDelete,
    handleMove
  };
}
