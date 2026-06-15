import { MODES } from "@/lib/constants";
import type {
  JourneyEvent,
  WorkspaceArtifact,
  WorkspaceBranch,
  WorkspaceMeta,
  WorkspaceNarration
} from "@/lib/workspace-types";

export type RedefinedMode = (typeof MODES)[number]["id"];

export type ClassificationSource = "manual" | "rules" | "simulated-ai" | "fallback" | "ai";

export type ClassificationResult = {
  mode: RedefinedMode;
  confidence: number;
  source: ClassificationSource;
  reason: string;
  topic: string;
};

export type IssueNode = {
  id: string;
  label: string;
  type?: string;
  detail?: string;
  reason?: string;
  check?: string;
  status?: IssueNodeStatus;
  risk?: "low" | "medium" | "high";
};

export type IssueEdge = {
  from: string;
  to: string;
  label?: string;
  status?: IssueNodeStatus;
};

export type IssueNodeStatus =
  | "neutral"
  | "unknown"
  | "checking"
  | "healthy"
  | "warning"
  | "failed";

export type IssueMap = {
  title: string;
  summary: string;
  nodes: IssueNode[];
  edges: IssueEdge[];
  likelyFailureZones: string[];
};

export type FixDiagnosisConfidence = "low" | "medium" | "high";

export type FixLikelyCause = {
  label: string;
  reason: string;
  priority: "low" | "medium" | "high";
};

export type FixDiagnosis = {
  title: string;
  answer: string;
  confidence: FixDiagnosisConfidence;
  why: string[];
  likelyCauses: FixLikelyCause[];
};

export type QuickTest = {
  id: string;
  title: string;
  purpose: string;
  commands: string[];
  successSignal: string;
  failureMeaning: string;
  category?: "dns" | "network" | "auth" | "config" | "service" | "generic";
};

export type DecisionPathItem = {
  id: string;
  condition: string;
  meaning: string;
  nextAction: string;
};

export type FailureBranch = {
  id: string;
  title: string;
  summary: string;
  signals: string[];
  checks: string[];
  priority: "low" | "medium" | "high";
};

export type CausalGraphNodeKind =
  | "source"
  | "dependency"
  | "failure"
  | "target"
  | "result";

export type CausalGraphNodeStatus =
  | "neutral"
  | "checking"
  | "passing"
  | "failing"
  | "unknown";

export type CausalGraph = {
  title: string;
  subtitle?: string;
  confidence: "low" | "medium" | "high";
  nodes: {
    id: string;
    label: string;
    subtitle?: string;
    kind: CausalGraphNodeKind;
    status: CausalGraphNodeStatus;
    x?: number;
    y?: number;
  }[];
  edges: {
    from: string;
    to: string;
    label?: string;
    kind?: "request" | "dependency" | "blocks" | "causes";
  }[];
  branches?: {
    id: string;
    label: string;
    nodeIds: string[];
    tone: "green" | "blue" | "purple" | "neutral";
  }[];
  simulationSteps: {
    id: string;
    title: string;
    description: string;
    activeNodeIds: string[];
    failingNodeIds?: string[];
    passingNodeIds?: string[];
    branchId?: string;
  }[];
};

export type PathUpdate = {
  status: "initial" | "narrowed" | "resolved" | "needs_more_evidence";
  title: string;
  description: string;
  nextBestAction: {
    title: string;
    description: string;
    commands?: string[];
  };
};

export type ScratchpadVariable = {
  id: string;
  label: string;
  value: string;
  source: "prompt" | "ai" | "evidence" | "user";
};

export type TimelineEntry = {
  id: string;
  type:
    | "initial_diagnosis"
    | "evidence_received"
    | "path_recalibrated"
    | "next_action"
    | "artifact_created"
    | "resolved";
  title: string;
  summary: string;
  timestampLabel: string;
};

export type EvidenceSignal = {
  id: string;
  label: string;
  severity: "info" | "success" | "warning" | "critical";
  matchedText: string;
  meaning: string;
  affectedNodeId?: string;
  affectedBranchId?: string;
  confidence?: number;
};

export type EvidenceBranch = {
  id: string;
  title: string;
  branchType: "rbac" | "network" | "token" | "identity" | "configuration" | "unknown";
  status: "active" | "new" | "confirmed" | "dismissed";
  confidence: number;
  evidenceScore?: number;
  summary: string;
  explanation?: {
    meaning: string;
    whyThisBranch: string;
    likelyRootCause: string;
  };
  cliSteps?: {
    label: string;
    command: string;
    expected?: string;
  }[];
  fixSteps?: string[];
  followUpQuestions?: string[];
  evidenceExcerpt: string;
  preview?: string;
  signals: EvidenceSignal[];
  nextAction: string;
  createdAt: string;
};

export type EnvironmentComparison = {
  leftLabel: string;
  rightLabel: string;
  rows: {
    field: string;
    leftValue: string;
    rightValue: string;
    status: "match" | "mismatch" | "unknown";
    impact?: string;
  }[];
};

export type DiagnosticTerminal = {
  title: string;
  shell: "powershell" | "bash" | "sql" | "generic";
  commands: {
    id: string;
    label: string;
    command: string;
    category?: "dns" | "network" | "auth" | "config" | "service" | "generic";
  }[];
  notes?: string[];
};

export type ArtifactAction = {
  type: "ticket_update" | "runbook" | "save_journey" | "share" | "checklist" | "summary";
  label: string;
};

export type FollowUpResult = {
  id: string;
  parentResultId: string;
  userMessage: string;
  signals: EvidenceSignal[];
  scratchpadUpdates: ScratchpadVariable[];
  updatedDiagnosis: FixDiagnosis & { status: PathUpdate["status"] };
  issueMapUpdates: {
    nodeId: string;
    status: IssueNodeStatus;
    reason: string;
  }[];
  nextBestAction: PathUpdate["nextBestAction"];
  timelineEntries: TimelineEntry[];
  activeEvidenceBranch?: EvidenceBranch;
  updatedEvidenceBranches?: EvidenceBranch[];
  pathUpdate?: PathUpdate;
  diagnosticTerminal?: DiagnosticTerminal;
  environmentComparison?: EnvironmentComparison;
  shouldPromoteDiagnosis?: boolean;
  resolved: boolean;
};

export type ResultSection =
  | {
      type: "checklist";
      title: string;
      items: string[];
    }
  | {
      type: "diagnostic_step" | "implementation_step" | "explanation";
      title: string;
      description: string;
    };

export type UnderstandMentalModelStep = {
  id: string;
  label: string;
  description?: string;
};

