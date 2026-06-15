import type { FixDiagnosis } from "@/lib/redefined";

type FixDiagnosisPanelProps = {
  diagnosis: FixDiagnosis;
};

function getConfidenceLabel(confidence: FixDiagnosis["confidence"]) {
  const labels = {
    low: "Low confidence",
    medium: "Medium confidence",
    high: "High confidence"
  };

  return labels[confidence];
}

export function FixDiagnosisPanel({ diagnosis }: FixDiagnosisPanelProps) {
  return (
    <section className="fix-diagnosis-panel">
      <div className="fix-diagnosis-main">
        <div className="block-label">Likely diagnosis</div>

        <div className="diagnosis-title-row">
          <h3>{diagnosis.title}</h3>
          <span className={`diagnosis-confidence confidence-${diagnosis.confidence}`}>
            {getConfidenceLabel(diagnosis.confidence)}
          </span>
        </div>

        <p className="diagnosis-answer">{diagnosis.answer}</p>

        {diagnosis.why.length > 0 ? (
          <div className="diagnosis-why">
            <div className="mini-label">Why this is likely</div>

            <ul>
              {diagnosis.why.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <aside className="likely-causes-panel">
        <div className="mini-label">Likely causes</div>

        <div className="likely-cause-list">
          {diagnosis.likelyCauses.map((cause) => (
            <article className="likely-cause" key={cause.label}>
              <div className="cause-topline">
                <strong>{cause.label}</strong>
                <span className={`priority priority-${cause.priority}`}>{cause.priority}</span>
              </div>

              <p>{cause.reason}</p>
            </article>
          ))}
        </div>
      </aside>
    </section>
  );
}
