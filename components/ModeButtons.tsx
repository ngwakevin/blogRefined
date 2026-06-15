"use client";

import { MODES } from "@/lib/constants";

type Mode = (typeof MODES)[number]["id"];

type ModeButtonsProps = {
  activeMode: Mode;
  moving: boolean;
  onModeChange: (mode: Mode) => void;
};

export default function ModeButtons({
  activeMode,
  moving,
  onModeChange
}: ModeButtonsProps) {
  const activeConfig = MODES.find((mode) => mode.id === activeMode) ?? MODES[0];

  return (
    <nav className="mode-nav" aria-label="Prompt modes">
      <span
        className={`mode-arrow${moving ? " moving" : ""}`}
        style={{ left: activeConfig.arrowLeft }}
        aria-hidden="true"
      >
        &rarr;
      </span>

      {MODES.map((mode) => (
        <button
          className={`mode${activeMode === mode.id ? " active" : ""}`}
          data-mode={mode.id}
          key={mode.id}
          onClick={() => onModeChange(mode.id)}
          type="button"
        >
          {mode.label}
        </button>
      ))}
    </nav>
  );
}