export type UnderstandBuildingBlock = {
  id: string;
  title: string;
  description: string;
  blockType?: "principle" | "component" | "mechanism" | "term" | "pattern" | "output" | "result" | "process" | "concept" | "constraint" | "risk" | "input";
  confidence?: number;
};

export type UnderstandMisconception = {
  id: string;
  misconception: string;
  reality: string;
};

export type UnderstandNextAction = {
  label: string;
  targetMode: "understand" | "build" | "fix" | "artifact";
  prompt: string;
};

export type UnderstandUserLevelOption = {
  id: string;
  label: string;
  description: string;
  selected?: boolean;
};

export type UnderstandAnalogy = {
  id: string;
  label: string;
  analogyTitle: string;
  explanation: string;
  keyTakeaway: string;
  isDefault?: boolean;
};

export type UnderstandThinkingSpark = {
  id: string;
  type: "challenge" | "scenario" | "what_if" | "compare";
  prompt: string;
  targetPrompt: string;
};

export type UnderstandBlindSpot = {
  title: string;
  description: string;
  whyItMatters: string;
  revealPrompt?: string;
};

export type UnderstandConfidenceItem = {
  id: string;
  label: string;
  confidence: number;
  reason?: string;
  suggestedAction?: string;
};

export type UnderstandResultGuide = {
  sectionExplanations: { section: string; explanation: string }[];
  differentiation: { title: string; description: string };
  promptDepth: { level: "shallow" | "moderate" | "deep"; suggestion: string };
  refinementOptions: { id: string; label: string; description: string }[];
};

export type BuildRequiredInput = {
  id: string;
  label: string;
  whyNeeded: string;
  placeholder?: string;
  status?: "missing" | "provided" | "assumed";
};

export type BuildFlowStep = {
  id: string;
  label: string;
  description: string;
};

export type BuildDraftingStep = {
  id: string;
  title: string;
  description: string;
  outputHint: string;
};

export type BuildSectionBlueprint = {
  id: string;
  sectionName: string;
  purpose: string;
  keyQuestions: string[];
  outputExpected?: string;
};

export type BuildQualityCheckItem = {
  id: string;
  item: string;
  reason: string;
  status?: "pending" | "passed" | "needs_work";
};

export type ArtifactSourceContext = {
  sourceMode?: "understand" | "build" | "fix" | "artifact";
  sourceTitle?: string;
  keyInputs?: string[];
  assumptions?: string[];
  evidence?: string[];
  commands?: string[];
};

export type ArtifactMissingDetail = {
  id: string;
  label: string;
  whyNeeded: string;
  placeholder?: string;
  status: "missing" | "provided" | "assumed";
};

export type ArtifactOutlineItem = {
  id: string;
  title: string;
  purpose: string;
};

export type ArtifactPreview = {
  format: "markdown" | "document" | "email" | "ticket" | "checklist" | "code";
  title: string;
  body: string;
};

export type ArtifactFormatOption = {
  id: string;
  label: string;
  description: string;
  targetFormat: "markdown" | "document" | "email" | "ticket" | "checklist" | "code";
};

export type ArtifactExportAction = {
  label: string;
  action: "copy" | "download" | "save" | "share" | "regenerate";
};

export type RedefinedResult = {
  id: string;
  mode: RedefinedMode;
  title: string;
  summary: string;
  classification: ClassificationResult;
  issueMap?: IssueMap;
  diagnosis?: FixDiagnosis;
  visualFlow: string[];
  sections: ResultSection[];
  actions: {
    label: string;
    action: string;
  }[];
  originalPrompt?: string;
  quickTests?: QuickTest[];
  failureBranches?: FailureBranch[];
  evidenceBranches?: EvidenceBranch[];
  activeEvidenceBranchId?: string;
  causalGraph?: CausalGraph;
  decisionPath?: DecisionPathItem[];
  pathUpdate?: PathUpdate;
  scratchpad?: ScratchpadVariable[];
  timeline?: TimelineEntry[];
  diagnosticTerminal?: DiagnosticTerminal;
  environmentComparison?: EnvironmentComparison;
  artifacts?: ArtifactAction[];
  domain?: string;
  clarity?: {
    level: "high" | "medium" | "low";
    score?: number;
  };
  mentalModel?: {
    title: string;
    steps: UnderstandMentalModelStep[];
  };
  coreBuildingBlocks?: UnderstandBuildingBlock[];
  misconceptions?: UnderstandMisconception[];
  realWorldExample?: {
    title: string;
    scenario: string;
    explanation: string;
  };
  decisionQuestions?: string[];
  nextActions?: UnderstandNextAction[];
  userLevelCheck?: {
    question: string;
    options: UnderstandUserLevelOption[];
  };
  analogySwitcher?: {
    title: string;
    subtitle?: string;
    analogies: UnderstandAnalogy[];
  };
  thinkingSparks?: UnderstandThinkingSpark[];
  blindSpot?: UnderstandBlindSpot;
  conceptConfidenceMap?: {
    title: string;
    items: UnderstandConfidenceItem[];
    lowestConfidenceAction?: { label: string; prompt: string };
  };
  teachBack?: {
    challenge: string;
    placeholder: string;
    expertVersion?: string;
  };
  shareableInsight?: {
    title: string;
    insight: string;
    supportingLine?: string;
    tags: string[];
    actions: { label: string; type: "copy" | "notion" | "linkedin" | "save" | "post" }[];
  };
  resultGuide?: UnderstandResultGuide;
  workspaceType?: string;
  requiredInputs?: BuildRequiredInput[];
  buildFlow?: BuildFlowStep[];
  draftingSteps?: BuildDraftingStep[];
  sectionBlueprint?: BuildSectionBlueprint[];
  qualityChecklist?: BuildQualityCheckItem[];
  buildNextActions?: UnderstandNextAction[];
  sourceContext?: ArtifactSourceContext;
  missingDetails?: ArtifactMissingDetail[];
  outline?: ArtifactOutlineItem[];
  artifactPreview?: ArtifactPreview;
  formatOptions?: ArtifactFormatOption[];
  exportActions?: ArtifactExportAction[];
  workspaceMeta?: WorkspaceMeta;
  workspaceBranches?: WorkspaceBranch[];
  workspaceJourney?: JourneyEvent[];
  workspaceArtifacts?: WorkspaceArtifact[];
  workspaceAudioGuides?: WorkspaceNarration[];
};

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export function getModeLabel(mode: RedefinedMode) {
  const labels: Record<RedefinedMode, string> = {
    understand: "Understand",
    build: "Build",
    fix: "Fix",
    artifact: "Artifact"
  };

  return labels[mode] || "Understand";
}

export function extractTopic(prompt: string) {
  return prompt
    .replace(
      /^(explain|fix|build|create|generate|draft|configure|setup|set up|troubleshoot|what is wrong with)\s+/i,
      ""
    )
    .trim();
}

