"use client";

import { useRouter } from "next/navigation";
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
import { DASHBOARD_CHANGED_EVENT, openCreateProject } from "@/components/dashboard/DashboardModals";
import { useProfile } from "@/components/profile/useProfile";
import { useVoiceRecorder } from "@/components/voice/useVoiceRecorder";
import { MODES } from "@/lib/constants";
import { orderProjects } from "@/lib/dashboard-store";
import { ensureDefaultProjects, getProjects } from "@/lib/journey-store";
import type { WorkspaceProject } from "@/lib/workspace-types";

type Mode = (typeof MODES)[number]["id"];

type DashboardCommandCenterProps = {
  statusText: string;
  initialProjectId?: string;
};

export function DashboardCommandCenter({
  statusText,
  initialProjectId
}: DashboardCommandCenterProps) {
  const router = useRouter();
  const { profile } = useProfile();
  const [promptText, setPromptText] = useState("");
  const [projects, setProjects] = useState<WorkspaceProject[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | undefined>(initialProjectId);
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const projectMenuRef = useRef<HTMLDivElement>(null);
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

  const loadProjects = useCallback(() => {
    const ensured = profileId ? ensureDefaultProjects(profileId) : { myWorkspaces: null };
    const ordered = orderProjects(getProjects(profileId));
    setProjects(ordered);
    setSelectedProjectId((current) => {
      if (current && ordered.some((project) => project.id === current)) return current;
      return ensured.myWorkspaces?.id ?? ordered[0]?.id;
    });
  }, [profileId]);

  useEffect(() => {
    const timer = window.setTimeout(loadProjects, 0);
    window.addEventListener(DASHBOARD_CHANGED_EVENT, loadProjects);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener(DASHBOARD_CHANGED_EVENT, loadProjects);
    };
  }, [loadProjects]);

  useEffect(() => {
    if (!projectMenuOpen) return undefined;
    const onDocClick = (event: MouseEvent) => {
      if (!projectMenuRef.current?.contains(event.target as Node)) setProjectMenuOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [projectMenuOpen]);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId]
  );

  const isDefaultProject = selectedProject?.projectType === "default";

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
    arrowTimerRef.current = window.setTimeout(() => {
      setArrowMoving(false);
    }, 720);
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
      resumeTimerRef.current = window.setTimeout(() => {
        startAutoCycle();
      }, 6000);
    },
    [selectModeWithContentTransition, startAutoCycle, stopAutoCycle]
  );

  useEffect(() => {
    const panelTimer = window.setTimeout(() => {
      setPanelVisible(true);
      selectMode("understand");
    }, 400);

    const cycleStartTimer = window.setTimeout(() => {
      startAutoCycle();
    }, 1600);

    return () => {
      window.clearTimeout(panelTimer);
      window.clearTimeout(cycleStartTimer);
      stopAutoCycle();
      if (resumeTimerRef.current !== undefined) window.clearTimeout(resumeTimerRef.current);
      if (arrowTimerRef.current !== undefined) window.clearTimeout(arrowTimerRef.current);
    };
  }, [selectMode, startAutoCycle, stopAutoCycle]);

  const handleSubmit = useCallback(
    (event?: FormEvent<HTMLFormElement>) => {
      event?.preventDefault();

      const clean = promptText.trim();
      if (!clean) {
        inputRef.current?.focus();
        return;
      }

      const params = new URLSearchParams();
      params.set("prompt", clean);
      if (manualModeRef.current) params.set("mode", manualModeRef.current);
      if (selectedProjectId) params.set("projectId", selectedProjectId);
      router.push(`/new?${params.toString()}`);
    },
    [promptText, router, selectedProjectId]
  );

  const handleNewProject = useCallback(() => {
    setProjectMenuOpen(false);
    openCreateProject();
  }, []);

  return (
    <section
      className="command-scene dash-command"
      style={stageStyle}
      aria-label="Doc/ReDefined command surface"
    >
      <form
        className="command-strip"
        aria-label="Prompt command"
        onSubmit={handleSubmit}
      >
        <span className="command-plus" aria-hidden="true">
          +
        </span>
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
          aria-label="Prepare path"
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
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m5 12 4 4L19 6" />
            </svg>
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

      <div className="dash-run-context" ref={projectMenuRef}>
        <div className="dash-run-line">
          <button
            type="button"
            className="dash-run-pill"
            aria-haspopup="menu"
            aria-expanded={projectMenuOpen}
            aria-label="Choose save destination"
            onClick={() => setProjectMenuOpen((open) => !open)}
          >
            <span className="dash-run-dot" aria-hidden="true" />
            <strong>{selectedProject?.name ?? "My Workspaces"}</strong>
            <span className="dash-run-caret" aria-hidden="true">▾</span>
          </button>
          <span className="dash-run-sub">
            &middot;{" "}
            {isDefaultProject ? statusText : "New workspace will be added here"}
          </span>
        </div>

        {projectMenuOpen ? (
          <div className="dash-run-menu" role="menu">
            {projects.map((project) => (
              <button
                key={project.id}
                type="button"
                role="menuitemradio"
                aria-checked={project.id === selectedProjectId}
                className={project.id === selectedProjectId ? "active" : ""}
                onClick={() => {
                  setSelectedProjectId(project.id);
                  setProjectMenuOpen(false);
                }}
              >
                <span className="dash-run-menu-name">{project.name}</span>
                {project.projectType === "default" ? (
                  <span className="dash-run-menu-tag">Default</span>
                ) : null}
              </button>
            ))}
            <button type="button" role="menuitem" className="dash-run-menu-new" onClick={handleNewProject}>
              + New project
            </button>
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
