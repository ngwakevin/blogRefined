"use client";

import { useRouter } from "next/navigation";
import {
  useEffect,
  useState,
  type FormEvent,
  type ReactNode
} from "react";
import { promptUpgrade } from "@/components/billing/UpgradeModal";
import { useProfile } from "@/components/profile/useProfile";
import { showToast } from "@/components/Toast";
import { canCreateProject, canCreateWorkspace, getAccount } from "@/lib/account-store";
import {
  MODE_META,
  PROJECT_COLOR_OPTIONS,
  PROJECT_TEMPLATES,
  SECTION_DEFAULTS,
  getDashboardRecords,
  orderProjects,
  relativeTime,
  type DashboardRecord,
  type ProjectColorKey,
  type SectionTemplate
} from "@/lib/dashboard-store";
import {
  createProject,
  createWorkspaceShell,
  ensureDefaultProjects,
  getProjects,
  moveWorkspacesToProject
} from "@/lib/journey-store";
import type { WorkspacePreferredMode } from "@/lib/workspace-types";
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

type CreateWorkspaceOptions = {
  destinationId?: string;
  prompt?: string;
  afterCreate?: {
    stayLabel: string;
    stayHref?: string;
  };
};

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
  const [workspacePrompt, setWorkspacePrompt] = useState<string | undefined>(undefined);
  const [workspaceAfterCreate, setWorkspaceAfterCreate] = useState<CreateWorkspaceOptions["afterCreate"]>();
  const [addToProjectId, setAddToProjectId] = useState<string | null>(null);

  useEffect(() => {
    const onProject = () => setProjectOpen(true);
    const onWorkspace = (event: Event) => {
      const detail = (event as CustomEvent<CreateWorkspaceOptions>).detail ?? {};
      setWorkspaceDestination(detail.destinationId);
      setWorkspacePrompt(detail.prompt);
      setWorkspaceAfterCreate(detail.afterCreate);
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
          initialPrompt={workspacePrompt}
          successAfterCreate={workspaceAfterCreate}
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

/* ── workspace sections editor ──────────────────────────────────────────── */

function SectionsEditor({
  sections,
  onChange,
  onReset
}: {
  sections: SectionTemplate[];
  onChange: (sections: SectionTemplate[]) => void;
  onReset: () => void;
}) {
  const addSection = () => {
    const title = window.prompt("Section name")?.trim();
    if (!title) return;
    onChange([...sections, { title, type: "custom" }]);
  };

  const renameSection = (index: number) => {
    const current = sections[index];
    const title = window.prompt("Rename section", current.title)?.trim();
    if (!title || title === current.title) return;
    onChange(sections.map((section, i) => (i === index ? { ...section, title } : section)));
  };

  const removeSection = (index: number) => {
    onChange(sections.filter((_, i) => i !== index));
  };

  return (
    <div className="dash-field">
      <div className="dash-sections-head">
        <span>Workspace sections</span>
        <button type="button" className="dash-sections-reset" onClick={onReset}>
          Reset to defaults
        </button>
      </div>
      <p className="dash-sections-sub">Organize this workspace before you run prompts.</p>
      <div className="dash-sections-chips">
        {sections.map((section, index) => (
          <span key={`${section.title}-${index}`} className="dash-section-chip">
            <button
              type="button"
              className="dash-section-chip-name"
              onClick={() => renameSection(index)}
              title="Click to rename"
            >
              {section.title}
            </button>
            {sections.length > 1 ? (
              <button
                type="button"
                className="dash-section-chip-remove"
                aria-label={`Remove ${section.title}`}
                onClick={() => removeSection(index)}
              >
                ✕
              </button>
            ) : null}
          </span>
        ))}
        <button type="button" className="dash-section-add" onClick={addSection}>
          + Add section
        </button>
      </div>
    </div>
  );
}

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
  const [firstWorkspaceName, setFirstWorkspaceName] = useState("");
  const [firstPath, setFirstPath] = useState<WorkspacePreferredMode>("auto");
  const [firstSections, setFirstSections] = useState<SectionTemplate[]>(SECTION_DEFAULTS.auto);
  const [firstSectionsEdited, setFirstSectionsEdited] = useState(false);
  const [created, setCreated] = useState<{ workspaceId: string; name: string; project: string } | null>(
    null
  );
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
    if (startMode === "first" && !firstWorkspaceName.trim()) {
      setError("Enter a workspace name.");
      return;
    }
    if (startMode === "first" && firstSections.some((section) => !section.title.trim())) {
      setError("Section names cannot be empty.");
      return;
    }

    const account = getAccount();
    const projectGate = canCreateProject(account, getProjects(profile.id).length);
    if (!projectGate.allowed) {
      onClose();
      promptUpgrade("Project limit reached", projectGate, account.currentPlanId);
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

    if (startMode === "first") {
      // No AI here — create the project + an empty workspace shell, then open its
      // terminal where the user runs the first prompt.
      const shell = createWorkspaceShell({
        workspaceName: firstWorkspaceName,
        preferredMode: firstPath,
        projectId: project.id,
        createdFrom: "create_project",
        sections: firstSections,
        profileId: profile.id
      });
      emitChange();
      setCreated({ workspaceId: shell.workspaceId, name: shell.workspaceName, project: project.name });
      return;
    }

    emitChange();
    onClose();
    router.push(`/projects/${encodeURIComponent(project.id)}`);
  };

  const selectFirstPath = (next: WorkspacePreferredMode) => {
    setFirstPath(next);
    if (!firstSectionsEdited) setFirstSections(SECTION_DEFAULTS[next]);
  };

  const movingCount = [...selectedIds].filter((id) => {
    const record = records.find((item) => item.workspaceId === id);
    return record?.projectId && projectNames[record.projectId];
  }).length;

  if (created) {
    return (
      <WorkspaceCreatedPopup
        workspaceId={created.workspaceId}
        workspaceName={created.name}
        projectName={created.project}
        stayLabel="Stay here"
        onOpen={() => {
          onClose();
          router.push(`/workspaces/${encodeURIComponent(created.workspaceId)}`);
        }}
        onStay={onClose}
      />
    );
  }

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
              <span>Workspace name</span>
              <input
                type="text"
                value={firstWorkspaceName}
                placeholder="Example: Storage Access Issue"
                onChange={(event) => {
                  setFirstWorkspaceName(event.target.value);
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
                    onClick={() => selectFirstPath(option.id)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <p className="dash-field-help">
                You&rsquo;ll run the first prompt inside the workspace terminal.
              </p>
            </div>
            <SectionsEditor
              sections={firstSections}
              onChange={(next) => {
                setFirstSections(next);
                setFirstSectionsEdited(true);
                if (error) setError("");
              }}
              onReset={() => {
                setFirstSections(SECTION_DEFAULTS[firstPath]);
                setFirstSectionsEdited(false);
              }}
            />
          </>
        ) : null}

        {error ? <p className="dash-modal-error">{error}</p> : null}

        <div className="dash-modal-actions">
          <button type="button" className="dash-btn-light" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="dash-btn-purple">
            {startMode === "first"
              ? "Create project and workspace"
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
    showToast({
      title: "Workspaces added",
      message: `${selectedIds.size} workspace${selectedIds.size === 1 ? "" : "s"} added to ${projectName}.`
    });
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

/* ── workspace created popup ────────────────────────────────────────────── */

function WorkspaceCreatedPopup({
  workspaceName,
  projectName,
  stayLabel,
  onOpen,
  onStay
}: {
  workspaceId: string;
  workspaceName: string;
  projectName: string;
  stayLabel: string;
  onOpen: () => void;
  onStay: () => void;
}) {
  return (
    <div className="dash-modal-overlay" role="dialog" aria-modal="true" aria-label="Workspace created">
      <button type="button" className="dash-modal-scrim" aria-label="Close" onClick={onStay} />
      <div className="dash-modal dash-modal-success">
        <span className="dash-success-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path
              d="m6 12.5 4 4 8-9"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <h2>Workspace created</h2>
        <p>
          <strong>{workspaceName}</strong> is ready in {projectName}.
        </p>
        <div className="dash-modal-actions dash-success-actions">
          <button type="button" className="dash-btn-light" onClick={onStay}>
            {stayLabel}
          </button>
          <button type="button" className="dash-btn-purple" onClick={onOpen}>
            Open workspace
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── create workspace ───────────────────────────────────────────────────── */

function CreateWorkspaceModal({
  initialDestinationId,
  initialPrompt,
  successAfterCreate,
  onClose
}: {
  initialDestinationId?: string;
  initialPrompt?: string;
  successAfterCreate?: CreateWorkspaceOptions["afterCreate"];
  onClose: () => void;
}) {
  const router = useRouter();
  const { profile } = useProfile();
  const [projects, setProjects] = useState<WorkspaceProject[]>([]);
  const [destinationId, setDestinationId] = useState<string | undefined>(initialDestinationId);
  const [workspaceName, setWorkspaceName] = useState("");
  const [path, setPath] = useState<WorkspacePreferredMode>("auto");
  const [sections, setSections] = useState<SectionTemplate[]>(SECTION_DEFAULTS.auto);
  const [sectionsEdited, setSectionsEdited] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<{ workspaceId: string; name: string; project: string } | null>(
    null
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const ensured = profile ? ensureDefaultProjects(profile.id) : { myWorkspaces: null };
      const ordered = orderProjects(getProjects(profile?.id));
      setProjects(ordered);
      setDestinationId((current) => current ?? ensured.myWorkspaces?.id ?? ordered[0]?.id);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [profile]);

  const selectPath = (next: WorkspacePreferredMode) => {
    setPath(next);
    if (!sectionsEdited) setSections(SECTION_DEFAULTS[next]);
  };

  const destinationName =
    projects.find((project) => project.id === destinationId)?.name ?? "My Workspaces";

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!workspaceName.trim()) {
      setError("Enter a workspace name.");
      return;
    }
    if (profile && !destinationId) {
      setError("Choose a project for this workspace.");
      return;
    }
    if (sections.some((section) => !section.title.trim())) {
      setError("Section names cannot be empty.");
      return;
    }

    const account = getAccount();
    const gate = canCreateWorkspace(account, getDashboardRecords(profile?.id).length);
    if (!gate.allowed) {
      onClose();
      promptUpgrade("Workspace limit reached", gate, account.currentPlanId);
      return;
    }

    // No AI here — create an empty workspace shell, then show a success popup
    // with an explicit "Open workspace" action.
    const shell = createWorkspaceShell({
      workspaceName,
      preferredMode: path,
      projectId: destinationId,
      createdFrom: initialDestinationId ? "project" : "dashboard",
      sections,
      terminalPrefill: initialPrompt,
      profileId: profile?.id
    });
    emitChange();
    setCreated({ workspaceId: shell.workspaceId, name: shell.workspaceName, project: destinationName });
  };

  if (created) {
    return (
      <WorkspaceCreatedPopup
        workspaceId={created.workspaceId}
        workspaceName={created.name}
        projectName={created.project}
        stayLabel={successAfterCreate?.stayLabel ?? "Stay on dashboard"}
        onOpen={() => {
          onClose();
          router.push(`/workspaces/${encodeURIComponent(created.workspaceId)}`);
        }}
        onStay={() => {
          onClose();
          if (successAfterCreate?.stayHref) {
            router.push(successAfterCreate.stayHref);
          }
        }}
      />
    );
  }

  return (
    <ModalShell
      title="Create workspace"
      subtitle="Name a working area, then run your first prompt inside it."
      onClose={onClose}
    >
      <form className="dash-modal-body" onSubmit={handleSubmit}>
        <label className="dash-field">
          <span>Project</span>
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
          <span>Workspace name</span>
          <input
            type="text"
            value={workspaceName}
            placeholder="Example: Storage Access Troubleshooting"
            autoFocus
            onChange={(event) => {
              setWorkspaceName(event.target.value);
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
                onClick={() => selectPath(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <p className="dash-field-help">
            Auto lets Doc/ReDefined choose the right path when you run your first prompt.
          </p>
        </div>

        <SectionsEditor
          sections={sections}
          onChange={(next) => {
            setSections(next);
            setSectionsEdited(true);
            if (error) setError("");
          }}
          onReset={() => {
            setSections(SECTION_DEFAULTS[path]);
            setSectionsEdited(false);
          }}
        />

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
