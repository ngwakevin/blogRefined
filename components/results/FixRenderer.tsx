import { FixDiagnosisPanel } from "@/components/results/FixDiagnosisPanel";
import IssueMapRenderer from "@/components/results/IssueMapRenderer";
import type { RedefinedResult } from "@/lib/redefined";

type FixRendererProps = {
  result: RedefinedResult;
};

export default function FixRenderer({ result }: FixRendererProps) {
  const likelyFailureNodes =
    result.issueMap?.nodes.filter((node) => result.issueMap?.likelyFailureZones.includes(node.id)) ??
    [];

  return (
    <>
      {result.diagnosis ? <FixDiagnosisPanel diagnosis={result.diagnosis} /> : null}

      {result.issueMap ? <IssueMapRenderer issueMap={result.issueMap} /> : null}

      <div className="fix-content-grid">
        <section className="fix-checks">
          <div className="block-label">Confirmation checks</div>

          <div className="fix-check-list">
            {result.sections.map((section, index) => (
              <article className="fix-check-card" key={`${section.title}-${index}`}>
                <div className="section-index">{String(index + 1).padStart(2, "0")}</div>

                <div>
                  <h3>{section.title}</h3>
                  {section.type === "checklist" ? (
                    <ul>
                      {section.items.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>{section.description}</p>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>

        {likelyFailureNodes.length ? (
          <aside className="fix-insight-panel">
            <div className="block-label">Likely failure areas</div>

            <ul>
              {likelyFailureNodes.map((node) => (
                <li key={node.id}>
                  <strong>{node.label}</strong>
                  {node.reason ? <p>{node.reason}</p> : null}
                </li>
              ))}
            </ul>
          </aside>
        ) : null}
      </div>
    </>
  );
}
