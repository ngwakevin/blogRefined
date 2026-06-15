import type { ClassificationResult, FixDiagnosis } from "@/lib/redefined";

type LiveDiagnosisPanelProps = {
  originalPrompt: string;
  diagnosis: FixDiagnosis;
  classification: ClassificationResult;
};

export function LiveDiagnosisPanel({
  originalPrompt,
  diagnosis,
  classification
}: LiveDiagnosisPanelProps) {
  return (
    <section className="live-diagnosis-panel">
      <div className="diagnosis-topline">
        <div>
          <p className="block-label">Current diagnosis</p>
          <h2>{diagnosis.title}</h2>
        </div>

        <div className="confidence-pill">
          <span>Confidence</span>
          <strong>
            {diagnosis.confidence[0].toUpperCase() + diagnosis.confidence.slice(1)} ·{" "}
            {Math.round(classification.confidence * 100)}%
          </strong>
        </div>
      </div>

      <p className="diagnosis-answer">{diagnosis.answer}</p>

      <div className="original-issue-meta">
        <span>Original issue</span>
        <strong>{originalPrompt}</strong>
      </div>
    </section>
  );
}
