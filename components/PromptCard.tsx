"use client";

import type { CSSProperties, FormEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import LandingSections from "@/components/landing/LandingSections";
import ModeButtons from "@/components/ModeButtons";
import { GuestWorkspaceReminder } from "@/components/journey/GuestWorkspaceReminder";
import { ProfilePromptModal } from "@/components/journey/ProfilePromptModal";
import { TemporaryLimitModal } from "@/components/journey/TemporaryLimitModal";
import { useProfile } from "@/components/profile/useProfile";
import { ResultDebugPanel, type ResultDebugInfo } from "@/components/results/ResultDebugPanel";
import { ResultRouter } from "@/components/results/ResultRouter";
import type { ResultSource } from "@/components/results/ResultSourceBadge";
import { useVoiceRecorder } from "@/components/voice/useVoiceRecorder";
import { MODES } from "@/lib/constants";
import {
  addWorkspaceToProject,
  assignWorkspaceToProjectSilently,
  clearTemporaryJourneyRecords,
  ensureDefaultProjects,
  getProjects,
  dismissProfilePromptForSession,
  getGuestLimitState,
  hasDismissedProfilePromptForSession,
  saveTemporaryJourneyRecord,
  saveProfileJourney,
  type ProfileJourneyRecord,
  type GuestLimitState,
  type TemporaryJourneyRecord
} from "@/lib/journey-store";
import {
  getModeLabel,
  type RedefinedResult
} from "@/lib/redefined";
import {
  attachWorkspaceToResult,
  createDefaultBranch,
  createInitialJourney,
  createWorkspaceArtifacts,
  createWorkspaceMeta,
  getUserWorkspaceState
} from "@/lib/workspace";
import type { UserWorkspaceState, WorkspacePersistence } from "@/lib/workspace-types";

type PromptCardProps = {
  visible: boolean;
  showLanding?: boolean;
};

type Mode = (typeof MODES)[number]["id"];

const PROCESSING_START_DELAY = 300;
const PROCESSING_STAGE_DELAY = 900;
const PROCESSING_END_DELAY = 400;
const MIN_PROCESSING_TIME = 4200;
const SLOW_RESPONSE_TIME = 7000;
const DEFAULT_GUEST_LIMIT_STATE: GuestLimitState = {
  count: 0,
  limit: 5,
  hasReachedLimit: false,
  shouldShowSoftReminder: false,
  shouldShowLimitReminder: false,
  shouldShowProfilePrompt: false
};

const processingDescriptions: Record<Mode, string> = {
  understand: "Reading your request and detecting the goal.",
  build: "Structuring the path into clear steps.",
  fix: "Checking for gaps, risks, and likely issues.",
  artifact: "Preparing the output format."
};

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export default function PromptCard({ visible, showLanding = true }: PromptCardProps) {
  const { profile } = useProfile();
  const [promptText, setPromptText] = useState("");
  const [activeMode, setActiveMode] = useState<Mode>("understand");
  const [submittedPrompt, setSubmittedPrompt] = useState("");
  const [submittedMode, setSubmittedMode] = useState<Mode | null>(null);
  const [generatedResult, setGeneratedResult] = useState<RedefinedResult | null>(null);
  const [resultSource, setResultSource] = useState<ResultSource>("ai");
  const [resultDebug, setResultDebug] = useState<ResultDebugInfo | null>(null);
  const [temporaryRecord, setTemporaryRecord] = useState<TemporaryJourneyRecord | null>(null);
  const [profileRecord, setProfileRecord] = useState<ProfileJourneyRecord | null>(null);
  const [guestLimitState, setGuestLimitState] = useState<GuestLimitState>(
    DEFAULT_GUEST_LIMIT_STATE
  );
  const [showProfilePrompt, setShowProfilePrompt] = useState(false);
  const [showTemporaryLimitModal, setShowTemporaryLimitModal] = useState(false);
  const [profilePromptMessage, setProfilePromptMessage] = useState<string | undefined>(undefined);
  const [profilePromptNext, setProfilePromptNext] = useState<string | undefined>(undefined);
  const [activeProjectId] = useState<string | undefined>(() => {
    if (typeof window === "undefined") return undefined;
    return new URLSearchParams(window.location.search).get("projectId") ?? undefined;
  });
  const [sourceWorkspaceId] = useState<string | undefined>(() => {
    if (typeof window === "undefined") return undefined;
    return new URLSearchParams(window.location.search).get("fromWorkspaceId") ?? undefined;
  });
  const [sourceWorkspaceName] = useState<string | undefined>(() => {
    if (typeof window === "undefined") return undefined;
    return new URLSearchParams(window.location.search).get("fromWorkspaceName") ?? undefined;
  });
  const [initialPrompt] = useState<string | undefined>(() => {
    if (typeof window === "undefined") return undefined;
    return new URLSearchParams(window.location.search).get("prompt")?.trim() || undefined;
  });
  const [initialMode] = useState<Mode | undefined>(() => {
    if (typeof window === "undefined") return undefined;
    const value = new URLSearchParams(window.location.search).get("mode");
    return MODES.some((mode) => mode.id === value) ? (value as Mode) : undefined;
  });
  const initialPromptSubmittedRef = useRef(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [creationContext, setCreationContext] = useState("");
  const [processingDescription, setProcessingDescription] = useState("");
  const [arrowMoving, setArrowMoving] = useState(false);
  const [panelVisible, setPanelVisible] = useState(false);
  const [contentChanging, setContentChanging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const cycleTimerRef = useRef<number | undefined>(undefined);
  const resumeTimerRef = useRef<number | undefined>(undefined);
  const slowStatusTimerRef = useRef<number | undefined>(undefined);
  const manualModeRef = useRef<Mode | null>(null);
  const processingRef = useRef(false);
  const currentModeIndexRef = useRef(0);
  const profilePromptTimerRef = useRef<number | undefined>(undefined);
  const persistenceOverrideRef = useRef<WorkspacePersistence | null>(null);

  const activeConfig = useMemo(
    () => MODES.find((mode) => mode.id === activeMode) ?? MODES[0],
    [activeMode]
  );

  const stageStyle = {
    "--active": activeConfig.color,
    "--active-shadow": activeConfig.soft,
    "--active-border": activeConfig.border,
    "--panel-text": activeConfig.panelText,
    "--panel-subtext": activeConfig.panelSubtext
  } as CSSProperties;

  const submittedConfig = useMemo(
    () => MODES.find((mode) => mode.id === submittedMode) ?? activeConfig,
    [activeConfig, submittedMode]
  );

  const refreshWorkspaceState = useCallback(() => {
    const nextGuestLimitState = getGuestLimitState();
    setGuestLimitState(nextGuestLimitState);
    return nextGuestLimitState;
  }, []);

  const userWorkspaceState = useMemo<UserWorkspaceState>(
    () => {
      void profile;
      return getUserWorkspaceState(guestLimitState.count);
    },
    [guestLimitState.count, profile]
  );

  const promptStatusText = useMemo(() => {
    if (userWorkspaceState.state === "profile" || userWorkspaceState.state === "profile_local") {
      return "Profile workspace · saved automatically";
    }

    if (userWorkspaceState.state === "signed_in") {
      return "Profile workspace · Synced";
    }

    if (userWorkspaceState.state === "guest_hard_limit" || userWorkspaceState.state === "guest_limit_reached") {
      return "Profile required to save more workspaces";
    }

    if (userWorkspaceState.state === "guest_near_limit") {
      return "Temporary workspace 5 of 5 · Create a profile to keep your workspaces";
    }

    if (userWorkspaceState.state === "guest_grace") {
      return `Reminder workspace ${userWorkspaceState.tempCount - userWorkspaceState.tempLimit + 1} of ${userWorkspaceState.graceLimit} · Create a profile soon`;
    }

    return `Temporary workspace ${userWorkspaceState.tempCount + 1} of ${userWorkspaceState.tempLimit}`;
  }, [userWorkspaceState]);

  const selectMode = useCallback((mode: Mode) => {
    setActiveMode(mode);
    setArrowMoving(true);
    setPanelVisible(true);

    window.setTimeout(() => {
      setArrowMoving(false);
    }, 720);
  }, []);

  const selectModeWithContentTransition = useCallback((mode: Mode) => {
    setContentChanging(true);

    window.setTimeout(() => {
      selectMode(mode);
      setContentChanging(false);
    }, 160);
  }, [selectMode]);

  const stopAutoCycle = useCallback(() => {
    if (cycleTimerRef.current !== undefined) {
      window.clearInterval(cycleTimerRef.current);
      cycleTimerRef.current = undefined;
    }
  }, []);

  const startAutoCycle = useCallback(() => {
    if (processingRef.current) return;

    stopAutoCycle();

    cycleTimerRef.current = window.setInterval(() => {
      currentModeIndexRef.current = (currentModeIndexRef.current + 1) % MODES.length;
      selectModeWithContentTransition(MODES[currentModeIndexRef.current].id);
    }, 2500);
  }, [selectModeWithContentTransition, stopAutoCycle]);

  const handleModeChange = useCallback((mode: Mode) => {
    if (processingRef.current) return;

    const modeIndex = MODES.findIndex((item) => item.id === mode);
    if (modeIndex !== -1) currentModeIndexRef.current = modeIndex;
    manualModeRef.current = mode;
    if (submittedPrompt) setSubmittedMode(mode);

    stopAutoCycle();
    if (resumeTimerRef.current !== undefined) {
      window.clearTimeout(resumeTimerRef.current);
    }

    selectModeWithContentTransition(mode);
    if (!submittedPrompt) {
      resumeTimerRef.current = window.setTimeout(() => {
        startAutoCycle();
      }, 6000);
    }
  }, [selectModeWithContentTransition, startAutoCycle, stopAutoCycle, submittedPrompt]);

  const handleSubmit = useCallback(async (event?: FormEvent<HTMLFormElement>, promptOverride?: string) => {
    event?.preventDefault();

    if (processingRef.current) return;

    const cleanPrompt = (promptOverride ?? promptText).trim();
    if (!cleanPrompt) {
      inputRef.current?.focus();
      return;
    }

    const persistenceOverride = persistenceOverrideRef.current;
    persistenceOverrideRef.current = null;
    const preSubmitGuestLimitState = refreshWorkspaceState();
    const preSubmitUserState = getUserWorkspaceState(preSubmitGuestLimitState.count);

    if (
      (preSubmitUserState.state === "guest_hard_limit" ||
        preSubmitUserState.state === "guest_limit_reached") &&
      persistenceOverride !== "unsaved"
    ) {
      setShowTemporaryLimitModal(true);
      return;
    }

    stopAutoCycle();
    if (resumeTimerRef.current !== undefined) {
      window.clearTimeout(resumeTimerRef.current);
    }
    if (slowStatusTimerRef.current !== undefined) {
      window.clearTimeout(slowStatusTimerRef.current);
    }

    processingRef.current = true;
    const selectedMode = manualModeRef.current;
    const startedAt = Date.now();

    setPanelVisible(true);
    setProcessingDescription("");
    setSubmittedMode(null);
    setSubmittedPrompt("");
    setGeneratedResult(null);
    setResultSource("ai");
    setResultDebug(null);
    setTemporaryRecord(null);
    setProfileRecord(null);
    setShowProfilePrompt(false);
    setShowTemporaryLimitModal(false);
    setProfilePromptMessage(undefined);
    setProfilePromptNext(undefined);
    setIsSubmitting(true);

    if (persistenceOverride !== "unsaved") {
      const targetProjectId =
        activeProjectId ?? ensureDefaultProjects(profile?.id).myWorkspaces?.id;
      const targetProjectName = targetProjectId
        ? getProjects(profile?.id).find((project) => project.id === targetProjectId)?.name
        : undefined;
      setCreationContext(
        targetProjectName ? `Creating workspace in ${targetProjectName}...` : ""
      );
    } else {
      setCreationContext("");
    }

    slowStatusTimerRef.current = window.setTimeout(() => {
      if (processingRef.current) {
        setProcessingDescription("Still preparing your path...");
      }
    }, SLOW_RESPONSE_TIME);

    await wait(PROCESSING_START_DELAY);

    for (const mode of MODES) {
      if (!processingRef.current) return;

      setContentChanging(true);
      await wait(160);
      if (!processingRef.current) return;

      selectMode(mode.id);
      setProcessingDescription(processingDescriptions[mode.id]);
      setContentChanging(false);
      await wait(PROCESSING_STAGE_DELAY);
    }

    const elapsed = Date.now() - startedAt;
    if (elapsed < MIN_PROCESSING_TIME) {
      await wait(MIN_PROCESSING_TIME - elapsed);
    }

    let result: RedefinedResult;
    let source: ResultSource = "ai";
    let debug: ResultDebugInfo | null = null;
    try {
      const response = await fetch("/api/redefine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: cleanPrompt, selectedMode })
      });

      if (!response.ok) {
        throw new Error("Failed to prepare structured result.");
      }

      const payload = (await response.json()) as {
        result: RedefinedResult;
        source: ResultSource;
        warning?: string;
        debug?: ResultDebugInfo;
      };

      result = payload.result;
      source = payload.source;
      debug = payload.debug ?? null;
    } catch {
      if (slowStatusTimerRef.current !== undefined) {
        window.clearTimeout(slowStatusTimerRef.current);
        slowStatusTimerRef.current = undefined;
      }
      setProcessingDescription("We could not prepare the path. Try again.");
      setCreationContext("");
      setIsSubmitting(false);
      processingRef.current = false;
      inputRef.current?.focus();
      return;
    }

    if (!processingRef.current) return;

    await wait(PROCESSING_END_DELAY);

    if (slowStatusTimerRef.current !== undefined) {
      window.clearTimeout(slowStatusTimerRef.current);
      slowStatusTimerRef.current = undefined;
    }

    const finalModeIndex = MODES.findIndex((mode) => mode.id === result.mode);
    if (finalModeIndex !== -1) currentModeIndexRef.current = finalModeIndex;

    setContentChanging(true);
    await wait(160);
    selectMode(result.mode);
    setSubmittedMode(result.mode);
    setSubmittedPrompt(cleanPrompt);
    setResultSource(source);
    setResultDebug(debug);

    const now = new Date().toISOString();
    const effectivePersistence = persistenceOverride === "unsaved" ? "unsaved" : undefined;
    const branch = createDefaultBranch(result, cleanPrompt, now);
    // No project selected: profile workspaces land in My Workspaces by default;
    // guests only if a local My Workspaces project already exists.
    const defaultProjectId =
      !activeProjectId && effectivePersistence !== "unsaved"
        ? ensureDefaultProjects(profile?.id).myWorkspaces?.id
        : undefined;
    const effectiveProjectId = activeProjectId ?? defaultProjectId;
    const workspaceMeta = createWorkspaceMeta({
      result,
      prompt: cleanPrompt,
      userState: preSubmitUserState,
      currentBranchId: branch.id,
      persistence: effectivePersistence,
      projectId: effectiveProjectId,
      createdFromWorkspaceId: sourceWorkspaceId
    });
    const journey = createInitialJourney(branch);
    const workspaceArtifacts = createWorkspaceArtifacts(result, branch, now);
    const workspaceResult = attachWorkspaceToResult({
      result: {
        ...result,
        originalPrompt: result.originalPrompt ?? cleanPrompt
      },
      workspaceMeta,
      branches: [branch],
      journey,
      artifacts: workspaceArtifacts
    });

    let nextWorkspaceResult = workspaceResult;

    if (workspaceMeta.persistence === "local_profile" && profile) {
      const record = saveProfileJourney(workspaceResult, profile.id, source);
      if (activeProjectId) {
        nextWorkspaceResult = addWorkspaceToProject(workspaceMeta.workspaceId, activeProjectId, profile.id) ?? workspaceResult;
      } else if (effectiveProjectId) {
        assignWorkspaceToProjectSilently(workspaceMeta.workspaceId, effectiveProjectId, profile.id);
      }
      setProfileRecord(record);
      setTemporaryRecord(null);
    } else if (workspaceMeta.persistence === "temporary") {
      const record = saveTemporaryJourneyRecord(workspaceResult);
      if (activeProjectId) {
        nextWorkspaceResult = addWorkspaceToProject(workspaceMeta.workspaceId, activeProjectId) ?? workspaceResult;
      } else if (effectiveProjectId) {
        assignWorkspaceToProjectSilently(workspaceMeta.workspaceId, effectiveProjectId);
      }
      setTemporaryRecord(record);
      setProfileRecord(null);
    } else {
      setTemporaryRecord(null);
      setProfileRecord(null);
    }

    setGeneratedResult(nextWorkspaceResult);

    const nextGuestLimitState = refreshWorkspaceState();
    if (!profile && nextGuestLimitState.shouldShowProfilePrompt && !hasDismissedProfilePromptForSession()) {
      profilePromptTimerRef.current = window.setTimeout(() => {
        setShowProfilePrompt(true);
      }, 500);
    }
    setProcessingDescription("");
    setCreationContext("");
    setContentChanging(false);
    setIsSubmitting(false);
    processingRef.current = false;
    window.setTimeout(() => {
      inputRef.current?.focus();
    }, 0);
  }, [activeProjectId, profile, promptText, refreshWorkspaceState, selectMode, sourceWorkspaceId, stopAutoCycle]);

  const {
    voiceInputState,
    voiceStatusMessage,
    handleVoiceInputClick
  } = useVoiceRecorder({
    onTranscript: (transcript) => {
      setPromptText(transcript);
      window.setTimeout(() => inputRef.current?.focus(), 0);
    },
    listeningMessage: "Listening...",
    transcribingMessage: "Transcribing...",
    readyMessage: "Transcript ready",
    errorMessage: "Could not transcribe audio"
  });

  useEffect(() => {
    if (!visible) return undefined;

    const panelTimer = window.setTimeout(() => {
      setPanelVisible(true);
      selectMode("understand");
    }, 900);

    const cycleStartTimer = window.setTimeout(() => {
      startAutoCycle();
    }, 2100);

    return () => {
      window.clearTimeout(panelTimer);
      window.clearTimeout(cycleStartTimer);
      stopAutoCycle();
      if (resumeTimerRef.current !== undefined) {
        window.clearTimeout(resumeTimerRef.current);
      }
      if (slowStatusTimerRef.current !== undefined) {
        window.clearTimeout(slowStatusTimerRef.current);
      }
      if (profilePromptTimerRef.current !== undefined) {
        window.clearTimeout(profilePromptTimerRef.current);
      }
      processingRef.current = false;
    };
  }, [selectMode, startAutoCycle, stopAutoCycle, visible]);

  useEffect(() => {
    const hydrationTimer = window.setTimeout(() => {
      refreshWorkspaceState();
    }, 0);

    return () => {
      window.clearTimeout(hydrationTimer);
    };
  }, [refreshWorkspaceState]);

  useEffect(() => {
    document.body.classList.remove(
      "stage-understand",
      "stage-build",
      "stage-fix",
      "stage-artifact"
    );
    document.body.classList.add(`stage-${activeMode}`);

    return () => {
      document.body.classList.remove(`stage-${activeMode}`);
    };
  }, [activeMode]);

  const runPrompt = useCallback((prompt: string) => {
    if (processingRef.current) return;
    setPromptText(prompt);
    const lenis = window.__lenis;
    if (lenis) {
      lenis.scrollTo(0);
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
    window.setTimeout(() => {
      void handleSubmit(undefined, prompt);
    }, 700);
  }, [handleSubmit]);

  useEffect(() => {
    if (!visible || !initialPrompt || initialPromptSubmittedRef.current) return;

    initialPromptSubmittedRef.current = true;
    if (initialMode) manualModeRef.current = initialMode;
    setPromptText(initialPrompt);
    window.setTimeout(() => {
      void handleSubmit(undefined, initialPrompt);
    }, 600);
  }, [visible, initialPrompt, initialMode, handleSubmit]);

  const handleCreateProfile = useCallback(() => {
    if (profilePromptNext) {
      window.location.href = `/signup?next=${profilePromptNext}`;
      return;
    }

    const pending = promptText.trim();
    window.location.href = pending
      ? `/signup?next=${encodeURIComponent(`/dashboard?prompt=${encodeURIComponent(pending)}`)}`
      : "/signup";
  }, [profilePromptNext, promptText]);

  const handleSignIn = useCallback(() => {
    const pending = promptText.trim();
    window.location.href = pending
      ? `/login?next=${encodeURIComponent(`/dashboard?prompt=${encodeURIComponent(pending)}`)}`
      : "/login";
  }, [promptText]);

  const handleContinueAsGuest = useCallback(() => {
    dismissProfilePromptForSession();
    setShowProfilePrompt(false);
  }, []);

  const handleContinueWithoutSaving = useCallback(() => {
    persistenceOverrideRef.current = "unsaved";
    setShowTemporaryLimitModal(false);
    void handleSubmit();
  }, [handleSubmit]);

  const handleClearTemporaryWorkspaces = useCallback(() => {
    clearTemporaryJourneyRecords();
    refreshWorkspaceState();
    setShowTemporaryLimitModal(false);
    void handleSubmit();
  }, [handleSubmit, refreshWorkspaceState]);

  const handleRequireProfile = useCallback((message?: string, next?: string) => {
    setProfilePromptMessage(message);
    setProfilePromptNext(next);
    setShowProfilePrompt(true);
  }, []);

  const handleWorkspaceAction = useCallback(async (prompt: string, sourceResult: RedefinedResult) => {
    if (processingRef.current) return;

    stopAutoCycle();
    if (resumeTimerRef.current !== undefined) {
      window.clearTimeout(resumeTimerRef.current);
    }
    if (slowStatusTimerRef.current !== undefined) {
      window.clearTimeout(slowStatusTimerRef.current);
    }

    processingRef.current = true;
    setIsSubmitting(true);
    setProcessingDescription("Preparing the output format.");

    const sourceContext = {
      sourceMode: sourceResult.mode,
      sourceTitle: sourceResult.title,
      keyInputs: (sourceResult.requiredInputs ?? [])
        .filter((inp) => inp.status === "provided")
        .map((inp) => inp.label),
      assumptions: (sourceResult.qualityChecklist ?? []).map((item) => item.item)
    };

    try {
      const response = await fetch("/api/redefine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, sourceContext })
      });

      if (!response.ok) throw new Error("Failed to generate artifact.");

      const payload = (await response.json()) as {
        result: RedefinedResult;
        source: ResultSource;
        warning?: string;
        debug?: ResultDebugInfo;
      };

      const finalModeIndex = MODES.findIndex((mode) => mode.id === payload.result.mode);
      if (finalModeIndex !== -1) currentModeIndexRef.current = finalModeIndex;

      const now = new Date().toISOString();
      const branch = createDefaultBranch(payload.result, prompt, now);
      const userState = getUserWorkspaceState(getGuestLimitState().count);
      const workspaceMeta = createWorkspaceMeta({
        result: payload.result,
        prompt,
        userState,
        currentBranchId: branch.id,
        persistence: "unsaved"
      });
      const workspaceResult = attachWorkspaceToResult({
        result: {
          ...payload.result,
          originalPrompt: payload.result.originalPrompt ?? prompt
        },
        workspaceMeta,
        branches: [branch],
        journey: createInitialJourney(branch),
        artifacts: createWorkspaceArtifacts(payload.result, branch, now)
      });

      selectMode(payload.result.mode);
      setSubmittedMode(payload.result.mode);
      setSubmittedPrompt(prompt);
      setGeneratedResult(workspaceResult);
      setResultSource(payload.source);
      setResultDebug(payload.debug ?? null);
    } catch {
      setProcessingDescription("Could not generate artifact. Try again.");
      window.setTimeout(() => setProcessingDescription(""), 3000);
    } finally {
      setIsSubmitting(false);
      processingRef.current = false;
    }
  }, [selectMode, stopAutoCycle]);

  return (
    <>
    <main
      className={`page${visible ? " visible" : ""}${!generatedResult && showLanding ? " landing-hero" : ""}`}
      style={stageStyle}
    >
      <section
        className={`hero${generatedResult ? " has-result" : ""}`}
        aria-label="Doc/ReDefined hero"
      >
        <section className="hero-copy">
          <h1 aria-label="Make anything make sense.">
            <span className="line"><span>Make anything</span></span>
            <span className="line">
              <span>
                make{" "}
                <em className="accent">
                  sense.
                  <svg viewBox="0 0 200 24" preserveAspectRatio="none" aria-hidden="true">
                    <path d="M6 16 C 40 6, 70 20, 104 12 C 138 4, 168 16, 194 10" />
                  </svg>
                </em>
              </span>
            </span>
          </h1>

          <p className="hero-subtitle">One prompt. Four paths. Zero blank pages.</p>
        </section>

        {!generatedResult ? (
        <section className="command-scene" aria-label="Doc/ReDefined command surface">
          <h2 className="prompt-title">What do you want to redefine?</h2>

          {sourceWorkspaceName ? (
            <p className="prompt-related-context">
              Creating related workspace from <strong>{sourceWorkspaceName}</strong>
            </p>
          ) : null}

          <form
            className={`command-strip${isSubmitting ? " processing" : ""}`}
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
              placeholder="Create a cloud security checklist"
              autoComplete="off"
              disabled={isSubmitting}
              onChange={(event) => setPromptText(event.target.value)}
            />
            <button
              className={`command-enter${promptText.trim() ? " ready" : ""}`}
              type="submit"
              aria-label="Prepare path"
              disabled={isSubmitting}
            >
              &#x21b5;
            </button>
            <button
              className={`prompt-voice-button is-${voiceInputState}`}
              type="button"
              aria-label={voiceInputState === "recording" ? "Stop voice input" : "Start voice input"}
              title={voiceInputState === "recording" ? "Stop recording" : "Speak prompt"}
              disabled={isSubmitting || voiceInputState === "transcribing"}
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

          <div
            className={`prompt-workspace-status prompt-workspace-status-${userWorkspaceState.state}`}
            aria-live="polite"
          >
            {promptStatusText}
          </div>

          {userWorkspaceState.state === "guest_near_limit" ? (
            <p className="prompt-workspace-reminder">
              You have 5 temporary workspaces. Create a profile to keep your records.
            </p>
          ) : null}

          {userWorkspaceState.state === "guest_grace" ? (
            <p className="prompt-workspace-reminder prompt-workspace-reminder-strong">
              You have {userWorkspaceState.hardLimit - userWorkspaceState.tempCount} workspace saves left before a profile is required.
            </p>
          ) : null}

          {userWorkspaceState.state === "guest_hard_limit" || userWorkspaceState.state === "guest_limit_reached" ? (
            <p className="prompt-workspace-reminder prompt-workspace-reminder-strong">
              Create a profile to continue saving new workspaces.
            </p>
          ) : null}

          <div
            className={`processing-status${isSubmitting ? " visible" : ""}`}
            aria-live="polite"
          >
            {creationContext || processingDescription || "Redefining request..."}
          </div>

          <ModeButtons
            activeMode={activeMode}
            moving={arrowMoving}
            onModeChange={handleModeChange}
          />

          <section
            className={`path-panel${panelVisible ? " visible" : ""}`}
            aria-label="Prepared path"
          >
            <div className="path-label">Path prepared</div>
            <div className={`active-stage${contentChanging ? " content-changing" : ""}`}>
              {submittedPrompt ? submittedConfig.label : activeConfig.label}
            </div>
            <p className={contentChanging ? "content-changing" : ""}>
              {isSubmitting
                ? processingDescription || "Redefining request..."
                : submittedPrompt || activeConfig.description}
            </p>
          </section>
        </section>
        ) : null}


        {generatedResult ? (
          <section
            className={`result-preview result-slot${generatedResult.mode === "fix" ? " fix-result-preview" : ""} visible`}
            aria-label={`Generated Doc/ReDefined ${getModeLabel(generatedResult.mode)} workspace`}
          >
            {!profile && (guestLimitState.shouldShowSoftReminder || guestLimitState.shouldShowLimitReminder) && (
              <GuestWorkspaceReminder
                count={guestLimitState.count}
                limit={guestLimitState.limit}
                onCreateProfile={handleCreateProfile}
              />
            )}
            <ResultDebugPanel debug={resultDebug} />
            <ResultRouter
              result={generatedResult}
              source={resultSource}
              temporaryRecord={temporaryRecord}
              profileRecord={profileRecord}
              guestLimitState={guestLimitState}
              onRequireProfile={handleRequireProfile}
              onGenerateArtifact={handleWorkspaceAction}
              onResultChange={setGeneratedResult}
            />
          </section>
        ) : null}
      </section>

      <ProfilePromptModal
        open={showProfilePrompt}
        count={guestLimitState.count}
        limit={guestLimitState.limit}
        message={profilePromptMessage}
        onCreateProfile={handleCreateProfile}
        onContinueAsGuest={handleContinueAsGuest}
      />
      <TemporaryLimitModal
        open={showTemporaryLimitModal}
        count={guestLimitState.count}
        limit={guestLimitState.limit}
        onCreateProfile={handleCreateProfile}
        onSignIn={handleSignIn}
        onContinueWithoutSaving={handleContinueWithoutSaving}
        onClearTemporaryWorkspaces={handleClearTemporaryWorkspaces}
      />
    </main>

    {!generatedResult && showLanding ? <LandingSections onRunPrompt={runPrompt} /> : null}
    </>
  );
}
