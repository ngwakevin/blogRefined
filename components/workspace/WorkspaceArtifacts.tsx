"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArtifactCard } from "@/components/artifacts/ArtifactCard";
import { promptUpgrade } from "@/components/billing/UpgradeModal";
import { DASHBOARD_CHANGED_EVENT } from "@/components/dashboard/DashboardModals";
import { GenerateArtifactModal } from "@/components/workspace/GenerateArtifactModal";
import { showToast } from "@/components/Toast";
import { canCreateArtifact, getAccount, incrementUsage } from "@/lib/account-store";
import { deleteLibraryArtifact, persistWorkspaceResult } from "@/lib/journey-store";
import {
  ARTIFACT_TYPE_LABELS,
  ARTIFACT_TYPE_OPTIONS,
  applyArtifactToWorkspace,
  artifactDownloadContent,
  artifactFilename,
  artifactTone,
  buildArtifactInstruction,
  buildArtifactTitle,
  newArtifactId,
  type ArtifactTypeOption
} from "@/lib/artifact-generation";
import type { RedefinedResult } from "@/lib/redefined";
import type { WorkspaceArtifact } from "@/lib/workspace-types";

const OPEN_GENERATE_ARTIFACT_EVENT = "workspace:open-generate-artifact";

/** Module-level trigger so the header and follow-up strip can open the modal. */
export function openGenerateArtifact(typeId?: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(OPEN_GENERATE_ARTIFACT_EVENT, { detail: { typeId } }));
}

type WorkspaceArtifactsProps = {
  result: RedefinedResult;
  recordId?: string;
  profileId?: string;
  onResultChange?: (result: RedefinedResult) => void;
};

const EMPTY_CHIPS = ["summary", "checklist", "runbook", "ticket", "implementation"];

