import type { EnvironmentComparison } from "@/lib/redefined";

type EnvironmentComparePanelProps = {
  comparison?: EnvironmentComparison;
};

export function EnvironmentComparePanel({ comparison }: EnvironmentComparePanelProps) {
  if (!comparison) return null;

  return (
    <section className="workspace-panel">
      <div className="block-label">Environment compare</div>

      <div className="compare-table">
        <div className="compare-head">
          <span>Field</span>
          <span>{comparison.leftLabel}</span>
          <span>{comparison.rightLabel}</span>
        </div>

        {comparison.rows.map((row) => (
          <div className={`compare-row compare-${row.status}`} key={row.field}>
            <strong>{row.field}</strong>
            <span>{row.leftValue}</span>
            <span>{row.rightValue}</span>
            {row.impact ? <p>{row.impact}</p> : null}
          </div>
        ))}
      </div>
    </section>
  );
}
