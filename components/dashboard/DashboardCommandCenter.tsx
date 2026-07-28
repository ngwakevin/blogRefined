"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent
} from "react";
import ModeButtons from "@/components/ModeButtons";
import { promptUpgrade } from "@/components/billing/UpgradeModal";
import { DASHBOARD_CHANGED_EVENT } from "@/components/dashboard/DashboardModals";
import { useProfile } from "@/components/profile/useProfile";
import { useVoiceRecorder } from "@/components/voice/useVoiceRecorder";
import { canCreateWorkspace, canRunPrompt, getAccount, incrementUsage } from "@/lib/account-store";
import { MODES } from "@/lib/constants";
import {
  getDashboardRecords,
  MODE_META,
  orderProjects,
  relativeTime,
  SECTION_DEFAULTS,
  type DashboardRecord
} from "@/lib/dashboard-store";
import {
  createWorkspaceShell,
  ensureDefaultProjects,
  getProfileJourneyRecords,
  getProjects,
  getTemporaryJourneyRecords,
  persistWorkspaceResult,
  updatePendingWorkspace
} from "@/lib/journey-store";
import { generateWorkspaceNameFromPrompt } from "@/lib/workspace";
import {
  buildFollowUpContextPrompt,
  followUpTitle,
  newFollowUpResultId,
  newPromptRunId,
  pickFollowUpSection,
  withPromptRunCompleted,
  withPromptRunFailed,
  withPromptRunStarted
} from "@/lib/workspace-followup";
import type { RedefinedResult, WorkspaceFollowUpResult } from "@/lib/redefined";
import type { WorkspacePreferredMode, WorkspaceProject, WorkspacePromptRun } from "@/lib/workspace-types";

type Mode = (typeof MODES)[number]["id"];

const PATH_OPTIONS: Array<{ id: WorkspacePreferredMode; label: string }> = [
  { id: "auto", label: "Auto" },
  ...MODES.map((mode) => ({ id: mode.id as WorkspacePreferredMode, label: mode.label }))
];

type DashboardCommandCenterProps = {
  statusText: string;
  initialProjectId?: string;
};

/** Resolves an existing workspace's full result + record id for follow-up runs. */
function findRecordResult(
  workspaceId: string,
  profileId?: string
): { result: RedefinedResult; recordId: string } | null {
  const records = profileId ? getProfileJourneyRecords(profileId) : getTemporaryJourneyRecords();
  for (const record of records) {
    const wid = record.workspaceMeta?.workspaceId ?? record.result.workspaceMeta?.workspaceId ?? record.id;
    if (wid === workspaceId) return { result: record.result, recordId: record.id };
  }
  return null;
}

