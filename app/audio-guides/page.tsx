"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AudioGuideCard } from "@/components/audio/AudioGuideCard";
import { DASHBOARD_CHANGED_EVENT } from "@/components/dashboard/DashboardModals";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { useProfile } from "@/components/profile/useProfile";
import {
  getArchivedAudioGuideIds,
  getAudioGuideItems,
  toggleArchivedAudioGuide,
  type AudioGuideItem,
  type AudioGuideStatus
} from "@/lib/audio-library";
import { deleteAudioGuide, getProjects } from "@/lib/journey-store";
import type { WorkspaceProject } from "@/lib/workspace-types";

type StatusFilter = "all" | AudioGuideStatus;

const STATUS_FILTERS: Array<{ id: StatusFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "ready", label: "Ready" },
  { id: "transcript_only", label: "Transcript only" },
  { id: "failed", label: "Failed" }
];

export default function AudioGuidesPage() {
  const { profile } = useProfile();
  const profileId = profile?.id;

  const [items, setItems] = useState<AudioGuideItem[]>([]);
  const [projects, setProjects] = useState<WorkspaceProject[]>([]);
  const [archivedIds, setArchivedIds] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [showArchived, setShowArchived] = useState(false);

  const refresh = useCallback(() => {
    setItems(getAudioGuideItems(profileId));
    setProjects(getProjects(profileId));
    setArchivedIds(getArchivedAudioGuideIds());
    setHydrated(true);
  }, [profileId]);

  useEffect(() => {
    const timer = window.setTimeout(refresh, 0);
    window.addEventListener(DASHBOARD_CHANGED_EVENT, refresh);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener(DASHBOARD_CHANGED_EVENT, refresh);
    };
  }, [refresh]);

  const projectName = useCallback(
    (id?: string) => (id ? projects.find((project) => project.id === id)?.name : undefined),
    [projects]
  );

  const availableProjects = useMemo(() => {
    const ids = new Set(items.map((item) => item.projectId).filter(Boolean) as string[]);
    return projects.filter((project) => ids.has(project.id));
  }, [items, projects]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items.filter((item) => {
      const archived = archivedIds.includes(item.id);
      if (showArchived !== archived) return false;
      if (statusFilter !== "all" && item.status !== statusFilter) return false;
      if (projectFilter !== "all" && item.projectId !== projectFilter) return false;
      if (
        query &&
        !item.title.toLowerCase().includes(query) &&
        !item.sourceWorkspaceName.toLowerCase().includes(query) &&
        !item.transcript.toLowerCase().includes(query)
      ) {
        return false;
      }
      return true;
    });
  }, [items, archivedIds, showArchived, statusFilter, projectFilter, search]);

  const handleArchive = useCallback((item: AudioGuideItem) => {
    setArchivedIds(toggleArchivedAudioGuide(item.id));
  }, []);

  const handleDelete = useCallback(
    (item: AudioGuideItem) => {
      if (!window.confirm(`Delete "${item.title}"? This removes the audio guide permanently.`)) return;
      deleteAudioGuide({
        recordId: item.recordId,
        audioGuideId: item.id,
        persistence: item.persistence,
        profileId
      });
      refresh();
    },
    [profileId, refresh]
  );

  const activeCount = items.filter((item) => !archivedIds.includes(item.id)).length;

  return (
    <DashboardShell active="audio">
      <header className="dash-page-head">
        <div>
          <h1>Audio Guides</h1>
          <p>
            {activeCount} narrated walkthrough{activeCount === 1 ? "" : "s"} — listen without leaving
            this page.
          </p>
        </div>
      </header>

      <div className="dash-toolbar art-toolbar">
        <input
          type="search"
          className="dash-search"
          placeholder="Search audio guides..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />

        <select
          className="art-select"
          value={projectFilter}
          onChange={(event) => setProjectFilter(event.target.value)}
          aria-label="Filter by project"
        >
          <option value="all">All projects</option>
          {availableProjects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>

        <button
          type="button"
          className={`art-archive-toggle${showArchived ? " active" : ""}`}
          aria-pressed={showArchived}
          onClick={() => setShowArchived((current) => !current)}
        >
          {showArchived ? "Viewing archived" : "Show archived"}
        </button>
      </div>

      <div className="dash-filters" role="group" aria-label="Status filters">
        {STATUS_FILTERS.map((filter) => (
          <button
            key={filter.id}
            type="button"
            className={statusFilter === filter.id ? "active" : ""}
            aria-pressed={statusFilter === filter.id}
            onClick={() => setStatusFilter(filter.id)}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {hydrated && filtered.length === 0 ? (
        <div className="dash-empty">
          <h2>{showArchived ? "No archived audio guides" : "No audio guides yet"}</h2>
          <p>
            {showArchived
              ? "Audio guides you archive will appear here."
              : "Generate a narrated walkthrough inside any workspace and it will collect here."}
          </p>
          {!showArchived ? (
            <Link className="dash-btn-purple" href="/workspaces">
              Go to workspaces
            </Link>
          ) : null}
        </div>
      ) : (
        <div className="audio-grid">
          {filtered.map((item) => (
            <AudioGuideCard
              key={`${item.recordId}-${item.id}`}
              item={item}
              projectName={projectName(item.projectId)}
              archived={archivedIds.includes(item.id)}
              onArchive={() => handleArchive(item)}
              onDelete={() => handleDelete(item)}
            />
          ))}
        </div>
      )}
    </DashboardShell>
  );
}
