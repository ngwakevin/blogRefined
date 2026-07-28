"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { promptUpgrade } from "@/components/billing/UpgradeModal";
import { DASHBOARD_CHANGED_EVENT } from "@/components/dashboard/DashboardModals";
import { canRunPrompt, getAccount, incrementUsage } from "@/lib/account-store";
import { MODES } from "@/lib/constants";
import { persistWorkspaceResult } from "@/lib/journey-store";
import type { RedefinedResult, WorkspaceFollowUpResult } from "@/lib/redefined";
import {
  buildFollowUpContextPrompt,
  followUpTitle,
  newFollowUpResultId,
  newPromptRunId,
  resolveFollowUpMode,
  withPromptRunCompleted,
  withPromptRunFailed,
  withPromptRunStarted
} from "@/lib/workspace-followup";
import type {
  WorkspacePreferredMode,
  WorkspacePromptRun
} from "@/lib/workspace-types";
import { pickFollowUpSection } from "@/lib/workspace-followup";

type WorkspaceFollowUpProps = {
  result: RedefinedResult;
  recordId?: string;
  profileId?: string;
  onResultChange?: (result: RedefinedResult) => void;
};

function FollowUpContent({ content }: { content: RedefinedResult }) {
  const commands = content.diagnosticTerminal?.commands ?? [];
  const blocks = content.coreBuildingBlocks ?? [];

  return (
    <div className="ws-fu-content">
      {content.summary ? <p>{content.summary}</p> : null}

      {commands.length > 0 ? (
        <pre className="ws-fu-pre">{commands.map((command) => command.command).join("\n")}</pre>
      ) : null}

      {content.artifactPreview?.body ? (
        <pre className="ws-fu-pre">{content.artifactPreview.body}</pre>
      ) : null}

      {content.sections.length > 0 ? (
        <ul className="ws-fu-list">
          {content.sections.slice(0, 6).map((section, index) =>
            section.type === "checklist" ? (
              section.items.slice(0, 8).map((item, itemIndex) => (
                <li key={`${index}-${itemIndex}`}>{item}</li>
              ))
            ) : (
              <li key={index}>
                <strong>{section.title}</strong>
                {"description" in section && section.description ? ` — ${section.description}` : null}
              </li>
            )
          )}
        </ul>
      ) : null}

      {blocks.length > 0 ? (
        <ul className="ws-fu-list">
          {blocks.slice(0, 6).map((block) => (
            <li key={block.id}>
              <strong>{block.title}</strong>
              {block.description ? ` — ${block.description}` : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

const QUICK_ACTIONS = [
  { label: "Generate summary", prompt: "Generate a concise summary of this workspace." },
  { label: "Generate runbook", prompt: "Generate a practical runbook from this workspace." },
  { label: "Create checklist", prompt: "Create a checklist from this workspace." },
  { label: "Draft ticket update", prompt: "Draft a ticket update for this workspace." }
];

export function WorkspaceFollowUp({
  result,
  recordId,
  profileId,
  onResultChange
}: WorkspaceFollowUpProps) {
  const [prompt, setPrompt] = useState("");
  const initialMode = result.workspaceMeta?.preferredMode ?? result.mode;
  const [mode, setMode] = useState<WorkspacePreferredMode>(initialMode);
  const [targetSectionId, setTargetSectionId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [moreActionsOpen, setMoreActionsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const moreActionsRef = useRef<HTMLDivElement>(null);

  const sections = useMemo(() => result.workspaceSections ?? [], [result.workspaceSections]);
  const followUps = useMemo(
    () => result.workspaceFollowUpResults ?? [],
    [result.workspaceFollowUpResults]
  );
  const sectionOptions = useMemo(
    () => [
      { id: "", label: "Whole workspace" },
      ...sections.map((section) => ({
        id: section.id,
        label: section.title
      }))
    ],
    [sections]
  );

  const selectedFollowUp = useMemo(() => {
    if (followUps.length === 0) return null;
    if (selectedRunId) {
      const match = followUps.find((entry) => entry.promptRunId === selectedRunId);
      if (match) return match;
    }
    return followUps[followUps.length - 1];
  }, [followUps, selectedRunId]);

  useEffect(() => {
    if (!moreActionsOpen) return undefined;
    const onDocClick = (event: MouseEvent) => {
      if (!moreActionsRef.current?.contains(event.target as Node)) {
        setMoreActionsOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [moreActionsOpen]);

  const prefillPrompt = useCallback((value: string) => {
    setPrompt(value);
    setError("");
    inputRef.current?.focus();
  }, []);

  const runFollowUp = useCallback(async () => {
    if (running) return;
    const clean = prompt.trim();
    if (!clean) {
      inputRef.current?.focus();
      setError("Enter a follow-up to run.");
      return;
    }

    const account = getAccount();
    const gate = canRunPrompt(account);
    if (!gate.allowed) {
      promptUpgrade("Prompt run limit reached", gate, account.currentPlanId);
      return;
    }

    setRunning(true);
    setError("");

    const resolvedMode = resolveFollowUpMode(mode, result.mode);
    const section = pickFollowUpSection(sections, {
      sectionId: targetSectionId ?? undefined,
      mode: resolvedMode
    });

    const now = new Date().toISOString();
    const runId = newPromptRunId();
    const run: WorkspacePromptRun = {
      id: runId,
      workspaceId: result.workspaceMeta?.workspaceId ?? result.id,
      prompt: clean,
      mode,
      status: "running",
      sectionId: section?.id,
      createdAt: now
    };

    // Persist the running state immediately so it survives a mid-run reload.
    const startedResult = withPromptRunStarted(result, run);
    onResultChange?.(startedResult);
    persistWorkspaceResult({ result: startedResult, recordId, profileId });

    try {
      const augmentedPrompt = buildFollowUpContextPrompt({ result, prompt: clean, section });
      const response = await fetch("/api/redefine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: augmentedPrompt,
          selectedMode: mode === "auto" ? undefined : resolvedMode,
          workspaceId: run.workspaceId,
          workspaceName: result.workspaceMeta?.workspaceName,
          projectId: result.workspaceMeta?.projectId,
          sourceContext: {
            sourceMode: result.mode,
            sourceTitle: result.workspaceMeta?.workspaceName ?? result.title,
            keyInputs: [result.workspaceMeta?.originalPrompt ?? result.originalPrompt ?? ""].filter(
              Boolean
            )
          }
        })
      });

      if (!response.ok) throw new Error("Follow-up request failed.");
      const payload = (await response.json()) as { result: RedefinedResult };

      const followUp: WorkspaceFollowUpResult = {
        id: newFollowUpResultId(),
        workspaceId: run.workspaceId,
        promptRunId: runId,
        mode: payload.result.mode,
        title: followUpTitle(clean),
        summary: payload.result.summary ?? "",
        content: { ...payload.result, promptRunId: runId },
        sectionId: section?.id,
        createdAt: new Date().toISOString()
      };

      const completedResult = withPromptRunCompleted(startedResult, { runId, followUp, section });
      onResultChange?.(completedResult);
      persistWorkspaceResult({ result: completedResult, recordId, profileId });
      window.dispatchEvent(new Event(DASHBOARD_CHANGED_EVENT));
      incrementUsage("promptRunsThisMonth");

      setSelectedRunId(runId);
      setPrompt("");
    } catch {
      const failedResult = withPromptRunFailed(startedResult, runId);
      onResultChange?.(failedResult);
      persistWorkspaceResult({ result: failedResult, recordId, profileId });
      setError("Follow-up failed. Your workspace is safe — edit and retry.");
    } finally {
      setRunning(false);
    }
  }, [
    mode,
    profileId,
    prompt,
    recordId,
    result,
    running,
    sections,
    onResultChange,
    targetSectionId
  ]);

  useEffect(() => {
    const handlePrefill = (event: Event) => {
      const detail = (event as CustomEvent<{ prompt?: string }>).detail;
      if (!detail?.prompt) return;
      setPrompt(detail.prompt);
      setError("");
      inputRef.current?.focus();
    };

    window.addEventListener("workspace:prefill-follow-up", handlePrefill as EventListener);
    return () => window.removeEventListener("workspace:prefill-follow-up", handlePrefill as EventListener);
  }, []);

  return (
    <section className="ws-followup" aria-label="Continue in this workspace">
      <section className={`ws-followup-scene${running ? " is-running" : ""}`} aria-label="Run a follow-up prompt in this workspace">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void runFollowUp();
          }}
        >
          <div className="command-strip" aria-label="Workspace follow-up command">
            <span className="command-plus" aria-hidden="true">+</span>
            <input
              ref={inputRef}
              className="prompt-input"
              type="text"
              value={prompt}
              placeholder="Ask a follow-up, generate an artifact, or expand this workspace..."
              autoComplete="off"
              disabled={running}
              onChange={(event) => {
                setPrompt(event.target.value);
                if (error) setError("");
              }}
            />
            <div className="ws-followup-more" ref={moreActionsRef}>
              <button
                className="ws-followup-actions-button"
                type="button"
                aria-expanded={moreActionsOpen}
                onClick={() => setMoreActionsOpen((open) => !open)}
              >
                Actions
              </button>
              {moreActionsOpen ? (
                <div className="ws-followup-menu" role="menu">
                  {QUICK_ACTIONS.map((action) => (
                    <button
                      key={action.label}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMoreActionsOpen(false);
                        prefillPrompt(action.prompt);
                      }}
                    >
                      {action.label}
                    </button>
                  ))}
                  <div className="ws-followup-menu-section">
                    <span>Change mode</span>
                    <div className="ws-followup-mode-grid">
                      {["auto", ...MODES.map((item) => item.id)].map((item) => (
                        <button
                          key={item}
                          type="button"
                          className={mode === item ? "active" : ""}
                          onClick={() => setMode(item as WorkspacePreferredMode)}
                        >
                          {item}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="ws-followup-menu-section">
                    <span>Target section</span>
                    <label className="ws-followup-select">
                      <span className="sr-only">Target section</span>
                      <select
                        value={targetSectionId ?? ""}
                        disabled={running}
                        onChange={(event) => setTargetSectionId(event.target.value || null)}
                      >
                        {sectionOptions.map((section) => (
                          <option key={section.id || "whole"} value={section.id}>
                            {section.id ? section.label : "Whole workspace"}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>
              ) : null}
            </div>
            <button
              className={`ws-followup-send${prompt.trim() && !running ? " ready" : ""}`}
              type="submit"
              disabled={running}
            >
              Send
            </button>
          </div>

          {error ? (
            <div className="ws-followup-error" role="alert">
              <span>{error}</span>
              <button type="button" onClick={() => void runFollowUp()}>
                Retry
              </button>
            </div>
          ) : null}

          {running ? (
            <div className="ws-followup-running-note" aria-live="polite">
              <span className="ws-terminal-spinner" aria-hidden="true" />
              <span>Running follow-up…</span>
            </div>
          ) : null}
        </form>
      </section>

      {selectedFollowUp ? (
        <article className="ws-followup-latest" aria-label="Follow-up response">
          <div className="ws-followup-latest-head">
            <span className={`ws-followup-badge ws-followup-badge-${selectedFollowUp.mode}`}>
              {selectedFollowUp.mode}
            </span>
            <h4>{selectedFollowUp.title}</h4>
          </div>
          <FollowUpContent content={selectedFollowUp.content} />
        </article>
      ) : null}

    </section>
  );
}
