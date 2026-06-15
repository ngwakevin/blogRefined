"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo } from "react";
import { openAddWorkspaces, openCreateWorkspace } from "@/components/dashboard/DashboardModals";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { WorkspaceCard } from "@/components/dashboard/WorkspaceCard";
import { useWorkspaceActions } from "@/components/dashboard/useWorkspaceActions";
import { PROJECT_COLORS, relativeTime } from "@/lib/dashboard-store";
import { deleteProject, updateProject } from "@/lib/journey-store";

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const projectId = decodeURIComponent(params.id);

  const {
    profile,
    records,
    projects,
    starredIds,
    hydrated,
    refresh,
    handleToggleStar,
    handleRename,
    handleDuplicate,
    handleDelete,
    handleMove
  } = useWorkspaceActions();

  const project = projects.find((item) => item.id === projectId) ?? null;

  const projectRecords = useMemo(
    () =>
      records.filter(
        (record) =>
          record.projectId === projectId ||
          (project?.workspaceIds.includes(record.workspaceId) ?? false)
      ),
    [project, projectId, records]
  );

  if (hydrated && !project) {
    return (
      <DashboardShell active="projects">
        <div className="dash-empty">
          <h2>Project not found</h2>
          <p>This project is not available on this profile.</p>
          <Link className="dash-btn-purple" href="/projects">
            Back to projects
          </Link>
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell active="projects">
      {project ? (
        <>
          <header
            className="dash-page-head dash-project-head"
            style={{ "--proj-color": PROJECT_COLORS[project.color ?? "blue"] } as React.CSSProperties}
          >
            <div>
              <p className="dash-breadcrumb">
                <Link href="/projects">Projects</Link> / {project.name}
              </p>
              <h1>
                <span className="dash-project-dot" aria-hidden="true" /> {project.name}
              </h1>
              <p>
                {projectRecords.length} workspace{projectRecords.length === 1 ? "" : "s"} · Updated{" "}
                {relativeTime(project.updatedAt)}
              </p>
            </div>
            <div className="dash-page-actions">
              <button
                type="button"
                className="dash-btn-purple"
                onClick={() => openCreateWorkspace({ destinationId: project.id })}
              >
                + New workspace in this project
              </button>
              <button type="button" onClick={() => openAddWorkspaces(project.id)}>
                Add existing workspaces
              </button>
              {project.projectType !== "system" ? (
                <button
                  type="button"
                  onClick={() => {
                    const name = window.prompt("Rename project", project.name)?.trim();
                    if (!name || name === project.name) return;
                    updateProject({ ...project, name });
                    refresh();
                  }}
                >
                  Rename
                </button>
              ) : null}
              {project.projectType !== "system" && project.projectType !== "default" ? (
                <button
                  type="button"
                  className="danger"
                  onClick={() => {
                    const confirmed = window.confirm(
                      `Delete project "${project.name}"? Workspaces inside are kept and ungrouped.`
                    );
                    if (!confirmed) return;
                    deleteProject(project.id, profile?.id);
                    router.push("/projects");
                  }}
                >
                  Delete project
                </button>
              ) : null}
            </div>
          </header>

          {projectRecords.length === 0 ? (
            <div className="dash-empty">
              <h2>No workspaces in this project yet</h2>
              <p>Create one here, or move existing workspaces in from their card menu.</p>
              <button
                type="button"
                className="dash-btn-purple"
                onClick={() => openCreateWorkspace({ destinationId: project.id })}
              >
                + New workspace in this project
              </button>
            </div>
          ) : (
            <div className="dash-ws-grid">
              {projectRecords.map((record) => (
                <WorkspaceCard
                  key={record.recordId}
                  record={record}
                  starred={starredIds.includes(record.workspaceId)}
                  projects={projects}
                  onToggleStar={handleToggleStar}
                  onRename={handleRename}
                  onDuplicate={handleDuplicate}
                  onDelete={handleDelete}
                  onMove={handleMove}
                />
              ))}
            </div>
          )}
        </>
      ) : null}
    </DashboardShell>
  );
}
