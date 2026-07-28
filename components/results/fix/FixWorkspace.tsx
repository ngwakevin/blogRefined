"use client";

import { useState } from "react";
import type {
  DiagnosticTerminal as DiagnosticTerminalData,
  EvidenceBranch,
  EvidenceSignal,
  FollowUpResult,
  PathUpdate,
  RedefinedResult,
  TimelineEntry
} from "@/lib/redefined";
import type { FixWorkspaceResult } from "@/types/redefined";
import type { WorkspaceNarration } from "@/lib/workspace-types";
import { parseEvidenceSignals } from "@/lib/evidence";
import { applyIssueMapUpdates, mergeScratchpad } from "@/lib/followup";
import {
  updateActiveTemporaryJourney,
  updateActiveProfileJourney,
  type GuestLimitState,
  type ProfileJourneyRecord,
  type TemporaryJourneyRecord
} from "@/lib/journey-store";
import { JourneyStatusBadge } from "@/components/journey/JourneyStatusBadge";
import { ResultSourceBadge, type ResultSource } from "@/components/results/ResultSourceBadge";
import { WorkspaceAudioGuide } from "@/components/workspace/WorkspaceAudioGuide";
import { ArtifactToolbar } from "./ArtifactToolbar";
import { DecisionMatrix } from "./DecisionMatrix";
import { DiagnosticTerminal } from "./DiagnosticTerminal";
import { EnvironmentComparePanel } from "./EnvironmentComparePanel";
import { FailureBranchesPanel } from "./FailureBranchesPanel";
import { IssueMapRenderer } from "./IssueMapRenderer";
import { JourneyTimeline } from "./JourneyTimeline";
import { LiveDiagnosisPanel } from "./LiveDiagnosisPanel";
import { PathUpdatePanel } from "./PathUpdatePanel";
import { QuickTestsRenderer } from "./QuickTestsRenderer";
import { ScratchpadPanel } from "./ScratchpadPanel";
import { SmartEvidenceInput } from "./SmartEvidenceInput";

type FixWorkspaceProps = {
  initialResult: RedefinedResult;
  initialSource?: ResultSource;
  temporaryRecord?: TemporaryJourneyRecord | null;
  profileRecord?: ProfileJourneyRecord | null;
  guestLimitState?: GuestLimitState;
  onRequireProfile?: (message?: string, next?: string) => void;
  onNarrationGenerated?: (narration: WorkspaceNarration) => void;
};

type EvidenceBranchType = EvidenceBranch["branchType"];
type SignalBranch = "rbac" | "network" | "token" | "identity" | "configuration" | "unknown";

function getLeadingEvidenceBranch(signals: EvidenceSignal[]): SignalBranch | null {
  const ordered: SignalBranch[] = ["rbac", "network", "token", "identity", "configuration", "unknown"];
  const bestByBranch = new Map<SignalBranch, number>();

  for (const signal of signals) {
    const value = `${signal.affectedBranchId ?? ""} ${signal.label}`.toLowerCase();
    const branch: SignalBranch | null =
      value.includes("rbac") || value.includes("permission") || value.includes("role")
        ? "rbac"
        : value.includes("network") || value.includes("firewall") || value.includes("dns")
          ? "network"
          : value.includes("sas") || value.includes("token") || value.includes("auth")
            ? "token"
            : value.includes("configuration") || value.includes("mismatch")
              ? "configuration"
              : value.includes("identity")
                ? "identity"
                : null;

    if (!branch) continue;
    bestByBranch.set(branch, Math.max(bestByBranch.get(branch) ?? 0, signal.confidence ?? 0.5));
  }

  return ordered
    .filter((branch) => bestByBranch.has(branch))
    .sort((a, b) => (bestByBranch.get(b) ?? 0) - (bestByBranch.get(a) ?? 0))[0] ?? null;
}

