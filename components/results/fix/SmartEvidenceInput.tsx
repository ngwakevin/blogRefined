"use client";

import { FormEvent, useState } from "react";
import { useVoiceRecorder } from "@/components/voice/useVoiceRecorder";
import { parseEvidenceSignals } from "@/lib/evidence";
import type { EvidenceBranch, EvidenceSignal } from "@/lib/redefined";

type SmartEvidenceInputProps = {
  isUpdating: boolean;
  evidenceBranches?: EvidenceBranch[];
  evidenceSignals?: EvidenceSignal[];
  expandedBranchIds?: string[];
  onSubmit: (message: string, signals: EvidenceSignal[]) => void | Promise<void>;
  onConfirmBranch?: (branch: EvidenceBranch) => void;
  onDismissBranch?: (branch: EvidenceBranch) => void;
  onRunBranchCommands?: (branch: EvidenceBranch) => void;
  onAddBranchToTicket?: (branch: EvidenceBranch) => void;
  onToggleBranch?: (branchId: string) => void;
  onCollapseAllBranches?: () => void;
  onExpandAllBranches?: () => void;
};

export function SmartEvidenceInput({
  isUpdating,
  evidenceBranches = [],
  evidenceSignals,
  expandedBranchIds = [],
  onSubmit,
  onConfirmBranch,
  onDismissBranch,
  onRunBranchCommands,
  onAddBranchToTicket,
  onToggleBranch,
  onCollapseAllBranches,
  onExpandAllBranches
}: SmartEvidenceInputProps) {
  const [message, setMessage] = useState("");
  const [detectedSignals, setDetectedSignals] = useState<EvidenceSignal[]>([]);
  const [showAllSignals, setShowAllSignals] = useState(false);

  const visibleSignals =
    evidenceSignals && evidenceSignals.length > 0 ? evidenceSignals : detectedSignals;
  const displayedSignals = showAllSignals ? visibleSignals : visibleSignals.slice(0, 3);
  const hiddenSignalCount = Math.max(visibleSignals.length - displayedSignals.length, 0);
  const {
    voiceInputState,
    voiceStatusMessage,
    handleVoiceInputClick
  } = useVoiceRecorder({
    onTranscript: (transcript) => {
      setMessage((current) => current.trim() ? `${current.trim()}\n${transcript}` : transcript);
    },
    listeningMessage: "Listening...",
    transcribingMessage: "Transcribing...",
    readyMessage: "Evidence ready",
    errorMessage: "Could not transcribe evidence"
  });

  function updateMessage(value: string) {
    setMessage(value);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const clean = message.trim();
    if (!clean || isUpdating) return;
    const localSignals = parseEvidenceSignals(clean);

    setDetectedSignals(localSignals);
    await onSubmit(clean, localSignals);
  }

  function signalTone(signal: EvidenceSignal) {
    const value = `${signal.affectedBranchId ?? ""} ${signal.label}`.toLowerCase();
    if (value.includes("rbac") || value.includes("permission") || value.includes("role")) return "rbac";
    if (value.includes("network") || value.includes("firewall") || value.includes("dns")) return "network";
    if (value.includes("sas") || value.includes("token") || value.includes("auth")) return "token";
    if (signal.severity === "success") return "success";
    if (signal.severity === "critical") return "critical";
    return "info";
  }

  function signalLabel(signal: EvidenceSignal) {
    const value = `${signal.affectedBranchId ?? ""} ${signal.label}`.toLowerCase();
    if (value.includes("rbac") || value.includes("permission") || value.includes("role")) return "RBAC";
    if (value.includes("network") || value.includes("firewall") || value.includes("dns")) return "Network";
    if (value.includes("sas") || value.includes("token") || value.includes("auth")) return "Token";
    if (signal.severity === "success") return "Identity";
    return "Signal";
  }

  function getEvidenceBranchScore(branch: EvidenceBranch): number | undefined {
    const direct =
      typeof branch.confidence === "number"
        ? branch.confidence
        : typeof branch.evidenceScore === "number"
          ? branch.evidenceScore
          : undefined;

    if (typeof direct === "number") {
      return direct <= 1 ? Math.round(direct * 100) : Math.round(direct);
    }

    const signalScores = (branch.signals ?? [])
      .map((signal) => signal.confidence)
      .filter((value): value is number => typeof value === "number");

    if (signalScores.length === 0) return undefined;

    const maxScore = Math.max(...signalScores);
    return maxScore <= 1 ? Math.round(maxScore * 100) : Math.round(maxScore);
  }

  function branchTone(branch: EvidenceBranch) {
    if (branch.branchType === "rbac" || branch.branchType === "identity") return "rbac";
    if (branch.branchType === "network") return "network";
    if (branch.branchType === "token") return "token";
    if (branch.branchType === "configuration") return "configuration";
    return "unknown";
  }

  return (
    <form className="workspace-card smart-evidence-panel" id="fix-evidence" onSubmit={handleSubmit}>
      <div className="section-heading">
        <div>
          <p className="block-label">Continue troubleshooting</p>
          <h3>Paste anything</h3>
          <p>
            Logs, Azure CLI output, curl output, error messages, manual notes, or a screenshot
            description. Doc/ReDefined will map signals back to the diagnostic branches.
          </p>
        </div>
        <span className="drop-pill">logs · cli · curl · notes</span>
      </div>

      <div className="evidence-prompt-shell">
        <span className="evidence-prompt-plus" aria-hidden="true">
          +
        </span>
        <textarea
          value={message}
          placeholder={`Paste actual evidence here.\n\nLogs, Azure CLI output, curl output, error messages, manual notes, or screenshot descriptions.`}
          disabled={isUpdating}
          onChange={(event) => updateMessage(event.target.value)}
        />
        <button
          className="evidence-prompt-enter"
          type="submit"
          aria-label="Continue troubleshooting"
          disabled={isUpdating || !message.trim()}
        >
          &#x21b5;
        </button>
      </div>

      <div className="section-voice-row">
        <button
          type="button"
          className={`section-voice-button is-${voiceInputState}`}
          disabled={isUpdating || voiceInputState === "transcribing"}
          onClick={handleVoiceInputClick}
        >
          <VoiceStateIcon state={voiceInputState} />
          {voiceInputState === "recording"
            ? "Listening..."
            : voiceInputState === "transcribing"
              ? "Transcribing..."
              : voiceInputState === "ready"
                ? "Evidence ready"
                : voiceInputState === "error"
                  ? "Try again"
                  : "Speak evidence"}
        </button>
        <span className={`section-voice-status is-${voiceInputState}`}>
          {voiceStatusMessage}
        </span>
      </div>

      <div className="evidence-chips">
        <button
          type="button"
          onClick={() =>
            updateMessage("nslookup works but Test-NetConnection fails TcpTestSucceeded : False Port 1433 timeout")
          }
        >
          DNS works, TCP fails
        </button>
        <button type="button" onClick={() => updateMessage("AuthorizationPermissionMismatch: This request is not authorized to perform this operation")}>
          RBAC denied
        </button>
        <button type="button" onClick={() => updateMessage("IpAddressNotAllowed: Public network access disabled or client IP is not allowed")}>
          Network blocked
        </button>
        <button type="button" onClick={() => updateMessage("AuthenticationFailed: SAS token is expired or missing permissions")}>
          SAS/Auth failed
        </button>
        <button
          type="button"
          onClick={() =>
            updateMessage(
              "TcpTestSucceeded is True but the application still fails server mismatch app.internal.example != db.private.example"
            )
          }
        >
          TCP works, app still fails
        </button>
        <button type="button" onClick={() => updateMessage("401 Unauthorized login failed")}>
          Auth failed
        </button>
        <button type="button" onClick={() => updateMessage("it works now issue resolved")}>
          Issue resolved
        </button>
      </div>

      <div className="detected-signals">
        <div className="detected-signals-inline-heading">
          <p className="mini-label">Detected signals</p>
          <span>Mapped to diagnostic branches.</span>
        </div>
        {visibleSignals.length ? (
          <div
            className={`detected-signals-row${visibleSignals.length === 1 ? " single-signal" : ""}`}
          >
            {displayedSignals.map((signal) => (
              <div
                className={`detected-signal-chip signal-${signalTone(signal)}`}
                key={signal.id}
              >
                {signalLabel(signal)} · {signal.matchedText}
                {typeof signal.confidence === "number"
                  ? ` · ${Math.round(signal.confidence * 100)}%`
                  : ""}
              </div>
            ))}
            {hiddenSignalCount > 0 ? (
              <button
                className="more-signals-button"
                type="button"
                onClick={() => setShowAllSignals(true)}
              >
                More signals +{hiddenSignalCount}
              </button>
            ) : showAllSignals && visibleSignals.length > 3 ? (
              <button
                className="more-signals-button"
                type="button"
                onClick={() => setShowAllSignals(false)}
              >
                Fewer signals
              </button>
            ) : null}
          </div>
        ) : (
          <div className="empty-state evidence-empty-state">
            No signals detected yet. Paste real evidence or click a sample chip above.
          </div>
        )}
      </div>

      {evidenceBranches.length ? (
        <div className="investigation-branches">
          <div className="investigation-branches-heading">
            <p className="mini-label">Investigation branches</p>
            <span>Original diagnosis stays visible until a branch is confirmed.</span>
          </div>

          {evidenceBranches.length > 1 ? (
            <div className="evidence-branch-controls">
              <button type="button" onClick={onCollapseAllBranches}>
                Collapse all
              </button>
              <button
                type="button"
                onClick={onExpandAllBranches}
              >
                Expand all
              </button>
            </div>
          ) : null}

          <div className="investigation-branch-list">
            {evidenceBranches.map((branch) => {
              const isOpen = expandedBranchIds.includes(branch.id);

              return (
                <article
                  className={`investigation-branch evidence-branch-card branch-${branchTone(branch)} status-${branch.status} ${branch.status === "active" ? "is-active" : ""}`}
                  key={branch.id}
                >
                  <button
                    className="investigation-branch-summary evidence-branch-header"
                    type="button"
                    onClick={() => onToggleBranch?.(branch.id)}
                    aria-expanded={isOpen}
                  >
                    <span className="evidence-branch-main">
                      <span className="evidence-branch-title">{branch.title}</span>
                      <span className="evidence-branch-preview">
                        {branch.preview ?? branch.evidenceExcerpt.slice(0, 100)}
                      </span>
                    </span>
                    <span className="evidence-branch-meta">
                      {getEvidenceBranchScore(branch) !== undefined && (
                        <span className="evidence-branch-confidence">
                          {getEvidenceBranchScore(branch)}%
                        </span>
                      )}
                      <span className="evidence-branch-status">{branch.status}</span>
                      <span className="evidence-branch-chevron" aria-hidden="true">
                        {isOpen ? "▴" : "▾"}
                      </span>
                    </span>
                  </button>

                  {isOpen ? (
                    <div className="investigation-branch-detail evidence-branch-body">
                      <section className="evidence-branch-section">
                        <span>What this means</span>
                        <p>{branch.explanation?.meaning ?? branch.summary}</p>
                      </section>
                      <section className="evidence-branch-section">
                        <span>Why this branch</span>
                        <p>{branch.explanation?.whyThisBranch ?? branch.summary}</p>
                      </section>
                      {branch.explanation?.likelyRootCause ? (
                        <section className="evidence-branch-section">
                          <span>Likely root cause</span>
                          <p>{branch.explanation.likelyRootCause}</p>
                        </section>
                      ) : null}
                      <div className="investigation-branch-evidence">
                        <span>Evidence excerpt</span>
                        <code>{branch.evidenceExcerpt}</code>
                      </div>
                      <div className="investigation-branch-signals">
                        {branch.signals.map((signal) => (
                          <span key={`${branch.id}-${signal.id}`}>
                            {signalLabel(signal)} · {signal.matchedText}
                          </span>
                        ))}
                      </div>
                      {branch.cliSteps?.length ? (
                        <section className="evidence-branch-section">
                          <span>CLI checks</span>
                          <div className="evidence-branch-cli-list">
                            {branch.cliSteps.map((step) => (
                              <div key={`${branch.id}-${step.label}-${step.command}`}>
                                <strong>{step.label}</strong>
                                <code>{step.command}</code>
                                {step.expected ? <em>{step.expected}</em> : null}
                              </div>
                            ))}
                          </div>
                        </section>
                      ) : null}
                      {branch.fixSteps?.length ? (
                        <section className="evidence-branch-section">
                          <span>Fix steps</span>
                          <ul>
                            {branch.fixSteps.map((step) => (
                              <li key={`${branch.id}-${step}`}>{step}</li>
                            ))}
                          </ul>
                        </section>
                      ) : null}
                      {branch.followUpQuestions?.length ? (
                        <section className="evidence-branch-section">
                          <span>Questions needed</span>
                          <ul>
                            {branch.followUpQuestions.map((question) => (
                              <li key={`${branch.id}-${question}`}>{question}</li>
                            ))}
                          </ul>
                        </section>
                      ) : null}
                      <div className="investigation-next-action">
                        <span>Next action</span>
                        <strong>{branch.nextAction}</strong>
                      </div>
                      <div className="investigation-actions">
                        <button type="button" onClick={() => onConfirmBranch?.(branch)}>
                          Mark as confirmed
                        </button>
                        <button type="button" onClick={() => onAddBranchToTicket?.(branch)}>
                          Add to ticket
                        </button>
                        <button type="button" onClick={() => onRunBranchCommands?.(branch)}>
                          Run commands
                        </button>
                        <button type="button" onClick={() => onDismissBranch?.(branch)}>
                          Dismiss
                        </button>
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        </div>
      ) : null}

      <button className="continue-btn" type="submit" disabled={isUpdating || !message.trim()}>
        {isUpdating ? "Analysing evidence..." : visibleSignals.length ? "Evidence mapped to branches" : "Analyse evidence"}
      </button>
    </form>
  );
}

function VoiceStateIcon({ state }: { state: "idle" | "recording" | "transcribing" | "ready" | "error" }) {
  if (state === "ready") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m5 12 4 4L19 6" />
      </svg>
    );
  }

  if (state === "transcribing") {
    return <span className="prompt-voice-spinner" aria-hidden="true" />;
  }

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
