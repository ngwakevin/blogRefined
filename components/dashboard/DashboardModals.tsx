"use client";

import { useRouter } from "next/navigation";
import {
  useEffect,
  useState,
  type FormEvent,
  type ReactNode
} from "react";
import { useProfile } from "@/components/profile/useProfile";
import {
  MODE_META,
  PROJECT_COLOR_OPTIONS,
  PROJECT_TEMPLATES,
  getDashboardRecords,
  orderProjects,
  relativeTime,
  type DashboardRecord,
  type ProjectColorKey
} from "@/lib/dashboard-store";
import {
  createProject,
  ensureDefaultProjects,
  getProjects,
  moveWorkspacesToProject
} from "@/lib/journey-store";
import { MODES } from "@/lib/constants";
import type { RedefinedMode } from "@/lib/redefined";
import type { WorkspaceProject } from "@/lib/workspace-types";

export const DASHBOARD_CHANGED_EVENT = "dashboard:changed";
const OPEN_PROJECT_EVENT = "dashboard:open-project";
const OPEN_WORKSPACE_EVENT = "dashboard:open-workspace";
const OPEN_ADD_WORKSPACES_EVENT = "dashboard:open-add-workspaces";

function emitChange() {
  window.dispatchEvent(new Event(DASHBOARD_CHANGED_EVENT));
}

type CreateWorkspaceOptions = { destinationId?: string };

/** Module-level triggers — callable from any component on any dashboard route. */
export function openCreateProject() {
  window.dispatchEvent(new Event(OPEN_PROJECT_EVENT));
}

export function openCreateWorkspace(options?: CreateWorkspaceOptions) {
  window.dispatchEvent(
    new CustomEvent(OPEN_WORKSPACE_EVENT, { detail: options ?? {} })
  );
}

export function openAddWorkspaces(projectId: string) {
  window.dispatchEvent(new CustomEvent(OPEN_ADD_WORKSPACES_EVENT, { detail: { projectId } }));
}

/** Rendered once inside DashboardShell; hosts both creation modals. */
export function DashboardModalsHost() {
  const [projectOpen, setProjectOpen] = useState(false);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [workspaceDestination, setWorkspaceDestination] = useState<string | undefined>(undefined);
  const [addToProjectId, setAddToProjectId] = useState<string | null>(null);

  useEffect(() => {
    const onProject = () => setProjectOpen(true);
    const onWorkspace = (event: Event) => {
      const detail = (event as CustomEvent<CreateWorkspaceOptions>).detail ?? {};
      setWorkspaceDestination(detail.destinationId);
      setWorkspaceOpen(true);
    };
    const onAdd = (event: Event) => {
      const detail = (event as CustomEvent<{ projectId: string }>).detail;
      if (detail?.projectId) setAddToProjectId(detail.projectId);
    };
    window.addEventListener(OPEN_PROJECT_EVENT, onProject);
    window.addEventListener(OPEN_WORKSPACE_EVENT, onWorkspace);
    window.addEventListener(OPEN_ADD_WORKSPACES_EVENT, onAdd);
    return () => {
      window.removeEventListener(OPEN_PROJECT_EVENT, onProject);
      window.removeEventListener(OPEN_WORKSPACE_EVENT, onWorkspace);
      window.removeEventListener(OPEN_ADD_WORKSPACES_EVENT, onAdd);
    };
  }, []);

  return (
    <>
      {projectOpen ? <CreateProjectModal onClose={() => setProjectOpen(false)} /> : null}
      {workspaceOpen ? (
        <CreateWorkspaceModal
          initialDestinationId={workspaceDestination}
          onClose={() => setWorkspaceOpen(false)}
        />
      ) : null}
      {addToProjectId ? (
        <AddWorkspacesModal projectId={addToProjectId} onClose={() => setAddToProjectId(null)} />
      ) : null}
    </>
  );
}

/* ── shared shell ───────────────────────────────────────────────────────── */

