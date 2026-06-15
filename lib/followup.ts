import type {
  DiagnosticTerminal,
  EnvironmentComparison,
  EvidenceSignal,
  FixDiagnosis,
  FollowUpResult,
  IssueMap,
  PathUpdate,
  RedefinedResult,
  ScratchpadVariable
} from "@/lib/redefined";
import {
  extractScratchpadFromEvidence,
  hasComparableEvidence,
  parseEvidenceSignals
} from "@/lib/evidence";

const RBAC_DIAGNOSIS_TITLE = "RBAC/data-plane permission is likely missing";
const RBAC_DIAGNOSIS_ANSWER =
  "The evidence points to a missing or incorrect Storage Blob Data role assignment at the required scope. Management-plane access such as Owner or Contributor may not be enough for blob/container data access.";
const RBAC_PATH_TITLE = "RBAC/data-plane permission is the leading branch";
const RBAC_NEXT_ACTION =
  "Confirm the caller has Storage Blob Data Reader, Contributor, or Owner at the correct storage account or container scope, then re-authenticate and retry.";

export function applyIssueMapUpdates(
  issueMap: IssueMap,
  updates: FollowUpResult["issueMapUpdates"]
): IssueMap {
  return {
    ...issueMap,
    nodes: issueMap.nodes.map((node) => {
      const update = updates.find((item) => item.nodeId === node.id);
      if (!update) return node;

      return {
        ...node,
        status: update.status,
        reason: update.reason
      };
    }),
    edges: issueMap.edges.map((edge) => {
      const toUpdate = updates.find((item) => item.nodeId === edge.to);
      if (!toUpdate) return edge;
      return { ...edge, status: toUpdate.status };
    })
  };
}

export function mergeScratchpad(
  existing: ScratchpadVariable[],
  updates: ScratchpadVariable[]
): ScratchpadVariable[] {
  const seen = new Set(existing.map((item) => `${item.label}:${item.value}`));
  const merged = [...existing];

  for (const update of updates) {
    const key = `${update.label}:${update.value}`;
    if (seen.has(key)) continue;

    merged.push(update);
    seen.add(key);
  }

  return merged;
}

function withStatus(
  diagnosis: FixDiagnosis,
  status: PathUpdate["status"],
  title: string,
  answer: string,
  confidence: FixDiagnosis["confidence"]
): FollowUpResult["updatedDiagnosis"] {
  return {
    ...diagnosis,
    title,
    answer,
    confidence,
    status
  };
}

function isRbacEvidence(signals: EvidenceSignal[]): boolean {
  return signals.some((signal) => {
    const value = `${signal.id} ${signal.label} ${signal.affectedBranchId ?? ""} ${signal.meaning}`.toLowerCase();
    return (
      value.includes("rbac") ||
      value.includes("permission") ||
      value.includes("role assignment")
    );
  });
}

function findIssueNodeId(issueMap: IssueMap, patterns: RegExp[]): string | null {
  const node = issueMap.nodes.find((item) => {
    const value = `${item.id} ${item.label} ${item.type ?? ""}`.toLowerCase();
    return patterns.some((pattern) => pattern.test(value));
  });

  return node?.id ?? null;
}

function buildRbacIssueMapUpdates(issueMap: IssueMap): FollowUpResult["issueMapUpdates"] {
  const rbacNodeId = findIssueNodeId(issueMap, [/rbac/, /role/, /permission/]);
  const identityNodeId = findIssueNodeId(issueMap, [/identity/, /principal/, /caller/]);
  const updates: FollowUpResult["issueMapUpdates"] = [];

  if (identityNodeId) {
    updates.push({
      nodeId: identityNodeId,
      status: "checking",
      reason: "Evidence requires confirming which principal is attempting data-plane access."
    });
  }

  if (rbacNodeId) {
    updates.push({
      nodeId: rbacNodeId,
      status: "failed",
      reason: "Evidence indicates the required data-plane role assignment is missing or scoped incorrectly."
    });
  }

  return updates;
}

function withRbacTerminal(terminal?: DiagnosticTerminal): DiagnosticTerminal | undefined {
  if (!terminal) return undefined;

  const rbacCommands: DiagnosticTerminal["commands"] = [
    {
      id: "evidence-rbac-role-assignment-list",
      label: "List data-plane role assignments",
      command: "az role assignment list --assignee <principal-id> --scope <storage-scope> -o table",
      category: "auth"
    },
    {
      id: "evidence-rbac-role-assignment-create",
      label: "Assign Storage Blob Data Reader",
      command:
        "az role assignment create --assignee <principal-id> --role \"Storage Blob Data Reader\" --scope <storage-scope>",
      category: "auth"
    }
  ];
  const seen = new Set<string>();

  return {
    ...terminal,
    commands: [...rbacCommands, ...terminal.commands].filter((command) => {
      if (seen.has(command.command)) return false;
      seen.add(command.command);
      return true;
    })
  };
}

