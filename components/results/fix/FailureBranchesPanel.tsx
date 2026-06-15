import type { EvidenceSignal, FailureBranch } from "@/lib/redefined";

type FailureBranchesPanelProps = {
  branches: FailureBranch[];
  evidenceSignals?: EvidenceSignal[];
};

function getBranchTone(branch: FailureBranch) {
  const branchText = `${branch.title} ${branch.summary}`.toLowerCase();

  if (
    branchText.includes("network") ||
    branchText.includes("firewall") ||
    branchText.includes("private endpoint") ||
    branchText.includes("dns")
  ) {
    return "blue";
  }

  if (
    branchText.includes("rbac") ||
    branchText.includes("role") ||
    branchText.includes("identity") ||
    branchText.includes("permission")
  ) {
    return "green";
  }

  if (
    branchText.includes("sas") ||
    branchText.includes("token") ||
    branchText.includes("auth")
  ) {
    return "purple";
  }

  return "neutral";
}

function signalMatchesBranch(signal: EvidenceSignal, branch: FailureBranch) {
  const branchValue = `${branch.id} ${branch.title} ${branch.summary}`.toLowerCase();
  const signalBranch = signal.affectedBranchId?.toLowerCase();

  if (signalBranch && branchValue.includes(signalBranch)) return true;
  if (signalBranch === "sas" && /(sas|token|auth)/.test(branchValue)) return true;
  if (signalBranch === "network" && /(network|firewall|private endpoint|dns)/.test(branchValue)) return true;
  if (signalBranch === "rbac" && /(rbac|permission|role|identity)/.test(branchValue)) return true;

  return false;
}

function strongestSignal(signals: EvidenceSignal[]) {
  return signals.reduce<EvidenceSignal | null>((best, signal) => {
    if (!best) return signal;
    return (signal.confidence ?? 0) > (best.confidence ?? 0) ? signal : best;
  }, null);
}

export function FailureBranchesPanel({
  branches,
  evidenceSignals = []
}: FailureBranchesPanelProps) {
  if (branches.length < 1) return null;

  return (
    <section className="workspace-card failure-branches-panel" aria-label="Likely failure branches">
      <div className="section-heading">
        <div>
          <p className="block-label">Failure branches</p>
          <h3>What could be failing</h3>
        </div>
      </div>

      <div className="failure-branches-grid">
        {branches.map((branch) => {
          const matches = evidenceSignals.filter((signal) => signalMatchesBranch(signal, branch));
          const matchedSignal = strongestSignal(matches);

          return (
            <article
              className={`failure-branch-card branch-${getBranchTone(branch)} priority-${branch.priority} ${matchedSignal ? "has-evidence" : ""}`}
              key={branch.id}
            >
              <div className="failure-branch-meta">
                <h4>{branch.title}</h4>
                <span className="priority-pill">{branch.priority}</span>
              </div>
              {matchedSignal ? (
                <div className="branch-evidence-badge">
                  Evidence matched
                  {typeof matchedSignal.confidence === "number"
                    ? ` · ${Math.round(matchedSignal.confidence * 100)}%`
                    : ""}
                </div>
              ) : null}
            <p>{branch.summary}</p>

            <div className="failure-branch-columns">
              <div>
                <strong>Signals</strong>
                <ul>
                  {branch.signals.map((signal) => (
                    <li key={signal}>{signal}</li>
                  ))}
                </ul>
              </div>
              <div>
                <strong>Checks</strong>
                <ul>
                  {branch.checks.map((check) => (
                    <li key={check}>{check}</li>
                  ))}
                </ul>
              </div>
            </div>
          </article>
          );
        })}
      </div>
    </section>
  );
}
