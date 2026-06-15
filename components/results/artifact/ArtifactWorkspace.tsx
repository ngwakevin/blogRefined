"use client";

import { useState } from "react";
import type { RedefinedResult } from "@/lib/redefined";

type ArtifactWorkspaceProps = {
  result: RedefinedResult;
};

const WORKSPACE_TYPE_LABELS: Record<string, string> = {
  business_plan_artifact: "Business Plan",
  runbook_artifact: "Runbook",
  ticket_update: "Ticket Update",
  implementation_plan: "Implementation Plan",
  checklist: "Checklist",
  summary: "Summary"
};

export function ArtifactWorkspace({ result }: ArtifactWorkspaceProps) {
  const [activeFormatId, setActiveFormatId] = useState<string>(
    () => result.formatOptions?.[0]?.id ?? "default"
  );
  const [copied, setCopied] = useState(false);

  const {
    title,
    summary,
    workspaceType,
    sourceContext,
    missingDetails = [],
    outline = [],
    artifactPreview,
    formatOptions = [],
    exportActions = []
  } = result;

  const typeLabel = workspaceType ? WORKSPACE_TYPE_LABELS[workspaceType] : null;
  const isDefaultFormat = activeFormatId === (formatOptions[0]?.id ?? "default");
  const activeFormat = formatOptions.find((f) => f.id === activeFormatId);

  const missingCount = missingDetails.filter((d) => d.status === "missing").length;
  const assumedCount = missingDetails.filter((d) => d.status === "assumed").length;

  const handleCopy = async () => {
    const content = artifactPreview?.body;
    if (!content) return;
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      /* clipboard unavailable */
    }
  };

  const handleExportAction = (action: string) => {
    if (action === "copy") handleCopy();
  };

  return (
    <div className="artifact-workspace">

      {/* 1. Artifact objective */}
      <section className="artifact-objective">
        <div className="artifact-badges-row">
          <div className="artifact-mode-badge">Artifact</div>
          {typeLabel && <div className="artifact-type-pill">{typeLabel}</div>}
        </div>
        <h2 className="artifact-title">{title}</h2>
        <p className="artifact-summary">{summary}</p>
      </section>

      {/* 2. Source context */}
      {sourceContext &&
        (sourceContext.sourceMode ||
          sourceContext.sourceTitle ||
          (sourceContext.keyInputs?.length ?? 0) > 0 ||
          (sourceContext.assumptions?.length ?? 0) > 0) && (
          <section className="artifact-ws-section">
            <h3 className="artifact-ws-heading">Source context</h3>
            <div className="artifact-source-meta">
              {sourceContext.sourceMode && (
                <span className={`artifact-source-mode-tag artifact-source--${sourceContext.sourceMode}`}>
                  {sourceContext.sourceMode}
                </span>
              )}
              {sourceContext.sourceTitle && (
                <span className="artifact-source-title-tag">{sourceContext.sourceTitle}</span>
              )}
            </div>
            {(sourceContext.keyInputs?.length ?? 0) > 0 && (
              <div className="artifact-source-inputs">
                <div className="artifact-source-sub-label">Inputs used</div>
                <ul className="artifact-source-input-list">
                  {sourceContext.keyInputs!.map((inp, i) => (
                    <li key={i}>{inp}</li>
                  ))}
                </ul>
              </div>
            )}
            {(sourceContext.assumptions?.length ?? 0) > 0 && (
              <div className="artifact-source-assumptions">
                <div className="artifact-source-sub-label">Assumptions</div>
                <ul className="artifact-source-input-list artifact-source-input-list--assumptions">
                  {sourceContext.assumptions!.map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

      {/* 3. Missing details */}
      {missingDetails.length > 0 && (
        <section className="artifact-ws-section">
          <div className="artifact-missing-header">
            <h3 className="artifact-ws-heading">Details needed</h3>
            <div className="artifact-missing-counts">
              {missingCount > 0 && (
                <span className="artifact-count-badge artifact-count--missing">{missingCount} missing</span>
              )}
              {assumedCount > 0 && (
                <span className="artifact-count-badge artifact-count--assumed">{assumedCount} assumed</span>
              )}
            </div>
          </div>
          <p className="artifact-ws-desc">
            Replace every{" "}
            <span className="artifact-placeholder-example">[bracketed placeholder]</span>{" "}
            in the preview with your actual information.
          </p>
          <div className="artifact-missing-grid">
            {missingDetails.map((detail) => (
              <div
                key={detail.id}
                className={`artifact-missing-card artifact-missing--${detail.status}`}
              >
                <div className="artifact-missing-status-badge">{detail.status}</div>
                <div className="artifact-missing-label">{detail.label}</div>
                <div className="artifact-missing-why">{detail.whyNeeded}</div>
                {detail.placeholder && (
                  <div className="artifact-missing-placeholder">{detail.placeholder}</div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 4. Artifact outline */}
      {outline.length > 0 && (
        <section className="artifact-ws-section">
          <h3 className="artifact-ws-heading">Artifact outline</h3>
          <ol className="artifact-outline-list">
            {outline.map((item, i) => (
              <li key={item.id} className="artifact-outline-item">
                <span className="artifact-outline-num">{i + 1}</span>
                <div className="artifact-outline-body">
                  <div className="artifact-outline-title">{item.title}</div>
                  <div className="artifact-outline-purpose">{item.purpose}</div>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* 5. Artifact preview */}
      {artifactPreview && (
        <section className="artifact-preview-section">
          <div className="artifact-preview-header">
            <h3 className="artifact-ws-heading">Artifact preview</h3>
            {formatOptions.length > 1 && (
              <div className="artifact-format-tabs" role="tablist" aria-label="Output format">
                {formatOptions.map((fmt) => (
                  <button
                    key={fmt.id}
                    role="tab"
                    type="button"
                    aria-selected={fmt.id === activeFormatId}
                    className={`artifact-format-tab${fmt.id === activeFormatId ? " artifact-format-tab--active" : ""}`}
                    onClick={() => setActiveFormatId(fmt.id)}
                    title={fmt.description}
                  >
                    {fmt.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {!isDefaultFormat && activeFormat && (
            <div className="artifact-format-notice">
              <span className="artifact-format-notice-text">
                Preview is in <strong>{formatOptions[0]?.label ?? "default"}</strong> format.
              </span>
              <span className="artifact-format-notice-hint">
                Click Regenerate to get a <strong>{activeFormat.label}</strong> version.
              </span>
            </div>
          )}

          <div className={`artifact-preview-body artifact-preview--${artifactPreview.format}`}>
            <pre className="artifact-preview-content">{artifactPreview.body}</pre>
          </div>
        </section>
      )}

      {/* 6. Export actions */}
      {exportActions.length > 0 && (
        <section className="artifact-ws-section artifact-export-section">
          <h3 className="artifact-ws-heading">Export</h3>
          <div className="artifact-export-actions">
            {exportActions.map((action) => (
              <button
                key={action.action}
                type="button"
                disabled={action.action === "download" || action.action === "share"}
                className={`artifact-export-btn artifact-export--${action.action}${
                  action.action === "copy" && copied ? " artifact-export--copied" : ""
                }`}
                onClick={() => handleExportAction(action.action)}
              >
                {action.action === "copy" && copied ? "Copied!" : action.label}
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
