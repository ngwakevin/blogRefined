"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { DASHBOARD_CHANGED_EVENT } from "@/components/dashboard/DashboardModals";
import { useProfile } from "@/components/profile/useProfile";
import { useVoiceRecorder } from "@/components/voice/useVoiceRecorder";
import { SECTION_DEFAULTS } from "@/lib/dashboard-store";
import { createWorkspaceShell, ensureDefaultProjects } from "@/lib/journey-store";
import { generateWorkspaceNameFromPrompt } from "@/lib/workspace";

const SUGGESTED_PROMPTS: Array<{ text: string; color: string; icon: ReactNode }> = [
  {
    text: "What is Azure Private Endpoint?",
    color: "#ded7fb",
    icon: (
      <svg viewBox="0 0 20 20"><path d="m10 2 1.6 4.4L16 8l-4.4 1.6L10 14l-1.6-4.4L4 8l4.4-1.6Z" /><path d="m15.5 12.5.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8Z" /></svg>
    )
  },
  {
    text: "How do I draft a business plan?",
    color: "#d3ecff",
    icon: (
      <svg viewBox="0 0 20 20"><path d="M5 2.5h7l3 3v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1Z" /><path d="M7 9h6M7 12h6M7 15h4" fill="none" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" /></svg>
    )
  },
  {
    text: "I cannot access Azure Storage",
    color: "#fbeab8",
    icon: (
      <svg viewBox="0 0 20 20"><path d="M13.8 3.2a4.3 4.3 0 0 0-4.6 6L3.5 14.9a1.4 1.4 0 0 0 0 2 1.4 1.4 0 0 0 2 0l5.6-5.7a4.3 4.3 0 0 0 6-4.6l-2.6 2.6-2.4-.7-.7-2.4Z" /></svg>
    )
  },
  {
    text: "Create a cloud security checklist",
    color: "#cdf3de",
    icon: (
      <svg viewBox="0 0 20 20"><rect x="3" y="3" width="14" height="14" rx="3" /><path d="m6.5 10 2.2 2.2L13.5 7.5" fill="none" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
    )
  }
];

export function DashboardPrompt() {
  const router = useRouter();
  const { profile } = useProfile();
  const [promptValue, setPromptValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const { voiceInputState, voiceStatusMessage, handleVoiceInputClick, isVoiceBusy } =
    useVoiceRecorder({
      onTranscript: (transcript) => {
        setPromptValue(transcript);
        inputRef.current?.focus();
      },
      listeningMessage: "Listening... tap to stop",
      transcribingMessage: "Transcribing...",
      readyMessage: "Transcript ready — press enter to redefine",
      errorMessage: "Voice input failed. You can type instead."
    });

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const clean = promptValue.trim();
    if (!clean) {
      inputRef.current?.focus();
      return;
    }

    const profileId = profile?.id;
    const defaultProject = profileId ? ensureDefaultProjects(profileId).myWorkspaces : null;
    const shell = createWorkspaceShell({
      workspaceName: generateWorkspaceNameFromPrompt(clean, "auto"),
      preferredMode: "auto",
      projectId: defaultProject?.id,
      createdFrom: "dashboard_quick_prompt",
      sections: SECTION_DEFAULTS.auto,
      terminalPrefill: clean,
      autoRunFirstPrompt: true,
      profileId
    });
    window.dispatchEvent(new CustomEvent(DASHBOARD_CHANGED_EVENT));
    setPromptValue("");
    router.push(`/workspaces/${encodeURIComponent(shell.workspaceId)}`);
  };

  const fillPrompt = (prompt: string) => {
    setPromptValue(prompt);
    inputRef.current?.focus();
  };

  return (
    <div className="dash-prompt-zone">
      <form className="dash-prompt" onSubmit={handleSubmit} aria-label="Create workspace">
        <span className="dash-prompt-plus" aria-hidden="true">+</span>
        <input
          ref={inputRef}
          type="text"
          value={promptValue}
          placeholder="Search or ask Doc/ReDefined anything..."
          autoComplete="off"
          onChange={(event) => setPromptValue(event.target.value)}
        />
        <kbd className="dash-prompt-kbd" aria-hidden="true">&#8984;K</kbd>
        <button
          type="button"
          className={`dash-mic${voiceInputState === "recording" ? " recording" : ""}`}
          aria-label={voiceInputState === "recording" ? "Stop recording" : "Use voice input"}
          disabled={voiceInputState === "transcribing"}
          onClick={handleVoiceInputClick}
        >
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <rect x="8" y="3" width="4" height="9" rx="2" />
            <path d="M5 9.5a5 5 0 0 0 10 0M10 14.5V17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
        </button>
      </form>

      {voiceStatusMessage && (isVoiceBusy || voiceInputState === "error" || voiceInputState === "ready") ? (
        <p className="dash-voice-status" aria-live="polite">{voiceStatusMessage}</p>
      ) : null}

      <div className="dash-suggest-row" aria-label="Suggested prompts">
        {SUGGESTED_PROMPTS.map((item) => (
          <button key={item.text} type="button" onClick={() => fillPrompt(item.text)}>
            <span
              className="dash-suggest-icon"
              style={{ background: item.color }}
              aria-hidden="true"
            >
              {item.icon}
            </span>
            <span>{item.text}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
