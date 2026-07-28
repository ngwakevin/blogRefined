"use client";

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
import { ResultRouter } from "@/components/results/ResultRouter";
import type { ResultSource } from "@/components/results/ResultSourceBadge";
import { useProfile } from "@/components/profile/useProfile";
import { useVoiceRecorder } from "@/components/voice/useVoiceRecorder";
import { MODES } from "@/lib/constants";
import { promptUpgrade } from "@/components/billing/UpgradeModal";
import { DASHBOARD_CHANGED_EVENT } from "@/components/dashboard/DashboardModals";
import { canRunPrompt, getAccount, incrementUsage } from "@/lib/account-store";
import { orderProjects } from "@/lib/dashboard-store";
import {
  getGuestLimitState,
  getProjects,
  movePendingWorkspace,
  removePendingWorkspace,
  saveProfileJourney,
  saveTemporaryJourneyRecord,
  updatePendingWorkspace,
  updatePendingWorkspaceSections,
  type ProfileJourneyRecord,
  type TemporaryJourneyRecord
} from "@/lib/journey-store";
import { type RedefinedResult } from "@/lib/redefined";
import { newPromptRunId } from "@/lib/workspace-followup";
import {
  assignResultToSection,
  attachWorkspaceToResult,
  createDefaultBranch,
  createInitialJourney,
  createWorkspaceArtifacts,
  createWorkspaceMeta,
  getUserWorkspaceState
} from "@/lib/workspace";
import type {
  JourneyEvent,
  PendingWorkspaceShell,
  WorkspacePreferredMode,
  WorkspaceProject,
  WorkspacePromptRun,
  WorkspaceSection,
  WorkspaceSectionType
} from "@/lib/workspace-types";

type WorkspaceRunnerProps = {
  shell: PendingWorkspaceShell;
};

type RunnerStatus = "idle" | "running" | "ready" | "error";
type Mode = (typeof MODES)[number]["id"];

const PATH_OPTIONS: Array<{ id: WorkspacePreferredMode; label: string; color?: string }> = [
  { id: "auto", label: "Auto" },
  ...MODES.map((mode) => ({ id: mode.id as WorkspacePreferredMode, label: mode.label, color: mode.color }))
];

const SECTION_EMPTY_TEXT: Partial<Record<WorkspaceSectionType, string>> = {
  overview: "No items yet. A summary will appear here after your first prompt.",
  prompt_runs: "No prompts run yet.",
  notes: "No notes yet.",
  artifact: "No artifacts yet."
};

function emptyTextFor(type: WorkspaceSectionType) {
  return SECTION_EMPTY_TEXT[type] ?? "No items yet. Content will appear here as you work.";
}

const MIN_RUN_TIME = 3600;

function wait(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

function VoicePromptIcon({ state }: { state: "idle" | "recording" | "transcribing" | "ready" | "error" }) {
  if (state === "ready") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m5 12 4 4L19 6" />
      </svg>
    );
  }

  if (state === "transcribing") return <span className="prompt-voice-spinner" aria-hidden="true" />;

  if (state === "error") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 9v4" />
        <path d="M12 17h.01" />
        <path d="M10.3 4.3 2.7 18a2 2 0 0 0 1.7 3h15.2a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0Z" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3Z" />
      <path d="M19 11a7 7 0 0 1-14 0" />
      <path d="M12 18v3" />
      <path d="M8 21h8" />
    </svg>
  );
}

