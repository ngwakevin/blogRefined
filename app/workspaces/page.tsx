"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { openCreateWorkspace } from "@/components/dashboard/DashboardModals";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { WorkspaceCard } from "@/components/dashboard/WorkspaceCard";
import { useWorkspaceActions } from "@/components/dashboard/useWorkspaceActions";
import type { RedefinedMode } from "@/lib/redefined";

type WorkspaceFilter =
  | "all"
  | "understand"
  | "build"
  | "fix"
  | "artifact"
  | "audio"
  | "has-artifact"
  | "starred";

const FILTERS: Array<{ id: WorkspaceFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "understand", label: "Understand" },
  { id: "build", label: "Build" },
  { id: "fix", label: "Fix" },
  { id: "artifact", label: "Artifact" },
  { id: "audio", label: "Has audio" },
  { id: "has-artifact", label: "Has artifact" },
  { id: "starred", label: "Starred" }
];

const MODE_FILTERS: RedefinedMode[] = ["understand", "build", "fix", "artifact"];

function parseFilter(value: string | null): WorkspaceFilter {
  return FILTERS.some((filter) => filter.id === value) ? (value as WorkspaceFilter) : "all";
}

function shellActiveFor(filter: WorkspaceFilter): "workspaces" | "audio" | "artifacts" | "starred" {
  if (filter === "audio") return "audio";
  if (filter === "has-artifact") return "artifacts";
  if (filter === "starred") return "starred";
  return "workspaces";
}

function WorkspacesContent() {
  const searchParams = useSearchParams();
  const {
    records,
    projects,
    starredIds,
    hydrated,
    handleToggleStar,
    handleRename,
    handleDuplicate,
    handleDelete,
    handleMove
  } = useWorkspaceActions();

  const [filter, setFilter] = useState<WorkspaceFilter>(() =>
    parseFilter(searchParams.get("filter"))
  );
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();

    return records.filter((record) => {
      if (MODE_FILTERS.includes(filter as RedefinedMode) && record.mode !== filter) return false;
      if (filter === "audio" && record.audioCount === 0) return false;
      if (filter === "has-artifact" && record.artifactCount === 0) return false;
      if (filter === "starred" && !starredIds.includes(record.workspaceId)) return false;
      if (
        query &&
        !record.name.toLowerCase().includes(query) &&
        !record.subtitle.toLowerCase().includes(query)
      ) {
        return false;
      }
      return true;
    });
  }, [filter, records, search, starredIds]);

  return (
    <DashboardShell active={shellActiveFor(filter)}>
      <header className="dash-page-head">
        <div>
          <h1>Workspaces</h1>
          <p>
            {records.length} workspace{records.length === 1 ? "" : "s"} saved to your profile.
          </p>
        </div>
        <button className="dash-btn-purple" type="button" onClick={() => openCreateWorkspace()}>
            + New workspace
          </button>
      </header>

      <div className="dash-toolbar">
        <input
          type="search"
          className="dash-search"
          placeholder="Search workspaces..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <div className="dash-view-toggle" role="group" aria-label="View">
          <button
            type="button"
            className={view === "grid" ? "active" : ""}
            aria-pressed={view === "grid"}
            onClick={() => setView("grid")}
          >
            Grid
          </button>
          <button
            type="button"
            className={view === "list" ? "active" : ""}
            aria-pressed={view === "list"}
            onClick={() => setView("list")}
          >
            List
          </button>
        </div>
      </div>

      <div className="dash-filters" role="group" aria-label="Filters">
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={filter === item.id ? "active" : ""}
            aria-pressed={filter === item.id}
            onClick={() => setFilter(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {hydrated && filtered.length === 0 ? (
        <div className="dash-empty">
          <h2>No workspaces here yet</h2>
          <p>Try a different filter, or create a new workspace from any prompt.</p>
          <button className="dash-btn-purple" type="button" onClick={() => openCreateWorkspace()}>
            + New workspace
          </button>
        </div>
      ) : (
        <div className={view === "grid" ? "dash-ws-grid" : "dash-ws-list"}>
          {filtered.map((record) => (
            <WorkspaceCard
              key={record.recordId}
              record={record}
              starred={starredIds.includes(record.workspaceId)}
              projects={projects}
              compact={view === "list"}
              onToggleStar={handleToggleStar}
              onRename={handleRename}
              onDuplicate={handleDuplicate}
              onDelete={handleDelete}
              onMove={handleMove}
            />
          ))}
        </div>
      )}
    </DashboardShell>
  );
}

export default function WorkspacesPage() {
  return (
    <Suspense fallback={null}>
      <WorkspacesContent />
    </Suspense>
  );
}
