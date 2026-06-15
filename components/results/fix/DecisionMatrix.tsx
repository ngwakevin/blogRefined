import type { DecisionPathItem } from "@/lib/redefined";

type DecisionMatrixProps = {
  decisions: DecisionPathItem[];
};

export function DecisionMatrix({ decisions }: DecisionMatrixProps) {
  return (
    <section className="workspace-card decision-matrix">
      <div className="section-heading">
        <div>
          <p className="block-label">Triage decision logic matrix</p>
          <h3>If this happens, go here</h3>
        </div>
      </div>

      {decisions.map((decision) => (
        <article className="decision-row" key={decision.id}>
          <span>{decision.condition}</span>
          <strong>{decision.meaning}</strong>
          <p>{decision.nextAction}</p>
        </article>
      ))}
    </section>
  );
}