export function classifyWithRules(prompt: string): ClassificationResult {
  const value = prompt.trim().toLowerCase();

  // "How to X" and "Help me X" patterns → Build mode (checked first to prevent
  // artifact signals like "draft" swallowing "how to draft ..." prompts)
  const howToBuildPatterns = [
    "how to draft",
    "how to create",
    "how to prepare",
    "how to structure",
    "how to write",
    "how to build",
    "how to make",
    "how to develop",
    "how should i build",
    "how should i create",
    "how should i write",
    "how should i structure",
    "help me build",
    "help me create",
    "help me structure",
    "help me draft",
    "help me write",
    "help me prepare"
  ];

  if (howToBuildPatterns.some((p) => value.includes(p))) {
    return {
      mode: "build",
      confidence: 0.88,
      source: "rules",
      reason: "Detected guided creation or construction intent.",
      topic: extractTopic(prompt)
    };
  }

  const fixSignals = [
    "fix",
    "troubleshoot",
    "troubleshooting",
    "issue",
    "error",
    "failed",
    "failure",
    "not working",
    "not connecting",
    "cannot connect",
    "can't connect",
    "unable to connect",
    "connection failed",
    "timeout",
    "timed out",
    "blocked",
    "broken",
    "wrong with",
    "what is wrong",
    "why is",
    "why does",
    "not reachable",
    "unreachable",
    "cannot reach",
    "can't reach",
    "gateway",
    "database not connecting",
    "refresh failed",
    "rejected",
    "not working",
    "weak",
    "investors don't",
    "cannot explain"
  ];

  // Artifact signals — "draft" is intentionally excluded here because
  // "how to draft ..." is caught above as Build and "draft a ..." is
  // caught by the startsWith check below.
  const artifactSignals = [
    "checklist",
    "runbook",
    "summary",
    "diagram",
    "ticket update",
    "document",
    "template",
    "artifact",
    "report",
    "email"
  ];

  const buildSignals = [
    "build",
    "setup",
    "set up",
    "configure",
    "implement",
    "deploy",
    "install",
    "enable",
    "provision",
    "create environment"
  ];

  const understandSignals = [
    "explain",
    "what is",
    "what does",
    "what are",
    "how does",
    "help me understand",
    "describe",
    "overview"
  ];

  if (fixSignals.some((signal) => value.includes(signal))) {
    return {
      mode: "fix",
      confidence: 0.9,
      source: "rules",
      reason: "Detected troubleshooting or failure language.",
      topic: extractTopic(prompt)
    };
  }

  if (
    artifactSignals.some((signal) => value.includes(signal)) ||
    value.startsWith("create") ||
    value.startsWith("generate") ||
    value.startsWith("draft") ||
    value.startsWith("write")
  ) {
    return {
      mode: "artifact",
      confidence: 0.86,
      source: "rules",
      reason: "Detected requested output or artifact language.",
      topic: extractTopic(prompt)
    };
  }

  if (buildSignals.some((signal) => value.includes(signal))) {
    return {
      mode: "build",
      confidence: 0.82,
      source: "rules",
      reason: "Detected implementation or configuration language.",
      topic: extractTopic(prompt)
    };
  }

  if (understandSignals.some((signal) => value.includes(signal))) {
    return {
      mode: "understand",
      confidence: 0.74,
      source: "rules",
      reason: "Detected explanation or learning intent.",
      topic: extractTopic(prompt)
    };
  }

  return {
    mode: "understand",
    confidence: 0.45,
    source: "rules",
    reason: "No strong signal detected.",
    topic: extractTopic(prompt)
  };
}

export async function classifyWithSimulatedAI(prompt: string): Promise<ClassificationResult> {
  await wait(600);

  const value = prompt.trim().toLowerCase();

  if (
    value.includes("cannot") ||
    value.includes("fails") ||
    value.includes("failed") ||
    value.includes("not able") ||
    value.includes("unreachable") ||
    value.includes("not connecting") ||
    value.includes("wrong")
  ) {
    return {
      mode: "fix",
      confidence: 0.84,
      source: "simulated-ai",
      reason: "Simulated AI detected a problem-solving/troubleshooting request.",
      topic: extractTopic(prompt)
    };
  }

  return {
    mode: "understand",
    confidence: 0.55,
    source: "simulated-ai",
    reason: "Simulated AI fallback defaulted to explanation mode.",
    topic: extractTopic(prompt)
  };
}

export async function classifyUserPrompt(
  prompt: string,
  selectedMode: RedefinedMode | null
): Promise<ClassificationResult> {
  if (selectedMode) {
    return {
      mode: selectedMode,
      confidence: 1,
      source: "manual",
      reason: "User selected this mode manually.",
      topic: extractTopic(prompt)
    };
  }

  const ruleResult = classifyWithRules(prompt);
  if (ruleResult.confidence >= 0.8) return ruleResult;

  const aiResult = await classifyWithSimulatedAI(prompt);
  if (aiResult.confidence >= 0.65) return aiResult;

  return {
    mode: "understand",
    confidence: 0.4,
    source: "fallback",
    reason: "Intent was unclear, defaulted to Understand.",
    topic: extractTopic(prompt)
  };
}

export function createLocalId() {
  return `local-${Date.now().toString(36)}`;
}

function isGatewayDatabasePrompt(prompt: string) {
  const value = prompt.toLowerCase();
  return (
    (value.includes("gateway") && (value.includes("sql") || value.includes("database"))) ||
    value.includes("data source")
  );
}

function isAccessPrompt(prompt: string) {
  const value = prompt.toLowerCase();
  return (
    value.includes("login") ||
    value.includes("sso") ||
    value.includes("sign in") ||
    value.includes("access") ||
    value.includes("application")
  );
}

function isCheckoutPrompt(prompt: string) {
  const value = prompt.toLowerCase();
  return value.includes("checkout") || value.includes("payment") || value.includes("order");
}

function mentionsPowerBI(prompt: string) {
  const value = prompt.toLowerCase();
  return value.includes("power bi") || value.includes("powerbi");
}

function mentionsSqlMi(prompt: string) {
  const value = prompt.toLowerCase();
  return value.includes("sql mi") || value.includes("managed instance");
}

