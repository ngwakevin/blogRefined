"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode
} from "react";
import { showToast } from "@/components/Toast";
import {
  DASHBOARD_CHANGED_EVENT,
  openAddWorkspaces,
  openCreateWorkspace
} from "@/components/dashboard/DashboardModals";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { WorkspaceCard } from "@/components/dashboard/WorkspaceCard";
import { useWorkspaceActions } from "@/components/dashboard/useWorkspaceActions";
import {
  PROJECT_COLOR_OPTIONS,
  PROJECT_COLORS,
  projectWorkspaceCount,
  relativeTime
} from "@/lib/dashboard-store";
import {
  deleteProject,
  getProfileJourneyRecords,
  getTemporaryJourneyRecords,
  updateProject
} from "@/lib/journey-store";
import type { JourneyEvent, WorkspaceProject } from "@/lib/workspace-types";

type ProjectActivityItem = {
  id: string;
  eventType: JourneyEvent["eventType"];
  title: string;
  description: string;
  timestamp: string;
  href: string;
  hrefLabel: string;
  workspaceName: string;
};

type ProjectStats = {
  workspaceCount: number;
  promptRuns: number;
  artifacts: number;
  audioGuides: number;
  lastUpdated: string;
};

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
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!moreOpen) return undefined;
    const onDoc = (event: MouseEvent) => {
      if (!moreRef.current?.contains(event.target as Node)) setMoreOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [moreOpen]);

  const projectWorkspaces = useMemo(
    () =>
      records
        .filter(
          (record) =>
            record.projectId === projectId ||
            (project?.workspaceIds.includes(record.workspaceId) ?? false)
        )
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [project, projectId, records]
  );

  const stats = useMemo<ProjectStats>(() => {
    const counts = projectWorkspaces.reduce(
      (acc, record) => ({
        workspaceCount: acc.workspaceCount + 1,
        promptRuns: acc.promptRuns + record.promptRunCount,
        artifacts: acc.artifacts + record.artifactCount,
        audioGuides: acc.audioGuides + record.audioCount,
        lastUpdated: record.updatedAt > acc.lastUpdated ? record.updatedAt : acc.lastUpdated
      }),
      {
        workspaceCount: 0,
        promptRuns: 0,
        artifacts: 0,
        audioGuides: 0,
        lastUpdated: project?.updatedAt ?? ""
      }
    );

    return {
      workspaceCount: project ? projectWorkspaceCount(project, records) : counts.workspaceCount,
      promptRuns: counts.promptRuns,
      artifacts: counts.artifacts,
      audioGuides: counts.audioGuides,
      lastUpdated: counts.lastUpdated || project?.updatedAt || ""
    };
  }, [project, projectWorkspaces, records]);

  const activity = useMemo(
    () => buildProjectActivity(project, profile?.id, projectWorkspaces),
    [profile?.id, project, projectWorkspaces]
  );

  const projectHref = `/projects/${encodeURIComponent(projectId)}`;
  const projectColor = project ? PROJECT_COLORS[project.color ?? "blue"] : PROJECT_COLORS.blue;
  const canEdit = Boolean(project && project.projectType !== "default" && project.projectType !== "system");
  const canDelete = Boolean(project && project.projectType !== "default" && project.projectType !== "system");
  const isPinned = project?.pinned !== false || project?.projectType === "default";

  const emitRefresh = () => {
    window.dispatchEvent(new Event(DASHBOARD_CHANGED_EVENT));
    refresh();
  };

  const handleTogglePin = () => {
    if (!project || !canEdit) return;
    updateProject({ ...project, pinned: !isPinned });
    showToast({ title: isPinned ? "Project unpinned" : "Project pinned" });
    emitRefresh();
  };

  const handleSaveProject = (next: WorkspaceProject) => {
    updateProject(next);
    showToast({ title: "Project updated" });
    emitRefresh();
  };

  const handleDeleteProject = () => {
    if (!project) return;
    deleteProject(project.id, profile?.id);
    showToast({ title: "Project deleted" });
    emitRefresh();
    router.push("/projects");
  };

  const handleNewWorkspace = () => {
    if (!project) return;
    openCreateWorkspace({
      destinationId: project.id,
      afterCreate: {
        stayLabel: "Stay on project",
        stayHref: projectHref
      }
    });
  };

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
        <div className="project-hub">
          <p className="project-hub-back">
            <Link href="/projects">← All projects</Link>
            <span>Projects / {project.name}</span>
          </p>

          <ProjectHeader
            project={project}
            projectColor={projectColor}
            workspaceCount={stats.workspaceCount}
            activityCount={activity.length}
            onNewWorkspace={handleNewWorkspace}
            onAddExisting={() => openAddWorkspaces(project.id)}
            onEdit={() => setEditOpen(true)}
            onTogglePin={canEdit ? handleTogglePin : undefined}
            onDelete={canDelete ? () => setDeleteOpen(true) : undefined}
          />

          <div className="project-hub-stats" aria-label="Project stats">
            <ProjectStat label="Workspaces" value={stats.workspaceCount} />
            <ProjectStat label="Prompt runs" value={stats.promptRuns} />
            <ProjectStat label="Artifacts" value={stats.artifacts} />
            <ProjectStat label="Audio guides" value={stats.audioGuides} />
            <ProjectStat label="Last updated" value={stats.lastUpdated ? relativeTime(stats.lastUpdated) : "Unknown"} />
          </div>

          <div className="project-hub-main">
            <section className="project-hub-section project-hub-workspaces">
              <div className="project-hub-section-head">
                <div>
                  <p>Workspaces</p>
                  <h2>Workspaces in this project</h2>
                </div>
                <button type="button" className="dash-btn-purple" onClick={handleNewWorkspace}>
                  + New workspace
                </button>
              </div>

              {projectWorkspaces.length === 0 ? (
                <div className="project-hub-empty">
                  <h3>This project is empty</h3>
                  <p>
                    Create a new workspace or add existing workspaces to start organizing your work.
                  </p>
                  <div className="project-hub-empty-actions">
                    <button type="button" className="dash-btn-purple" onClick={handleNewWorkspace}>
                      New workspace
                    </button>
                    <button type="button" onClick={() => openAddWorkspaces(project.id)}>
                      Add existing workspace
                    </button>
                  </div>
                </div>
              ) : (
                <div className="dash-ws-grid">
                  {projectWorkspaces.map((record) => (
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
            </section>

            <aside className="project-hub-sidebar">
              <section className="project-hub-section">
                <div className="project-hub-section-head">
                  <div>
                    <p>Project activity</p>
                    <h2>Recent activity</h2>
                  </div>
                </div>

                {activity.length === 0 ? (
                  <div className="project-hub-activity-empty">
                    <h3>No project activity yet</h3>
                    <p>Prompts, artifacts, and audio guides from workspaces in this project will appear here.</p>
                  </div>
                ) : (
                  <div className="project-hub-activity-list">
                    {activity.map((item) => (
                      <article key={item.id} className="project-hub-activity-item">
                        <span className={`project-hub-activity-icon activity-${item.eventType}`}>
                          {activityIcon(item.eventType)}
                        </span>
                        <div className="project-hub-activity-body">
                          <strong>{item.title}</strong>
                          <p>
                            {item.description} <span className="project-hub-activity-workspace">In {item.workspaceName}</span>
                          </p>
                          <div className="project-hub-activity-meta">
                            <span>{relativeTime(item.timestamp)}</span>
                            <Link href={item.href}>{item.hrefLabel}</Link>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </aside>
          </div>
        </div>
      ) : null}

      {editOpen && project ? (
        <ProjectEditModal
          project={project}
          onClose={() => setEditOpen(false)}
          onSave={handleSaveProject}
        />
      ) : null}

      {deleteOpen && project ? (
        <ProjectDeleteModal
          project={project}
          onClose={() => setDeleteOpen(false)}
          onDelete={handleDeleteProject}
        />
      ) : null}
    </DashboardShell>
  );
}

function ProjectHeader({
  project,
  projectColor,
  workspaceCount,
  activityCount,
  onNewWorkspace,
  onAddExisting,
  onEdit,
  onTogglePin,
  onDelete
}: {
  project: WorkspaceProject;
  projectColor: string;
  workspaceCount: number;
  activityCount: number;
  onNewWorkspace: () => void;
  onAddExisting: () => void;
  onEdit?: () => void;
  onTogglePin?: () => void;
  onDelete?: () => void;
}) {
  const canEdit = Boolean(onEdit);
  const moreRef = useRef<HTMLDivElement | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    if (!moreOpen) return undefined;
    const onDoc = (event: MouseEvent) => {
      if (!moreRef.current?.contains(event.target as Node)) setMoreOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [moreOpen]);

  return (
    <header
      className={`project-hub-hero${project.projectType === "default" ? " default-project" : ""}`}
      style={{ "--project-color": projectColor } as CSSProperties}
    >
      <div className="project-hub-hero-head">
        <div className="project-hub-hero-copy">
          <p className="project-hub-label">PROJECT</p>
          <h1>{project.name}</h1>
          {project.description ? (
            <p className="project-hub-desc">{project.description}</p>
          ) : (
            <p className="project-hub-desc">A workspace hub for planning, tracking, and shipping connected work.</p>
          )}

          <div className="project-hub-meta">
            <span className="project-hub-chip project-hub-chip-filled">
              {project.projectType === "default" ? "Default project" : project.pinned === false ? "Unpinned" : "Pinned"}
            </span>
            <span className="project-hub-chip">Project color</span>
            <span className="project-hub-chip">{project.color ?? "blue"}</span>
            <span className="project-hub-chip">{workspaceCount} workspace{workspaceCount === 1 ? "" : "s"}</span>
            <span className="project-hub-chip">{activityCount} recent activity item{activityCount === 1 ? "" : "s"}</span>
            <span className="project-hub-chip">Created {relativeTime(project.createdAt)}</span>
            <span className="project-hub-chip">Updated {relativeTime(project.updatedAt)}</span>
          </div>
        </div>

        <div className="project-hub-actions">
          <button type="button" className="dash-btn-purple" onClick={onNewWorkspace}>
            New workspace
          </button>
          <button type="button" onClick={onAddExisting}>
            Add existing workspace
          </button>
          {canEdit ? (
            <button type="button" onClick={onEdit}>
              Rename
            </button>
          ) : null}
          {onTogglePin ? (
            <button type="button" onClick={onTogglePin}>
              {project.pinned === false ? "Pin project" : "Unpin project"}
            </button>
          ) : null}
          {onDelete ? (
            <div className="project-hub-more" ref={moreRef}>
              <button
                type="button"
                className="project-hub-more-button"
                aria-label="More project actions"
                aria-expanded={moreOpen}
                onClick={() => setMoreOpen((open) => !open)}
              >
                More
              </button>
              {moreOpen ? (
                <div className="project-hub-more-menu" role="menu">
                  <button type="button" role="menuitem" disabled title="Coming soon" onClick={() => setMoreOpen(false)}>
                    Archive project
                  </button>
                  {onDelete ? (
                    <button
                      type="button"
                      role="menuitem"
                      className="danger"
                      onClick={() => {
                        setMoreOpen(false);
                        onDelete();
                      }}
                    >
                      Delete project
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}

function ProjectStat({ label, value }: { label: string; value: string | number }) {
  return (
    <article className="project-hub-stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function ProjectEditModal({
  project,
  onClose,
  onSave
}: {
  project: WorkspaceProject;
  onClose: () => void;
  onSave: (project: WorkspaceProject) => void;
}) {
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? "");
  const [color, setColor] = useState<WorkspaceProject["color"]>(project.color ?? "blue");

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const handleSave = () => {
    const nextName = name.trim();
    if (!nextName) return;
    onSave({
      ...project,
      name: nextName,
      description: description.trim() || undefined,
      color
    });
    onClose();
  };

  return (
    <div className="dash-modal-overlay" role="dialog" aria-modal="true" aria-label="Edit project">
      <button type="button" className="dash-modal-scrim" aria-label="Close" onClick={onClose} />
      <div className="dash-modal">
        <div className="dash-modal-head">
          <div>
            <h2>Edit project</h2>
            <p>Adjust the project name, description, and color identity.</p>
          </div>
          <button type="button" className="dash-modal-close" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="dash-modal-body">
          <label className="dash-field">
            <span>Project name</span>
            <input type="text" value={name} onChange={(event) => setName(event.target.value)} />
          </label>

          <label className="dash-field">
            <span>Description</span>
            <textarea
              rows={3}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>

          <div className="dash-field">
            <span>Project color</span>
            <div className="dash-color-grid" role="radiogroup" aria-label="Project color">
              {PROJECT_COLOR_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={color === option.value}
                  className={`dash-color-card${color === option.value ? " active" : ""}`}
                  onClick={() => setColor(option.value)}
                >
                  <span className="dash-color-swatch" style={{ background: option.hex }} aria-hidden="true">
                    {color === option.value ? "✓" : ""}
                  </span>
                  <span className="dash-color-label">{option.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="dash-modal-actions">
          <button type="button" className="dash-btn-light" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="dash-btn-purple" onClick={handleSave}>
            Save project
          </button>
        </div>
      </div>
    </div>
  );
}

function ProjectDeleteModal({
  project,
  onClose,
  onDelete
}: {
  project: WorkspaceProject;
  onClose: () => void;
  onDelete: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div className="dash-modal-overlay" role="dialog" aria-modal="true" aria-label="Delete project">
      <button type="button" className="dash-modal-scrim" aria-label="Close" onClick={onClose} />
      <div className="dash-modal dash-modal-danger">
        <h2>Delete project</h2>
        <p>
          Deleting this project will not delete its workspaces. Workspaces will be moved back to My Workspaces.
        </p>
        <p>
          <strong>{project.name}</strong> will be removed from your projects list.
        </p>
        <div className="dash-modal-actions">
          <button type="button" className="dash-btn-light" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="dash-btn-danger" onClick={onDelete}>
            Delete project
          </button>
        </div>
      </div>
    </div>
  );
}

function buildProjectActivity(
  project: WorkspaceProject | null,
  profileId: string | undefined,
  projectWorkspaces: Array<{ workspaceId: string; name: string }>
): ProjectActivityItem[] {
  if (!project) return [];
  const source = profileId ? getProfileJourneyRecords(profileId) : getTemporaryJourneyRecords();
  const workspaceIds = new Set(projectWorkspaces.map((record) => record.workspaceId));

  return source
    .flatMap((record) => {
      const meta = record.workspaceMeta ?? record.result.workspaceMeta;
      const workspaceId = meta?.workspaceId ?? record.id;
      if (!workspaceIds.has(workspaceId) && meta?.projectId !== project.id) return [];

      const workspaceName = meta?.workspaceName ?? record.title;
      const events = record.journey ?? record.result.workspaceJourney ?? [];

      return events.map((event) => {
        const link = resolveActivityLink(event, workspaceId);
        return {
          id: `${record.id}-${event.id}`,
          eventType: event.eventType,
          title: event.title,
          description: event.description,
          timestamp: event.timestamp,
          workspaceName,
          href: link.href,
          hrefLabel: link.label
        };
      });
    })
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, 8);
}

function resolveActivityLink(event: JourneyEvent, workspaceId: string): { href: string; label: string } {
  if (event.artifactId) {
    return {
      href: `/artifacts/${encodeURIComponent(event.artifactId)}`,
      label: "Open artifact"
    };
  }
  if (event.audioGuideId) {
    return {
      href: `/audio-guides/${encodeURIComponent(event.audioGuideId)}`,
      label: "Open audio guide"
    };
  }
  return {
    href: `/workspaces/${encodeURIComponent(workspaceId)}`,
    label: "Open workspace"
  };
}

function activityIcon(eventType: JourneyEvent["eventType"]): ReactNode {
  switch (eventType) {
    case "workspace_created":
      return <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>;
    case "workspace_added_to_project":
      return <svg viewBox="0 0 24 24"><path d="M7 12h10M12 7v10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>;
    case "workspace_removed_from_project":
      return <svg viewBox="0 0 24 24"><path d="M7 12h10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>;
    case "prompt_failed":
    case "follow_up_prompt_failed":
      return <svg viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>;
    case "artifact_created":
      return <svg viewBox="0 0 24 24"><path d="M7 4h7l4 4v12H7z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /><path d="M9 12h6M9 16h4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>;
    case "audio_guide_created":
    case "audio_guide_regenerated":
      return <svg viewBox="0 0 24 24"><path d="M9 9v6h2l3 3V6l-3 3H9Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /><path d="M17 9a4 4 0 0 1 0 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>;
    case "workspace_renamed":
      return <svg viewBox="0 0 24 24"><path d="M4 20h6l10-10a2 2 0 0 0-6-6L4 14v6Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg>;
    default:
      return <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" strokeWidth="2" /></svg>;
  }
}
