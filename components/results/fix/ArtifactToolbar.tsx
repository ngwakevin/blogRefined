"use client";

import { useState } from "react";
import {
  buildIncidentBrief,
  buildRunbook,
  buildSlackIncidentBrief,
  buildSummary,
  buildTicketUpdate
} from "@/lib/artifacts";
import { saveOrUpdateProfileJourney } from "@/lib/journey-store";
import { getLocalProfile } from "@/lib/profile-store";
import type { ArtifactAction, EvidenceSignal, RedefinedResult } from "@/lib/redefined";
import type { FixWorkspaceResult } from "@/types/redefined";

type ArtifactToolbarProps = {
  actions: ArtifactAction[];
  evidenceSignals?: EvidenceSignal[];
  result: RedefinedResult;
  onRequireProfile?: (message?: string, next?: string) => void;
};

function artifactLabel(action: ArtifactAction) {
  const labels: Record<ArtifactAction["type"], string> = {
    ticket_update: "Create ticket update",
    runbook: "Export runbook",
    save_journey: "Save journey",
    share: "Share",
    checklist: action.label,
    summary: action.label
  };

  return labels[action.type] ?? action.label;
}

export function ArtifactToolbar({
  actions,
  evidenceSignals = [],
  result,
  onRequireProfile
}: ArtifactToolbarProps) {
  const [preview, setPreview] = useState<{
    title: string;
    body: string;
    slackBody?: string;
  } | null>(null);

  function extension() {
    const shell = result.diagnosticTerminal?.shell;
    if (shell === "powershell") return "ps1";
    if (shell === "bash") return "sh";
    if (shell === "sql") return "sql";
    return "txt";
  }

  async function copyText(text: string) {
    await navigator.clipboard?.writeText(text);
  }

  function downloadRunbook() {
    const body = buildRunbook(result);
    const blob = new Blob([body], { type: "text/plain" });
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(blob);
    anchor.download = `doc-redefined-runbook.${extension()}`;
    anchor.click();
    URL.revokeObjectURL(anchor.href);
  }

  async function handleAction(action: ArtifactAction) {
    if (action.type === "save_journey") {
      const profile = getLocalProfile();
      if (!profile) {
        onRequireProfile?.("Create a profile to save this workspace.", "save");
        return;
      }

      saveOrUpdateProfileJourney(result as FixWorkspaceResult, profile.id, "local");
      setPreview({
        title: "Saved to profile",
        body: "Saved to your Doc/ReDefined profile."
      });
      return;
    }

    if (action.type === "share") {
      const profile = getLocalProfile();
      if (!profile) {
        onRequireProfile?.("Create a profile to save and share this workspace.", "share");
        return;
      }

      setPreview({
        title: "Team sharing",
        body: "Team sharing is coming soon. For now, export a runbook or copy the ticket update."
      });
      return;
    }

    if (action.type === "ticket_update") {
      const body = buildTicketUpdate(result);
      setPreview({ title: "Ticket update", body });
      await copyText(body);
      return;
    }

    if (action.type === "runbook") {
      downloadRunbook();
      return;
    }

    if (action.type === "summary") {
      const body = buildSummary(result);
      setPreview({ title: "Workspace summary", body });
      await copyText(body);
      return;
    }

    setPreview({
      title: action.label,
      body: `${action.label} is ready for a future integration.\n\n${buildSummary(result)}`
    });
  }

  async function openIncidentBrief() {
    const body = buildIncidentBrief(result, evidenceSignals);
    const slackBody = buildSlackIncidentBrief(result, evidenceSignals);
    setPreview({ title: "Incident brief", body, slackBody });
    await copyText(body);
  }

  return (
    <>
      <section className="artifact-toolbar" aria-label="Workspace artifacts">
        <div>
          <div className="block-label">Artifacts</div>
          <p>{result.title}</p>
        </div>

        <div>
          <button type="button" onClick={() => void openIncidentBrief()}>
            Incident brief
          </button>
          {actions.map((action) => (
            <button key={action.type} type="button" onClick={() => void handleAction(action)}>
              {artifactLabel(action)}
            </button>
          ))}
        </div>
      </section>

      {preview ? (
        <div className="modal-backdrop">
          <section className="artifact-modal">
            <div className="modal-topline">
              <div>
                <p className="block-label">Artifact preview</p>
                <h3>{preview.title}</h3>
              </div>
              <button type="button" onClick={() => setPreview(null)}>
                x
              </button>
            </div>
            <pre>{preview.body}</pre>
            <div className="modal-actions">
              <button type="button" onClick={() => void copyText(preview.body)}>
                {preview.slackBody ? "Copy brief" : "Copy artifact"}
              </button>
              {preview.slackBody ? (
                <button type="button" onClick={() => void copyText(preview.slackBody ?? "")}>
                  Copy Slack version
                </button>
              ) : null}
              <button type="button" onClick={downloadRunbook}>
                Download runbook
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
