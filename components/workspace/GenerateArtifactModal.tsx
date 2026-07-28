"use client";

import { useMemo, useState } from "react";
import {
  ARTIFACT_TYPE_OPTIONS,
  artifactOptionById,
  type ArtifactTypeOption
} from "@/lib/artifact-generation";

type GenerateArtifactModalProps = {
  initialTypeId?: string;
  generating: boolean;
  defaultTitleFor: (option: ArtifactTypeOption) => string;
  onCancel: () => void;
  onGenerate: (input: {
    option: ArtifactTypeOption;
    title: string;
    instructions: string;
  }) => void;
};

export function GenerateArtifactModal({
  initialTypeId,
  generating,
  defaultTitleFor,
  onCancel,
  onGenerate
}: GenerateArtifactModalProps) {
  const [typeId, setTypeId] = useState(
    () => artifactOptionById(initialTypeId ?? ARTIFACT_TYPE_OPTIONS[0].id).id
  );
  const option = useMemo(() => artifactOptionById(typeId), [typeId]);

  const [title, setTitle] = useState(() => defaultTitleFor(option));
  const [titleEdited, setTitleEdited] = useState(false);
  const [instructions, setInstructions] = useState("");

  // Keep the title in sync with the chosen type until the user edits it.
  const handleSelectType = (id: string) => {
    setTypeId(id);
    if (!titleEdited) setTitle(defaultTitleFor(artifactOptionById(id)));
  };

  const canSubmit = title.trim().length > 0 && !generating;

  return (
    <div className="ws-artifact-overlay" role="dialog" aria-modal="true" aria-label="Generate artifact">
      <div className="ws-genart-dialog">
        <header className="ws-genart-head">
          <div>
            <h3>Generate artifact</h3>
            <p>Create a reusable output from this workspace.</p>
          </div>
          <button type="button" aria-label="Close" onClick={onCancel}>
            ✕
          </button>
        </header>

        <form
          className="ws-genart-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!canSubmit) return;
            onGenerate({ option, title: title.trim(), instructions });
          }}
        >
          <label className="ws-genart-field">
            <span>Artifact type</span>
            <div className="ws-genart-types" role="radiogroup" aria-label="Artifact type">
              {ARTIFACT_TYPE_OPTIONS.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  role="radio"
                  aria-checked={entry.id === typeId}
                  className={`ws-genart-type${entry.id === typeId ? " active" : ""}`}
                  onClick={() => handleSelectType(entry.id)}
                >
                  {entry.label}
                </button>
              ))}
            </div>
          </label>

          <label className="ws-genart-field">
            <span>Artifact title</span>
            <input
              type="text"
              value={title}
              onChange={(event) => {
                setTitle(event.target.value);
                setTitleEdited(true);
              }}
              placeholder="Artifact title"
              autoFocus
            />
          </label>

          <label className="ws-genart-field">
            <span>Optional instructions</span>
            <textarea
              value={instructions}
              onChange={(event) => setInstructions(event.target.value)}
              placeholder="Anything specific to emphasize, include, or format..."
              rows={3}
            />
          </label>

          <div className="ws-genart-actions">
            <button type="button" className="ws-genart-cancel" onClick={onCancel} disabled={generating}>
              Cancel
            </button>
            <button type="submit" className="ws-genart-submit" disabled={!canSubmit}>
              {generating ? "Generating…" : "Generate artifact"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
