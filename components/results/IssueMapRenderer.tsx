import type { IssueMap } from "@/lib/redefined";

type IssueMapRendererProps = {
  issueMap: IssueMap;
};

export default function IssueMapRenderer({ issueMap }: IssueMapRendererProps) {
  const likelyZones = new Set(issueMap.likelyFailureZones);
  const likelyZoneNodes = issueMap.nodes.filter((node) => likelyZones.has(node.id));
  const likelyZoneLabels = likelyZoneNodes.length
    ? likelyZoneNodes.map((node) => ({ id: node.id, label: node.label }))
    : issueMap.likelyFailureZones.map((zone) => ({ id: zone, label: zone }));

  return (
    <section className="issue-map" aria-label={issueMap.title}>
      <div className="issue-map-header">
        <div>
          <div className="issue-map-kicker">Issue map</div>
          <h3>{issueMap.title}</h3>
          <p>{issueMap.summary}</p>
        </div>

        {issueMap.likelyFailureZones.length ? (
          <div className="failure-zones" aria-label="Likely failure zones">
            <span>Likely failure zones</span>
            <div>
              {likelyZoneLabels.map((zone) => (
                <strong key={zone.id}>{zone.label}</strong>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="issue-map-path">
        {issueMap.nodes.map((node, index) => {
          const outgoingEdge = issueMap.edges.find((edge) => edge.from === node.id);
          const isLikelyZone = likelyZones.has(node.id);

          return (
            <div className="issue-map-step" key={node.id}>
              <article
                className={`issue-node risk-${node.risk ?? "low"}${
                  isLikelyZone ? " likely-zone" : ""
                } status-${node.status ?? "neutral"}`}
              >
                <span className="node-index">{String(index + 1).padStart(2, "0")}</span>
                <h4>{node.label}</h4>
                {node.type ? <em>{node.type}</em> : null}
                {node.reason ? <p className="node-reason">{node.reason}</p> : null}
                {node.check ? <p className="node-check">{node.check}</p> : null}
              </article>

              {index < issueMap.nodes.length - 1 ? (
                <div className="issue-edge" aria-hidden="true">
                  <span className="edge-pulse" />
                  {outgoingEdge?.label ? <em>{outgoingEdge.label}</em> : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