export function buildIssueMap(prompt: string, classification: ClassificationResult): IssueMap {
  if (isGatewayDatabasePrompt(prompt)) {
    const hasPowerBI = mentionsPowerBI(prompt);
    const hasSqlMi = mentionsSqlMi(prompt);

    return {
      title: "Live request path",
      summary:
        "Visualizing the likely path between the request source, gateway, resolution layer, network, and target service.",
      nodes: [
        {
          id: "source",
          label: hasPowerBI ? "Power BI" : "Request Source",
          type: "service",
          detail: "The user or service starts a refresh or connection.",
          reason: "This is where the request originates before it reaches the connection path.",
          check: hasPowerBI
            ? "Confirm the dataset is using the expected gateway connection."
            : "Confirm the source is sending the request to the expected connector.",
          risk: "low"
        },
        {
          id: "gateway",
          label: "Gateway",
          type: "gateway",
          detail: "The intermediary that must receive and forward the request.",
          reason: "The gateway must be online, mapped correctly, and able to reach the target.",
          check: "Confirm the gateway service is healthy and using the expected data source mapping.",
          risk: "medium"
        },
        {
          id: "resolution",
          label: "DNS",
          type: "check",
          detail: "The target service name must resolve from the gateway environment.",
          reason: "A wrong or public resolution path can prevent private database connectivity.",
          check: hasSqlMi
            ? "Confirm the gateway resolves the SQL MI hostname to the expected private address."
            : "Confirm the gateway resolves the target hostname to the expected reachable address.",
          risk: "medium"
        },
        {
          id: "network",
          label: "Network / Firewall",
          type: "network",
          detail: "Routing, firewall, private access, and ports must allow the connection.",
          reason: "Traffic can be blocked by routing, firewall, NSG, private endpoint, or port rules.",
          check: hasSqlMi
            ? "Validate route, firewall, private endpoint, NSG, and port access from gateway to SQL MI."
            : "Validate route, firewall, private endpoint, security rule, and port access.",
          risk: "high"
        },
        {
          id: "target",
          label: hasSqlMi ? "SQL MI" : "Target Service",
          type: "database",
          detail: "The target endpoint must accept the request and authenticate it.",
          reason: "The target may reject traffic, credentials, identity, or permissions.",
          check: hasSqlMi
            ? "Confirm SQL MI accepts traffic from the gateway network path."
            : "Confirm the target service accepts traffic and validates the expected identity.",
          risk: "medium"
        }
      ],
      edges: [
        { from: "source", to: "gateway" },
        { from: "gateway", to: "resolution" },
        { from: "resolution", to: "network" },
        { from: "network", to: "target" }
      ],
      likelyFailureZones: ["resolution", "network", "target"]
    };
  }

  if (isAccessPrompt(prompt)) {
    return {
      title: "Access flow",
      summary:
        "Visualizing how the user request moves through application access, identity validation, claims, and final access result.",
      nodes: [
        {
          id: "user",
          label: "User",
          type: "user",
          detail: "The affected person or account attempting access.",
          reason: "The affected identity determines assignment, policy, and claims evaluation.",
          check: "Confirm the exact user, group membership, and affected sign-in attempt.",
          risk: "low"
        },
        {
          id: "app",
          label: "Application",
          type: "app",
          detail: "The app receiving the sign-in or access request.",
          reason: "The app must be configured to trust the expected identity path.",
          check: "Confirm application assignment, redirect URLs, and SSO configuration.",
          risk: "low"
        },
        {
          id: "identity",
          label: "Identity Provider",
          type: "identity",
          detail: "The identity system responsible for authentication.",
          reason: "Identity provider settings control authentication, token issuance, and policy.",
          check: "Review issuer, certificate, entity ID, reply URL, and sign-in logs.",
          risk: "medium"
        },
        {
          id: "claims",
          label: "Claims / Attributes",
          type: "check",
          detail: "Groups, claims, attributes, and policy inputs used for access.",
          reason: "Missing or mismatched claims often cause access denial after authentication.",
          check: "Compare expected claims and group attributes against the issued token.",
          risk: "high"
        },
        {
          id: "access",
          label: "Access Result",
          type: "output",
          detail: "The final allow, deny, redirect, or error state.",
          reason: "The final result shows whether the failure is authentication or authorization.",
          check: "Capture the exact access result and correlate it with sign-in or app logs.",
          risk: "medium"
        }
      ],
      edges: [
        { from: "user", to: "app" },
        { from: "app", to: "identity" },
        { from: "identity", to: "claims" },
        { from: "claims", to: "access" }
      ],
      likelyFailureZones: ["identity", "claims", "access"]
    };
  }

  return {
    title: "Issue flow",
    summary: "Visualizing the likely path from symptom to context, dependency, validation, and resolution.",
    nodes: [
      {
        id: "symptom",
        label: "Symptom",
        type: "unknown",
        detail: "What the user can observe.",
        reason: "The visible symptom anchors the investigation and prevents guessing.",
        check: "Capture the exact error, timestamp, user, and system state.",
        risk: "medium"
      },
      {
        id: "context",
        label: "Context",
        type: "check",
        detail: "When, where, and for whom the issue happens.",
        reason: "Context narrows whether this is user-specific, environment-specific, or systemic.",
        check: "Compare affected and unaffected users, locations, and times.",
        risk: "low"
      },
      {
        id: "dependency",
        label: "Dependency",
        type: "check",
        detail: "External systems, permissions, or services involved.",
        reason: "Most fix paths depend on a handoff to another service, identity, or network layer.",
        check: "Validate the highest-risk dependency before checking lower-risk nodes.",
        risk: "medium"
      },
      {
        id: "validation",
        label: "Validation",
        type: "check",
        detail: "Checks that confirm or eliminate likely causes.",
        reason: "Validation turns the issue map into evidence instead of assumptions.",
        check: "Run one targeted check per likely failure zone and record the result.",
        risk: "low"
      },
      {
        id: "resolution",
        label: "Resolution",
        type: "output",
        detail: "The action that restores the expected state.",
        reason: "The fix should map back to the first confirmed failed handoff.",
        check: "Confirm the repair by rerunning the original failed request.",
        risk: "low"
      }
    ],
    edges: [
      { from: "symptom", to: "context", label: "scope" },
      { from: "context", to: "dependency", label: "depends on" },
      { from: "dependency", to: "validation", label: "check" },
      { from: "validation", to: "resolution", label: "resolve" }
    ],
    likelyFailureZones: ["symptom", "dependency"]
  };
}

