"use client";

import Link from "next/link";
import { Suspense } from "react";
import { DashboardCommandCenter } from "@/components/dashboard/DashboardCommandCenter";
import { openCreateProject, openCreateWorkspace } from "@/components/dashboard/DashboardModals";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { ProjectCard } from "@/components/dashboard/ProjectCard";
import { WorkspaceCard } from "@/components/dashboard/WorkspaceCard";
import { useWorkspaceActions } from "@/components/dashboard/useWorkspaceActions";
import {
  MODE_META,
  pinnedProjects,
  projectModeBreakdown,
  projectWorkspaceCount,
  relativeTime
} from "@/lib/dashboard-store";

const ACTIVITY_COLORS: Record<string, string> = {
  audio_guide_created: "#b2a5ff",
  audio_guide_regenerated: "#b2a5ff",
  artifact_created: "#00bf63",
  workspace_added_to_project: "#38b6ff",
  workspace_removed_from_project: "#38b6ff",
  branch_created: "#f5b800",
  branch_updated: "#f5b800",
  branch_confirmed: "#00bf63",
  workspace_renamed: "#38b6ff",
  workspace_migrated: "#b2a5ff",
  workspace_created: "#38b6ff"
};

export default function DashboardHome() {
  const {
    profile,
    hydrated,
    records,
    projects,
    activity,
    starredIds,
    handleToggleStar,
    handleRename,
    handleDuplicate,
    handleDelete,
    handleMove
  } = useWorkspaceActions();

  const latest = records[0] ?? null;
  const latestMeta = latest ? MODE_META[latest.mode] : null;
  const recent = records.slice(0, 8);
  const pinned = pinnedProjects(projects).slice(0, 3);

  return (
    <DashboardShell active="home">
      <header className="dash-welcome">
        <p className="dash-welcome-kicker">Welcome back, {profile?.name ?? "there"}</p>
        <h1>Ask Doc/ReDefined</h1>
      </header>

      <Suspense fallback={null}>
        <DashboardCommandCenter statusText="Saved automatically" />
      </Suspense>

      {/* continue where you left off */}
      {hydrated ? (
        latest && latestMeta ? (
          <section className="dash-section" aria-label="Continue where you left off">
            <div className="dash-section-head">
              <h2>Continue where you left off</h2>
            </div>
            <div
              className="dash-continue"
              data-fg={latestMeta.fg}
              style={{ "--ws-color": latestMeta.color } as React.CSSProperties}
            >
              <button
                type="button"
                className={`dash-ws-star dash-continue-star${starredIds.includes(latest.workspaceId) ? " on" : ""}`}
                aria-label={starredIds.includes(latest.workspaceId) ? "Unstar workspace" : "Star workspace"}
                onClick={() => handleToggleStar(latest.workspaceId)}
              >
                {starredIds.includes(latest.workspaceId) ? "★" : "☆"}
              </button>
              <div className="dash-continue-info">
                <span className="dash-ws-badge">{latestMeta.label}</span>
                <h3>{latest.name}</h3>
                <p>{latest.subtitle}</p>
                <span className="dash-ws-meta">
                  {[
                    `Updated ${relativeTime(latest.updatedAt)}`,
                    latest.audioCount > 0
                      ? `${latest.audioCount} audio guide${latest.audioCount === 1 ? "" : "s"}${latest.audioReady ? " ready" : ""}`
                      : "No audio guide yet",
                    `${latest.artifactCount} artifact${latest.artifactCount === 1 ? "" : "s"}`,
                    latest.branchCount > 1 ? `${latest.branchCount} branches` : null
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </div>
              <div className="dash-continue-actions">
                <Link className="dash-btn-dark" href={latest.href}>
                  Open workspace
                </Link>
                <button type="button" className="dash-btn-light" onClick={() => openCreateWorkspace()}>
                  New workspace
                </button>
              </div>
            </div>
          </section>
        ) : (
          <section className="dash-section" aria-label="Create your first workspace">
            <div className="dash-empty">
              <h2>Create your first workspace</h2>
              <p>
                Ask anything — Doc/ReDefined turns it into a structured workspace. Pick a starter
                prompt above or type your own.
              </p>
            </div>
          </section>
        )
      ) : null}

      {/* recent workspaces */}
      {recent.length > 0 ? (
        <section className="dash-section" aria-label="Recent workspaces">
          <div className="dash-section-head">
            <h2>Recent workspaces</h2>
            <Link href="/workspaces">View all</Link>
          </div>
          <div className="dash-ws-grid">
            {recent.map((record) => (
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
        </section>
      ) : null}

      {/* quick actions + activity */}
      <div className="dash-two-col">
        <section className="dash-quick" aria-label="Quick actions">
          <h2>Quick Actions</h2>
          <div className="dash-quick-grid">
            <button type="button" onClick={() => openCreateWorkspace()}>
              <span aria-hidden="true">
                <svg viewBox="0 0 20 20"><path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
              </span>
              New workspace
            </button>
            <button type="button" onClick={openCreateProject}>
              <span aria-hidden="true">
                <svg viewBox="0 0 20 20"><path d="M3 5.5A1.5 1.5 0 0 1 4.5 4h3.6l1.6 2h5.8A1.5 1.5 0 0 1 17 7.5v7A1.5 1.5 0 0 1 15.5 16h-11A1.5 1.5 0 0 1 3 14.5Z" /></svg>
              </span>
              New project
            </button>
            <button
              type="button"
              onClick={() => openCreateWorkspace({ prompt: "Create an artifact for " })}
            >
              <span aria-hidden="true">
                <svg viewBox="0 0 20 20"><path d="M5 3h7l3 3v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" /></svg>
              </span>
              Create artifact
            </button>
            <Link href="/audio-guides">
              <span aria-hidden="true">
                <svg viewBox="0 0 20 20"><rect x="8" y="3" width="4" height="9" rx="2" /><path d="M5 9.5a5 5 0 0 0 10 0M10 14.5V17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
              </span>
              Open audio guides
            </Link>
          </div>
          <Link className="dash-quick-foot" href="/templates">
            Explore templates &rarr;
          </Link>
        </section>

        <section className="dash-activity" aria-label="Activity">
          <h2>Activity</h2>
          {activity.length === 0 ? (
            <p className="dash-activity-empty">
              No activity yet. Create a workspace to get things moving.
            </p>
          ) : (
            <ul>
              {activity.slice(0, 5).map((item) => (
                <li key={item.id}>
                  <span
                    className="dash-activity-dot"
                    style={{ background: ACTIVITY_COLORS[item.eventType] ?? "#b2a5ff" }}
                    aria-hidden="true"
                  />
                  <Link href={item.href} className="dash-activity-line">
                    <strong>{item.title}</strong>
                    <em>
                      {item.workspaceName} · {relativeTime(item.timestamp)}
                    </em>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Link className="dash-activity-foot" href="/workspaces">
            View all activity &rarr;
          </Link>
        </section>
      </div>

      {/* pinned projects */}
      <section className="dash-section" aria-label="Pinned projects">
        <div className="dash-section-head">
          <h2>
            <span aria-hidden="true">&#128204;</span> Pinned Projects
          </h2>
          <Link href="/projects">Manage projects</Link>
        </div>
        <div className="proj-color-grid">
          {pinned.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              count={projectWorkspaceCount(project, records)}
              modeMix={projectModeBreakdown(project, records)}
            />
          ))}
          <button type="button" className="proj-color-new" onClick={openCreateProject}>
            <span className="proj-color-plus" aria-hidden="true">+</span>
            <span>
              <strong>New project</strong>
              <em>Create a new project</em>
            </span>
          </button>
        </div>
      </section>
    </DashboardShell>
  );
}