export function refineFollowUpForEvidence(
  followUp: FollowUpResult,
  signals: EvidenceSignal[],
  message: string,
  currentResult: RedefinedResult
): FollowUpResult {
  const comparableEvidence = hasComparableEvidence(message);

  if (!isRbacEvidence(signals)) {
    return comparableEvidence
      ? followUp
      : {
          ...followUp,
          environmentComparison: undefined
        };
  }

  if (!currentResult.diagnosis || !currentResult.issueMap) {
    return {
      ...followUp,
      environmentComparison: undefined
    };
  }

  return {
    ...followUp,
    signals: followUp.signals.length > 0 ? followUp.signals : signals,
    updatedDiagnosis: withStatus(
      currentResult.diagnosis,
      "narrowed",
      RBAC_DIAGNOSIS_TITLE,
      RBAC_DIAGNOSIS_ANSWER,
      "high"
    ),
    issueMapUpdates: buildRbacIssueMapUpdates(currentResult.issueMap),
    nextBestAction: {
      title: RBAC_PATH_TITLE,
      description: RBAC_NEXT_ACTION,
      commands: [
        "az role assignment list --assignee <principal-id> --scope <storage-scope> -o table",
        "az role assignment create --assignee <principal-id> --role \"Storage Blob Data Reader\" --scope <storage-scope>"
      ]
    },
    timelineEntries:
      followUp.timelineEntries.length > 0
        ? followUp.timelineEntries
        : [
            {
              id: `timeline-rbac-${Date.now()}`,
              type: "path_recalibrated",
              title: "RBAC evidence matched",
              summary: "Data-plane role assignment is now the leading branch.",
              timestampLabel: "Just now"
            }
          ],
    diagnosticTerminal: withRbacTerminal(followUp.diagnosticTerminal ?? currentResult.diagnosticTerminal),
    environmentComparison: comparableEvidence ? followUp.environmentComparison : undefined,
    resolved: false
  };
}

