"use client";

import Link from "next/link";
import { useCallback } from "react";
import type { WorkspaceTabId } from "@/components/workspace/WorkspaceTabNav";
import { WorkspaceAudioGuide } from "@/components/workspace/WorkspaceAudioGuide";
import { WorkspaceFollowUp } from "@/components/workspace/WorkspaceFollowUp";
import { DASHBOARD_CHANGED_EVENT } from "@/components/dashboard/DashboardModals";
import { showToast } from "@/components/Toast";
import { openGenerateArtifact as openGenerateArtifactModal, WorkspaceArtifacts } from "@/components/workspace/WorkspaceArtifacts";
import { ArtifactWorkspace } from "@/components/results/artifact/ArtifactWorkspace";
import { BuildWorkspace } from "@/components/results/build/BuildWorkspace";
import { FixWorkspace } from "@/components/results/fix/FixWorkspace";
import { UnderstandWorkspace } from "@/components/results/understand/UnderstandWorkspace";
import { relativeTime } from "@/lib/dashboard-store";
import { persistWorkspaceResult } from "@/lib/journey-store";
import { coerceResultToLens, resolveLensPath, type LensId } from "@/lib/lens-contracts";
import type { ResultSource } from "@/components/results/ResultSourceBadge";
import type {
  GuestLimitState,
  ProfileJourneyRecord,
  TemporaryJourneyRecord
} from "@/lib/journey-store";
import type { PathUpdate, RedefinedResult } from "@/lib/redefined";
import type {
  JourneyEvent,
  WorkspaceNarration,
  WorkspacePromptRun,
  WorkspacePromptRunStatus
} from "@/lib/workspace-types";

type WorkspaceTraceTabsProps = {
  result: RedefinedResult;
  source?: ResultSource;
  temporaryRecord?: TemporaryJourneyRecord | null;
  profileRecord?: ProfileJourneyRecord | null;
  guestLimitState?: GuestLimitState;
  recordId?: string;
  originalPrompt?: string;
  activeTab: WorkspaceTabId;
  onTabChange: (tab: WorkspaceTabId) => void;
  onNarrationGenerated?: (narration: WorkspaceNarration) => void;
  onRequireProfile?: (message?: string, next?: string) => void;
  onGenerateArtifact?: (prompt: string, sourceResult: RedefinedResult) => void;
  onResultChange?: (result: RedefinedResult) => void;
};

function statusLabel(status: WorkspacePromptRunStatus): string {
  if (status === "running") return "Running";
  if (status === "completed") return "Completed";
  if (status === "cancelled") return "Cancelled";
  return "Failed";
}

function statusTone(status: WorkspacePromptRunStatus): string {
  if (status === "running") return "running";
  if (status === "completed") return "completed";
  if (status === "cancelled") return "cancelled";
  return "failed";
}

function sectionTitleFor(result: RedefinedResult, sectionId?: string): string | null {
  if (!sectionId) return null;
  return result.workspaceSections?.find((section) => section.id === sectionId)?.title ?? null;
}

function promptRunTitle(run: WorkspacePromptRun, index: number): string {
  const firstLine = run.prompt.split("\n")[0].trim();
  return `Prompt ${index + 1}: ${firstLine.length > 84 ? `${firstLine.slice(0, 81)}…` : firstLine}`;
}

function getPromptRunResult(result: RedefinedResult, run: WorkspacePromptRun): RedefinedResult | null {
  if (run.resultId === result.id || run.id === result.promptRunId) return result;

  const followUp = (result.workspaceFollowUpResults ?? []).find(
    (entry) =>
      entry.promptRunId === run.id ||
      entry.id === run.resultId ||
      entry.content.id === run.resultId
  );

  return followUp?.content ?? null;
}

function getPromptRunArtifacts(result: RedefinedResult, run: WorkspacePromptRun, runResult: RedefinedResult | null) {
  return (result.workspaceArtifacts ?? []).filter(
    (artifact) => artifact.sourceRunId === run.id || artifact.sourceResultId === runResult?.id
  );
}

function getPromptRunGuides(result: RedefinedResult, run: WorkspacePromptRun, runResult: RedefinedResult | null) {
  return (result.workspaceAudioGuides ?? []).filter(
    (guide) => guide.sourceRunId === run.id || guide.sourceResultId === runResult?.id
  );
}

function promptRunStatusClass(status: WorkspacePromptRunStatus) {
  return `ws-run-status is-${statusTone(status)}`;
}

function timelineTone(eventType: JourneyEvent["eventType"]): { color: string; fg: "light" | "dark"; icon: string; label: string } {
  if (
    eventType === "artifact_created"
    || eventType === "workspace_created"
    || eventType === "workspace_renamed"
    || eventType === "workspace_moved_to_project"
    || eventType === "workspace_added_to_project"
    || eventType === "workspace_removed_from_project"
    || eventType === "workspace_migrated"
  ) {
    return { color: "#111827", fg: "light", icon: "•", label: "Workspace" };
  }
  if (
    eventType === "audio_guide_created"
    || eventType === "audio_guide_regenerated"
  ) {
    return { color: "#b2a5ff", fg: "light", icon: "♪", label: "Audio" };
  }
  if (
    eventType === "follow_up_prompt_failed"
    || eventType === "prompt_failed"
  ) {
    return { color: "#ef4444", fg: "light", icon: "!", label: "Failure" };
  }
  if (
    eventType === "section_created"
    || eventType === "section_renamed"
    || eventType === "section_deleted"
  ) {
    return { color: "#8b8fa3", fg: "light", icon: "▣", label: "Section" };
  }
  return { color: "#38b6ff", fg: "light", icon: "→", label: "Prompt" };
}