export function buildFixDiagnosis(
  prompt: string,
  classification: ClassificationResult,
  issueMap?: IssueMap
): FixDiagnosis {
  const value = prompt.toLowerCase();
  const mentionsGateway = value.includes("gateway");
  const mentionsDatabase =
    value.includes("database") ||
    value.includes("sql") ||
    value.includes("sql mi") ||
    value.includes("db");
  const mentionsLogin = isAccessPrompt(prompt);
  const mentionsCheckout = isCheckoutPrompt(prompt);

  if (mentionsGateway && mentionsDatabase) {
    return {
      title: "Likely connection-path failure",
      answer:
        "The issue is most likely in the path between the gateway host and the target database service. The strongest areas to validate are name resolution, network reachability, firewall/private endpoint access, and gateway data source mapping.",
      confidence: "medium",
      why: [
        "The prompt mentions a gateway and a database target.",
        "The reported symptom is a connection failure.",
        "That usually means the request reaches the gateway layer but cannot complete the path to the database."
      ],
      likelyCauses: [
        {
          label: "Name resolution mismatch",
          reason:
            "The gateway host may not resolve the database hostname to the expected reachable address.",
          priority: "high"
        },
        {
          label: "Network or firewall block",
          reason:
            "The gateway host may not have route, port, private endpoint, firewall, or NSG access to the database.",
          priority: "high"
        },
        {
          label: "Gateway data source mapping",
          reason:
            "The dataset or request may be mapped to the wrong gateway data source, hostname, or credential set.",
          priority: "medium"
        },
        {
          label: "Authentication or permission mismatch",
          reason:
            "The gateway may reach the database but fail when credentials or permissions are validated.",
          priority: "medium"
        }
      ]
    };
  }

  if (mentionsLogin) {
    return {
      title: "Likely access or identity flow failure",
      answer:
        "The issue is most likely in the authentication or authorization path. The strongest areas to validate are application assignment, identity provider configuration, claims/attributes, and user access policy.",
      confidence: "medium",
      why: [
        "The prompt describes a login or access failure.",
        "Access issues usually depend on identity flow, claims, assignment, or authorization policy.",
        "The failure may happen even if the application itself is online."
      ],
      likelyCauses: [
        {
          label: "Application assignment missing",
          reason:
            "The user may not be assigned to the enterprise application or required group.",
          priority: "high"
        },
        {
          label: "Claims or attributes mismatch",
          reason:
            "The application may expect a claim or identifier that is missing or incorrectly mapped.",
          priority: "high"
        },
        {
          label: "Identity provider configuration issue",
          reason:
            "SSO URLs, certificates, entity IDs, or reply URLs may not match the application configuration.",
          priority: "medium"
        },
        {
          label: "Conditional access or policy block",
          reason:
            "The user may be blocked by policy, device compliance, MFA, or location rules.",
          priority: "medium"
        }
      ]
    };
  }

  if (mentionsCheckout) {
    return {
      title: "Likely transaction flow failure",
      answer:
        "The issue is most likely in the handoff between checkout, payment confirmation, order creation, or backend validation.",
      confidence: "medium",
      why: [
        "The prompt describes a failure during a transaction journey.",
        "Checkout issues often happen between payment confirmation and order finalization.",
        "The visible symptom may be caused by a backend or integration dependency."
      ],
      likelyCauses: [
        {
          label: "Payment confirmation handoff",
          reason:
            "The payment provider may confirm payment but the application may not receive or process the callback correctly.",
          priority: "high"
        },
        {
          label: "Order creation failure",
          reason:
            "The order service may fail after payment confirmation because of validation, inventory, or database issues.",
          priority: "high"
        },
        {
          label: "Backend dependency failure",
          reason:
            "A downstream API, queue, webhook, or database dependency may be unavailable or returning errors.",
          priority: "medium"
        }
      ]
    };
  }

  const likelyZones =
    issueMap?.nodes
      .filter((node) => issueMap.likelyFailureZones?.includes(node.id))
      .map((node) => node.label) ?? [];

  return {
    title: "More evidence is needed",
    answer:
      "Doc/ReDefined could not confidently infer a specific cause yet. Add exact error output, logs, command results, or observed behavior so the workspace can create a stronger diagnostic branch.",
    confidence: "low",
    why: [
      "The prompt describes a problem or failure state.",
      "The exact root cause is not confirmed yet.",
      "The issue map highlights the most likely areas to validate first."
    ],
    likelyCauses:
      likelyZones.length > 0
        ? likelyZones.map((zone, index) => ({
            label: zone,
            reason:
              "This area was highlighted as a likely failure zone based on the prompt and issue map.",
            priority: index === 0 ? "high" : "medium"
          }))
        : [
            {
              label: "Unconfirmed dependency failure",
              reason:
                "The prompt does not provide enough detail to identify the exact dependency yet.",
              priority: "medium"
            }
          ]
  };
}

function buildFixVisualFlow(prompt: string) {
  if (isGatewayDatabasePrompt(prompt)) {
    return ["Source", "Gateway", "Resolution", "Network", "Target"];
  }

  if (isAccessPrompt(prompt)) {
    return ["User", "Application", "Identity", "Claims", "Access"];
  }

  return ["Symptom", "Context", "Dependency", "Validation", "Resolution"];
}

function buildFixSections(prompt: string): ResultSection[] {
  if (isGatewayDatabasePrompt(prompt)) {
    const hasPowerBI = mentionsPowerBI(prompt);
    const hasSqlMi = mentionsSqlMi(prompt);

    return [
      {
        type: "diagnostic_step",
        title: hasPowerBI
          ? "Check name resolution from the gateway server"
          : "Check name resolution from the affected host",
        description: hasSqlMi
          ? "Confirm the gateway resolves the SQL MI hostname to the expected private address."
          : "Confirm the machine or service making the connection resolves the target hostname to the expected reachable address."
      },
      {
        type: "diagnostic_step",
        title: hasSqlMi
          ? "Test network reachability from gateway to SQL MI"
          : "Test network reachability to the target",
        description: hasSqlMi
          ? "Validate route, firewall, private endpoint, NSG, and port access."
          : "Validate route, port access, firewall, private endpoint, proxy, or security rule behavior between the source and target."
      },
      {
        type: "diagnostic_step",
        title: hasSqlMi ? "Validate SQL MI access rules" : "Validate service-side access rules",
        description: hasSqlMi
          ? "Confirm SQL MI accepts traffic from the gateway network path."
          : "Check whether the target service accepts traffic from the expected source, subnet, private endpoint, or integration path."
      },
      {
        type: "diagnostic_step",
        title: hasPowerBI
          ? "Review Power BI Gateway data source mapping"
          : "Review credentials, mapping, and permissions",
        description: hasPowerBI
          ? "Confirm the dataset uses the correct gateway source, hostname, credentials, and permissions."
          : "Confirm the request is using the correct data source mapping, credential set, identity, role, or permission model."
      }
    ];
  }

  return [
    {
      type: "diagnostic_step",
      title: "Confirm the exact failure point",
      description:
        "Identify which node in the issue map first fails and collect the exact error, timestamp, and affected user or system."
    },
    {
      type: "diagnostic_step",
      title: "Validate the highest-risk dependency",
      description:
        "Start with the highlighted likely failure zone and confirm whether the dependency is reachable and correctly configured."
    },
    {
      type: "diagnostic_step",
      title: "Compare expected vs actual flow",
      description:
        "Check whether the request follows the expected path or is being redirected, blocked, misrouted, or denied."
    },
    {
      type: "diagnostic_step",
      title: "Document the confirmed cause",
      description:
        "Once a check fails, capture the evidence and convert it into a fix action, ticket update, or runbook step."
    }
  ];
}