function branchCopy(branch: EvidenceBranchType) {
  if (branch === "rbac") {
    return {
      title: "RBAC evidence branch",
      summary: "The pasted evidence points to missing or incorrect Storage Blob Data permissions.",
      nextAction: "Confirm Storage Blob Data Reader/Contributor at the correct storage account or container scope."
    };
  }

  if (branch === "network") {
    return {
      title: "Network evidence branch",
      summary: "The pasted evidence points to firewall, public network access, private endpoint, or DNS path restrictions.",
      nextAction: "Check storage network rules, private endpoint approval, and DNS resolution."
    };
  }

  if (branch === "token") {
    return {
      title: "Token/SAS evidence branch",
      summary: "The pasted evidence points to an expired, invalid, restricted, or incorrectly scoped token/SAS.",
      nextAction: "Validate SAS expiry, permissions, allowed IP, protocol, and clock skew."
    };
  }

  if (branch === "configuration") {
    return {
      title: "Configuration evidence branch",
      summary: "The pasted evidence points to mismatched configured versus observed values.",
      nextAction: "Compare source, target, environment, and runtime configuration values."
    };
  }

  return {
    title: "Evidence branch",
    summary: "The pasted evidence created a focused investigation branch.",
    nextAction: "Review the detected signals and run the most relevant validation check."
  };
}

function buildInvestigationPathUpdate(branch: EvidenceBranchType): PathUpdate {
  const copy = branchCopy(branch);

  return {
    status: "narrowed",
    title: `${copy.title} is active`,
    description: `The original diagnosis is unchanged. New evidence has created a ${copy.title.replace(" evidence branch", "")} investigation branch.`,
    nextBestAction: {
      title: copy.nextAction,
      description: copy.nextAction,
      commands: branchCommands(branch).map((command) => command.command)
    }
  };
}

function prioritizeTerminalCommands(
  terminal: DiagnosticTerminalData,
  branch: SignalBranch | null
): DiagnosticTerminalData {
  if (!branch) return terminal;

  const branchCommandsForType: DiagnosticTerminalData["commands"] =
    branch === "rbac"
      ? branchCommands("rbac")
      : branch === "network"
        ? branchCommands("network")
        : branch === "token"
          ? branchCommands("token")
          : branchCommands(branch);

  const seen = new Set<string>();
  const commands = [...branchCommandsForType, ...terminal.commands].filter((command) => {
    if (seen.has(command.command)) return false;
    seen.add(command.command);
    return true;
  });

  return {
    ...terminal,
    commands
  };
}