function getTimelineAction(result: RedefinedResult, event: JourneyEvent, setActiveTab: (tab: WorkspaceTabId) => void) {
  if (event.artifactId) {
    return (
      <Link href={`/artifacts/${encodeURIComponent(event.artifactId)}`} className="workspace-timeline-link">
        Open artifact
      </Link>
    );
  }

  if (event.audioGuideId) {
    return (
      <button type="button" className="workspace-timeline-link" onClick={() => setActiveTab("audio-guides")}>
        Play guide
      </button>
    );
  }

  if (event.promptRunId) {
    return (
      <button type="button" className="workspace-timeline-link" onClick={() => setActiveTab("prompt-runs")}>
        View result
      </button>
    );
  }

  if (event.sectionId) {
    const section = result.workspaceSections?.find((item) => item.id === event.sectionId);
    if (section) {
      return (
        <button type="button" className="workspace-timeline-link" onClick={() => setActiveTab("workspace")}>
          Open {section.title}
        </button>
      );
    }
  }

  return null;
}

type GuideCard = {
  title: string;
  body: string;
  items?: string[];
};

type FixPlaybookFlowNode = {
  title: string;
  instruction: string;
  status: string;
  active?: boolean;
};

type FixRecommendedStep = {
  action: string;
  source: string;
  status: "Not started" | "Active" | "Done";
};

type FixRailCard = {
  tone: "yellow" | "blue" | "green" | "purple";
  title: string;
  value: string;
  detail: string;
};

type GuideViewModel = {
  lens: LensId;
  accent: "purple" | "blue" | "yellow" | "green";
  badge: string;
  title: string;
  subtitle: string;
  metric?: string;
  cards: GuideCard[];
  rail: GuideCard[];
  nextAction: string;
  actions: { label: string; prompt?: string; anchor?: string }[];
};

function WorkspaceGuidePanel({
  result,
  setActiveTab
}: {
  result: RedefinedResult;
  setActiveTab: (tab: WorkspaceTabId) => void;
}) {
  const lastRunMode = result.workspacePromptRuns?.at(-1)?.mode;
  const lens = resolveLensPath({
    workspacePath: result.workspaceMeta?.mode,
    promptRunPath: lastRunMode && lastRunMode !== "auto" ? lastRunMode : undefined,
    resultMode: result.mode
  });
  const guide = buildGuideViewModel(result, lens);

  function runGuideAction(action: { prompt?: string; anchor?: string }) {
    setActiveTab("workspace");
    if (action.prompt) {
      window.dispatchEvent(
        new CustomEvent("workspace:prefill-follow-up", {
          detail: { prompt: action.prompt }
        })
      );
    }
    if (action.anchor) {
      window.setTimeout(() => {
        document.getElementById(action.anchor ?? "")?.scrollIntoView({
          behavior: "smooth",
          block: "start"
        });
      }, 60);
    }
  }

  if (guide.lens === "fix") {
    return <FixPlaybookGuide result={result} guide={guide} onAction={runGuideAction} />;
  }

  return (
    <div className={`workspace-lens-guide guide-${guide.accent}`}>
      <section className="guide-hero-card">
        <div>
          <p className="workspace-guide-label">{guide.badge}</p>
          <h2>{guide.title}</h2>
          <p>{guide.subtitle}</p>
        </div>
        {guide.metric ? <span className="guide-hero-badge">{guide.metric}</span> : null}
      </section>

      <div className="guide-layout-grid">
        <main className="guide-main-grid">
          {guide.cards.map((card, index) => (
            <GuideCardView key={`${card.title}-${index}`} card={card} index={index} />
          ))}
        </main>

        <aside className="guide-rail">
          {guide.rail.map((card, index) => (
            <GuideCardView key={`${card.title}-${index}`} card={card} index={index} compact />
          ))}
          <section className="guide-next-card">
            <p className="workspace-guide-label">Recommended next action</p>
            <h3>{guide.nextAction}</h3>
          </section>
        </aside>
      </div>

      <section className="guide-action-row" aria-label="Guide actions">
        {guide.actions.map((action) => (
          <button key={action.label} type="button" onClick={() => runGuideAction(action)}>
            {action.label}
          </button>
        ))}
      </section>
    </div>
  );
}

