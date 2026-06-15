import type { ScratchpadVariable } from "@/lib/redefined";

type ScratchpadPanelProps = {
  variables: ScratchpadVariable[];
};

export function ScratchpadPanel({ variables }: ScratchpadPanelProps) {
  return (
    <section className="workspace-card scratchpad-panel">
      <p className="block-label">Session sandbox memory</p>
      <h3>Discovered variables</h3>

      <div className="scratchpad-list">
        {variables.map((variable) => (
          <article key={variable.id}>
            <span>{variable.label}</span>
            <button type="button">{variable.value}</button>
          </article>
        ))}
      </div>
    </section>
  );
}