function snippet(content?: string): string {
  return (content ?? "")
    .replace(/[#*`>_]/g, " ")
    .replace(/^\s*[-•]\s*/gm, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 150);
}

function typeLabelOf(artifact: WorkspaceArtifact): string {
  return artifact.displayType ?? ARTIFACT_TYPE_LABELS[artifact.artifactType];
}

export function WorkspaceArtifacts({
  result,
  recordId,
  profileId,
  onResultChange
}: WorkspaceArtifactsProps) {
  const artifacts = useMemo(() => result.workspaceArtifacts ?? [], [result.workspaceArtifacts]);
  const workspaceName = result.workspaceMeta?.workspaceName ?? result.title;
  const workspaceId = result.workspaceMeta?.workspaceId ?? result.id;
  const persistence =
    result.workspaceMeta?.persistence === "local_profile" ? "local_profile" : "temporary";

  const [modalOpen, setModalOpen] = useState(false);
  const [modalType, setModalType] = useState<string | undefined>(undefined);
  const [generating, setGenerating] = useState(false);
  const [generatingTitle, setGeneratingTitle] = useState("");

  useEffect(() => {
    const onOpen = (event: Event) => {
      const detail = (event as CustomEvent<{ typeId?: string }>).detail;
      setModalType(detail?.typeId);
      setModalOpen(true);
    };
    window.addEventListener(OPEN_GENERATE_ARTIFACT_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_GENERATE_ARTIFACT_EVENT, onOpen);
  }, []);

  const handleGenerate = useCallback(
    async (input: { option: ArtifactTypeOption; title: string; instructions: string }) => {
      const account = getAccount();
      const gate = canCreateArtifact(account);
      if (!gate.allowed) {
        setModalOpen(false);
        promptUpgrade("Artifact limit reached", gate, account.currentPlanId);
        return;
      }
      setModalOpen(false);
      setGenerating(true);
      setGeneratingTitle(input.title.trim());
      try {
        const prompt = buildArtifactInstruction({
          result,
          option: input.option,
          title: input.title,
          instructions: input.instructions
        });
        const response = await fetch("/api/redefine", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt,
            selectedMode: "artifact",
            workspaceId,
            workspaceName,
            projectId: result.workspaceMeta?.projectId,
            sourceContext: {
              sourceMode: result.mode,
              sourceTitle: workspaceName,
              keyInputs: [result.workspaceMeta?.originalPrompt ?? result.originalPrompt ?? ""].filter(
                Boolean
              )
            }
          })
        });
        if (!response.ok) throw new Error("Artifact generation failed.");
        const payload = (await response.json()) as { result: RedefinedResult };
        const body = payload.result.artifactPreview?.body ?? payload.result.summary;
        if (!body || !body.trim()) throw new Error("Empty artifact.");

        const now = new Date().toISOString();
        const lastRun = (result.workspacePromptRuns ?? []).at(-1);
        const artifact: WorkspaceArtifact = {
          id: newArtifactId(),
          name: input.title.trim(),
          artifactType: input.option.artifactType,
          displayType: input.option.label,
          sourceMode: result.mode,
          workspaceId,
          projectId: result.workspaceMeta?.projectId,
          sourceResultId: result.id,
          sourceRunId: lastRun?.id,
          content: body,
          format: "markdown",
          instructions: input.instructions.trim() || undefined,
          createdAt: now,
          updatedAt: now
        };

        const nextResult = applyArtifactToWorkspace(result, artifact);
        onResultChange?.(nextResult);
        persistWorkspaceResult({ result: nextResult, recordId, profileId });
        window.dispatchEvent(new Event(DASHBOARD_CHANGED_EVENT));
        incrementUsage("artifactsThisMonth");

        showToast({ title: "Artifact created", message: artifact.name });
      } catch {
        showToast({ title: "Could not generate artifact", message: "Please try again." });
      } finally {
        setGenerating(false);
        setGeneratingTitle("");
      }
    },
    [onResultChange, profileId, recordId, result, workspaceId, workspaceName]
  );

  const handleCopy = useCallback(async (artifact: WorkspaceArtifact) => {
    try {
      await navigator.clipboard.writeText(artifact.content ?? "");
      showToast({ title: "Artifact copied" });
    } catch {
      showToast({ title: "Copy failed", message: "Clipboard is unavailable." });
    }
  }, []);

  const handleDownload = useCallback(
    (artifact: WorkspaceArtifact) => {
      const content = artifactDownloadContent(artifact, workspaceName);
      const mime = artifact.format === "text" ? "text/plain" : "text/markdown";
      const blob = new Blob([content], { type: `${mime};charset=utf-8` });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = artifactFilename(artifact);
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      incrementUsage("exportsThisMonth");
    },
    [workspaceName]
  );

  const handleDelete = useCallback(
    (artifact: WorkspaceArtifact) => {
      if (!window.confirm(`Delete "${artifact.name}"? This cannot be undone.`)) return;
      const next: RedefinedResult = {
        ...result,
        workspaceArtifacts: (result.workspaceArtifacts ?? []).filter(
          (entry) => entry.id !== artifact.id
        )
      };
      onResultChange?.(next);
      if (recordId) {
        deleteLibraryArtifact({
          recordId,
          artifactId: artifact.id,
          origin: "artifact",
          persistence,
          profileId
        });
      }
      window.dispatchEvent(new Event(DASHBOARD_CHANGED_EVENT));
    },
    [onResultChange, persistence, profileId, recordId, result]
  );

  const openModal = (typeId?: string) => {
    setModalType(typeId);
    setModalOpen(true);
  };

  return (
    <section className="ws-artifacts" aria-label="Artifacts">
      <header className="ws-artifacts-head">
        <h3>Artifacts</h3>
        <button type="button" className="ws-artifacts-generate" onClick={() => openModal()}>
          Generate artifact
        </button>
      </header>

      {generating ? (
        <div className="ws-artifacts-generating" aria-live="polite">
          <span className="ws-terminal-spinner" aria-hidden="true" />
          <div>
            <strong>Generating artifact…</strong>
            <p>{generatingTitle}</p>
            <span>Using workspace result, prompt runs, and selected sections.</span>
          </div>
        </div>
      ) : null}

      {artifacts.length === 0 && !generating ? (
        <div className="ws-artifacts-empty">
          <h4>No artifacts yet</h4>
          <p>Turn this workspace into a reusable document, checklist, runbook, or summary.</p>
          <button type="button" className="ws-artifacts-empty-cta" onClick={() => openModal()}>
            Generate artifact
          </button>
          <div className="ws-artifacts-chips">
            {EMPTY_CHIPS.map((id) => {
              const option = ARTIFACT_TYPE_OPTIONS.find((entry) => entry.id === id);
              if (!option) return null;
              return (
                <button key={id} type="button" onClick={() => openModal(id)}>
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {artifacts.length > 0 ? (
        <div className="art-color-grid">
          {artifacts.map((artifact) => (
            <ArtifactCard
              key={artifact.id}
              data={{
                id: artifact.id,
                href: `/artifacts/${encodeURIComponent(artifact.id)}`,
                title: artifact.name,
                typeLabel: typeLabelOf(artifact),
                tone: artifactTone(artifact.artifactType, artifact.displayType),
                snippet: snippet(artifact.content),
                sourceName: workspaceName,
                createdAt: artifact.createdAt
              }}
              onCopy={() => void handleCopy(artifact)}
              onDownload={() => handleDownload(artifact)}
              onDelete={() => handleDelete(artifact)}
            />
          ))}
        </div>
      ) : null}

      {modalOpen ? (
        <GenerateArtifactModal
          defaultTitleFor={(option) => buildArtifactTitle(workspaceName, option)}
          initialTypeId={modalType}
          generating={generating}
          onCancel={() => setModalOpen(false)}
          onGenerate={handleGenerate}
        />
      ) : null}
    </section>
  );
}