function buildQuickTests(prompt: string): QuickTest[] {
  if (isGatewayDatabasePrompt(prompt)) {
    const targetLabel = mentionsSqlMi(prompt) ? "SQL MI" : "target";

    return [
      {
        id: "dns-test",
        title: "Name resolution test",
        purpose: "Check whether the affected host resolves the target correctly.",
        commands: ["nslookup <target-fqdn>", "nslookup <target-alias>"],
        successSignal: "Resolves to the expected reachable address.",
        failureMeaning: "DNS, alias, or private endpoint resolution issue.",
        category: "dns"
      },
      {
        id: "network-test",
        title: "Port reachability test",
        purpose: `Check whether the gateway can reach ${targetLabel} on the required port.`,
        commands: ["Test-NetConnection <target-fqdn> -Port 1433"],
        successSignal: "TcpTestSucceeded is True.",
        failureMeaning: "Route, firewall, private endpoint, NSG, or port access issue.",
        category: "network"
      },
      {
        id: "mapping-test",
        title: "Datasource mapping check",
        purpose: "Check whether the app/report source matches the gateway datasource exactly.",
        commands: ["Compare server, database, auth type, and credential binding"],
        successSignal: "Source and gateway datasource values match.",
        failureMeaning: "Datasource mapping or credential binding mismatch.",
        category: "config"
      }
    ];
  }

  return [
    {
      id: "first-failure-test",
      title: "Collect exact failure evidence",
      purpose: "Capture the exact error, log line, status code, or command output from the affected system.",
      commands: ["Paste the exact error output, log line, or failed command result."],
      successSignal: "The evidence identifies the affected component, identity, endpoint, or dependency.",
      failureMeaning: "The workspace still needs more specific evidence before choosing a concrete root-cause branch.",
      category: "generic"
    }
  ];
}

function buildDecisionPath(prompt: string): DecisionPathItem[] {
  if (isGatewayDatabasePrompt(prompt)) {
    return [
      {
        id: "dns-fails",
        condition: "If DNS fails",
        meaning: "DNS / private endpoint issue",
        nextAction: "Validate DNS zone, alias usage, conditional forwarding, and private endpoint records."
      },
      {
        id: "tcp-fails",
        condition: "If TCP fails",
        meaning: "Network / firewall / route issue",
        nextAction: "Check route tables, firewall rules, NSGs, private endpoint approval, and VNet path."
      },
      {
        id: "target-auth-fails",
        condition: "If target login fails",
        meaning: "Target access or authentication issue",
        nextAction: "Validate credentials, database permissions, login mapping, and TLS/certificate behavior."
      },
      {
        id: "only-app-fails",
        condition: "If only the app/report fails",
        meaning: "Gateway datasource mapping issue",
        nextAction: "Match source server/database values exactly with the gateway datasource."
      }
    ];
  }

  return [
    {
      id: "node-fails",
      condition: "If a highlighted node fails",
      meaning: "That branch is now the leading cause.",
      nextAction: "Run the next check closest to the failed node and update the path with evidence."
    },
    {
      id: "all-nodes-pass",
      condition: "If highlighted nodes pass",
      meaning: "The likely cause shifts later in the flow.",
      nextAction: "Compare expected vs actual handoff and inspect mapping or policy layers."
    }
  ];
}

function buildPathUpdate(prompt: string): PathUpdate {
  const gatewayDatabase = isGatewayDatabasePrompt(prompt);

  return {
    status: "initial",
    title: gatewayDatabase ? "Validate gateway connectivity evidence" : "Collect targeted failure evidence",
    description: gatewayDatabase
      ? "Run the quick tests from the gateway server. The first failed test will narrow DNS, network, target access, or datasource mapping."
      : "Paste the exact error output, logs, command result, affected identity, endpoint, or timestamp so the workspace can narrow the issue.",
    nextBestAction: {
      title: gatewayDatabase ? "Run DNS and TCP tests from the gateway server" : "Paste exact failure evidence",
      description: gatewayDatabase
        ? "Start with name resolution and port reachability so the path can be narrowed from evidence."
        : "Include the exact error text, log line, command output, and affected system or identity.",
      commands: gatewayDatabase
        ? ["nslookup <target-fqdn>", "Test-NetConnection <target-fqdn> -Port 1433"]
        : undefined
    }
  };
}

function buildScratchpad(prompt: string): ScratchpadVariable[] {
  const variables: ScratchpadVariable[] = [
    {
      id: "original-prompt",
      label: "original_prompt",
      value: prompt,
      source: "prompt"
    }
  ];

  if (isGatewayDatabasePrompt(prompt)) {
    variables.push(
      {
        id: "source-system",
        label: "source_system",
        value: mentionsPowerBI(prompt) ? "Power BI" : "Request source",
        source: "ai"
      },
      {
        id: "target-service",
        label: "target_service",
        value: mentionsSqlMi(prompt) ? "SQL MI" : "Target database",
        source: "ai"
      },
      {
        id: "port",
        label: "port",
        value: "1433",
        source: "ai"
      }
    );
  }

  return variables;
}

function buildTimeline(): TimelineEntry[] {
  return [
    {
      id: "initial-diagnosis",
      type: "initial_diagnosis",
      title: "Initial diagnosis path generated",
      summary: "Structured Fix workspace created from the prompt.",
      timestampLabel: "Just now"
    }
  ];
}

function buildDiagnosticTerminal(prompt: string): DiagnosticTerminal {
  if (isGatewayDatabasePrompt(prompt)) {
    return {
      title: "Diagnostic terminal",
      shell: "powershell",
      commands: [
        {
          id: "cmd-dns",
          label: "DNS lookup",
          command: "nslookup <target-fqdn>",
          category: "dns"
        },
        {
          id: "cmd-network",
          label: "Port reachability",
          command: "Test-NetConnection <target-fqdn> -Port 1433",
          category: "network"
        }
      ],
      notes: ["Run these from the gateway server or affected host environment."]
    };
  }

  return {
    title: "Diagnostic terminal",
    shell: "generic",
    commands: [
      {
        id: "cmd-first-check",
        label: "First focused check",
        command: "Run the smallest check for the first highlighted failure zone",
        category: "generic"
      }
    ]
  };
}