function ModalShell({
  title,
  subtitle,
  onClose,
  children
}: {
  title: string;
  subtitle: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div className="dash-modal-overlay" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" className="dash-modal-scrim" aria-label="Close" onClick={onClose} />
      <div className="dash-modal">
        <div className="dash-modal-head">
          <div>
            <h2>{title}</h2>
            <p>{subtitle}</p>
          </div>
          <button type="button" className="dash-modal-close" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

const PATH_OPTIONS = [
  { id: "auto", label: "Auto" },
  ...MODES.map((mode) => ({ id: mode.id, label: mode.label }))
] as const;

const MODE_COLOR: Record<string, string> = {
  understand: "#b2a5ff",
  build: "#38b6ff",
  fix: "#f5b800",
  artifact: "#00bf63"
};

const MODE_FILTERS: Array<{ id: "all" | RedefinedMode; label: string }> = [
  { id: "all", label: "All" },
  { id: "understand", label: "Understand" },
  { id: "build", label: "Build" },
  { id: "fix", label: "Fix" },
  { id: "artifact", label: "Artifact" }
];

/* ── shared workspace picker ────────────────────────────────────────────── */

function WorkspacePicker({
  records,
  selectedIds,
  excludeProjectId,
  projectNames,
  onToggle
}: {
  records: DashboardRecord[];
  selectedIds: Set<string>;
  excludeProjectId?: string;
  projectNames: Record<string, string>;
  onToggle: (workspaceId: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [modeFilter, setModeFilter] = useState<"all" | RedefinedMode>("all");

  const query = search.trim().toLowerCase();
  const filtered = records.filter((record) => {
    if (excludeProjectId && record.projectId === excludeProjectId) return false;
    if (modeFilter !== "all" && record.mode !== modeFilter) return false;
    if (
      query &&
      !record.name.toLowerCase().includes(query) &&
      !record.subtitle.toLowerCase().includes(query)
    ) {
      return false;
    }
    return true;
  });

  return (
    <div className="dash-picker">
      <input
        type="search"
        className="dash-picker-search"
        placeholder="Search workspaces..."
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      <div className="dash-picker-filters" role="group" aria-label="Filter by mode">
        {MODE_FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={modeFilter === item.id ? "active" : ""}
            aria-pressed={modeFilter === item.id}
            onClick={() => setModeFilter(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="dash-picker-list">
        {filtered.length === 0 ? (
          <p className="dash-picker-empty">No workspaces match.</p>
        ) : (
          filtered.map((record) => {
            const meta = MODE_META[record.mode];
            const currentProject =
              record.projectId && projectNames[record.projectId]
                ? projectNames[record.projectId]
                : null;
            return (
              <label
                key={record.workspaceId}
                className={`dash-picker-row${selectedIds.has(record.workspaceId) ? " selected" : ""}`}
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(record.workspaceId)}
                  onChange={() => onToggle(record.workspaceId)}
                />
                <span className="dash-picker-badge" style={{ background: meta.color }}>
                  {meta.label}
                </span>
                <span className="dash-picker-text">
                  <strong>{record.name}</strong>
                  <em>{record.subtitle}</em>
                  <small>
                    Updated {relativeTime(record.updatedAt)}
                    {record.audioCount > 0 ? ` · ${record.audioCount} audio` : ""}
                    {record.artifactCount > 0
                      ? ` · ${record.artifactCount} artifact${record.artifactCount === 1 ? "" : "s"}`
                      : ""}
                    {currentProject ? ` · in ${currentProject}` : ""}
                  </small>
                </span>
              </label>
            );
          })
        )}
      </div>
    </div>
  );
}

/* ── create project ─────────────────────────────────────────────────────── */

type ProjectStartMode = "empty" | "existing" | "first";

function CreateProjectModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { profile } = useProfile();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState<ProjectColorKey>("blue");
  const [pinned, setPinned] = useState(true);
  const [activeTemplate, setActiveTemplate] = useState("blank");
  const [startMode, setStartMode] = useState<ProjectStartMode>("empty");
  const [records, setRecords] = useState<DashboardRecord[]>([]);
  const [projectNames, setProjectNames] = useState<Record<string, string>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [firstPrompt, setFirstPrompt] = useState("");
  const [firstPath, setFirstPath] = useState<string>("auto");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!profile) return undefined;
    const timer = window.setTimeout(() => {
      setRecords(getDashboardRecords(profile.id));
      setProjectNames(
        Object.fromEntries(getProjects(profile.id).map((project) => [project.id, project.name]))
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, [profile]);

  const toggleSelected = (workspaceId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(workspaceId)) next.delete(workspaceId);
      else next.add(workspaceId);
      return next;
    });
  };

  if (!profile) {
    return (
      <ModalShell
        title="Create project"
        subtitle="Group related workspaces together."
        onClose={onClose}
      >
        <p className="dash-modal-guest">
          Create a profile to organize workspaces into projects.
        </p>
        <div className="dash-modal-actions">
          <button type="button" className="dash-btn-light" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="dash-btn-purple"
            onClick={() => router.push("/signup")}
          >
            Create profile
          </button>
        </div>
      </ModalShell>
    );
  }

  const applyTemplate = (templateId: string) => {
    setActiveTemplate(templateId);
    const template = PROJECT_TEMPLATES.find((item) => item.id === templateId);
    if (!template) return;
    if (template.id !== "blank") {
      setName(template.name);
      setDescription(template.description);
      setColor(template.color);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim()) {
      setError("Enter a project name.");
      return;
    }
    if (startMode === "first" && !firstPrompt.trim()) {
      setError("Enter a prompt for the first workspace.");
      return;
    }

    const project = createProject({
      name,
      description,
      color,
      pinned,
      profileId: profile.id
    });

    if (startMode === "existing" && selectedIds.size > 0) {
      moveWorkspacesToProject([...selectedIds], project.id, profile.id);
    }

    emitChange();
    onClose();

    if (startMode === "first") {
      // The only path that calls AI: create project, then generate the first workspace into it.
      const params = new URLSearchParams();
      params.set("prompt", firstPrompt.trim());
      if (firstPath !== "auto") params.set("mode", firstPath);
      params.set("projectId", project.id);
      router.push(`/new?${params.toString()}`);
      return;
    }

    router.push(`/projects/${encodeURIComponent(project.id)}`);
  };

  const movingCount = [...selectedIds].filter((id) => {
    const record = records.find((item) => item.workspaceId === id);
    return record?.projectId && projectNames[record.projectId];
  }).length;

  return (
    <ModalShell
      title="Create project"
      subtitle="Group related workspaces together."
      onClose={onClose}
    >
      <form className="dash-modal-body" onSubmit={handleSubmit}>
        <div className="dash-template-chips" role="group" aria-label="Project templates">
          {PROJECT_TEMPLATES.map((template) => (
            <button
              key={template.id}
              type="button"
              className={activeTemplate === template.id ? "active" : ""}
              onClick={() => applyTemplate(template.id)}
            >
              {template.label}
            </button>
          ))}
        </div>

        <label className="dash-field">
          <span>Project name</span>
          <input
            type="text"
            value={name}
            placeholder="Example: Azure Investigations"
            autoFocus
            onChange={(event) => {
              setName(event.target.value);
              if (error) setError("");
            }}
          />
        </label>

        <label className="dash-field">
          <span>Description</span>
          <textarea
            value={description}
            placeholder="Example: Workspaces for Azure networking, DNS, and private endpoint issues."
            rows={2}
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

        <label className="dash-toggle">
          <input
            type="checkbox"
            checked={pinned}
            onChange={(event) => setPinned(event.target.checked)}
          />
          <span className="dash-toggle-track" aria-hidden="true">
            <span className="dash-toggle-knob" />
          </span>
          <span>Pin to sidebar</span>
        </label>

        <div className="dash-field">
          <span>How should this project start?</span>
          <div className="dash-start-modes" role="radiogroup" aria-label="Project start">
            {(
              [
                { id: "empty", title: "Start empty", desc: "Create the project now and add workspaces later." },
                { id: "existing", title: "Add existing workspaces", desc: "Move existing workspaces into this project." },
                { id: "first", title: "Create first workspace", desc: "Start this project with a new prompt." }
              ] as Array<{ id: ProjectStartMode; title: string; desc: string }>
            ).map((option) => (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={startMode === option.id}
                className={`dash-start-card${startMode === option.id ? " active" : ""}`}
                onClick={() => {
                  setStartMode(option.id);
                  if (error) setError("");
                }}
              >
                <span className="dash-start-radio" aria-hidden="true" />
                <span className="dash-start-text">
                  <strong>{option.title}</strong>
                  <em>{option.desc}</em>
                </span>
              </button>
            ))}
          </div>
        </div>

        {startMode === "existing" ? (
          <div className="dash-field">
            <span>
              Select workspaces
              {selectedIds.size > 0 ? ` (${selectedIds.size} selected)` : ""}
            </span>
            <WorkspacePicker
              records={records}
              selectedIds={selectedIds}
              projectNames={projectNames}
              onToggle={toggleSelected}
            />
            {movingCount > 0 ? (
              <p className="dash-move-note">
                {movingCount} workspace{movingCount === 1 ? "" : "s"} will move from{" "}
                {movingCount === 1 ? "its current project" : "their current projects"} into{" "}
                {name.trim() || "this project"}.
              </p>
            ) : null}
          </div>
        ) : null}

        {startMode === "first" ? (
          <>
            <label className="dash-field">
              <span>First workspace prompt</span>
              <textarea
                value={firstPrompt}
                placeholder="Example: I cannot access Azure Storage account"
                rows={2}
                onChange={(event) => {
                  setFirstPrompt(event.target.value);
                  if (error) setError("");
                }}
              />
            </label>
            <div className="dash-field">
              <span>Path</span>
              <div className="dash-path-row" role="radiogroup" aria-label="Path">
                {PATH_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    role="radio"
                    aria-checked={firstPath === option.id}
                    className={`dash-path-chip${firstPath === option.id ? " active" : ""}`}
                    style={
                      option.id !== "auto"
                        ? ({ "--chip-color": MODE_COLOR[option.id] } as React.CSSProperties)
                        : undefined
                    }
                    onClick={() => setFirstPath(option.id)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </>
        ) : null}

        {error ? <p className="dash-modal-error">{error}</p> : null}

        <div className="dash-modal-actions">
          <button type="button" className="dash-btn-light" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="dash-btn-purple">
            {startMode === "first"
              ? "Create project & workspace"
              : startMode === "existing" && selectedIds.size > 0
                ? `Create project with ${selectedIds.size} workspace${selectedIds.size === 1 ? "" : "s"}`
                : "Create project"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

/* ── add existing workspaces to a project ───────────────────────────────── */

function AddWorkspacesModal({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const { profile } = useProfile();
  const [records, setRecords] = useState<DashboardRecord[]>([]);
  const [projectNames, setProjectNames] = useState<Record<string, string>>({});
  const [projectName, setProjectName] = useState("this project");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setRecords(getDashboardRecords(profile?.id));
      const projects = getProjects(profile?.id);
      setProjectNames(Object.fromEntries(projects.map((project) => [project.id, project.name])));
      setProjectName(projects.find((project) => project.id === projectId)?.name ?? "this project");
    }, 0);
    return () => window.clearTimeout(timer);
  }, [profile, projectId]);

  const toggleSelected = (workspaceId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(workspaceId)) next.delete(workspaceId);
      else next.add(workspaceId);
      return next;
    });
  };

  const movingCount = [...selectedIds].filter((id) => {
    const record = records.find((item) => item.workspaceId === id);
    return record?.projectId && record.projectId !== projectId && projectNames[record.projectId];
  }).length;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (selectedIds.size === 0) {
      onClose();
      return;
    }
    moveWorkspacesToProject([...selectedIds], projectId, profile?.id);
    emitChange();
    onClose();
  };

  return (
    <ModalShell
      title="Add workspaces"
      subtitle={`Move existing workspaces into ${projectName}.`}
      onClose={onClose}
    >
      <form className="dash-modal-body" onSubmit={handleSubmit}>
        <WorkspacePicker
          records={records}
          selectedIds={selectedIds}
          excludeProjectId={projectId}
          projectNames={projectNames}
          onToggle={toggleSelected}
        />
        {movingCount > 0 ? (
          <p className="dash-move-note">
            {movingCount} workspace{movingCount === 1 ? "" : "s"} will move from{" "}
            {movingCount === 1 ? "its current project" : "their current projects"} into {projectName}.
          </p>
        ) : null}
        <div className="dash-modal-actions">
          <button type="button" className="dash-btn-light" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="dash-btn-purple" disabled={selectedIds.size === 0}>
            Add {selectedIds.size > 0 ? selectedIds.size : ""} workspace
            {selectedIds.size === 1 ? "" : "s"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

/* ── create workspace ───────────────────────────────────────────────────── */

function CreateWorkspaceModal({
  initialDestinationId,
  onClose
}: {
  initialDestinationId?: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const { profile } = useProfile();
  const [projects, setProjects] = useState<WorkspaceProject[]>([]);
  const [destinationId, setDestinationId] = useState<string | undefined>(initialDestinationId);
  const [prompt, setPrompt] = useState("");
  const [path, setPath] = useState<string>("auto");
  const [error, setError] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const ensured = profile ? ensureDefaultProjects(profile.id) : { myWorkspaces: null };
      const ordered = orderProjects(getProjects(profile?.id));
      setProjects(ordered);
      setDestinationId((current) => current ?? ensured.myWorkspaces?.id ?? ordered[0]?.id);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [profile]);

  const destinationName =
    projects.find((project) => project.id === destinationId)?.name ?? "My Workspaces";
  const previewColor = path === "auto" ? "#111827" : MODE_COLOR[path] ?? "#111827";

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!prompt.trim()) {
      setError("Enter a prompt to create a workspace.");
      return;
    }

    const params = new URLSearchParams();
    params.set("prompt", prompt.trim());
    if (path !== "auto") params.set("mode", path);
    if (destinationId) params.set("projectId", destinationId);
    onClose();
    router.push(`/new?${params.toString()}`);
  };

  return (
    <ModalShell
      title="Create workspace"
      subtitle="Start from a prompt. Doc/ReDefined will route it into the right path."
      onClose={onClose}
    >
      <form className="dash-modal-body" onSubmit={handleSubmit}>
        <label className="dash-field">
          <span>Destination</span>
          <select
            className="dash-select"
            value={destinationId ?? ""}
            onChange={(event) => setDestinationId(event.target.value || undefined)}
          >
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
                {project.projectType === "default" ? " (default)" : ""}
              </option>
            ))}
          </select>
        </label>

        <label className="dash-field">
          <span>Prompt</span>
          <textarea
            value={prompt}
            placeholder="What do you want to redefine?"
            rows={3}
            autoFocus
            onChange={(event) => {
              setPrompt(event.target.value);
              if (error) setError("");
            }}
          />
        </label>

        <div className="dash-field">
          <span>Path</span>
          <div className="dash-path-row" role="radiogroup" aria-label="Path">
            {PATH_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={path === option.id}
                className={`dash-path-chip${path === option.id ? " active" : ""}`}
                style={
                  option.id !== "auto"
                    ? ({ "--chip-color": MODE_COLOR[option.id] } as React.CSSProperties)
                    : undefined
                }
                onClick={() => setPath(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="dash-preview-row">
          <span className="dash-preview-dot" style={{ background: previewColor }} aria-hidden="true" />
          {path === "auto"
            ? "Color is decided after the path is detected."
            : `${PATH_OPTIONS.find((option) => option.id === path)?.label} workspace`}
        </div>

        {error ? <p className="dash-modal-error">{error}</p> : null}

        <div className="dash-modal-actions">
          <button type="button" className="dash-btn-light" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="dash-btn-purple">
            Create workspace in {destinationName}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
