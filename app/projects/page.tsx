"use client";

import Link from "next/link";
import { openCreateProject } from "@/components/dashboard/DashboardModals";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { useWorkspaceActions } from "@/components/dashboard/useWorkspaceActions";
import {
  MODE_META,
  PROJECT_COLORS,
  projectModeMix,
  projectWorkspaceCount,
  relativeTime
} from "@/lib/dashboard-store";
import { deleteProject, updateProject } from "@/lib/journey-store";
import type { WorkspaceProject } from "@/lib/workspace-types";

export default function ProjectsPage() {
  const { profile, records, projects, hydrated, refresh } = useWorkspaceActions();

  const handleRenameProject = (project: WorkspaceProject) => {
    const name = window.prompt("Rename project", project.name)?.trim();
    if (!name || name === project.name) return;
    updateProject({ ...project, name });
    refresh();
  };

  const handleDeleteProject = (project: WorkspaceProject) => {
    const confirmed = window.confirm(
      `Delete project "${project.name}"? Workspaces inside are kept and ungrouped.`
    );
    if (!confirmed) return;
    deleteProject(project.id, profile?.id);
    refresh();
  };

  return (
    <DashboardShell active="projects">
      <header className="dash-page-head">
        <div>
          <h1>Projects</h1>
          <p>Group related workspaces so bigger efforts stay organised.</p>
        </div>
        <button className="dash-btn-purple" type="button" onClick={openCreateProject}>
          + New project
        </button>
      </header>

      {hydrated && projects.length === 0 ? (
        <div className="dash-empty">
          <h2>No projects yet</h2>
          <p>Create a project, then move workspaces into it from any workspace menu.</p>
          <button className="dash-btn-purple" type="button" onClick={openCreateProject}>
            + New project
          </button>
        </div>
      ) : (
        <div className="dash-project-grid">
          {projects.map((project) => {
            const count = projectWorkspaceCount(project, records);
            const mix = projectModeMix(project, records);

            return (
              <article
                key={project.id}
                className="dash-project-card dash-project-card-lg"
                style={{ "--proj-color": PROJECT_COLORS[project.color ?? "blue"] } as React.CSSProperties}
              >
                <span className="dash-project-dot" aria-hidden="true" />
                <div className="dash-project-text">
                  <strong>{project.name}</strong>
                  <em>
                    {count} workspace{count === 1 ? "" : "s"} · Updated {relativeTime(project.updatedAt)}
                  </em>
                  {mix.length > 0 ? (
                    <span className="dash-project-mix" aria-hidden="true">
                      {mix.map((mode) => (
                        <i key={mode} style={{ background: MODE_META[mode].color }} />
                      ))}
                    </span>
                  ) : null}
                </div>
                <div className="dash-project-actions">
                  <Link className="dash-btn-dark" href={`/projects/${encodeURIComponent(project.id)}`}>
                    Open
                  </Link>
                  {project.projectType !== "system" ? (
                    <button type="button" onClick={() => handleRenameProject(project)}>
                      Rename
                    </button>
                  ) : null}
                  {project.projectType !== "system" && project.projectType !== "default" ? (
                    <button type="button" className="danger" onClick={() => handleDeleteProject(project)}>
                      Delete
                    </button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </DashboardShell>
  );
}