function buildArtifactActions(): ArtifactAction[] {
  return [
    { type: "ticket_update", label: "Create ticket update" },
    { type: "runbook", label: "Export executable runbook" },
    { type: "save_journey", label: "Save journey workspace" },
    { type: "share", label: "Share with team" }
  ];
}

function isTerraformPrivateEndpointPrompt(prompt: string): boolean {
  const value = prompt.toLowerCase();
  return /terraform/.test(value) && /private\s+endpoint|privatelink|private\s+link/.test(value);
}

function isBusinessPlanPrompt(prompt: string): boolean {
  return /business\s+plan|business/.test(prompt.toLowerCase());
}

function buildWorkspaceTitle(prompt: string, classification: ClassificationResult): string {
  if (isTerraformPrivateEndpointPrompt(prompt)) return "Azure Private Endpoint Terraform Builder";
  if (isBusinessPlanPrompt(prompt)) return "Business Plan Builder";
  return classification.topic || prompt;
}

function buildRequiredInputs(prompt: string): BuildRequiredInput[] {
  if (isTerraformPrivateEndpointPrompt(prompt)) {
    return [
      { id: "input-scope", label: "Azure subscription and resource group", whyNeeded: "Defines where Terraform will create the private endpoint resources.", placeholder: "subscription id, resource group, location", status: "missing" },
      { id: "input-network", label: "Virtual network and subnet", whyNeeded: "Private endpoints need a target subnet and compatible network policy settings.", placeholder: "vnet name and private endpoint subnet", status: "missing" },
      { id: "input-target", label: "Target Azure resource", whyNeeded: "Terraform needs the service resource ID and subresource group IDs.", placeholder: "storage account, SQL server, Key Vault, etc.", status: "missing" },
      { id: "input-dns", label: "Private DNS zone", whyNeeded: "Private endpoint traffic only works cleanly when service FQDNs resolve to private IPs.", placeholder: "privatelink.blob.core.windows.net", status: "missing" },
      { id: "input-naming", label: "Naming and tags", whyNeeded: "Keeps the Terraform block reusable across environments.", placeholder: "environment, owner, cost center", status: "assumed" }
    ];
  }

  return [
    { id: "input-business-name", label: "Business name", whyNeeded: "Anchors the plan and keeps each section specific.", placeholder: "Working business name", status: "missing" },
    { id: "input-product", label: "Product/service", whyNeeded: "Defines what the business sells and the value it delivers.", placeholder: "What are you offering?", status: "missing" },
    { id: "input-customer", label: "Target customer", whyNeeded: "Shapes market analysis, messaging, channels, and pricing.", placeholder: "Who buys this and why?", status: "missing" },
    { id: "input-market", label: "Market/location", whyNeeded: "Sets the competitive and geographic context.", placeholder: "Industry, city, country, or niche", status: "missing" },
    { id: "input-revenue", label: "Revenue model", whyNeeded: "Explains how the business makes money.", placeholder: "Sales, services, subscriptions, marketplace", status: "missing" },
    { id: "input-pricing", label: "Pricing", whyNeeded: "Turns the offer into measurable financial assumptions.", placeholder: "Price points or package levels", status: "missing" },
    { id: "input-costs", label: "Startup costs", whyNeeded: "Shows funding needs and break-even pressure.", placeholder: "Launch budget, tools, inventory, payroll", status: "missing" },
    { id: "input-channel", label: "Marketing channel", whyNeeded: "Clarifies how customers will be reached and acquired.", placeholder: "SEO, ads, partnerships, direct sales", status: "missing" },
    { id: "input-funding", label: "Funding purpose", whyNeeded: "Connects the plan to loans, investors, grants, or internal approval.", placeholder: "Loan, investor pitch, grant, internal plan", status: "missing" }
  ];
}

function buildBuildFlow(prompt: string): BuildFlowStep[] {
  const labels = isTerraformPrivateEndpointPrompt(prompt)
    ? ["Variables", "Resource group", "Subnet", "Private endpoint", "DNS zone group", "VNet link", "Validation"]
    : ["Idea", "Customer", "Market", "Offer", "Revenue model", "Operations", "Financials", "Executive summary"];

  return labels.map((label, index) => ({
    id: `flow-${index + 1}`,
    label,
    description: index === 0 ? "Start with the required inputs." : `Build and validate the ${label.toLowerCase()} layer.`
  }));
}

function buildSectionBlueprint(prompt: string): BuildSectionBlueprint[] {
  if (isTerraformPrivateEndpointPrompt(prompt)) {
    return [
      { id: "sec-variables", sectionName: "Variables", purpose: "Capture reusable values for names, IDs, location, DNS, and tags.", keyQuestions: ["Which values differ by environment?", "Which service resource ID is targeted?"], outputExpected: "variables.tf with typed inputs and useful descriptions." },
      { id: "sec-network", sectionName: "Network Foundation", purpose: "Reference or create the resource group, VNet, and subnet dependencies.", keyQuestions: ["Which subnet hosts private endpoints?", "Are policies and address space ready?"], outputExpected: "Terraform data/resource blocks for network dependencies." },
      { id: "sec-private-endpoint", sectionName: "Private Endpoint", purpose: "Create the endpoint and private service connection.", keyQuestions: ["Which subresource name is required?", "Should the connection be manual or automatic?"], outputExpected: "azurerm_private_endpoint with service connection." },
      { id: "sec-dns", sectionName: "DNS Zone Group", purpose: "Bind private DNS so the service FQDN resolves privately.", keyQuestions: ["Which privatelink zone is required?", "Does the VNet link exist?"], outputExpected: "DNS zone group and VNet link configuration." },
      { id: "sec-validation", sectionName: "Validation", purpose: "Confirm Terraform output, DNS resolution, and service reachability.", keyQuestions: ["Does nslookup return a private IP?", "Can the workload connect through the private route?"], outputExpected: "Outputs and post-apply validation commands." }
    ];
  }

  return [
    { id: "sec-executive-summary", sectionName: "Executive Summary", purpose: "Summarize the business, market, offer, and ask.", keyQuestions: ["What is the business?", "Why now?", "What result are you asking for?"], outputExpected: "A concise one-page summary." },
    { id: "sec-business-description", sectionName: "Business Description", purpose: "Explain the company, mission, problem, and solution.", keyQuestions: ["What problem exists?", "How does the business solve it?", "What makes it credible?"], outputExpected: "A clear problem-solution narrative." },
    { id: "sec-market-analysis", sectionName: "Market Analysis", purpose: "Prove there is a reachable market and real demand.", keyQuestions: ["Who is the customer?", "How large is the market?", "Who are the competitors?"], outputExpected: "Segments, market size, and competitor snapshot." },
    { id: "sec-product-service", sectionName: "Product/Service", purpose: "Describe the offer, pricing, and differentiation.", keyQuestions: ["What is sold?", "What does it cost?", "Why choose it?"], outputExpected: "Offer details with pricing and positioning." },
    { id: "sec-marketing", sectionName: "Marketing Strategy", purpose: "Show how customers will be acquired and retained.", keyQuestions: ["Which channels will work first?", "What message converts?", "How will retention happen?"], outputExpected: "A practical go-to-market plan." },
    { id: "sec-operations", sectionName: "Operations Plan", purpose: "Define how the business delivers reliably.", keyQuestions: ["Who does what?", "Which tools or partners matter?", "What workflow creates the output?"], outputExpected: "Roles, workflow, partners, and operating model." },
    { id: "sec-financial", sectionName: "Financial Plan", purpose: "Translate assumptions into revenue, costs, and cash flow.", keyQuestions: ["What drives revenue?", "What are the main costs?", "When is break-even?"], outputExpected: "Startup costs, revenue model, and projections." },
    { id: "sec-risks", sectionName: "Risks/Milestones", purpose: "Identify risks and proof points.", keyQuestions: ["What could fail?", "How will risk be reduced?", "Which milestones show progress?"], outputExpected: "Risk table and milestone roadmap." }
  ];
}

