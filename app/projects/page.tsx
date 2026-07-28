"use client";

import { openCreateProject } from "@/components/dashboard/DashboardModals";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { ProjectCard } from "@/components/dashboard/ProjectCard";
import { useWorkspaceActions } from "@/components/dashboard/useWorkspaceActions";
import { projectModeBreakdown, projectWorkspaceCount } from "@/lib/dashboard-store";
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
        <div className="proj-color-grid">
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              count={projectWorkspaceCount(project, records)}
              modeMix={projectModeBreakdown(project, records)}
              onRename={
                project.projectType !== "system" ? () => handleRenameProject(project) : undefined
              }
              onDelete={
                project.projectType !== "system" && project.projectType !== "default"
                  ? () => handleDeleteProject(project)
                  : undefined
              }
            />
          ))}
        </div>
      )}
    </DashboardShell>
  );
}
