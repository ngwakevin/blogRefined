import type { IssueMap } from "@/lib/redefined";

type IssueMapRendererProps = {
  issueMap: IssueMap;
  mapStateLabel: string;
};

export function IssueMapRenderer({ issueMap, mapStateLabel }: IssueMapRendererProps) {
  return (
    <section className="infrastructure-map">
      <div className="map-header">
        <div>
          <p className="map-kicker">Infrastructure hop map</p>
          <h3>{issueMap.title}</h3>
        </div>
        <span className="map-state">{mapStateLabel}</span>
      </div>

      <div className="hop-map">
        {issueMap.nodes.map((node, index) => (
          <div className="hop-node-wrap" key={node.id}>
            <article className="hop-node" data-node={node.id} data-status={node.status ?? "neutral"}>
              <span className="hop-index">{String(index + 1).padStart(2, "0")}</span>
              <strong>{node.label}</strong>
              <em>{node.status ?? "Neutral"}</em>
            </article>
            {index < issueMap.nodes.length - 1 ? (
              <div className="hop-line" aria-hidden="true">
                <span />
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}