export function WorkspaceRunner({ shell }: WorkspaceRunnerProps) {
  const { profile } = useProfile();
  const [status, setStatus] = useState<RunnerStatus>("idle");
  const [prompt, setPrompt] = useState(shell.terminalPrefill ?? "");
  const [mode, setMode] = useState<WorkspacePreferredMode>(shell.preferredMode);
  const [workspaceName, setWorkspaceName] = useState(shell.workspaceName);
  const [projectId, setProjectId] = useState(shell.projectId);
  const [sections, setSections] = useState<WorkspaceSection[]>(shell.sections);
  const [activeSectionId, setActiveSectionId] = useState<string | null>(shell.sections[0]?.id ?? null);
  const [projects, setProjects] = useState<WorkspaceProject[]>([]);
  const [moveOpen, setMoveOpen] = useState(false);
  const [generated, setGenerated] = useState<RedefinedResult | null>(null);
  const [resultSource, setResultSource] = useState<ResultSource>("ai");
  const [profileRecord, setProfileRecord] = useState<ProfileJourneyRecord | null>(null);
  const [temporaryRecord, setTemporaryRecord] = useState<TemporaryJourneyRecord | null>(null);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const runningRef = useRef(false);
  const autoRunRef = useRef(false);
  const moveRef = useRef<HTMLDivElement>(null);

  const visualMode = mode === "auto" ? "understand" : mode;
  const activeConfig = useMemo(
    () => MODES.find((item) => item.id === visualMode) ?? MODES[0],
    [visualMode]
  );
  const stageStyle = {
    "--active": activeConfig.color,
    "--active-shadow": activeConfig.soft,
    "--active-border": activeConfig.border,
    "--panel-text": activeConfig.panelText,
    "--panel-subtext": activeConfig.panelSubtext
  } as CSSProperties;

  const { voiceInputState, voiceStatusMessage, handleVoiceInputClick } = useVoiceRecorder({
    onTranscript: (transcript) => {
      setPrompt(transcript);
      setError("");
      inputRef.current?.focus();
    },
    listeningMessage: "Listening... tap to stop",
    transcribingMessage: "Transcribing...",
    readyMessage: "Transcript ready — press enter to run",
    errorMessage: "Voice input failed. You can type instead."
  });

  useEffect(() => {
    const timer = window.setTimeout(() => setProjects(orderProjects(getProjects(profile?.id))), 0);
    return () => window.clearTimeout(timer);
  }, [profile]);

  useEffect(() => {
    if (!moveOpen) return undefined;
    const onDoc = (event: MouseEvent) => {
      if (!moveRef.current?.contains(event.target as Node)) setMoveOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [moveOpen]);

  const projectName = projectId
    ? projects.find((project) => project.id === projectId)?.name ?? null
    : null;
  const modeLabel = PATH_OPTIONS.find((option) => option.id === mode)?.label ?? "Auto";

  const persistSections = useCallback(
    (next: WorkspaceSection[]) => {
      setSections(next);
      updatePendingWorkspaceSections(shell.workspaceId, next);
    },
    [shell.workspaceId]
  );

  const handleAddSection = () => {
    const title = window.prompt("Section name")?.trim();
    if (!title) return;
    const now = new Date().toISOString();
    persistSections([
      ...sections,
      {
        id: `section-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        workspaceId: shell.workspaceId,
        title,
        type: "custom",
        itemIds: [],
        createdAt: now,
        updatedAt: now
      }
    ]);
  };

  const handleRenameSection = (section: WorkspaceSection) => {
    const title = window.prompt("Rename section", section.title)?.trim();
    if (!title || title === section.title) return;
    persistSections(
      sections.map((item) =>
        item.id === section.id ? { ...item, title, updatedAt: new Date().toISOString() } : item
      )
    );
  };

  const handleDeleteSection = (section: WorkspaceSection) => {
    if (section.type === "overview" && sections.filter((item) => item.type !== "overview").length === 0) {
      window.alert("Keep at least one section. Overview cannot be removed on its own.");
      return;
    }
    const next = sections.filter((item) => item.id !== section.id);
    persistSections(next);
    if (activeSectionId === section.id) setActiveSectionId(next[0]?.id ?? null);
  };

  const handleResetSections = () => {
    persistSections(shell.sections);
    setActiveSectionId(shell.sections[0]?.id ?? null);
  };

  const handleRenameWorkspace = () => {
    const next = window.prompt("Rename workspace", workspaceName)?.trim();
    if (!next || next === workspaceName) return;
    updatePendingWorkspace(shell.workspaceId, { workspaceName: next });
    setWorkspaceName(next);
  };

  const handleMove = (targetId: string) => {
    setMoveOpen(false);
    if (targetId === projectId) return;
    movePendingWorkspace(shell.workspaceId, targetId, profile?.id);
    setProjectId(targetId);
  };

  const selectMode = (next: WorkspacePreferredMode) => {
    setMode(next);
    updatePendingWorkspace(shell.workspaceId, { preferredMode: next });
  };

  const selectVisualMode = (next: Mode) => {
    selectMode(next);
  };

  const runPrompt = useCallback(async () => {
    if (runningRef.current) return;
    const clean = prompt.trim();
    if (!clean) {
      inputRef.current?.focus();
      setError("Enter a prompt to run.");
      return;
    }

    const account = getAccount();
    const promptGate = canRunPrompt(account);
    if (!promptGate.allowed) {
      promptUpgrade("Prompt run limit reached", promptGate, account.currentPlanId);
      return;
    }

    runningRef.current = true;
    setError("");
    setStatus("running");
    const promptRunId = newPromptRunId();
    const promptRunCreatedAt = new Date().toISOString();
    const promptRun: WorkspacePromptRun = {
      id: promptRunId,
      workspaceId: shell.workspaceId,
      prompt: clean,
      mode,
      status: "running",
      createdAt: promptRunCreatedAt
    };

    updatePendingWorkspace(shell.workspaceId, {
      status: "running",
      originalPrompt: clean,
      terminalPrefill: clean,
      journey: [
        ...(shell.journey ?? []),
        {
          id: `event-${Date.now().toString(36)}-first-start`,
          eventType: "first_prompt_started",
          title: "First prompt started",
          description: "The first prompt began running in this workspace.",
          timestamp: promptRunCreatedAt
        }
      ]
    });

    const startedAt = Date.now();
    const selectedMode = mode !== "auto" ? mode : null;

    try {
      const response = await fetch("/api/redefine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: clean,
          projectId,
          workspaceId: shell.workspaceId,
          workspaceName,
          preferredMode: selectedMode ?? mode,
          // Lens Contract: explicit lens so the AI handler does not auto-classify when a path is set.
          path: selectedMode ?? undefined,
          lens: selectedMode ?? undefined
        })
      });
      if (!response.ok) throw new Error("Failed to prepare structured result.");

      const payload = (await response.json()) as { result: RedefinedResult; source: ResultSource };

      const elapsed = Date.now() - startedAt;
      if (elapsed < MIN_RUN_TIME) await wait(MIN_RUN_TIME - elapsed);

      const now = new Date().toISOString();
      const result = payload.result;
      const userState = getUserWorkspaceState(getGuestLimitState().count);
      const branch = createDefaultBranch(result, clean, now);
      const workspaceMeta = {
        ...createWorkspaceMeta({
          result,
          prompt: clean,
          userState,
          currentBranchId: branch.id,
          persistence: shell.persistence,
          projectId,
          preferredMode: mode,
          createdFrom: shell.createdFrom,
          workspaceIdOverride: shell.workspaceId,
          workspaceNameOverride: workspaceName
        }),
        status: "completed" as const
      };

      const { sections: assignedSections, items } = assignResultToSection(
        sections,
        result,
        shell.workspaceId,
        now
      );

      const completedAt = new Date().toISOString();
      const completedPromptRun: WorkspacePromptRun = {
        ...promptRun,
        status: "completed",
        resultId: result.id,
        sectionId: assignedSections.find((section) => section.itemIds.length > 0)?.id,
        completedAt
      };
      const promptEvents: JourneyEvent[] = [
        {
          id: `event-${Date.now().toString(36)}-done`,
          eventType: "first_prompt_completed",
          title: "First prompt completed",
          description: "The workspace result was generated and saved.",
          timestamp: completedAt,
          promptRunId
        }
      ];
      const existingJourney = shell.journey ?? [];

      const workspaceResult = attachWorkspaceToResult({
        result: { ...result, originalPrompt: clean, promptRunId },
        workspaceMeta,
        branches: [branch],
        journey: [...existingJourney, ...createInitialJourney(branch), ...promptEvents],
        artifacts: createWorkspaceArtifacts(result, branch, now),
        promptRuns: [completedPromptRun],
        sections: assignedSections,
        items
      });

      if (shell.persistence === "local_profile" && profile) {
        setProfileRecord(saveProfileJourney(workspaceResult, profile.id, payload.source));
      } else {
        setTemporaryRecord(saveTemporaryJourneyRecord(workspaceResult));
      }

      removePendingWorkspace(shell.workspaceId);
      window.dispatchEvent(new CustomEvent(DASHBOARD_CHANGED_EVENT));
      incrementUsage("promptRunsThisMonth");
      setResultSource(payload.source);
      setGenerated(workspaceResult);
      setStatus("ready");
    } catch {
      updatePendingWorkspace(shell.workspaceId, { status: "error" });
      setStatus("error");
    } finally {
      runningRef.current = false;
    }
  }, [mode, profile, projectId, prompt, sections, shell, workspaceName]);

  useEffect(() => {
    if (!shell.autoRunFirstPrompt || autoRunRef.current || !shell.terminalPrefill?.trim()) return;
    autoRunRef.current = true;
    void runPrompt();
  }, [runPrompt, shell.autoRunFirstPrompt, shell.terminalPrefill]);

  if (status === "ready" && generated) {
    return (
      <section className="result-preview result-slot fix-result-preview visible">
        <ResultRouter
          result={generated}
          source={resultSource}
          profileRecord={profileRecord ?? undefined}
          temporaryRecord={temporaryRecord ?? undefined}
          guestLimitState={getGuestLimitState()}
          onResultChange={setGenerated}
        />
      </section>
    );
  }

  const running = status === "running";
  const statusLabel = running ? "Running" : status === "error" ? "Error" : "Empty workspace";

  return (
    <div className="ws-canvas">
      <header className="ws-head">
        <div className="ws-head-titles">
          <p className="ws-head-project">Project: {projectName ?? "Unassigned"}</p>
          <h1>{workspaceName}</h1>
          <div className="ws-head-badges">
            <span className={`ws-badge ws-badge-${status}`}>{statusLabel}</span>
            <span className="ws-badge ws-badge-path" data-mode={mode}>
              Path: {modeLabel}
            </span>
          </div>
        </div>
        <div className="ws-head-actions">
          <button type="button" onClick={handleRenameWorkspace}>Rename</button>
          <div className="ws-move" ref={moveRef}>
            <button type="button" onClick={() => setMoveOpen((open) => !open)} aria-expanded={moveOpen}>
              Move to project
            </button>
            {moveOpen ? (
              <div className="ws-move-menu" role="menu">
                {projects.map((project) => (
                  <button
                    key={project.id}
                    type="button"
                    disabled={project.id === projectId}
                    onClick={() => handleMove(project.id)}
                  >
                    {project.name}
                    {project.id === projectId ? " ✓" : ""}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <button type="button" onClick={handleAddSection}>+ Add section</button>
        </div>
      </header>

      <div className="ws-sections" aria-label="Workspace sections">
        <span className="ws-sections-label">Sections</span>
        <div className="ws-sections-row">
          {sections.map((section) => (
            <span
              key={section.id}
              className={`ws-section-chip${activeSectionId === section.id ? " active" : ""}`}
            >
              <button
                type="button"
                className="ws-section-name"
                onClick={() => setActiveSectionId(section.id)}
                onDoubleClick={() => handleRenameSection(section)}
                title="Click to focus · double-click to rename"
              >
                {section.title}
              </button>
              {sections.length > 1 ? (
                <button
                  type="button"
                  className="ws-section-remove"
                  aria-label={`Remove ${section.title}`}
                  onClick={() => handleDeleteSection(section)}
                >
                  ✕
                </button>
              ) : null}
            </span>
          ))}
          <div className="ws-sections-tools">
            <button type="button" onClick={handleAddSection}>+ Add</button>
            <button type="button" onClick={handleResetSections}>Reset</button>
          </div>
        </div>
      </div>

      <section
        className={`command-scene dash-command ws-command${running ? " is-running" : ""}${status === "error" ? " is-error" : ""}`}
        style={stageStyle}
        aria-label="Run prompt in this workspace"
      >
        {running ? (
          <div className="ws-command-status-panel">
            <p className="ws-command-kicker">
              <span className="ws-terminal-spinner" aria-hidden="true" />
              Running prompt...
            </p>
            <p>{prompt}</p>
          </div>
        ) : status === "error" ? (
          <div className="ws-command-status-panel is-error">
            <p className="ws-command-kicker">Prompt failed</p>
            <p>{prompt}</p>
            <span className="ws-command-error">
              We could not generate this workspace. Your workspace is saved — try again.
            </span>
            <button type="button" className="dash-btn-purple" onClick={() => void runPrompt()}>
              Retry prompt
            </button>
          </div>
        ) : (
          <form
            onSubmit={(event: FormEvent<HTMLFormElement>) => {
              event.preventDefault();
              void runPrompt();
            }}
          >
            <p className="prompt-title ws-command-title">Ask Doc/ReDefined</p>

            <div className="command-strip" aria-label="Workspace prompt command">
              <span className="command-plus" aria-hidden="true">
                +
              </span>
              <input
                id="ws-prompt"
                ref={inputRef}
                className="prompt-input"
                type="text"
                value={prompt}
                placeholder="Search or ask Doc/ReDefined anything..."
                autoComplete="off"
                autoFocus
                onChange={(event) => {
                  setPrompt(event.target.value);
                  if (error) setError("");
                }}
              />
              <button
                className={`command-enter${prompt.trim() ? " ready" : ""}`}
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
                <VoicePromptIcon state={voiceInputState} />
              </button>
            </div>

            <div
              className={`prompt-voice-status${voiceStatusMessage ? " visible" : ""} is-${voiceInputState}`}
              aria-live="polite"
            >
              {voiceStatusMessage}
            </div>

            <div className="dash-run-context">
              <div className="dash-run-line">
                <span className="dash-run-pill ws-run-pill">
                  <span className="dash-run-dot" aria-hidden="true" />
                  <strong>{projectName ?? "My Workspaces"}</strong>
                </span>
                <span className="dash-run-sub">
                  &middot; {shell.persistence === "local_profile" ? "Saved automatically" : "Saved locally"}
                </span>
              </div>
            </div>

            <ModeButtons activeMode={visualMode} moving={false} onModeChange={selectVisualMode} />

            <section className="path-panel visible" aria-label="Prepared path">
              <div className="path-label">Path prepared</div>
              <div className="active-stage">{mode === "auto" ? "Auto" : activeConfig.label}</div>
              <p>
                {mode === "auto"
                  ? "Doc/ReDefined will choose the best path for this workspace prompt."
                  : activeConfig.description}
              </p>
            </section>

            {error ? <p className="ws-terminal-error">{error}</p> : null}
          </form>
        )}
      </section>

      {/* section content cards */}
      {status === "idle" ? (
        <div className="ws-section-cards">
          {sections.map((section) => (
            <button
              key={section.id}
              type="button"
              className={`ws-section-card${activeSectionId === section.id ? " active" : ""}`}
              onClick={() => setActiveSectionId(section.id)}
            >
              <h3>{section.title}</h3>
              <p>{emptyTextFor(section.type)}</p>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