function buildQualityChecklist(prompt: string): BuildQualityCheckItem[] {
  const items = isTerraformPrivateEndpointPrompt(prompt)
    ? [
        ["DNS/private endpoint resolution is validated", "Private endpoint builds often fail because FQDNs still resolve publicly."],
        ["Subresource and target resource ID are correct", "Wrong group IDs can deploy but connect to the wrong service plane."],
        ["Subnet and VNet link assumptions are explicit", "Networking dependencies must be clear before the Terraform block is reusable."],
        ["Variables avoid hardcoded environment values", "Reusable Terraform needs clean inputs for dev, test, and prod."],
        ["Post-apply checks are included", "The build should prove DNS and connectivity after deployment."]
      ]
    : [
        ["Customer and problem are specific", "Generic customer definitions make market, pricing, and marketing sections weak."],
        ["Revenue assumptions are measurable", "The plan needs numbers that can be tested and adjusted."],
        ["Startup costs and break-even are visible", "Readers need to understand funding needs and cash-flow pressure."],
        ["Marketing channel is realistic", "A plan without a believable acquisition path is incomplete."],
        ["Risks and milestones are explicit", "The strongest plans show what must be proven next."]
      ];

  return items.map(([item, reason], index) => ({
    id: `check-${index + 1}`,
    item,
    reason,
    status: "pending"
  }));
}

export function buildLocalRedefinedResult(
  prompt: string,
  classification: ClassificationResult
): RedefinedResult {
  const mode = classification.mode;

  if (mode === "fix") {
    const issueMap = buildIssueMap(prompt, classification);
    const diagnosis = buildFixDiagnosis(prompt, classification, issueMap);

    return {
      id: createLocalId(),
      mode,
      title: classification.topic || prompt,
      summary:
        "A troubleshooting path to identify symptoms, likely causes, validation checks, and next actions.",
      classification,
      issueMap,
      diagnosis,
      visualFlow: buildFixVisualFlow(prompt),
      sections: buildFixSections(prompt),
      originalPrompt: prompt,
      quickTests: buildQuickTests(prompt),
      decisionPath: buildDecisionPath(prompt),
      pathUpdate: buildPathUpdate(prompt),
      scratchpad: buildScratchpad(prompt),
      timeline: buildTimeline(),
      diagnosticTerminal: buildDiagnosticTerminal(prompt),
      artifacts: buildArtifactActions(),
      actions: [
        { label: "Generate commands", action: "generate_commands" },
        { label: "Create ticket update", action: "create_ticket_update" },
        { label: "Build troubleshooting checklist", action: "build_troubleshooting_checklist" }
      ]
    };
  }

  if (mode === "artifact") {
    return {
      id: createLocalId(),
      mode,
      title: classification.topic || prompt,
      summary: "A practical output prepared as a reusable artifact.",
      classification,
      visualFlow: ["Input", "Structure", "Checklist", "Review", "Export"],
      sections: [
        {
          type: "checklist",
          title: "Core checklist",
          items: [
            "Define scope",
            "Identify owners",
            "Review risks",
            "Validate implementation",
            "Document next actions"
          ]
        }
      ],
      actions: [
        { label: "Open artifact", action: "open_artifact" },
        { label: "Create runbook", action: "create_runbook" },
        { label: "Export summary", action: "export_summary" }
      ]
    };
  }

  if (mode === "build") {
    const title = buildWorkspaceTitle(prompt, classification);
    return {
      id: createLocalId(),
      mode,
      title,
      summary: "A guided implementation path with steps, checks, and decisions.",
      classification,
      originalPrompt: prompt,
      domain: isTerraformPrivateEndpointPrompt(prompt) ? "azure_infrastructure" : "business",
      workspaceType: isTerraformPrivateEndpointPrompt(prompt)
        ? "terraform_private_endpoint_builder"
        : "business_plan_builder",
      requiredInputs: buildRequiredInputs(prompt),
      buildFlow: buildBuildFlow(prompt),
      draftingSteps: [],
      sectionBlueprint: buildSectionBlueprint(prompt),
      qualityChecklist: buildQualityChecklist(prompt),
      buildNextActions: [
        {
          label: "Generate artifact",
          targetMode: "artifact",
          prompt: isTerraformPrivateEndpointPrompt(prompt)
            ? "Create a Terraform private endpoint block from this build path"
            : "Create a complete business plan from this build path"
        },
        {
          label: "Create checklist",
          targetMode: "artifact",
          prompt: `Create a checklist for ${title}`
        }
      ],
      visualFlow: buildBuildFlow(prompt).map((step) => step.label),
      sections: [],
      actions: [
        { label: "Start build path", action: "open_build_path" },
        { label: "Show decisions", action: "show_decisions" },
        { label: "Generate checklist", action: "generate_checklist" }
      ]
    };
  }

  return {
    id: createLocalId(),
    mode: "understand",
    title: classification.topic || prompt,
    summary: "A clear explanation with simple context, visual flow, and role-based understanding.",
    classification,
    visualFlow: ["Concept", "Context", "How it works", "Example", "Summary"],
    sections: [
      {
        type: "explanation",
        title: "Simple explanation",
        description: "Break the topic into plain language and explain what matters first."
      },
      {
        type: "explanation",
        title: "How it works",
        description: "Show the flow, components, and relationships behind the topic."
      }
    ],
    actions: [
      { label: "Open visual guide", action: "open_visual_guide" },
      { label: "Show example", action: "show_example" },
      { label: "Create summary", action: "create_summary" }
    ]
  };
}