export function DashboardCommandCenter({
  statusText,
  initialProjectId
}: DashboardCommandCenterProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { profile } = useProfile();
  const [promptText, setPromptText] = useState("");
  const [projects, setProjects] = useState<WorkspaceProject[]>([]);
  const [records, setRecords] = useState<DashboardRecord[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | undefined>(initialProjectId);
  const [destinationWorkspaceId, setDestinationWorkspaceId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuView, setMenuView] = useState<"list" | "new">("list");
  const [search, setSearch] = useState("");
  const [newName, setNewName] = useState("");
  const [newPath, setNewPath] = useState<WorkspacePreferredMode>("auto");
  const [newError, setNewError] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);
  const [activeMode, setActiveMode] = useState<Mode>("understand");
  const [arrowMoving, setArrowMoving] = useState(false);
  const [panelVisible, setPanelVisible] = useState(false);
  const [contentChanging, setContentChanging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const cycleTimerRef = useRef<number | undefined>(undefined);
  const resumeTimerRef = useRef<number | undefined>(undefined);
  const arrowTimerRef = useRef<number | undefined>(undefined);
  const manualModeRef = useRef<Mode | null>(null);
  const currentModeIndexRef = useRef(0);

  const activeConfig = useMemo(
    () => MODES.find((mode) => mode.id === activeMode) ?? MODES[0],
    [activeMode]
  );

  const profileId = profile?.id;

  const loadData = useCallback(() => {
    const ensured = profileId ? ensureDefaultProjects(profileId) : { myWorkspaces: null };
    const ordered = orderProjects(getProjects(profileId)).filter(
      (project) => project.projectType !== "system" && project.name !== "Doc/ReDefined Learning"
    );
    setProjects(ordered);
    setRecords(getDashboardRecords(profileId));
    setSelectedProjectId((current) => {
      if (current && ordered.some((project) => project.id === current)) return current;
      return ensured.myWorkspaces?.id ?? ordered[0]?.id;
    });
  }, [profileId]);

  useEffect(() => {
    const timer = window.setTimeout(loadData, 0);
    window.addEventListener(DASHBOARD_CHANGED_EVENT, loadData);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener(DASHBOARD_CHANGED_EVENT, loadData);
    };
  }, [loadData]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onDocClick = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [menuOpen]);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId]
  );

  const projectName = useCallback(
    (id?: string) => (id ? projects.find((project) => project.id === id)?.name : undefined),
    [projects]
  );

  // The chosen destination — falls back to "new workspace" if the picked
  // workspace was deleted.
  const destinationRecord = destinationWorkspaceId
    ? records.find((record) => record.workspaceId === destinationWorkspaceId) ?? null
    : null;

  const stageStyle = {
    "--active": activeConfig.color,
    "--active-shadow": activeConfig.soft,
    "--active-border": activeConfig.border,
    "--panel-text": activeConfig.panelText,
    "--panel-subtext": activeConfig.panelSubtext
  } as CSSProperties;

  const { voiceInputState, voiceStatusMessage, handleVoiceInputClick } = useVoiceRecorder({
    onTranscript: (transcript) => {
      setPromptText(transcript);
      inputRef.current?.focus();
    },
    listeningMessage: "Listening... tap to stop",
    transcribingMessage: "Transcribing...",
    readyMessage: "Transcript ready — press enter to redefine",
    errorMessage: "Voice input failed. You can type instead."
  });

  const selectMode = useCallback((mode: Mode) => {
    setActiveMode(mode);
    setArrowMoving(true);
    setPanelVisible(true);
    if (arrowTimerRef.current !== undefined) window.clearTimeout(arrowTimerRef.current);
    arrowTimerRef.current = window.setTimeout(() => setArrowMoving(false), 720);
  }, []);

  const selectModeWithContentTransition = useCallback(
    (mode: Mode) => {
      setContentChanging(true);
      window.setTimeout(() => {
        selectMode(mode);
        setContentChanging(false);
      }, 160);
    },
    [selectMode]
  );

  const stopAutoCycle = useCallback(() => {
    if (cycleTimerRef.current !== undefined) {
      window.clearInterval(cycleTimerRef.current);
      cycleTimerRef.current = undefined;
    }
  }, []);

  const startAutoCycle = useCallback(() => {
    stopAutoCycle();
    cycleTimerRef.current = window.setInterval(() => {
      currentModeIndexRef.current = (currentModeIndexRef.current + 1) % MODES.length;
      selectModeWithContentTransition(MODES[currentModeIndexRef.current].id);
    }, 2500);
  }, [selectModeWithContentTransition, stopAutoCycle]);

  const handleModeChange = useCallback(
    (mode: Mode) => {
      const modeIndex = MODES.findIndex((item) => item.id === mode);
      if (modeIndex !== -1) currentModeIndexRef.current = modeIndex;
      manualModeRef.current = mode;
      stopAutoCycle();
      if (resumeTimerRef.current !== undefined) window.clearTimeout(resumeTimerRef.current);
      selectModeWithContentTransition(mode);
      resumeTimerRef.current = window.setTimeout(() => startAutoCycle(), 6000);
    },
    [selectModeWithContentTransition, startAutoCycle, stopAutoCycle]
  );

  useEffect(() => {
    const panelTimer = window.setTimeout(() => {
      setPanelVisible(true);
      selectMode("understand");
    }, 400);
    const cycleStartTimer = window.setTimeout(() => startAutoCycle(), 1600);
    return () => {
      window.clearTimeout(panelTimer);
      window.clearTimeout(cycleStartTimer);
      stopAutoCycle();
      if (resumeTimerRef.current !== undefined) window.clearTimeout(resumeTimerRef.current);
      if (arrowTimerRef.current !== undefined) window.clearTimeout(arrowTimerRef.current);
    };
  }, [selectMode, startAutoCycle, stopAutoCycle]);

  /* ── running ──────────────────────────────────────────────────────────────── */

  const runNewWorkspace = useCallback(
    (clean: string, mode: WorkspacePreferredMode) => {
      const account = getAccount();
      const workspaceGate = canCreateWorkspace(account, getDashboardRecords(profileId).length);
      if (!workspaceGate.allowed) {
        promptUpgrade("Workspace limit reached", workspaceGate, account.currentPlanId);
        return;
      }
      const promptGate = canRunPrompt(account);
      if (!promptGate.allowed) {
        promptUpgrade("Prompt run limit reached", promptGate, account.currentPlanId);
        return;
      }

      const shell = createWorkspaceShell({
        workspaceName: generateWorkspaceNameFromPrompt(clean, mode),
        preferredMode: mode,
        projectId: selectedProjectId,
        createdFrom: "dashboard_quick_prompt",
        sections: SECTION_DEFAULTS[mode],
        terminalPrefill: clean,
        autoRunFirstPrompt: true,
        profileId
      });
      window.dispatchEvent(new CustomEvent(DASHBOARD_CHANGED_EVENT));
      setPromptText("");
      router.push(`/workspaces/${encodeURIComponent(shell.workspaceId)}`);
    },
    [profileId, router, selectedProjectId]
  );

  const runExistingWorkspace = useCallback(
    async (clean: string, workspaceId: string, mode: WorkspacePreferredMode) => {
      const account = getAccount();
      const promptGate = canRunPrompt(account);
      if (!promptGate.allowed) {
        promptUpgrade("Prompt run limit reached", promptGate, account.currentPlanId);
        return;
      }

      const found = findRecordResult(workspaceId, profileId);
      const target = `/workspaces/${encodeURIComponent(workspaceId)}`;
      if (!found) {
        router.push(target);
        return;
      }

      const { result, recordId } = found;
      const section = pickFollowUpSection(result.workspaceSections ?? [], {
        mode: mode === "auto" ? result.mode : mode
      });
      const runId = newPromptRunId();
      const now = new Date().toISOString();
      const run: WorkspacePromptRun = {
        id: runId,
        workspaceId,
        prompt: clean,
        mode,
        status: "running",
        sectionId: section?.id,
        createdAt: now
      };

      const started = withPromptRunStarted(result, run);
      persistWorkspaceResult({ result: started, recordId, profileId });
      window.dispatchEvent(new Event(DASHBOARD_CHANGED_EVENT));
      setPromptText("");

      try {
        const augmented = buildFollowUpContextPrompt({ result, prompt: clean, section });
        const response = await fetch("/api/redefine", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: augmented,
            selectedMode: mode === "auto" ? undefined : mode,
            workspaceId,
            workspaceName: result.workspaceMeta?.workspaceName,
            projectId: result.workspaceMeta?.projectId
          })
        });
        if (!response.ok) throw new Error("Follow-up request failed.");
        const payload = (await response.json()) as { result: RedefinedResult };

        const followUp: WorkspaceFollowUpResult = {
          id: newFollowUpResultId(),
          workspaceId,
          promptRunId: runId,
          mode: payload.result.mode,
          title: followUpTitle(clean),
          summary: payload.result.summary ?? "",
          content: payload.result,
          sectionId: section?.id,
          createdAt: new Date().toISOString()
        };
        const completed = withPromptRunCompleted(started, { runId, followUp, section });
        persistWorkspaceResult({ result: completed, recordId, profileId });
        incrementUsage("promptRunsThisMonth");
        window.dispatchEvent(new Event(DASHBOARD_CHANGED_EVENT));
      } catch {
        const failed = withPromptRunFailed(started, runId);
        persistWorkspaceResult({ result: failed, recordId, profileId });
      }
      router.push(target);
    },
    [profileId, router]
  );

  // A newly created (empty) shell runs its first prompt in the workspace runner.
  const runPendingShell = useCallback(
    (clean: string, workspaceId: string) => {
      const account = getAccount();
      const promptGate = canRunPrompt(account);
      if (!promptGate.allowed) {
        promptUpgrade("Prompt run limit reached", promptGate, account.currentPlanId);
        return;
      }
      updatePendingWorkspace(workspaceId, {
        terminalPrefill: clean,
        originalPrompt: clean,
        autoRunFirstPrompt: true,
        status: "awaiting_first_prompt"
      });
      window.dispatchEvent(new Event(DASHBOARD_CHANGED_EVENT));
      setPromptText("");
      router.push(`/workspaces/${encodeURIComponent(workspaceId)}`);
    },
    [router]
  );

  const submitTo = useCallback(
    (clean: string, mode: WorkspacePreferredMode) => {
      if (destinationRecord?.pending) {
        runPendingShell(clean, destinationRecord.workspaceId);
      } else if (destinationRecord) {
        void runExistingWorkspace(clean, destinationRecord.workspaceId, mode);
      } else {
        runNewWorkspace(clean, mode);
      }
    },
    [destinationRecord, runExistingWorkspace, runNewWorkspace, runPendingShell]
  );

  const handleSubmit = useCallback(
    (event?: FormEvent<HTMLFormElement>) => {
      event?.preventDefault();
      const clean = promptText.trim();
      if (!clean) {
        inputRef.current?.focus();
        return;
      }
      submitTo(clean, activeMode as WorkspacePreferredMode);
    },
    [activeMode, promptText, submitTo]
  );

  // A guest who typed a prompt before signing up lands here with ?prompt=…
  const autoRanRef = useRef(false);
  useEffect(() => {
    if (autoRanRef.current) return;
    const incoming = searchParams.get("prompt")?.trim();
    if (!incoming) return;
    autoRanRef.current = true;
    const timer = window.setTimeout(() => {
      runNewWorkspace(incoming, activeMode as WorkspacePreferredMode);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [searchParams, activeMode, runNewWorkspace]);

  /* ── destination menu helpers ─────────────────────────────────────────────── */

  const chooseExisting = (workspaceId: string) => {
    setDestinationWorkspaceId(workspaceId);
    setMenuOpen(false);
    inputRef.current?.focus();
  };

  // Creates an empty workspace shell only — does not run the prompt. The typed
  // prompt stays in the input; the new shell becomes the selected destination.
  const handleCreateWorkspace = () => {
    const name = newName.trim();
    if (!name) {
      setNewError("Workspace name is required.");
      return;
    }
    const account = getAccount();
    const gate = canCreateWorkspace(account, getDashboardRecords(profileId).length);
    if (!gate.allowed) {
      setMenuOpen(false);
      promptUpgrade("Workspace limit reached", gate, account.currentPlanId);
      return;
    }

    const shell = createWorkspaceShell({
      workspaceName: name,
      preferredMode: newPath,
      projectId: selectedProjectId,
      createdFrom: "dashboard",
      sections: SECTION_DEFAULTS[newPath],
      profileId
    });
    window.dispatchEvent(new CustomEvent(DASHBOARD_CHANGED_EVENT));
    setDestinationWorkspaceId(shell.workspaceId);
    setNewName("");
    setNewPath("auto");
    setNewError("");
    setMenuView("list");
    setMenuOpen(false);
    inputRef.current?.focus();
  };

  const query = search.trim().toLowerCase();
  const workspaceRows = query
    ? records.filter(
        (record) =>
          record.name.toLowerCase().includes(query) || record.subtitle.toLowerCase().includes(query)
      )
    : records.slice(0, 6);

  const pillLabel = destinationRecord ? destinationRecord.name : "New workspace";
  const pillSub = destinationRecord
    ? `${projectName(destinationRecord.projectId) ?? "Workspace"}${destinationRecord.pending ? ` · ${statusText}` : ""}`
    : `${selectedProject?.name ?? "My Workspaces"} · ${statusText}`;

  return (
    <section
      className="command-scene dash-command"
      style={stageStyle}
      aria-label="Doc/ReDefined command surface"
    >
      <form className="command-strip" aria-label="Prompt command" onSubmit={handleSubmit}>
        <span className="command-plus" aria-hidden="true">+</span>
        <input
          ref={inputRef}
          className="prompt-input"
          type="text"
          value={promptText}
          placeholder="Search or ask Doc/ReDefined anything..."
          autoComplete="off"
          onChange={(event) => setPromptText(event.target.value)}
        />
        <button
          className={`command-enter${promptText.trim() ? " ready" : ""}`}
          type="submit"
          aria-label="Run prompt"
        >
          &#x21b5;
        </button>
        <button
          className={`prompt-voice-button is-${voiceInputState}`}
          type="button"
          aria-label={voiceInputState === "recording" ? "Stop voice input" : "Start voice input"}
          title={voiceInputState === "recording" ? "Stop recording" : "Speak prompt"}
          disabled={voiceInputState === "transcribing"}
          onClick={handleVoiceInputClick}
        >
          {voiceInputState === "ready" ? (
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>
          ) : voiceInputState === "transcribing" ? (
            <span className="prompt-voice-spinner" aria-hidden="true" />
          ) : voiceInputState === "error" ? (
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 9v4" />
              <path d="M12 17h.01" />
              <path d="M10.3 4.3 2.7 18a2 2 0 0 0 1.7 3h15.2a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0Z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3Z" />
              <path d="M19 11a7 7 0 0 1-14 0" />
              <path d="M12 18v3" />
              <path d="M8 21h8" />
            </svg>
          )}
        </button>
      </form>

      <div
        className={`prompt-voice-status${voiceStatusMessage ? " visible" : ""} is-${voiceInputState}`}
        aria-live="polite"
      >
        {voiceStatusMessage}
      </div>

      <div className="dash-run-context" ref={menuRef}>
        <div className="dash-run-line">
          <button
            type="button"
            className="dash-run-pill"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label="Choose where this prompt goes"
            onClick={() => {
              setMenuView("list");
              setMenuOpen((open) => !open);
            }}
          >
            <span className="dash-run-dot" aria-hidden="true" />
            <strong>{pillLabel}</strong>
            <span className="dash-run-caret" aria-hidden="true">▾</span>
          </button>
          <span className="dash-run-sub">&middot; {pillSub}</span>
        </div>

        {menuOpen ? (
          <div className="dash-dest-menu" role="menu">
            {menuView === "list" ? (
              <>
                <p className="dash-dest-title">Send prompt to</p>
                <input
                  className="dash-dest-search"
                  type="search"
                  placeholder="Search workspaces..."
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />

                {workspaceRows.length > 0 ? (
                  <>
                    <p className="dash-dest-label">{query ? "Workspaces" : "Recent workspaces"}</p>
                    <div className="dash-dest-list">
                      {workspaceRows.map((record) => {
                        const meta = MODE_META[record.mode];
                        return (
                          <button
                            key={record.recordId}
                            type="button"
                            className={`dash-dest-row${destinationWorkspaceId === record.workspaceId ? " active" : ""}`}
                            onClick={() => chooseExisting(record.workspaceId)}
                          >
                            <span className="dash-dest-row-main">
                              <span className="dash-dest-row-name">{record.name}</span>
                              <span className="dash-dest-row-meta">
                                {projectName(record.projectId) ?? "Workspace"}
                                {!query ? ` · ${relativeTime(record.updatedAt)}` : ""}
                              </span>
                            </span>
                            <span
                              className="dash-dest-badge"
                              style={{ background: meta.soft } as CSSProperties}
                            >
                              {meta.label}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <p className="dash-dest-empty">No workspaces yet.</p>
                )}

                <p className="dash-dest-label">Create</p>
                <button
                  type="button"
                  className="dash-dest-new"
                  onClick={() => {
                    setNewName("");
                    setNewPath("auto");
                    setNewError("");
                    setMenuView("new");
                  }}
                >
                  + New workspace
                </button>
              </>
            ) : (
              <>
                <p className="dash-dest-title">New workspace</p>

                <label className="dash-dest-field">
                  <span>Workspace name</span>
                  <input
                    type="text"
                    value={newName}
                    placeholder="Workspace name"
                    autoFocus
                    onChange={(event) => {
                      setNewName(event.target.value);
                      if (newError) setNewError("");
                    }}
                  />
                  <small className="dash-dest-hint">Name this workspace before running your prompt.</small>
                  {newError ? <small className="dash-dest-error">{newError}</small> : null}
                </label>

                <div className="dash-dest-field">
                  <span>Project</span>
                  <div className="dash-dest-projects" role="radiogroup" aria-label="Project">
                    {projects.map((project) => (
                      <button
                        key={project.id}
                        type="button"
                        role="radio"
                        aria-checked={selectedProjectId === project.id}
                        className={`dash-dest-proj${selectedProjectId === project.id ? " active" : ""}`}
                        onClick={() => setSelectedProjectId(project.id)}
                      >
                        <span>{project.name}</span>
                        {project.projectType === "default" ? <em>Default</em> : null}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="dash-dest-field">
                  <span>Path</span>
                  <div className="dash-dest-projects" role="radiogroup" aria-label="Path">
                    {PATH_OPTIONS.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        role="radio"
                        aria-checked={newPath === option.id}
                        className={`dash-dest-proj${newPath === option.id ? " active" : ""}`}
                        onClick={() => setNewPath(option.id)}
                      >
                        <span>{option.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <p className="dash-dest-helper">
                  Need a new project? <Link href="/projects">Create it from Projects</Link>.
                </p>

                <div className="dash-dest-actions">
                  <button type="button" className="dash-dest-back" onClick={() => setMenuView("list")}>
                    Back
                  </button>
                  <button type="button" className="dash-dest-primary" onClick={handleCreateWorkspace}>
                    Create workspace
                  </button>
                </div>
              </>
            )}
          </div>
        ) : null}
      </div>

      <ModeButtons activeMode={activeMode} moving={arrowMoving} onModeChange={handleModeChange} />

      <section className={`path-panel${panelVisible ? " visible" : ""}`} aria-label="Prepared path">
        <div className="path-label">Path prepared</div>
        <div className={`active-stage${contentChanging ? " content-changing" : ""}`}>
          {activeConfig.label}
        </div>
        <p className={contentChanging ? "content-changing" : ""}>{activeConfig.description}</p>
      </section>
    </section>
  );
}
