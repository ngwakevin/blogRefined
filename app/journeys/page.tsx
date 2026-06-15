"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useProfile } from "@/components/profile/useProfile";
import {
  addWorkspaceToProject,
  createProject,
  deleteProject,
  getProfileJourneyRecords,
  getProjects,
  getTemporaryJourneyRecords,
  removeWorkspaceFromProject,
  type ProfileJourneyRecord,
  type TemporaryJourneyRecord
} from "@/lib/journey-store";
import { getLocalProfile } from "@/lib/profile-store";
import { getModeLabel } from "@/lib/redefined";
import type { WorkspaceProject } from "@/lib/workspace-types";
import type { UserProfile } from "@/types/profile";

type JourneyCardRecord = TemporaryJourneyRecord | ProfileJourneyRecord;

function formatUpdatedTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently updated";

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function JourneyCard({
  record,
  href,
  showSaveToProfile,
  projects,
  profileId,
  onChanged
}: {
  record: JourneyCardRecord;
  href: string;
  showSaveToProfile: boolean;
  projects: WorkspaceProject[];
  profileId?: string;
  onChanged: () => void;
}) {
  const workspaceId = record.workspaceMeta?.workspaceId;
  const currentProjectId = record.workspaceMeta?.projectId;
  return (
    <article className="journey-card">
      <div>
        <p className="journey-card-mode">{getModeLabel(record.mode)}</p>
        <h2>{record.workspaceMeta?.workspaceName ?? record.title}</h2>
        <p>{record.workspaceMeta?.workspaceSubtitle ?? record.originalPrompt}</p>
      </div>

      <div className="journey-card-meta">
        <span>Updated {formatUpdatedTime(record.updatedAt)}</span>
      </div>

      <div className="journey-card-actions">
        <Link href={href}>Open workspace</Link>
        {workspaceId && projects.length > 0 ? (
          <select
            aria-label="Move to project"
            value={currentProjectId ?? ""}
            onChange={(event) => {
              const nextProjectId = event.target.value;
              if (currentProjectId) {
                removeWorkspaceFromProject(workspaceId, currentProjectId, profileId);
              }
              if (nextProjectId) {
                addWorkspaceToProject(workspaceId, nextProjectId, profileId);
              }
              onChanged();
            }}
          >
            <option value="">Ungrouped</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        ) : null}
        {showSaveToProfile ? <Link href="/signup?next=save">Save to profile</Link> : null}
      </div>
    </article>
  );
}

