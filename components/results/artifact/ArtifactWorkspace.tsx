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

function extractPlaceholderTokens(value?: string): string[] {
  if (!value) return [];
  const matches = value.match(/\[[^\]]+\]/g) ?? [];
  return [...new Set(matches)];
}

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
  const providedCount = missingDetails.filter((d) => d.status === "provided").length;
  const totalDetailCount = missingDetails.length;
  const readyDetailCount = Math.max(totalDetailCount - missingCount, 0);
  const readinessScore = totalDetailCount > 0
    ? Math.round((readyDetailCount / totalDetailCount) * 100)
    : 100;
  const nextMissingDetail = missingDetails.find((d) => d.status === "missing");
  const nextAction = nextMissingDetail
    ? `Fill ${nextMissingDetail.label}`
    : exportActions.find((action) => action.action === "copy")?.label ?? "Review and export";
  const unresolvedPreviewTokens = extractPlaceholderTokens(artifactPreview?.body);
  const deliverySteps = [
    {
      title: "Source",
      body: "Confirm the workspace context and assumptions.",
      status: "Completed",
      count: sourceContext?.sourceMode ?? "Artifact",
      state: "completed"
    },
    {
      title: "Details",
      body: "Replace placeholders before final use.",
      status: missingCount > 0 ? "Blocked" : "Ready",
      count: missingCount > 0 ? `${missingCount} missing` : "Complete",
      state: missingCount > 0 ? "blocked" : "completed"
    },
    {
      title: "Outline",
      body: "Review the structure before editing.",
      status: "Ready",
      count: outline.length > 0 ? `${outline.length} sections` : "Draft",
      state: "ready"
    },
    {
      title: "Preview",
      body: "Inspect the generated artifact body.",
      status: artifactPreview ? "Generated" : "Pending",
      count: activeFormat?.label ?? formatOptions[0]?.label ?? artifactPreview?.format ?? "Default",
      state: artifactPreview ? "generated" : "ready"
    },
    {
      title: "Export",
      body: "Copy, save, regenerate, or download.",
      status: missingCount > 0 ? "Blocked" : "Ready",
      count: exportActions.length > 0 ? `${exportActions.length} actions` : "Pending",
      state: missingCount > 0 ? "blocked" : "ready"
    }
  ];
  const activeDeliveryIndex = missingCount > 0 ? 1 : artifactPreview ? 3 : 4;

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
        <div className="artifact-hero-status-row" aria-label="Artifact status summary">
          <span><strong>Artifact type</strong>{typeLabel ?? "Artifact"}</span>
          <span><strong>Format</strong>{activeFormat?.label ?? formatOptions[0]?.label ?? artifactPreview?.format ?? "Default"}</span>
          <span><strong>Readiness</strong>{missingCount > 0 ? "Needs details" : "Ready"}</span>
          <span><strong>Missing inputs</strong>{missingCount}</span>
          <span><strong>Next action</strong>{nextAction}</span>
        </div>
      </section>

      <section className="artifact-delivery-flow-card">
        <div className="artifact-flow-head">
          <div>
            <p className="artifact-flow-label">Artifact delivery path</p>
            <h3>Move from context to reusable output</h3>
          </div>
          <span>{missingCount > 0 ? "Needs details" : "Ready"}</span>
        </div>
        <div className="artifact-delivery-flow" aria-label="Artifact delivery path">
          {deliverySteps.map((step, index) => (
            <article
              key={step.title}
              className={`artifact-flow-node state-${step.state}${index === activeDeliveryIndex ? " is-active" : ""}`}
            >
              <span className="artifact-flow-number">{index + 1}</span>
              <div>
                <h4>{step.title}</h4>
                <p>{step.body}</p>
              </div>
              <em><strong>{step.status}</strong>{step.count}</em>
            </article>
          ))}
        </div>
      </section>

      <div className="artifact-workspace-grid">
        <main className="artifact-main-column">
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
                <div>
                  <p className="artifact-section-kicker">Completion Board</p>
                  <h3 className="artifact-ws-heading">Required details before export</h3>
                </div>
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
                      <div className="artifact-missing-placeholder">
                        <span>Used in preview</span>
                        <strong>{detail.placeholder}</strong>
                      </div>
                    )}
                  </div>
                ))}
              </div>
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

              {unresolvedPreviewTokens.length > 0 && (
                <div className="artifact-unresolved-panel">
                  <span>Unresolved placeholders</span>
                  <div>
                    {unresolvedPreviewTokens.slice(0, 8).map((token) => (
                      <code key={token}>{token}</code>
                    ))}
                  </div>
                </div>
              )}

              <div className={`artifact-preview-body artifact-preview--${artifactPreview.format}`}>
                <pre className="artifact-preview-content">{artifactPreview.body}</pre>
              </div>

              {exportActions.length > 0 && (
                <div className="artifact-preview-footer">
                  <h3 className="artifact-ws-heading">Delivery controls</h3>
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
                </div>
              )}
            </section>
          )}
        </main>

        <aside className="artifact-side-column">
          <section className="artifact-rail-card rail-green">
            <p>Readiness Score</p>
            <strong>{readinessScore}%</strong>
            <span>{readyDetailCount} ready · {missingCount} blocked</span>
          </section>

          <section className="artifact-rail-card rail-yellow">
            <p>Next Best Action</p>
            <strong>{nextAction}</strong>
            <span>{missingCount > 0 ? "Resolve the active missing detail before exporting." : "Review the preview and deliver the artifact."}</span>
          </section>

          <section className="artifact-rail-card rail-purple">
            <p>Detail coverage</p>
            <strong>{providedCount} provided · {missingCount} missing</strong>
            <span>{assumedCount} assumed. Replace placeholders and confirm assumptions before sharing.</span>
          </section>

          <section className="artifact-rail-card rail-blue">
            <p>Export Readiness</p>
            <strong>{missingCount > 0 ? "Blocked" : "Ready"}</strong>
            <span>{missingCount > 0 ? "Unresolved details remain in the preview." : "Preview is ready for copy or save."}</span>
          </section>

          {/* 4. Artifact outline */}
          {outline.length > 0 && (
            <section className="artifact-ws-section artifact-outline-section">
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
        </aside>
      </div>
    </div>
  );
}
