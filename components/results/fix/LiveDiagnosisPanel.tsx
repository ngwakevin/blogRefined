import type { ClassificationResult, FixDiagnosis } from "@/lib/redefined";
import type { ReactNode } from "react";

type LiveDiagnosisPanelProps = {
  originalPrompt: string;
  diagnosis: FixDiagnosis;
  classification: ClassificationResult;
  audioGuideCard?: ReactNode;
};

export function LiveDiagnosisPanel({
  originalPrompt,
  diagnosis,
  classification,
  audioGuideCard
}: LiveDiagnosisPanelProps) {
  return (
    <section className="live-diagnosis-panel" id="fix-diagnosis">
      <div className="diagnosis-topline">
        <div>
          <p className="block-label">Current diagnosis</p>
          <h2>{diagnosis.title}</h2>
        </div>

        <div className="diagnosis-side-cards">
          {audioGuideCard}
          <div className="confidence-pill">
            <span>Confidence</span>
            <strong>
              {diagnosis.confidence[0].toUpperCase() + diagnosis.confidence.slice(1)} ·{" "}
              {Math.round(classification.confidence * 100)}%
            </strong>
          </div>
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
