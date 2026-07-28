"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DASHBOARD_CHANGED_EVENT } from "@/components/dashboard/DashboardModals";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { useProfile } from "@/components/profile/useProfile";
import { ArtifactCard } from "@/components/artifacts/ArtifactCard";
import {
  ARTIFACT_TYPE_LABELS,
  artifactDownloadName,
  getArchivedArtifactIds,
  getArtifactLibraryItems,
  toggleArchivedArtifact,
  type ArtifactLibraryItem,
  type ArtifactType
} from "@/lib/artifact-library";
import { incrementUsage } from "@/lib/account-store";
import { artifactTone } from "@/lib/artifact-generation";
import { deleteLibraryArtifact, getProjects } from "@/lib/journey-store";
import type { WorkspaceProject } from "@/lib/workspace-types";

function snippet(content: string): string {
  return content
    .replace(/[#*`>_]/g, " ")
    .replace(/^\s*[-•]\s*/gm, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 150);
}

export default function ArtifactsPage() {
  const { profile } = useProfile();
  const profileId = profile?.id;

  const [items, setItems] = useState<ArtifactLibraryItem[]>([]);
  const [projects, setProjects] = useState<WorkspaceProject[]>([]);
  const [archivedIds, setArchivedIds] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<ArtifactType | "all">("all");
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [showArchived, setShowArchived] = useState(false);

  const refresh = useCallback(() => {
    setItems(getArtifactLibraryItems(profileId));
    setProjects(getProjects(profileId));
    setArchivedIds(getArchivedArtifactIds());
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

  // Only show type/project filters that actually exist in the library.
  const availableTypes = useMemo(() => {
    const set = new Set<ArtifactType>();
    items.forEach((item) => set.add(item.type));
    return [...set];
  }, [items]);

  const availableProjects = useMemo(() => {
    const ids = new Set(items.map((item) => item.projectId).filter(Boolean) as string[]);
    return projects.filter((project) => ids.has(project.id));
  }, [items, projects]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items.filter((item) => {
      const archived = archivedIds.includes(item.id);
      if (showArchived !== archived) return false;
      if (typeFilter !== "all" && item.type !== typeFilter) return false;
      if (projectFilter !== "all" && item.projectId !== projectFilter) return false;
      if (
        query &&
        !item.title.toLowerCase().includes(query) &&
        !item.sourceWorkspaceName.toLowerCase().includes(query) &&
        !item.content.toLowerCase().includes(query)
      ) {
        return false;
      }
      return true;
    });
  }, [items, archivedIds, showArchived, typeFilter, projectFilter, search]);

  const handleCopy = useCallback(async (item: ArtifactLibraryItem) => {
    try {
      await navigator.clipboard.writeText(item.content);
    } catch {
      // clipboard unavailable
    }
  }, []);

  const handleDownload = useCallback((item: ArtifactLibraryItem) => {
    const mime = item.format === "code" || item.format === "email" ? "text/plain" : "text/markdown";
    const blob = new Blob([item.content], { type: `${mime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = artifactDownloadName(item);
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    incrementUsage("exportsThisMonth");
  }, []);

  const handleArchive = useCallback((item: ArtifactLibraryItem) => {
    setArchivedIds(toggleArchivedArtifact(item.id));
  }, []);

  const handleDelete = useCallback(
    (item: ArtifactLibraryItem) => {
      const confirmed = window.confirm(
        `Delete "${item.title}"? This removes the artifact from its workspace permanently.`
      );
      if (!confirmed) return;
      deleteLibraryArtifact({
        recordId: item.recordId,
        artifactId: item.id,
        origin: item.origin,
        persistence: item.persistence,
        profileId
      });
      refresh();
    },
    [profileId, refresh]
  );

  const activeCount = items.filter((item) => !archivedIds.includes(item.id)).length;

  return (
    <DashboardShell active="artifacts">
      <header className="dash-page-head">
        <div>
          <h1>Artifacts</h1>
          <p>
            {activeCount} artifact{activeCount === 1 ? "" : "s"} generated across your workspaces.
          </p>
        </div>
      </header>

      <div className="dash-toolbar art-toolbar">
        <input
          type="search"
          className="dash-search"
          placeholder="Search artifacts..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />

        <select
          className="art-select"
          value={typeFilter}
          onChange={(event) => setTypeFilter(event.target.value as ArtifactType | "all")}
          aria-label="Filter by type"
        >
          <option value="all">All types</option>
          {availableTypes.map((type) => (
            <option key={type} value={type}>
              {ARTIFACT_TYPE_LABELS[type]}
            </option>
          ))}
        </select>

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

      {hydrated && filtered.length === 0 ? (
        <div className="dash-empty">
          <h2>{showArchived ? "No archived artifacts" : "No artifacts yet"}</h2>
          <p>
            {showArchived
              ? "Artifacts you archive will appear here."
              : "Generate an artifact inside any workspace — runbooks, checklists, summaries, tickets — and it will collect here."}
          </p>
          {!showArchived ? (
            <Link className="dash-btn-purple" href="/workspaces">
              Go to workspaces
            </Link>
          ) : null}
        </div>
      ) : (
        <div className="art-color-grid">
          {filtered.map((item) => (
            <ArtifactCard
              key={`${item.recordId}-${item.id}`}
              data={{
                id: item.id,
                href: `/artifacts/${encodeURIComponent(item.id)}`,
                title: item.title,
                typeLabel: item.displayType ?? ARTIFACT_TYPE_LABELS[item.type],
                tone: artifactTone(item.type, item.displayType),
                snippet: snippet(item.content),
                sourceName: item.sourceWorkspaceName,
                projectName: projectName(item.projectId),
                createdAt: item.createdAt,
                archived: archivedIds.includes(item.id)
              }}
              onCopy={() => void handleCopy(item)}
              onDownload={() => handleDownload(item)}
              onArchive={() => handleArchive(item)}
              onDelete={() => handleDelete(item)}
            />
          ))}
        </div>
      )}
    </DashboardShell>
  );
}