function FixPlaybookGuide({
  result,
  guide,
  onAction
}: {
  result: RedefinedResult;
  guide: GuideViewModel;
  onAction: (action: { prompt?: string; anchor?: string }) => void;
}) {
  const flow = buildFixPlaybookFlow(result);
  const recommended = buildFixRecommendedPath(result);
  const rail = buildFixIntelligenceRail(result);
  const interpretation = buildFixInterpretation(result);

  return (
    <div className="workspace-lens-guide guide-yellow fix-playbook-guide">
      <section className="guide-hero-card fix-playbook-hero">
        <div>
          <p className="workspace-guide-label">Fix Guide</p>
          <h2>Fix Playbook</h2>
          <p>How to move from diagnosis to evidence, checks, and reusable output.</p>
        </div>
        {guide.metric ? <span className="guide-hero-badge">{guide.metric}</span> : null}
      </section>

      <section className="fix-playbook-flow-card">
        <div className="fix-playbook-section-head">
          <div>
            <p className="workspace-guide-label">Diagnostic Playbook Flow</p>
            <h3>Follow the investigation path</h3>
          </div>
          <span>{result.pathUpdate?.status ? statusCopy(result.pathUpdate.status) : "Initial path"}</span>
        </div>
        <div className="fix-playbook-flow" aria-label="Diagnostic Playbook Flow">
          {flow.map((node, index) => (
            <article key={node.title} className={`fix-flow-node${node.active ? " is-active" : ""}`}>
              <span className="fix-flow-number">{index + 1}</span>
              <div>
                <h4>{node.title}</h4>
                <p>{node.instruction}</p>
              </div>
              <em>{node.status}</em>
            </article>
          ))}
        </div>
      </section>

      <div className="fix-playbook-layout">
        <main className="fix-playbook-main">
          <section className="fix-recommended-panel">
            <div className="fix-playbook-section-head">
              <div>
                <p className="workspace-guide-label">Recommended path</p>
                <h3>Recommended path</h3>
              </div>
            </div>
            <div className="fix-recommended-list">
              {recommended.map((step, index) => (
                <article key={`${step.action}-${index}`} className="fix-recommended-step">
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <strong>{step.action}</strong>
                    <small>{step.source}</small>
                  </div>
                  <em className={`fix-status-badge status-${step.status.toLowerCase().replace(/\s+/g, "-")}`}>
                    {step.status}
                  </em>
                </article>
              ))}
            </div>
          </section>

          <section className="fix-interpret-panel">
            <p className="workspace-guide-label">How to interpret results</p>
            <h3>{interpretation.title}</h3>
            <p>{interpretation.body}</p>
            <div className="fix-interpret-grid">
              {interpretation.items.map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
          </section>
        </main>

        <aside className="fix-intelligence-rail">
          {rail.map((card) => (
            <section key={card.title} className={`fix-rail-card rail-${card.tone}`}>
              <p>{card.title}</p>
              <strong>{card.value}</strong>
              <span>{card.detail}</span>
            </section>
          ))}
          <section className="fix-rail-actions" aria-label="Guide actions">
            {guide.actions.map((action) => (
              <button key={action.label} type="button" onClick={() => onAction(action)}>
                {action.label}
              </button>
            ))}
          </section>
        </aside>
      </div>
    </div>
  );
}

function GuideCardView({
  card,
  index,
  compact = false
}: {
  card: GuideCard;
  index: number;
  compact?: boolean;
}) {
  return (
    <section className={`workspace-guide-card${compact ? " is-compact" : ""}`}>
      <span className="guide-step-num">{String(index + 1).padStart(2, "0")}</span>
      <p className="workspace-guide-label">{card.title}</p>
      <p>{card.body}</p>
      {card.items?.length ? (
        <ul>
          {card.items.slice(0, 4).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function buildGuideViewModel(result: RedefinedResult, lens: LensId): GuideViewModel {
  if (lens === "fix") return buildFixGuide(result);
  if (lens === "build") return buildBuildGuide(result);
  if (lens === "artifact") return buildArtifactGuide(result);
  return buildUnderstandGuide(result);
}

function buildFixGuide(result: RedefinedResult): GuideViewModel {
  const firstBranch = [...(result.failureBranches ?? [])].sort((a, b) => priorityWeight(b.priority) - priorityWeight(a.priority))[0];
  const firstCheck = result.quickTests?.[0];
  const decision = result.decisionPath?.[0];
  const nextAction = result.pathUpdate?.nextBestAction?.title ?? firstCheck?.title ?? "Run the first check, paste evidence, then follow the decision matrix.";

  return {
    lens: "fix",
    accent: "yellow",
    badge: "Fix Guide",
    title: "Fix Playbook",
    subtitle: "Move from diagnosis to evidence, checks, and reusable output.",
    metric: result.diagnosis
      ? `${capitalize(result.diagnosis.confidence)} confidence`
      : "Diagnostic guide",
    cards: [
      {
        title: "What this workspace is diagnosing",
        body: result.diagnosis?.title ?? result.title,
        items: result.diagnosis?.why ?? [result.summary]
      },
      {
        title: "Current working theory",
        body: result.diagnosis?.answer ?? "Start with the current diagnosis, then prove or disprove it with targeted evidence."
      },
      {
        title: "How to use failure branches",
        body: firstBranch
          ? `Start with ${firstBranch.title}, especially if its priority is ${firstBranch.priority}.`
          : "Use branches as competing explanations. Test the highest-risk branch first.",
        items: firstBranch?.checks ?? result.failureBranches?.map((branch) => branch.title)
      },
      {
        title: "First checks to run",
        body: firstCheck
          ? `${firstCheck.title}: ${firstCheck.purpose}`
          : "Run the smallest check from the affected host before changing configuration.",
        items: firstCheck?.commands
      },
      {
        title: "How to interpret results",
        body: decision
          ? `${decision.condition} means ${decision.meaning}`
          : "A passing check narrows the path. A failing check should be pasted back into the Evidence section."
      },
      {
        title: "When to create output",
        body: "Create a ticket update once a branch is confirmed. Export the runbook when the checks are useful for reuse."
      }
    ],
    rail: [
      {
        title: "Evidence to collect",
        body: "Paste exact command output, error text, affected identity, host, timestamp, or screenshot notes."
      },
      {
        title: "Recommended next action",
        body: result.pathUpdate?.nextBestAction?.description ?? nextAction
      },
      {
        title: "Artifact timing",
        body: "Generate incident output after the diagnosis is narrowed or a branch is confirmed."
      }
    ],
    nextAction,
    actions: [
      { label: "Go to diagnosis", anchor: "fix-diagnosis" },
      { label: "Open runbook checks", anchor: "fix-runbook-checks" },
      { label: "Paste evidence", anchor: "fix-evidence", prompt: "Paste evidence from the latest diagnostic check and update the active branch." },
      { label: "Create ticket update", anchor: "fix-artifacts", prompt: "Create a concise ticket update from the current diagnosis and latest evidence." },
      { label: "Export runbook", anchor: "fix-artifacts", prompt: "Generate a reusable diagnostic runbook from this workspace." }
    ]
  };
}

function buildFixPlaybookFlow(result: RedefinedResult): FixPlaybookFlowNode[] {
  const activeBranch = getActiveEvidenceBranch(result);
  const firstBranch = getFirstFailureBranch(result);
  const firstCheck = result.quickTests?.[0];
  const confirmed = activeBranch?.status === "confirmed" || result.pathUpdate?.status === "resolved";
  const activeStep: FixPlaybookFlowNode["title"] =
    confirmed ? "Output" : activeBranch ? "Decision" : firstBranch ? "Failure Branch" : "Diagnosis";

  return [
    {
      title: "Diagnosis",
      instruction: "Understand what Doc/ReDefined thinks is failing.",
      status: result.diagnosis ? `${capitalize(result.diagnosis.confidence)} confidence` : "Available",
      active: activeStep === "Diagnosis"
    },
    {
      title: "Failure Branch",
      instruction: "Start with the highest-priority branch.",
      status: activeBranch?.title ?? firstBranch?.title ?? "Not started",
      active: activeStep === "Failure Branch"
    },
    {
      title: "Run Check",
      instruction: "Run the first check from the affected host.",
      status: firstCheck?.title ?? "Open checks",
      active: activeStep === "Run Check"
    },
    {
      title: "Paste Evidence",
      instruction: "Paste command output or screenshots.",
      status: activeBranch ? "Evidence received" : "Not started",
      active: activeStep === "Paste Evidence"
    },
    {
      title: "Decision",
      instruction: "Use the decision matrix to choose the next branch.",
      status: result.decisionPath?.[0]?.condition ?? result.pathUpdate?.nextBestAction?.title ?? "Pending evidence",
      active: activeStep === "Decision"
    },
    {
      title: "Output",
      instruction: "Create a ticket update or export a runbook.",
      status: confirmed ? "Ready" : "Not ready",
      active: activeStep === "Output"
    }
  ];
}

function buildFixRecommendedPath(result: RedefinedResult): FixRecommendedStep[] {
  const activeBranch = getActiveEvidenceBranch(result);
  const firstBranch = getFirstFailureBranch(result);
  const checks = result.quickTests ?? [];
  const likelyCauses = result.diagnosis?.likelyCauses ?? [];
  const confirmed = activeBranch?.status === "confirmed" || result.pathUpdate?.status === "resolved";
  const branchLabel = activeBranch?.title ?? firstBranch?.title;

  const steps: FixRecommendedStep[] = [
    {
      action: result.diagnosis?.title
        ? `Review ${result.diagnosis.title}.`
        : "Review the current diagnosis.",
      source: "Current diagnosis",
      status: "Done"
    },
    {
      action: branchLabel ? `Start with ${branchLabel}.` : "Start with the highest-priority failure branch.",
      source: "Failure branches",
      status: activeBranch ? "Active" : "Not started"
    }
  ];

  const checkSources = checks.slice(0, 2);
  for (const check of checkSources) {
    steps.push({
      action: check.title,
      source: "Quick diagnostic runbook",
      status: activeBranch ? "Done" : "Not started"
    });
  }

  if (likelyCauses[0]) {
    steps.push({
      action: `Confirm ${likelyCauses[0].label}.`,
      source: "Likely causes",
      status: confirmed ? "Done" : activeBranch ? "Active" : "Not started"
    });
  }

  steps.push(
    {
      action: "Paste evidence after each check.",
      source: "Evidence input",
      status: activeBranch ? "Done" : "Active"
    },
    {
      action: "Generate a ticket update once the branch is confirmed.",
      source: "Artifacts",
      status: confirmed ? "Active" : "Not started"
    }
  );

  // The status of each step is derived independently above, which can leave
  // several steps marked "Active" at once. Collapse to a single Active step —
  // the first one that isn't Done — so the path has one clear current focus.
  const normalized = steps.slice(0, 7);
  let activeAssigned = false;
  for (const step of normalized) {
    if (step.status === "Done") continue;
    if (!activeAssigned) {
      step.status = "Active";
      activeAssigned = true;
    } else {
      step.status = "Not started";
    }
  }

  return normalized;
}

function buildFixIntelligenceRail(result: RedefinedResult): FixRailCard[] {
  const activeBranch = getActiveEvidenceBranch(result);
  const firstBranch = getFirstFailureBranch(result);
  const confirmed = activeBranch?.status === "confirmed" || result.pathUpdate?.status === "resolved";
  const evidenceItems = [
    "dynamic rule",
    "user attributes",
    "membership evaluation",
    "synchronization status"
  ];

  return [
    {
      tone: "yellow",
      title: "Current diagnosis",
      value: result.diagnosis?.title ?? result.title,
      detail: result.diagnosis ? `${capitalize(result.diagnosis.confidence)} confidence` : "Diagnostic path available"
    },
    {
      tone: "blue",
      title: "Active branch",
      value: activeBranch?.title ?? firstBranch?.title ?? "Evidence branch is active",
      detail: activeBranch ? `${activeBranch.status} · ${activeBranch.confidence}% confidence` : "Start with the top branch"
    },
    {
      tone: "purple",
      title: "Evidence to collect",
      value: evidenceItems.join(", "),
      detail: "Paste exact outputs or screenshots after each check."
    },
    {
      tone: "green",
      title: "Output readiness",
      value: confirmed ? "Ready" : "Not ready",
      detail: confirmed ? "Suggested output: ticket update or runbook." : "Ready when a branch is confirmed."
    }
  ];
}

function buildFixInterpretation(result: RedefinedResult) {
  const decision = result.decisionPath?.[0];
  return {
    title: decision ? decision.condition : "Use evidence to narrow, not guess",
    body: decision
      ? `${decision.meaning} Next action: ${decision.nextAction}`
      : "A failed check should activate or strengthen a branch. A passing check should reduce scope and move you to the next highest-priority branch.",
    items: [
      "Passing check: narrow scope",
      "Failed check: paste evidence",
      "Confirmed branch: create output"
    ]
  };
}

function getActiveEvidenceBranch(result: RedefinedResult) {
  return (result.evidenceBranches ?? []).find((branch) =>
    result.activeEvidenceBranchId
      ? branch.id === result.activeEvidenceBranchId
      : branch.status === "active" || branch.status === "confirmed"
  );
}

function getFirstFailureBranch(result: RedefinedResult) {
  return [...(result.failureBranches ?? [])].sort((a, b) => priorityWeight(b.priority) - priorityWeight(a.priority))[0];
}

function statusCopy(status: PathUpdate["status"]) {
  if (status === "needs_more_evidence") return "Needs more evidence";
  return status.split("_").map(capitalize).join(" ");
}

function buildUnderstandGuide(result: RedefinedResult): GuideViewModel {
  const firstBlock = result.coreBuildingBlocks?.[0];
  const misconception = result.misconceptions?.[0];

  return {
    lens: "understand",
    accent: "purple",
    badge: "Understand Guide",
    title: "How to use this Understand workspace",
    subtitle: "Learn the concept, review the mental model, and test your understanding.",
    metric: result.resultGuide?.promptDepth.level ? `${result.resultGuide.promptDepth.level} depth` : "Learning guide",
    cards: [
      {
        title: "What this concept means",
        body: result.summary || result.title
      },
      {
        title: "How to read the mental model",
        body: result.mentalModel?.title ?? "Follow the model from the first step to the last, then explain the transitions in your own words.",
        items: result.mentalModel?.steps.map((step) => step.label)
      },
      {
        title: "Key ideas to remember",
        body: firstBlock
          ? `${firstBlock.title}: ${firstBlock.description}`
          : "Focus on the small set of ideas that explain the whole concept.",
        items: result.coreBuildingBlocks?.map((block) => block.title)
      },
      {
        title: "Common misconceptions",
        body: misconception
          ? `${misconception.misconception} → ${misconception.reality}`
          : "Look for assumptions that sound plausible but do not match the actual mechanism."
      },
      {
        title: "Questions to test yourself",
        body: result.teachBack?.challenge ?? "Try explaining the concept without looking, then compare your explanation to the workspace."
      },
      {
        title: "Recommended next learning step",
        body: result.nextActions?.[0]?.prompt ?? result.resultGuide?.promptDepth.suggestion ?? "Ask for an example, counterexample, or quiz."
      }
    ],
    rail: [
      { title: "Study focus", body: firstBlock?.title ?? "Mental model and key vocabulary." },
      { title: "Common mistake", body: misconception?.misconception ?? "Memorizing terms without explaining cause and effect." },
      { title: "Next question to ask", body: result.thinkingSparks?.[0]?.prompt ?? "Ask for a scenario that tests this concept." }
    ],
    nextAction: result.nextActions?.[0]?.label ?? "Use teach-back to test your understanding.",
    actions: [
      { label: "Go to Workspace" },
      { label: "Create quiz", prompt: "Create a short quiz from this workspace." },
      { label: "Explain simpler", prompt: "Explain this concept more simply with an example." }
    ]
  };
}

function buildBuildGuide(result: RedefinedResult): GuideViewModel {
  return {
    lens: "build",
    accent: "blue",
    badge: "Build Guide",
    title: "How to use this Build workspace",
    subtitle: "Turn the plan into implementation steps, decisions, validation, and rollback.",
    metric: result.requiredInputs?.some((input) => input.status === "missing") ? "Inputs needed" : "Implementation guide",
    cards: [
      { title: "Build objective", body: result.summary || result.title },
      {
        title: "Implementation order",
        body: "Work through the plan in sequence and validate after each meaningful step.",
        items: result.buildFlow?.map((step) => step.label) ?? result.sections.map((section) => section.title)
      },
      {
        title: "Required resources",
        body: "Confirm missing or assumed inputs before implementation.",
        items: result.requiredInputs?.map((input) => `${input.label}: ${input.status ?? "assumed"}`)
      },
      {
        title: "Key decisions",
        body: "Use the decision points to avoid building around unresolved assumptions.",
        items: result.sectionBlueprint?.flatMap((section) => section.keyQuestions)
      },
      {
        title: "Validation approach",
        body: "Treat validation as part of the build, not a final afterthought.",
        items: result.qualityChecklist?.map((item) => item.item)
      },
      {
        title: "Risks and rollback",
        body: "Before shipping, identify what can fail, how you will detect it, and how to return to a known-good state."
      }
    ],
    rail: [
      { title: "Recommended next build action", body: result.buildNextActions?.[0]?.prompt ?? "Start with the first implementation step." },
      { title: "Decisions still needed", body: result.requiredInputs?.find((input) => input.status === "missing")?.label ?? "Review assumptions before implementation." },
      { title: "Validation checklist summary", body: result.qualityChecklist?.[0]?.reason ?? "Validate behavior, failure modes, and handoff points." }
    ],
    nextAction: result.buildNextActions?.[0]?.label ?? "Start the first build step and validate it.",
    actions: [
      { label: "Go to Workspace" },
      { label: "Create checklist", prompt: "Create an implementation checklist from this Build workspace." },
      { label: "Generate artifact", prompt: result.buildNextActions?.[0]?.prompt ?? "Generate an implementation artifact from this Build workspace." }
    ]
  };
}

function buildArtifactGuide(result: RedefinedResult): GuideViewModel {
  return {
    lens: "artifact",
    accent: "green",
    badge: "Artifact Guide",
    title: "How to use this Artifact workspace",
    subtitle: "Review, complete, export, and reuse the generated document.",
    metric: result.missingDetails?.some((detail) => detail.status === "missing") ? "Details missing" : "Ready to review",
    cards: [
      { title: "What artifact is being created", body: result.artifactPreview?.title ?? result.title },
      {
        title: "Source context",
        body: result.sourceContext?.sourceTitle ?? result.originalPrompt ?? result.summary,
        items: result.sourceContext?.keyInputs
      },
      {
        title: "Missing details",
        body: "Fill missing details before treating the artifact as final.",
        items: result.missingDetails?.map((detail) => `${detail.label}: ${detail.status}`)
      },
      {
        title: "How to review the draft",
        body: "Check that the structure, claims, assumptions, and audience match the original request.",
        items: result.outline?.map((item) => item.title)
      },
      {
        title: "Export and reuse options",
        body: "Use the output format that matches where this artifact will be consumed.",
        items: result.formatOptions?.map((option) => option.label)
      },
      {
        title: "Recommended next action",
        body: result.exportActions?.[0]?.label ?? "Review the draft, fill missing details, then export or copy the final artifact."
      }
    ],
    rail: [
      { title: "Completion status", body: result.missingDetails?.some((detail) => detail.status === "missing") ? "Needs missing inputs." : "Ready for review." },
      { title: "Missing inputs", body: result.missingDetails?.find((detail) => detail.status === "missing")?.whyNeeded ?? "No critical missing inputs detected." },
      { title: "Export actions", body: result.exportActions?.map((action) => action.label).join(", ") || "Copy, download, save, or share when ready." }
    ],
    nextAction: result.exportActions?.[0]?.label ?? "Review and export the artifact.",
    actions: [
      { label: "Go to Workspace" },
      { label: "Create checklist", prompt: "Create a review checklist for this artifact." },
      { label: "Draft export notes", prompt: "Draft concise export and reuse notes for this artifact." }
    ]
  };
}

function priorityWeight(priority: "low" | "medium" | "high") {
  if (priority === "high") return 3;
  if (priority === "medium") return 2;
  return 1;
}

function capitalize(value: string) {
  return value ? value[0].toUpperCase() + value.slice(1) : value;
}

function WorkspaceWorkLogTab({
  result,
  onViewResult,
  onRetryPrompt,
  onOpenGenerateArtifact
}: {
  result: RedefinedResult;
  onViewResult: () => void;
  onRetryPrompt: (prompt: string) => void;
  onOpenGenerateArtifact: (prompt: string) => void;
}) {
  const runs = result.workspacePromptRuns ?? [];

  if (runs.length === 0) {
    return (
      <div className="workspace-empty-panel">
        <h3>No prompts have been run yet.</h3>
        <p>Run your first prompt to start building this workspace.</p>
      </div>
    );
  }

  return (
    <div className="workspace-worklog">
      <header className="workspace-worklog-header">
        <h3>Work Log</h3>
        <p>A record of prompts, results, and workspace activity.</p>
      </header>

      <div className="workspace-worklog-list">
        {runs.map((run, index) => {
          const runResult = getPromptRunResult(result, run);
          const artifacts = getPromptRunArtifacts(result, run, runResult);
          const guides = getPromptRunGuides(result, run, runResult);
          const sectionName = sectionTitleFor(result, run.sectionId);

          return (
            <article key={run.id} className="workspace-run-card is-static">
              <div className="workspace-run-topline">
                <div>
                  <p className="workspace-run-kicker">{promptRunTitle(run, index)}</p>
                  <h3>{run.prompt}</h3>
                </div>
                <span className={`workspace-run-status ${promptRunStatusClass(run.status)}`}>
                  {statusLabel(run.status)}
                </span>
              </div>

              <div className="workspace-run-meta">
                <span>Mode: {run.mode}</span>
                <span>Created: {relativeTime(run.createdAt)}</span>
                {run.completedAt ? <span>Completed: {relativeTime(run.completedAt)}</span> : null}
                {sectionName ? <span>Section: {sectionName}</span> : null}
                <span>Result: {runResult?.title ?? "Result unavailable"}</span>
              </div>

              {artifacts.length > 0 ? (
                <div className="workspace-run-linked">
                  <span className="workspace-run-linked-label">Artifacts</span>
                  <div className="workspace-run-chip-row">
                    {artifacts.map((artifact) => (
                      <Link key={artifact.id} href={`/artifacts/${encodeURIComponent(artifact.id)}`} className="workspace-run-chip">
                        {artifact.name}
                      </Link>
                    ))}
                  </div>
                </div>
              ) : null}

              {guides.length > 0 ? (
                <div className="workspace-run-linked">
                  <span className="workspace-run-linked-label">Audio guides</span>
                  <div className="workspace-run-chip-row">
                    {guides.map((guide) => (
                      <span key={guide.id} className="workspace-run-chip">
                        {guide.title}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="workspace-run-actions">
                <button type="button" onClick={onViewResult}>
                  View result
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(run.prompt);
                      showToast({ title: "Prompt copied" });
                    } catch {
                      showToast({ title: "Copy failed", message: "Clipboard is unavailable." });
                    }
                  }}
                >
                  Copy prompt
                </button>
                <button type="button" onClick={() => onOpenGenerateArtifact(run.prompt)}>
                  Create artifact
                </button>
                {run.status === "failed" ? (
                  <button type="button" onClick={() => onRetryPrompt(run.prompt)}>
                    Retry
                  </button>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function WorkspaceAudioGuidesTab({
  result,
  originalPrompt,
  onNarrationGenerated
}: {
  result: RedefinedResult;
  originalPrompt?: string;
  onNarrationGenerated?: (narration: WorkspaceNarration) => void;
}) {
  const guides = result.workspaceAudioGuides ?? [];
  const initialNarration = guides[guides.length - 1];

  return (
    <div className="workspace-audio-tab-panel">
      <header className="workspace-audio-tab-header">
        <h3>Audio Guides</h3>
        <p>Create and listen to narrated walkthroughs from this workspace.</p>
      </header>
      <WorkspaceAudioGuide
        key={`${result.workspaceMeta?.workspaceId ?? result.id}-${initialNarration?.sourceResultHash ?? "new"}`}
        result={result}
        workspaceMeta={result.workspaceMeta}
        originalPrompt={
          originalPrompt ?? result.originalPrompt ?? result.workspaceMeta?.originalPrompt ?? result.title
        }
        initialNarration={initialNarration}
        onNarrationGenerated={onNarrationGenerated}
      />
      <p className="workspace-audio-tab-note">
        Audio guides are saved to this workspace and also appear in the global{" "}
        <Link href="/audio-guides">Audio Guides</Link> library.
      </p>
    </div>
  );
}

function WorkspaceTimelineTab({
  result,
  setActiveTab
}: {
  result: RedefinedResult;
  setActiveTab: (tab: WorkspaceTabId) => void;
}) {
  const entries = [...(result.workspaceJourney ?? [])].sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  if (entries.length === 0) {
    return (
      <div className="workspace-empty-panel">
        <h3>No timeline activity yet.</h3>
      </div>
    );
  }

  return (
    <div className="workspace-timeline">
      {entries.map((event) => {
        const tone = timelineTone(event.eventType);
        const action = getTimelineAction(result, event, setActiveTab);
        return (
          <article key={event.id} className="workspace-timeline-item">
            <span className="workspace-timeline-marker" style={{ background: tone.color }} aria-hidden="true">
              {tone.icon}
            </span>
            <div className="workspace-timeline-body">
              <div className="workspace-timeline-topline">
                <div>
                  <h3>{event.title}</h3>
                  <p>{event.description}</p>
                </div>
                <span className="workspace-timeline-time">{relativeTime(event.timestamp)}</span>
              </div>
              <div className="workspace-timeline-meta">
                <span>{tone.label}</span>
                {action}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

/**
 * Render a result through the Lens Contract pipeline.
 *
 * The authoritative lens is the saved workspace path (then prompt-run path, then result mode).
 * The raw result is validated against that lens and normalized into it on mismatch — we never
 * switch to a different renderer just because the raw shape looks like another lens.
 */
function renderResultByMode(
  result: RedefinedResult,
  source: ResultSource,
  extras?: {
    temporaryRecord?: TemporaryJourneyRecord | null;
    profileRecord?: ProfileJourneyRecord | null;
    guestLimitState?: GuestLimitState;
    onRequireProfile?: (message?: string, next?: string) => void;
    onNarrationGenerated?: (narration: WorkspaceNarration) => void;
  }
) {
  const lastRunMode = result.workspacePromptRuns?.at(-1)?.mode;
  const lens: LensId = resolveLensPath({
    workspacePath: result.workspaceMeta?.mode,
    promptRunPath: lastRunMode && lastRunMode !== "auto" ? lastRunMode : undefined,
    resultMode: result.mode
  });

  const { result: rendered, normalized, forbidden } = coerceResultToLens(
    result,
    lens,
    result.originalPrompt ?? result.workspaceMeta?.originalPrompt ?? result.title
  );

  if (process.env.NODE_ENV !== "production" && (normalized || forbidden.length > 0)) {
    if (forbidden.length > 0) {
      console.warn(`Forbidden sections detected for ${lens} lens: ${forbidden.join(", ")}.`);
    }
    if (result.mode !== lens) {
      console.warn(
        `Lens mismatch detected: workspace.path=${lens} but result.shape=${result.mode ?? "unknown"}. Normalizing to ${lens}.`
      );
    }
  }

  switch (lens) {
    case "build":
      return <BuildWorkspace result={rendered} />;
    case "artifact":
      return <ArtifactWorkspace result={rendered} />;
    case "fix":
      return (
        <FixWorkspace
          initialResult={rendered}
          initialSource={source}
          temporaryRecord={extras?.temporaryRecord}
          profileRecord={extras?.profileRecord}
          guestLimitState={extras?.guestLimitState}
          onRequireProfile={extras?.onRequireProfile}
          onNarrationGenerated={extras?.onNarrationGenerated}
        />
      );
    case "understand":
    default:
      return (
        <UnderstandWorkspace
          result={rendered}
          source={source}
          onNarrationGenerated={extras?.onNarrationGenerated}
        />
      );
  }
}

export function WorkspaceTraceTabs({
  result,
  source = "ai",
  temporaryRecord,
  profileRecord,
  guestLimitState,
  recordId,
  originalPrompt,
  activeTab,
  onTabChange: setActiveTab,
  onNarrationGenerated,
  onRequireProfile,
  onGenerateArtifact,
  onResultChange
}: WorkspaceTraceTabsProps) {
  const viewResultInWorkspace = useCallback(() => {
    setActiveTab("workspace");
    if (typeof window !== "undefined") {
      window.setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 0);
    }
  }, [setActiveTab]);

  const openPromptInWorkspace = useCallback((prompt: string) => {
    window.dispatchEvent(
      new CustomEvent("workspace:prefill-follow-up", {
        detail: { prompt }
      })
    );
    setActiveTab("workspace");
  }, [setActiveTab]);

  const openGenerateArtifact = useCallback((prompt: string) => {
    setActiveTab("artifacts");
    if (onGenerateArtifact) {
      onGenerateArtifact(prompt, result);
      return;
    }
    openGenerateArtifactModal(prompt);
  }, [onGenerateArtifact, result, setActiveTab]);

  return (
    <section className="workspace-trace-shell" aria-label="Workspace tabs">
      <div className="workspace-trace-panel">
        {activeTab === "workspace" ? (
          <>
            {renderResultByMode(result, source, {
              temporaryRecord,
              profileRecord,
              guestLimitState,
              onRequireProfile,
              onNarrationGenerated
            })}
            <WorkspaceFollowUp
              result={result}
              recordId={recordId}
              profileId={profileRecord?.profileId}
              onResultChange={onResultChange}
            />
          </>
        ) : null}
        {activeTab === "result-guide" ? (
          <WorkspaceGuidePanel result={result} setActiveTab={setActiveTab} />
        ) : null}
        {activeTab === "prompt-runs" ? (
          <WorkspaceWorkLogTab
            result={result}
            onViewResult={viewResultInWorkspace}
            onRetryPrompt={openPromptInWorkspace}
            onOpenGenerateArtifact={openGenerateArtifact}
          />
        ) : null}
        {activeTab === "artifacts" ? (
          <WorkspaceArtifacts
            result={result}
            recordId={recordId}
            profileId={profileRecord?.profileId}
            onResultChange={onResultChange}
          />
        ) : null}
        {activeTab === "audio-guides" ? (
          <WorkspaceAudioGuidesTab
            result={result}
            originalPrompt={originalPrompt}
            onNarrationGenerated={onNarrationGenerated}
          />
        ) : null}
        {activeTab === "timeline" ? <WorkspaceTimelineTab result={result} setActiveTab={setActiveTab} /> : null}
      </div>
    </section>
  );
}
