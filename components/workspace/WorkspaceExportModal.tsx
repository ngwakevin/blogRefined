"use client";

import { useEffect, useMemo, useState } from "react";
import { showToast } from "@/components/Toast";
import { buildWorkspaceExportPackage, type WorkspaceExportFormat } from "@/lib/workspace-export";
import type { RedefinedResult } from "@/lib/redefined";

type WorkspaceExportModalProps = {
  result: RedefinedResult;
  profileId?: string;
  onClose: () => void;
};

function downloadText(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function WorkspaceExportModal({ result, profileId, onClose }: WorkspaceExportModalProps) {
  const exportPackage = useMemo(
    () => buildWorkspaceExportPackage({ result, profileId }),
    [profileId, result]
  );
  const [format, setFormat] = useState<WorkspaceExportFormat>("markdown");

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const text = format === "markdown" ? exportPackage.markdown : exportPackage.jsonText;
  const previewCounts = {
    promptRuns: exportPackage.exportData.promptRuns.length,
    artifacts: exportPackage.exportData.artifacts.length,
    audioGuides: exportPackage.exportData.audioGuides.length,
    timeline: exportPackage.exportData.timeline.length
  };

  const copyMarkdown = async () => {
    try {
      await navigator.clipboard.writeText(exportPackage.markdown);
      showToast({ title: "Workspace export copied" });
    } catch {
      showToast({ title: "Could not copy workspace export" });
    }
  };

  return (
    <div
      className="ws-export-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Export workspace"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="ws-export-dialog">
        <header className="ws-export-head">
          <div>
            <h3>Export workspace</h3>
            <p>Download this workspace with its prompts, results, artifacts, and timeline.</p>
          </div>
          <button type="button" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </header>

        <section className="ws-export-form">
          <div className="ws-export-summary" aria-label="Export summary">
            <div>
              <strong>{exportPackage.workspaceName}</strong>
              <span>{exportPackage.projectName}</span>
            </div>
            <p>
              Export includes:
              {" "}
              {previewCounts.promptRuns} prompt runs
              {" · "}
              {previewCounts.artifacts} artifacts
              {" · "}
              {previewCounts.audioGuides} audio guides
              {" · "}
              {previewCounts.timeline} timeline events
            </p>
          </div>

          <div className="ws-export-format-row" role="tablist" aria-label="Export format">
            <button
              type="button"
              className={`ws-export-format${format === "markdown" ? " active" : ""}`}
              onClick={() => setFormat("markdown")}
            >
              Markdown
            </button>
            <button
              type="button"
              className={`ws-export-format${format === "json" ? " active" : ""}`}
              onClick={() => setFormat("json")}
            >
              JSON
            </button>
            <button type="button" className="ws-export-format disabled" disabled title="Coming soon">
              PDF
            </button>
            <button type="button" className="ws-export-format disabled" disabled title="Coming soon">
              DOCX
            </button>
            <button type="button" className="ws-export-format disabled" disabled title="Coming soon">
              Share link
            </button>
          </div>

          <div className="ws-export-preview">
            <div className="ws-export-preview-head">
              <strong>{format === "markdown" ? "Markdown preview" : "JSON preview"}</strong>
              <span>{text.length.toLocaleString()} chars</span>
            </div>
            <textarea readOnly value={text} aria-label={`${format} export preview`} />
          </div>

          <div className="ws-export-actions">
            <button type="button" className="ws-export-copy" onClick={copyMarkdown}>
              Copy Markdown
            </button>
            <button
              type="button"
              className="ws-export-download"
              onClick={() => downloadText(exportPackage.markdownFilename, exportPackage.markdown, "text/markdown")}
            >
              Download Markdown
            </button>
            <button
              type="button"
              className="ws-export-download ws-export-download-json"
              onClick={() => downloadText(exportPackage.jsonFilename, exportPackage.jsonText, "application/json")}
            >
              Download JSON
            </button>
            <button type="button" className="ws-export-close" onClick={onClose}>
              Close
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