export function processLocalFollowUp(message: string, currentResult: RedefinedResult): FollowUpResult {
  const value = message.toLowerCase();
  const signals = parseEvidenceSignals(message);
  const scratchpadUpdates = extractScratchpadFromEvidence(message);
  const diagnosis = currentResult.diagnosis;

  if (!diagnosis || !currentResult.issueMap) {
    throw new Error("Follow-up requires a Fix result with diagnosis and issue map.");
  }

  const hasDnsHealthy = signals.some((signal) => signal.id === "dns-healthy");
  const hasTcpFailed = signals.some((signal) => signal.id === "tcp-failed");
  const hasAuthFailed = signals.some((signal) => signal.id === "auth-failed");
  const hasMismatch = signals.some((signal) => signal.id === "config-mismatch");
  const comparableEvidence = hasComparableEvidence(message);

  const base = {
    id: `followup-${Date.now().toString(36)}`,
    parentResultId: currentResult.id,
    userMessage: message,
    signals,
    scratchpadUpdates
  };

  if (isRbacEvidence(signals)) {
    return {
      ...base,
      updatedDiagnosis: withStatus(
        diagnosis,
        "narrowed",
        RBAC_DIAGNOSIS_TITLE,
        RBAC_DIAGNOSIS_ANSWER,
        "high"
      ),
      issueMapUpdates: buildRbacIssueMapUpdates(currentResult.issueMap),
      nextBestAction: {
        title: RBAC_PATH_TITLE,
        description: RBAC_NEXT_ACTION,
        commands: [
          "az role assignment list --assignee <principal-id> --scope <storage-scope> -o table",
          "az role assignment create --assignee <principal-id> --role \"Storage Blob Data Reader\" --scope <storage-scope>"
        ]
      },
      timelineEntries: [
        {
          id: `timeline-rbac-${Date.now()}`,
          type: "evidence_received",
          title: "RBAC evidence received",
          summary: "Detected missing or incorrect Storage data-plane role assignment evidence.",
          timestampLabel: "Just now"
        },
        {
          id: `timeline-rbac-recalibrated-${Date.now()}`,
          type: "path_recalibrated",
          title: "Path recalibrated",
          summary: "RBAC/data-plane permission is now the leading branch.",
          timestampLabel: "Just now"
        }
      ],
      diagnosticTerminal: withRbacTerminal(currentResult.diagnosticTerminal),
      resolved: false
    };
  }

  if (hasDnsHealthy && hasTcpFailed) {
    return {
      ...base,
      updatedDiagnosis: withStatus(
        diagnosis,
        "narrowed",
        "Network path failure is now more likely",
        "DNS appears healthy, but TCP connectivity is failing. Focus on route, firewall, private endpoint, NSG, or port access from the affected host.",
        "high"
      ),
      issueMapUpdates: [
        { nodeId: "resolution", status: "healthy", reason: "Evidence indicates DNS lookup succeeds." },
        { nodeId: "network", status: "failed", reason: "Evidence indicates TCP reachability failed." }
      ],
      nextBestAction: {
        title: "Validate route and firewall path from the gateway server",
        description:
          "Check route tables, firewall rules, NSGs, private endpoint approval, VNet path, and whether TCP 1433 is allowed.",
        commands: ["Test-NetConnection <target-fqdn> -Port 1433"]
      },
      timelineEntries: [
        {
          id: `timeline-evidence-${Date.now()}`,
          type: "evidence_received",
          title: "Evidence ingested",
          summary: "Detected DNS success and TCP failure from pasted evidence.",
          timestampLabel: "Just now"
        },
        {
          id: `timeline-recalibrated-${Date.now()}`,
          type: "path_recalibrated",
          title: "Path recalibrated",
          summary: "DNS marked healthy. Network marked failed.",
          timestampLabel: "Just now"
        }
      ],
      resolved: false
    };
  }

  if ((value.includes("tcptestsucceeded is true") || hasMismatch) && comparableEvidence) {
    const environmentComparison: EnvironmentComparison | undefined = hasMismatch
      ? {
          leftLabel: "Source configuration",
          rightLabel: "Gateway / cloud configuration",
          rows: [
            {
              field: "Server",
              leftValue: "Source value",
              rightValue: "Gateway value",
              status: "mismatch",
              impact: "Server names do not match. Gateway datasource binding may fail."
            }
          ]
        }
      : undefined;

    return {
      ...base,
      updatedDiagnosis: withStatus(
        diagnosis,
        "narrowed",
        "Datasource mapping or application-layer configuration is now more likely",
        "DNS and TCP connectivity appear healthy, so the likely issue shifts to datasource mapping, server name mismatch, credentials, permissions, or application-layer configuration.",
        "high"
      ),
      issueMapUpdates: [
        { nodeId: "resolution", status: "healthy", reason: "Evidence indicates resolution is working." },
        { nodeId: "network", status: "healthy", reason: "Evidence indicates TCP reachability works." },
        {
          nodeId: "target",
          status: "warning",
          reason: "Evidence indicates remaining application or mapping failure."
        }
      ],
      nextBestAction: {
        title: "Compare source values with gateway datasource values",
        description:
          "Server, database, authentication type, and credentials should match exactly between the application/report and gateway datasource."
      },
      timelineEntries: [
        {
          id: `timeline-mismatch-${Date.now()}`,
          type: "path_recalibrated",
          title: "Comparison recommended",
          summary: "Possible environment mismatch detected.",
          timestampLabel: "Just now"
        }
      ],
      environmentComparison,
      resolved: false
    };
  }

  if (hasAuthFailed) {
    return {
      ...base,
      updatedDiagnosis: withStatus(
        diagnosis,
        "narrowed",
        "Authentication or permission failure is now more likely",
        "The path may be reachable, but the request is likely failing during credential, login, role, or permission validation.",
        "high"
      ),
      issueMapUpdates: [
        { nodeId: "target", status: "failed", reason: "Evidence indicates authentication failed." }
      ],
      nextBestAction: {
        title: "Test login from the affected host using the same credential path",
        description:
          "Use the same hostname, database, authentication type, and credentials used by the application or gateway datasource."
      },
      timelineEntries: [
        {
          id: `timeline-auth-${Date.now()}`,
          type: "evidence_received",
          title: "Authentication evidence received",
          summary: "Detected login or authorization failure.",
          timestampLabel: "Just now"
        }
      ],
      resolved: false
    };
  }

  if (value.includes("works") || value.includes("resolved") || value.includes("fixed")) {
    return {
      ...base,
      updatedDiagnosis: withStatus(
        diagnosis,
        "resolved",
        "Issue appears resolved",
        "The troubleshooting journey now has a successful outcome. Capture the fix as a reusable ticket update, checklist, or runbook.",
        "high"
      ),
      issueMapUpdates: currentResult.issueMap.nodes.map((node) => ({
        nodeId: node.id,
        status: "healthy",
        reason: "User reported the issue is resolved."
      })),
      nextBestAction: {
        title: "Generate the closure artifact",
        description: "Create a ticket update or runbook so the fix is documented for the team."
      },
      timelineEntries: [
        {
          id: `timeline-resolved-${Date.now()}`,
          type: "resolved",
          title: "Issue resolved",
          summary: "User reported that the issue works now.",
          timestampLabel: "Just now"
        }
      ],
      resolved: true
    };
  }

  const diagnosticTerminal: DiagnosticTerminal | undefined = signals.length
    ? currentResult.diagnosticTerminal
    : undefined;

  return {
    ...base,
    updatedDiagnosis: withStatus(
      diagnosis,
      "needs_more_evidence",
      "More evidence is needed",
      "The message was captured, but it does not clearly identify which branch succeeded or failed.",
      "low"
    ),
    issueMapUpdates: [],
    nextBestAction: {
      title: "Paste the exact output of the first failed check",
      description: "Include command output, error text, or a screenshot description if possible."
    },
    timelineEntries: [
      {
        id: `timeline-needs-evidence-${Date.now()}`,
        type: "evidence_received",
        title: "Evidence received",
        summary: "Additional information was captured, but the engine needs a clearer test result.",
        timestampLabel: "Just now"
      }
    ],
    diagnosticTerminal,
    resolved: false
  };
}