function branchCommands(branch: EvidenceBranchType): DiagnosticTerminalData["commands"] {
  if (branch === "rbac") {
    return [
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
  }

  if (branch === "network") {
    return [
      {
        id: "evidence-storage-network-rules",
        label: "Check storage network rules",
        command:
          "az storage account show --name <storage-account-name> --resource-group <resource-group> --query \"{publicNetworkAccess:publicNetworkAccess, defaultAction:networkRuleSet.defaultAction}\"",
        category: "network"
      },
      {
        id: "evidence-storage-blob-dns",
        label: "Check blob DNS",
        command: "nslookup <storage-account-name>.blob.core.windows.net",
        category: "dns"
      },
      {
        id: "evidence-storage-dfs-dns",
        label: "Check dfs DNS",
        command: "nslookup <storage-account-name>.dfs.core.windows.net",
        category: "dns"
      }
    ];
  }

  if (branch === "token") {
    return [
      {
        id: "evidence-sas-review",
        label: "Review SAS constraints",
        command: "Review SAS start time, expiry time, permissions, allowed IP, and protocol.",
        category: "auth"
      }
    ];
  }

  return [];
}

function strongestEvidenceSignal(signals: EvidenceSignal[]) {
  return signals.reduce<EvidenceSignal | null>((best, signal) => {
    if (!best) return signal;
    return (signal.confidence ?? 0.5) > (best.confidence ?? 0.5) ? signal : best;
  }, null);
}

function normalizeConfidence(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 62;
  return value <= 1 ? Math.round(value * 100) : Math.round(value);
}

function createEvidenceBranch(
  branchType: EvidenceBranchType,
  signals: EvidenceSignal[],
  message: string
): EvidenceBranch {
  const copy = branchCopy(branchType);
  const strongest = strongestEvidenceSignal(signals);

  const signalMax = signals.length > 0 ? Math.max(...signals.map((s) => s.confidence ?? 0)) : 0;
  const confValue = strongest?.confidence ?? signalMax;
  const rawConfidence = confValue || 0.62;

  return {
    id: `evidence-${branchType}-${Date.now().toString(36)}`,
    title: copy.title,
    branchType,
    status: "active",
    confidence: normalizeConfidence(rawConfidence),
    summary: copy.summary,
    explanation: {
      meaning: copy.summary,
      whyThisBranch: "The local signal classifier mapped the pasted evidence to this investigation branch.",
      likelyRootCause: copy.nextAction
    },
    cliSteps: branchCommands(branchType).map((command) => ({
      label: command.label,
      command: command.command
    })),
    fixSteps: [copy.nextAction],
    followUpQuestions: [
      "What exact identity, host, or service generated this evidence?",
      "What changed immediately before this issue appeared?"
    ],
    evidenceExcerpt: message.trim().slice(0, 360),
    signals,
    nextAction: copy.nextAction,
    createdAt: new Date().toISOString()
  };
}

function normalizeEvidenceBranchDetail(branch: EvidenceBranch): EvidenceBranch {
  const fallback = createEvidenceBranch(
    branch.branchType,
    branch.signals,
    branch.evidenceExcerpt
  );

  return {
    ...branch,
    confidence: normalizeConfidence(branch.confidence),
    explanation: branch.explanation ?? fallback.explanation,
    cliSteps: branch.cliSteps?.length ? branch.cliSteps : fallback.cliSteps,
    fixSteps: branch.fixSteps?.length ? branch.fixSteps : fallback.fixSteps,
    followUpQuestions: branch.followUpQuestions?.length
      ? branch.followUpQuestions
      : fallback.followUpQuestions
  };
}

function upsertEvidenceBranch(
  branches: EvidenceBranch[],
  branchType: EvidenceBranchType,
  signals: EvidenceSignal[],
  message: string
): EvidenceBranch[] {
  const existing = branches.find((branch) => branch.branchType === branchType);
  const nextBranch = createEvidenceBranch(branchType, signals, message);

  return existing
    ? branches.map((branch) => {
        if (branch.id !== existing.id) {
          return branch.status === "active" ? { ...branch, status: "new" } : branch;
        }

        return {
          ...branch,
          status: "active",
          confidence: Math.max(branch.confidence, nextBranch.confidence),
          evidenceExcerpt: `${branch.evidenceExcerpt}\n\n${nextBranch.evidenceExcerpt}`,
          signals,
          nextAction: nextBranch.nextAction
        };
      })
    : [
        ...branches.map((branch) =>
          branch.status === "active" ? { ...branch, status: "new" as const } : branch
        ),
        nextBranch
      ];
}

function investigationTimeline(branch: EvidenceBranch): TimelineEntry[] {
  return [
    {
      id: `timeline-evidence-analysed-${Date.now()}`,
      type: "evidence_received",
      title: "Evidence analysed",
      summary: `Detected ${branch.title.replace(" evidence branch", "")} signal from pasted evidence.`,
      timestampLabel: "Just now"
    },
    {
      id: `timeline-branch-created-${Date.now()}`,
      type: "path_recalibrated",
      title: "Investigation branch created",
      summary: `${branch.title} added and marked active.`,
      timestampLabel: "Just now"
    },
    {
      id: `timeline-path-updated-${Date.now()}`,
      type: "next_action",
      title: "Path updated",
      summary: branch.nextAction,
      timestampLabel: "Just now"
    }
  ];
}

function confirmedDiagnosis(branch: EvidenceBranch, previous: RedefinedResult["diagnosis"]) {
  if (!previous) return previous;

  if (branch.branchType === "rbac") {
    return {
      ...previous,
      title: "RBAC/data-plane permission is likely missing",
      answer:
        "The evidence branch has been confirmed. The caller is missing or has an incorrect Storage Blob Data role assignment at the required scope.",
      confidence: "high" as const
    };
  }

  return {
    ...previous,
    title: `${branch.title.replace(" evidence branch", "")} confirmed`,
    answer: branch.summary,
    confidence: "high" as const
  };
}

export function FixWorkspace({
  initialResult,
  initialSource = "ai",
  temporaryRecord,
  profileRecord,
  guestLimitState,
  onRequireProfile,
  onNarrationGenerated
}: FixWorkspaceProps) {
  const [result, setResult] = useState(initialResult);
  const [sourceState, setSourceState] = useState<{
    source: ResultSource;
    context: "initial" | "follow-up";
  }>({
    source: initialSource,
    context: "initial"
  });
  const [pathUpdate, setPathUpdate] = useState<PathUpdate>(
    initialResult.pathUpdate ?? {
      status: "initial",
      title: "Collect targeted failure evidence",
      description: "Paste the exact error output, logs, command result, affected identity, endpoint, or timestamp.",
      nextBestAction: {
        title: "Paste evidence",
        description: "Share the exact output of the first failed check."
      }
    }
  );
  const [isUpdating, setIsUpdating] = useState(false);
  const [mapStateLabel, setMapStateLabel] = useState("Initial path");
  const [latestSignals, setLatestSignals] = useState<EvidenceSignal[]>([]);
  const [evidenceBranches, setEvidenceBranches] = useState<EvidenceBranch[]>(
    initialResult.evidenceBranches ?? []
  );
  const [activeEvidenceBranchId, setActiveEvidenceBranchId] = useState<string | null>(
    initialResult.activeEvidenceBranchId ?? null
  );
  const [expandedEvidenceBranchIds, setExpandedEvidenceBranchIds] = useState<string[]>(
    initialResult.activeEvidenceBranchId ? [initialResult.activeEvidenceBranchId] : []
  );

  async function handleFollowUp(message: string, submittedSignals?: EvidenceSignal[]) {
    setIsUpdating(true);
    const localSignals = submittedSignals ?? parseEvidenceSignals(message);
    const localBranch = getLeadingEvidenceBranch(localSignals) ?? "unknown";
    const nextEvidenceBranches = upsertEvidenceBranch(
      evidenceBranches,
      localBranch,
      localSignals,
      message
    );
    const activeEvidenceBranch =
      nextEvidenceBranches.find((branch) => branch.status === "active") ??
      nextEvidenceBranches[nextEvidenceBranches.length - 1];
    const nextActiveEvidenceBranchId = activeEvidenceBranch?.id ?? null;
    const localTimeline = activeEvidenceBranch ? investigationTimeline(activeEvidenceBranch) : [];
    const localPathUpdate = buildInvestigationPathUpdate(localBranch);
    setLatestSignals(localSignals);
    setEvidenceBranches(nextEvidenceBranches);
    setActiveEvidenceBranchId(nextActiveEvidenceBranchId);
    setExpandedEvidenceBranchIds([]);
    if (localBranch) {
      setPathUpdate(localPathUpdate);
      setResult((previous) => ({
        ...previous,
        evidenceBranches: nextEvidenceBranches,
        activeEvidenceBranchId: nextActiveEvidenceBranchId ?? undefined,
        timeline: [...(previous.timeline ?? []), ...localTimeline],
        diagnosticTerminal: previous.diagnosticTerminal
          ? prioritizeTerminalCommands(previous.diagnosticTerminal, localBranch)
          : previous.diagnosticTerminal
      }));
    }

    const localResult: RedefinedResult = {
      ...result,
      evidenceBranches: nextEvidenceBranches,
      activeEvidenceBranchId: nextActiveEvidenceBranchId ?? undefined,
      timeline: [...(result.timeline ?? []), ...localTimeline],
      diagnosticTerminal: result.diagnosticTerminal
        ? prioritizeTerminalCommands(result.diagnosticTerminal, localBranch)
        : result.diagnosticTerminal
    };
    persistWorkspaceResult(localResult, localPathUpdate);

    let followUp: FollowUpResult;

    try {
      const response = await fetch("/api/follow-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: result.id,
          originalPrompt: result.originalPrompt ?? result.title,
          currentResult: localResult,
          evidenceText: message,
          localSignals,
          localEvidenceBranch: activeEvidenceBranch,
          evidenceBranches: nextEvidenceBranches,
          activeEvidenceBranchId: nextActiveEvidenceBranchId,
          timeline: localResult.timeline ?? []
        })
      });

      if (!response.ok) {
        throw new Error("Follow-up request failed.");
      }

      const payload = (await response.json()) as {
        followUp: FollowUpResult;
        source: "ai" | "local" | "repaired";
        warning?: string;
      };
      followUp = payload.followUp;
      setLatestSignals(payload.followUp.signals.length > 0 ? payload.followUp.signals : localSignals);
      setSourceState({
        source: payload.source,
        context: "follow-up"
      });
    } catch {
      setIsUpdating(false);
      return;
    }

    let updatedResult: RedefinedResult | null = null;

    setResult((previous) => {
      if (!previous.issueMap) return previous;
      const followUpBranch = getLeadingEvidenceBranch(followUp.signals) ?? localBranch;
      const terminal = followUp.diagnosticTerminal ?? previous.diagnosticTerminal;
      const mergedEvidenceBranches =
        followUp.updatedEvidenceBranches?.map((branch) =>
          normalizeEvidenceBranchDetail({
            ...branch,
            confidence: normalizeConfidence(branch.confidence)
          })
        ) ??
        (followUp.activeEvidenceBranch
          ? upsertEvidenceBranch(
              nextEvidenceBranches,
              followUp.activeEvidenceBranch.branchType,
              followUp.activeEvidenceBranch.signals,
              followUp.activeEvidenceBranch.evidenceExcerpt
            ).map((branch) => {
              if (branch.branchType !== followUp.activeEvidenceBranch?.branchType) return branch;
              const aiBranch = followUp.activeEvidenceBranch;
              return normalizeEvidenceBranchDetail({
                ...branch,
                ...aiBranch,
                id: branch.id,
                confidence: normalizeConfidence(
                  aiBranch.confidence ?? branch.confidence
                ),
                signals: aiBranch.signals?.length ? aiBranch.signals : branch.signals,
                evidenceExcerpt: aiBranch.evidenceExcerpt ?? branch.evidenceExcerpt,
                createdAt: aiBranch.createdAt ?? branch.createdAt
              });
            })
          : nextEvidenceBranches);
      const activeBranchId =
        followUp.activeEvidenceBranch?.id ??
        mergedEvidenceBranches.find((branch) => branch.status === "active")?.id ??
        nextActiveEvidenceBranchId ??
        undefined;

      updatedResult = {
        ...previous,
        diagnosis: followUp.shouldPromoteDiagnosis
          ? {
              title: followUp.updatedDiagnosis.title,
              answer: followUp.updatedDiagnosis.answer,
              confidence: followUp.updatedDiagnosis.confidence,
              why: followUp.updatedDiagnosis.why,
              likelyCauses: followUp.updatedDiagnosis.likelyCauses
            }
          : previous.diagnosis,
        issueMap: applyIssueMapUpdates(previous.issueMap, followUp.issueMapUpdates),
        scratchpad: mergeScratchpad(previous.scratchpad ?? [], followUp.scratchpadUpdates),
        timeline: [...(previous.timeline ?? []), ...followUp.timelineEntries],
        evidenceBranches: mergedEvidenceBranches,
        activeEvidenceBranchId: activeBranchId,
        diagnosticTerminal: terminal
          ? prioritizeTerminalCommands(terminal, followUpBranch)
          : terminal,
        environmentComparison: followUp.environmentComparison
      };

      return updatedResult;
    });

    const followUpBranch = getLeadingEvidenceBranch(followUp.signals) ?? localBranch;
    const nextPathUpdate = followUp.pathUpdate ?? buildInvestigationPathUpdate(followUpBranch);

    if (followUp.updatedEvidenceBranches) {
      const normalizedBranches = followUp.updatedEvidenceBranches.map((branch) =>
        normalizeEvidenceBranchDetail({
          ...branch,
          confidence: normalizeConfidence(branch.confidence)
        })
      );
      setEvidenceBranches(normalizedBranches);
      const nextActiveId =
        followUp.activeEvidenceBranch?.id ??
          normalizedBranches.find((branch) => branch.status === "active")?.id ??
          nextActiveEvidenceBranchId;
      setActiveEvidenceBranchId(nextActiveId);
      setExpandedEvidenceBranchIds([]);
    } else if (followUp.activeEvidenceBranch) {
      const aiBranch = followUp.activeEvidenceBranch;
      const matchedLocalBranch = evidenceBranches.find(
        (b) => b.id === aiBranch.id || b.branchType === aiBranch.branchType
      );
      setEvidenceBranches((branches) =>
        branches.map((branch) => {
          if (branch.id !== matchedLocalBranch?.id && branch.branchType !== aiBranch.branchType) {
            return branch;
          }
          return normalizeEvidenceBranchDetail({
            ...branch,
            ...aiBranch,
            id: branch.id,
            confidence: normalizeConfidence(aiBranch.confidence ?? branch.confidence),
            signals: aiBranch.signals?.length ? aiBranch.signals : branch.signals,
            evidenceExcerpt: aiBranch.evidenceExcerpt ?? branch.evidenceExcerpt,
            createdAt: aiBranch.createdAt ?? branch.createdAt
          });
        })
      );
      setActiveEvidenceBranchId(matchedLocalBranch?.id ?? nextActiveEvidenceBranchId);
      setExpandedEvidenceBranchIds([]);
    }
    setPathUpdate(nextPathUpdate);

    setMapStateLabel(followUp.resolved ? "Resolved" : "Path recalibrated");
    const persistedResult = updatedResult as RedefinedResult | null;
    if (persistedResult) {
      const nextPersistedResult = {
        ...(persistedResult as FixWorkspaceResult),
        pathUpdate: {
          status: nextPathUpdate.status,
          title: nextPathUpdate.title,
          description: nextPathUpdate.description,
          nextBestAction: nextPathUpdate.nextBestAction
        }
      };

      if (profileRecord) {
        updateActiveProfileJourney(nextPersistedResult);
      } else {
        updateActiveTemporaryJourney(nextPersistedResult);
      }
    }
    setIsUpdating(false);
  }

  function persistWorkspaceResult(nextResult: RedefinedResult, nextPathUpdate: PathUpdate) {
    const nextPersistedResult = {
      ...(nextResult as FixWorkspaceResult),
      pathUpdate: {
        status: nextPathUpdate.status,
        title: nextPathUpdate.title,
        description: nextPathUpdate.description,
        nextBestAction: nextPathUpdate.nextBestAction
      }
    };

    if (profileRecord) {
      updateActiveProfileJourney(nextPersistedResult);
    } else {
      updateActiveTemporaryJourney(nextPersistedResult);
    }
  }

  function handleConfirmBranch(branch: EvidenceBranch) {
    const nextBranches = evidenceBranches.map((item) =>
      item.id === branch.id ? { ...item, status: "confirmed" as const } : item
    );
    const nextPathUpdate: PathUpdate = {
      status: "narrowed",
      title: `${branch.title.replace(" evidence branch", "")} confirmed`,
      description: branch.summary,
      nextBestAction: {
        title: branch.nextAction,
        description: branch.nextAction,
        commands: branchCommands(branch.branchType).map((command) => command.command)
      }
    };
    let nextResult: RedefinedResult | null = null;

    setEvidenceBranches(nextBranches);
    setActiveEvidenceBranchId(branch.id);
    setExpandedEvidenceBranchIds([branch.id]);
    setLatestSignals(branch.signals);
    setPathUpdate(nextPathUpdate);
    setResult((previous) => {
      nextResult = {
        ...previous,
        diagnosis: confirmedDiagnosis(branch, previous.diagnosis),
        evidenceBranches: nextBranches,
        timeline: [
          ...(previous.timeline ?? []),
          {
            id: `timeline-root-confirmed-${Date.now()}`,
            type: "path_recalibrated",
            title: "Root cause confirmed",
            summary: `${branch.title} marked as confirmed.`,
            timestampLabel: "Just now"
          }
        ],
        diagnosticTerminal: previous.diagnosticTerminal
          ? prioritizeTerminalCommands(previous.diagnosticTerminal, branch.branchType)
          : previous.diagnosticTerminal
      };

      return nextResult;
    });

    if (nextResult) {
      persistWorkspaceResult(nextResult, nextPathUpdate);
    }
  }

  function handleDismissBranch(branch: EvidenceBranch) {
    const nextBranches = evidenceBranches.map((item) =>
      item.id === branch.id ? { ...item, status: "dismissed" as const } : item
    );
    const nextSignals = latestSignals.filter((signal) => {
      const branchValue = signal.affectedBranchId?.toLowerCase();
      if (branch.branchType === "token") return branchValue !== "sas" && branchValue !== "token";
      return branchValue !== branch.branchType;
    });
    let nextResult: RedefinedResult | null = null;

    setEvidenceBranches(nextBranches);
    setActiveEvidenceBranchId((current) => (current === branch.id ? null : current));
    setExpandedEvidenceBranchIds((current) => current.filter((id) => id !== branch.id));
    setLatestSignals(nextSignals);
    setResult((previous) => {
      nextResult = {
        ...previous,
        evidenceBranches: nextBranches,
        timeline: [
          ...(previous.timeline ?? []),
          {
            id: `timeline-branch-dismissed-${Date.now()}`,
            type: "path_recalibrated",
            title: "Branch dismissed",
            summary: `${branch.title} dismissed from active investigation.`,
            timestampLabel: "Just now"
          }
        ]
      };

      return nextResult;
    });

    if (nextResult) {
      persistWorkspaceResult(nextResult, pathUpdate);
    }
  }

  function handleRunBranchCommands(branch: EvidenceBranch) {
    if (result.diagnosticTerminal) {
      setResult((previous) => ({
        ...previous,
        diagnosticTerminal: previous.diagnosticTerminal
          ? prioritizeTerminalCommands(previous.diagnosticTerminal, branch.branchType)
          : previous.diagnosticTerminal
      }));
    }

    window.requestAnimationFrame(() => {
      document.getElementById("diagnostic-terminal")?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    });
  }

  function handleAddBranchToTicket(branch: EvidenceBranch) {
    let nextResult: RedefinedResult | null = null;

    setResult((previous) => {
      nextResult = {
        ...previous,
        timeline: [
          ...(previous.timeline ?? []),
          {
            id: `timeline-ticket-context-${Date.now()}`,
            type: "artifact_created",
            title: "Branch added to ticket context",
            summary: branch.summary,
            timestampLabel: "Just now"
          }
        ]
      };

      return nextResult;
    });

    if (nextResult) {
      persistWorkspaceResult(nextResult, pathUpdate);
    }
  }

  function handleToggleEvidenceBranch(branchId: string) {
    setExpandedEvidenceBranchIds((current) =>
      current.includes(branchId)
        ? current.filter((id) => id !== branchId)
        : [...current, branchId]
    );
  }

  function handleCollapseAllEvidenceBranches() {
    setExpandedEvidenceBranchIds([]);
  }

  function handleExpandAllEvidenceBranches() {
    setExpandedEvidenceBranchIds(
      evidenceBranches
        .filter((branch) => branch.status !== "dismissed")
        .map((branch) => branch.id)
    );
  }

  function handleNarrationGenerated(narration: WorkspaceNarration) {
    setResult((previous) => ({
      ...previous,
      workspaceAudioGuides: [
        ...(previous.workspaceAudioGuides ?? []).filter(
          (guide) => guide.sourceResultHash !== narration.sourceResultHash
        ),
        narration
      ]
    }));
    onNarrationGenerated?.(narration);
  }

  if (!result.diagnosis || !result.issueMap || !result.diagnosticTerminal) return null;

  const renderedResult: RedefinedResult = {
    ...result,
    pathUpdate
  };

  return (
    <section className="fix-workspace">
      <div className="workspace-status-row">
        <ResultSourceBadge source={sourceState.source} context={sourceState.context} />
        {temporaryRecord && guestLimitState ? (
          <JourneyStatusBadge
            count={guestLimitState.count}
            limit={guestLimitState.limit}
          />
        ) : null}
      </div>

      <LiveDiagnosisPanel
        originalPrompt={result.originalPrompt ?? result.title}
        diagnosis={result.diagnosis}
        classification={result.classification}
        audioGuideCard={
          <WorkspaceAudioGuide
            result={renderedResult}
            workspaceMeta={result.workspaceMeta}
            originalPrompt={result.originalPrompt ?? result.workspaceMeta?.originalPrompt ?? result.title}
            initialNarration={(result.workspaceAudioGuides ?? []).at(-1)}
            onNarrationGenerated={handleNarrationGenerated}
            variant="compact"
          />
        }
      />

      <FailureBranchesPanel
        branches={result.failureBranches ?? []}
        evidenceSignals={latestSignals}
      />

      <IssueMapRenderer issueMap={result.issueMap} mapStateLabel={mapStateLabel} />

      <section className="fix-workspace-grid">
        <div className="workspace-left">
          <QuickTestsRenderer quickTests={result.quickTests ?? []} />
          <DecisionMatrix decisions={result.decisionPath ?? []} />
          <EnvironmentComparePanel comparison={result.environmentComparison} />
        </div>

        <div className="workspace-right">
          <PathUpdatePanel pathUpdate={pathUpdate} />
          <ScratchpadPanel variables={result.scratchpad ?? []} />
          <JourneyTimeline entries={result.timeline ?? []} />
        </div>
      </section>

      <SmartEvidenceInput
        isUpdating={isUpdating}
        evidenceBranches={evidenceBranches}
        evidenceSignals={latestSignals}
        expandedBranchIds={expandedEvidenceBranchIds}
        onSubmit={handleFollowUp}
        onConfirmBranch={handleConfirmBranch}
        onDismissBranch={handleDismissBranch}
        onRunBranchCommands={handleRunBranchCommands}
        onAddBranchToTicket={handleAddBranchToTicket}
        onToggleBranch={handleToggleEvidenceBranch}
        onCollapseAllBranches={handleCollapseAllEvidenceBranches}
        onExpandAllBranches={handleExpandAllEvidenceBranches}
      />

      <DiagnosticTerminal terminal={result.diagnosticTerminal} />

      <ArtifactToolbar
        actions={result.artifacts ?? []}
        evidenceSignals={latestSignals}
        result={renderedResult}
        onRequireProfile={onRequireProfile}
      />
    </section>
  );
}