export default function JourneysPage() {
  const { clearProfile } = useProfile();
  const [profile, setProfile] = useState<UserProfile | null>(() => getLocalProfile());
  const [refreshKey, setRefreshKey] = useState(0);
  const temporaryRecords = useMemo<TemporaryJourneyRecord[]>(() => {
    void refreshKey;
    return getTemporaryJourneyRecords().slice().reverse();
  }, [refreshKey]);
  const profileRecords = useMemo<ProfileJourneyRecord[]>(() => {
    void refreshKey;
    const localProfile = getLocalProfile();
    return localProfile ? getProfileJourneyRecords(localProfile.id).slice().reverse() : [];
  }, [refreshKey]);
  const projects = useMemo(
    () => {
      void refreshKey;
      return getProjects(profile?.id).slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },
    [profile?.id, refreshKey]
  );
  const [newProjectName, setNewProjectName] = useState("");

  const primaryRecords = profile ? profileRecords : temporaryRecords;
  const countLabel = useMemo(() => {
    const label = profile ? "saved journey" : "temporary journey";
    if (primaryRecords.length === 1) return `1 ${label}`;
    return `${primaryRecords.length} ${label}s`;
  }, [primaryRecords.length, profile]);

  function handleClearProfile() {
    clearProfile();
    setProfile(null);
  }
  function refreshLibrary() {
    setRefreshKey((current) => current + 1);
  }

  function handleCreateProject() {
    const name = newProjectName.trim();
    if (!name) return;
    createProject({ name, profileId: profile?.id });
    setNewProjectName("");
    refreshLibrary();
  }

  const recordsByWorkspaceId = new Map(
    primaryRecords
      .map((record) => [record.workspaceMeta?.workspaceId, record] as const)
      .filter((entry): entry is [string, JourneyCardRecord] => Boolean(entry[0]))
  );
  const projectWorkspaceIds = new Set(projects.flatMap((project) => project.workspaceIds));
  const ungroupedRecords = primaryRecords.filter((record) => {
    const workspaceId = record.workspaceMeta?.workspaceId;
    return !workspaceId || !projectWorkspaceIds.has(workspaceId);
  });

  return (
    <main className="journey-history-page">
      <section className="journey-history-hero">
        <div>
          <p className="block-label">Doc/ReDefined journeys</p>
          <h1>{profile ? "Journey History" : "Temporary Journey History"}</h1>
          <p>
            {profile
              ? `Signed in locally as ${profile.name} (${profile.email}). Your saved MVP profile journeys are available on this device.`
              : "Review the workspaces stored temporarily on this device. Create a profile to keep these records."}
          </p>
        </div>

        {profile ? (
          <button className="journey-primary-link" type="button" onClick={handleClearProfile}>
            Clear local profile
          </button>
        ) : (
          <Link href="/signup?next=journeys" className="journey-primary-link">
            Create a profile to keep these records
          </Link>
        )}
      </section>

      <section className="journey-history-list" aria-label={countLabel}>
        <div className="journey-history-topline">
          <span>{countLabel}</span>
          <Link href="/">Create new workspace</Link>
        </div>

        <section className="project-library-section">
          <div className="journey-history-topline">
            <span>Projects</span>
            <div className="project-create-inline">
              <input
                value={newProjectName}
                placeholder="New project name"
                onChange={(event) => setNewProjectName(event.target.value)}
              />
              <button type="button" onClick={handleCreateProject}>
                Create project
              </button>
            </div>
          </div>

          {projects.length > 0 ? (
            <div className="journey-card-grid">
              {projects.map((project) => (
                <article className={`journey-card project-card project-${project.color ?? "blue"}`} key={project.id}>
                  <div>
                    <p className="journey-card-mode">Project</p>
                    <h2>{project.name}</h2>
                    <p>{project.description ?? `${project.workspaceIds.length} workspaces`}</p>
                  </div>
                  <div className="journey-card-meta">
                    <span>{project.workspaceIds.length} workspaces · Updated {formatUpdatedTime(project.updatedAt)}</span>
                  </div>
                  <div className="journey-card-actions">
                    <Link href={`/?projectId=${project.id}`}>New workspace in this project</Link>
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm("Delete this project? Workspaces inside it will not be deleted; they will become ungrouped.")) {
                          deleteProject(project.id, profile?.id);
                          refreshLibrary();
                        }
                      }}
                    >
                      Delete project
                    </button>
                  </div>
                  {project.workspaceIds.length > 0 ? (
                    <div className="project-workspace-list">
                      {project.workspaceIds.map((workspaceId) => {
                        const record = recordsByWorkspaceId.get(workspaceId);
                        if (!record) return null;
                        return (
                          <Link
                            key={workspaceId}
                            href={profile ? `/profile-journey/${record.id}` : `/temp-journey/${record.id}`}
                          >
                            {record.workspaceMeta?.workspaceName ?? record.title} — {record.workspaceMeta?.workspaceSubtitle ?? record.originalPrompt}
                          </Link>
                        );
                      })}
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          ) : (
            <section className="empty-journey-history">
              <h2>No projects yet.</h2>
              <p>Create a project to group related workspaces.</p>
            </section>
          )}
        </section>

        {ungroupedRecords.length > 0 ? (
          <section className="project-library-section">
            <div className="journey-history-topline">
              <span>Ungrouped workspaces</span>
            </div>
            <div className="journey-card-grid">
              {ungroupedRecords.map((record) => (
                <JourneyCard
                  key={record.id}
                  record={record}
                  href={profile ? `/profile-journey/${record.id}` : `/temp-journey/${record.id}`}
                  showSaveToProfile={!profile}
                  projects={projects}
                  profileId={profile?.id}
                  onChanged={refreshLibrary}
                />
              ))}
            </div>
          </section>
        ) : null}

        {primaryRecords.length > 0 ? (
          <>
          <div className="journey-history-topline">
            <span>All workspaces</span>
          </div>
          <div className="journey-card-grid">
            {primaryRecords.map((record) => (
              <JourneyCard
                key={record.id}
                record={record}
                href={profile ? `/profile-journey/${record.id}` : `/temp-journey/${record.id}`}
                showSaveToProfile={!profile}
                projects={projects}
                profileId={profile?.id}
                onChanged={refreshLibrary}
              />
            ))}
          </div>
          </>
        ) : (
          <section className="empty-journey-history">
            <h2>{profile ? "No saved journeys yet." : "No temporary journeys yet."}</h2>
            <p>Submit a prompt to create your first Doc/ReDefined workspace.</p>
            <Link href="/">Start with a prompt</Link>
          </section>
        )}
      </section>

      {profile && temporaryRecords.length > 0 ? (
        <section className="journey-history-list" aria-label="Remaining temporary journeys">
          <div className="journey-history-topline">
            <span>Temporary journeys still on this device</span>
          </div>
          <div className="journey-card-grid">
            {temporaryRecords.map((record) => (
              <JourneyCard
                key={record.id}
                record={record}
                href={`/temp-journey/${record.id}`}
                showSaveToProfile={false}
                projects={projects}
                profileId={profile?.id}
                onChanged={refreshLibrary}
              />
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
