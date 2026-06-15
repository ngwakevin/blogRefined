export type ResultDebugInfo = {
  source: "ai" | "repaired" | "fallback";
  fallbackReason?: string;
  repairAttempted: boolean;
  qualityIssues: string[];
  qualityWarnings: string[];
  genericContentDetected?: boolean;
  genericContentFields?: string[];
  provider?: {
    hasKey: boolean;
    model: string | null;
  };
};

type ResultDebugPanelProps = {
  debug?: ResultDebugInfo | null;
};

function formatReason(reason?: string) {
  if (!reason) return "none";
  return reason.replaceAll("_", " ");
}

export function ResultDebugPanel({ debug }: ResultDebugPanelProps) {
  if (process.env.NEXT_PUBLIC_DEBUG_OS !== "true" || !debug) return null;

  return (
    <section className="result-debug-panel" aria-label="Doc/ReDefined debug details">
      <div>
        <span>Source</span>
        <strong>{debug.source}</strong>
      </div>
      <div>
        <span>Fallback reason</span>
        <strong>{formatReason(debug.fallbackReason)}</strong>
      </div>
      <div>
        <span>Repair attempted</span>
        <strong>{debug.repairAttempted ? "yes" : "no"}</strong>
      </div>
      <div>
        <span>Provider</span>
        <strong>
          {debug.provider?.hasKey ? "key loaded" : "missing key"}
          {debug.provider?.model ? ` · ${debug.provider.model}` : ""}
        </strong>
      </div>
      {debug.qualityIssues.length > 0 ? (
        <div className="result-debug-wide">
          <span>Quality issues</span>
          <strong>{debug.qualityIssues.join(" | ")}</strong>
        </div>
      ) : null}
      {debug.qualityWarnings.length > 0 ? (
        <div className="result-debug-wide">
          <span>Quality warnings</span>
          <strong>{debug.qualityWarnings.join(" | ")}</strong>
        </div>
      ) : null}
      <div>
        <span>Generic content</span>
        <strong>{debug.genericContentDetected ? "detected" : "none"}</strong>
      </div>
      {debug.genericContentFields && debug.genericContentFields.length > 0 ? (
        <div className="result-debug-wide">
          <span>Generic fields</span>
          <strong>{debug.genericContentFields.join(" | ")}</strong>
        </div>
      ) : null}
    </section>
  );
}
