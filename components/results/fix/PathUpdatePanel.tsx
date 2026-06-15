import type { PathUpdate } from "@/lib/redefined";

type PathUpdatePanelProps = {
  pathUpdate: PathUpdate;
};

export function PathUpdatePanel({ pathUpdate }: PathUpdatePanelProps) {
  return (
    <section className={`workspace-card path-update-panel update-${pathUpdate.status}`}>
      <div className="panel-topline">
        <p className="block-label">Path update</p>
        <span>{pathUpdate.status.replaceAll("_", " ")}</span>
      </div>
      <h3>{pathUpdate.title}</h3>
      <p>{pathUpdate.description}</p>

      <div className="next-action">
        <div className="mini-label">Next best action</div>
        <strong>{pathUpdate.nextBestAction.title}</strong>
        <p>{pathUpdate.nextBestAction.description}</p>
        {pathUpdate.nextBestAction.commands?.length ? (
          <div className="next-action-commands">
            {pathUpdate.nextBestAction.commands.map((command) => (
              <code key={command}>{command}</code>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
