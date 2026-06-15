import type { EvidenceSignal, RedefinedResult } from "@/lib/redefined";

function issueMapSummary(result: RedefinedResult) {
  return (
    result.issueMap?.nodes
      .map((node) => `- ${node.label}: ${node.status ?? "neutral"}${node.reason ? ` — ${node.reason}` : ""}`)
      .join("\n") ?? "- No issue map available."
  );
}

function failureBranchSummary(result: RedefinedResult) {
  if (!result.failureBranches?.length) return "- No failure branches captured.";

  return result.failureBranches
    .map((branch) => {
      const signals = branch.signals.map((signal) => `  - Signal: ${signal}`).join("\n");
      const checks = branch.checks.map((check) => `  - Check: ${check}`).join("\n");
      return `- ${branch.title} (${branch.priority}): ${branch.summary}\n${signals}\n${checks}`;
    })
    .join("\n");
}

function causalGraphSummary(result: RedefinedResult) {
  if (!result.causalGraph) return "- No causal graph captured.";

  const steps = result.causalGraph.simulationSteps
    .map((step) => `- ${step.title}: ${step.description}`)
    .join("\n");

  return `Title: ${result.causalGraph.title}
Confidence: ${result.causalGraph.confidence}

${steps}`;
}

export function buildTicketUpdate(result: RedefinedResult): string {
  return `# Ticket Update

## Original prompt
${result.originalPrompt ?? result.title}

## Current diagnosis
${result.diagnosis?.title ?? result.title}

${result.diagnosis?.answer ?? result.summary}

## Current path update
${result.pathUpdate?.title ?? "No path update available."}

${result.pathUpdate?.description ?? ""}

## Issue map status
${issueMapSummary(result)}

## Likely failure branches
${failureBranchSummary(result)}

## Live causal graph
${causalGraphSummary(result)}

## Next best action
${result.pathUpdate?.nextBestAction.title ?? "Review current diagnosis."}

${result.pathUpdate?.nextBestAction.description ?? ""}

## Timeline
${result.timeline?.map((entry) => `- ${entry.title}: ${entry.summary}`).join("\n") ?? "- No timeline entries."}
`;
}

export function buildRunbook(result: RedefinedResult): string {
  const shell = result.diagnosticTerminal?.shell ?? "generic";
  const commands = result.diagnosticTerminal?.commands.map((item) => item.command).join("\n") ?? "";
  const variables =
    result.scratchpad?.map((item) => `# ${item.label}=${item.value}`).join("\n") ?? "# No variables captured.";
  const notes = result.diagnosticTerminal?.notes?.map((note) => `# ${note}`).join("\n") ?? "";
  const branchChecks =
    result.failureBranches
      ?.map((branch) => [`# ${branch.title}`, ...branch.checks.map((check) => `# - ${check}`)].join("\n"))
      .join("\n\n") ?? "# No failure branch checks captured.";

  return `# Doc/ReDefined runbook
# Shell: ${shell}

${variables}

${notes}

# Failure branch checks
${branchChecks}

${commands}
`;
}

export function buildSummary(result: RedefinedResult): string {
  return `# Doc/ReDefined Summary

${result.title}

${result.summary}

Diagnosis: ${result.diagnosis?.title ?? "Not available"}

Causal graph: ${result.causalGraph?.title ?? "Not available"}

Next action: ${result.pathUpdate?.nextBestAction.title ?? "Not available"}
`;
}

function evidenceLines(signals: EvidenceSignal[]) {
  if (signals.length < 1) return "- No evidence signals captured yet.";
  return signals.map((signal) => `- ${signal.matchedText}`).join("\n");
}

function likelyBranchSummary(signals: EvidenceSignal[]) {
  const text = signals
    .map((signal) => `${signal.affectedBranchId ?? ""} ${signal.label} ${signal.matchedText}`)
    .join(" ")
    .toLowerCase();

  if (/(rbac|permission|role)/.test(text)) {
    return "Likely RBAC/data-plane permission issue, with possible network restriction.";
  }
  if (/(network|firewall|dns|private endpoint)/.test(text)) {
    return "Likely network access restriction, with authorization still worth confirming.";
  }
  if (/(sas|token|auth)/.test(text)) {
    return "Likely SAS/token configuration issue, with authorization scope still worth confirming.";
  }

  return "Likely access failure with authorization and network branches still under review.";
}

function incidentNextAction(result: RedefinedResult, signals: EvidenceSignal[]) {
  const text = signals
    .map((signal) => `${signal.affectedBranchId ?? ""} ${signal.label} ${signal.matchedText}`)
    .join(" ")
    .toLowerCase();

  if (/(rbac|permission|role)/.test(text)) {
    return "Assign Storage Blob Data Reader/Contributor at correct scope and re-test.";
  }
  if (/(network|firewall|dns|private endpoint)/.test(text)) {
    return "Validate storage firewall, public network access, private endpoint, and DNS path.";
  }
  if (/(sas|token|auth)/.test(text)) {
    return "Validate SAS expiry, permissions, allowed IP, and HTTPS-only settings.";
  }

  return result.pathUpdate?.nextBestAction.title ?? "Run the next diagnostic check and re-test.";
}

function incidentTitle(result: RedefinedResult) {
  const value = `${result.title} ${result.originalPrompt ?? ""}`.toLowerCase();
  if (/(storage|blob|container|adls)/.test(value) && /(access denied|403|not authorized|authorization)/.test(value)) {
    return "Storage access denied";
  }

  return result.title || "Storage access denied";
}

export function buildIncidentBrief(
  result: RedefinedResult,
  signals: EvidenceSignal[] = []
): string {
  return `# Incident Brief

## Title
${incidentTitle(result)}

## Summary
${likelyBranchSummary(signals)}

## Evidence
${evidenceLines(signals)}

## Next action
${incidentNextAction(result, signals)}
`;
}

export function buildSlackIncidentBrief(
  result: RedefinedResult,
  signals: EvidenceSignal[] = []
): string {
  return `*Incident brief: ${incidentTitle(result)}*

*Summary:* ${likelyBranchSummary(signals)}

*Evidence:*
${evidenceLines(signals)}

*Next action:* ${incidentNextAction(result, signals)}`;
}
