import type { CausalGraph } from "@/types/redefined";

type PlainObject = Record<string, unknown>;

const nodeTypes = new Set([
  "user",
  "service",
  "app",
  "gateway",
  "database",
  "network",
  "identity",
  "security",
  "check",
  "output",
  "unknown"
]);

const statuses = new Set(["neutral", "unknown", "checking", "healthy", "warning", "failed"]);
const priorities = new Set(["low", "medium", "high"]);
const categories = new Set(["dns", "network", "auth", "config", "service", "generic"]);
const shells = new Set(["powershell", "bash", "sql", "generic"]);
const causalNodeKinds = new Set(["source", "dependency", "failure", "target", "result"]);
const causalNodeStatuses = new Set(["neutral", "checking", "passing", "failing", "unknown"]);
const causalEdgeKinds = new Set(["request", "dependency", "blocks", "causes"]);
const timelineTypes = new Set([
  "initial_diagnosis",
  "evidence_received",
  "path_recalibrated",
  "next_action",
  "artifact_created",
  "resolved"
]);
const artifactTypes = new Set([
  "ticket_update",
  "runbook",
  "save_journey",
  "share",
  "checklist",
  "summary"
]);

export function normalizeFixWorkspaceResult(raw: unknown, prompt: string): unknown {
  const source = asObject(raw);
  const title = normalizeTitle(stringValue(source.title, source.topic, source.heading, prompt), prompt);
  const issueMap = normalizeIssueMap(source.issueMap ?? source.map ?? source.flow, prompt);
  const failureBranches = normalizeFailureBranches(source.failureBranches ?? source.branches, prompt);
  const causalGraph = normalizeCausalGraph(source.causalGraph, prompt);
  const quickTests = normalizeQuickTests(source.quickTests ?? source.tests ?? source.checks, failureBranches, prompt);
  const decisionPath = normalizeDecisionPath(source.decisionPath ?? source.decisions ?? source.branches);
  const pathUpdate = normalizePathUpdate(source.pathUpdate, quickTests, failureBranches, prompt);

  return {
    id: stringValue(source.id, `fix-${Date.now()}`),
    mode: "fix",
    originalPrompt: stringValue(source.originalPrompt, source.prompt, prompt),
    title,
    summary: stringValue(
      source.summary,
      "A structured troubleshooting workspace with diagnosis, issue map, validation checks, and next actions."
    ),
    classification: normalizeClassification(source.classification, prompt),
    diagnosis: normalizeDiagnosis(source.diagnosis, title, prompt),
    issueMap,
    quickTests,
    failureBranches,
    causalGraph,
    decisionPath,
    pathUpdate,
    scratchpad: normalizeScratchpad(source.scratchpad, prompt),
    timeline: normalizeTimeline(source.timeline),
    diagnosticTerminal: normalizeDiagnosticTerminal(source.diagnosticTerminal ?? source.terminal, quickTests),
    environmentComparison: normalizeEnvironmentComparison(source.environmentComparison),
    artifacts: normalizeArtifacts(source.artifacts ?? source.actions),
    visualFlow: normalizeStringArray(source.visualFlow, issueMap.nodes.map((node) => node.label)),
    sections: normalizeSections(source.sections),
    actions: normalizeActions(source.actions)
  };
}

function normalizeFailureBranches(value: unknown, prompt: string) {
  const items = asArray(value);
  const branches = items.map((item, index) => {
    if (typeof item === "string") {
      return {
        id: slug(item, `failure-branch-${index + 1}`),
        title: item,
        summary: "This branch may explain the observed failure.",
        signals: [],
        checks: ["Run the related validation check and update the workspace with evidence."],
        priority: index === 0 ? "high" : "medium"
      };
    }

    const object = asObject(item);
    const title = stringValue(object.title, object.label, object.name, `Failure branch ${index + 1}`);
    return {
      id: stringValue(object.id, slug(title, `failure-branch-${index + 1}`)),
      title,
      summary: stringValue(object.summary, object.description, "This branch may explain the observed failure."),
      signals: normalizeStringArray(object.signals, ["Observed behavior matches this branch."]),
      checks: normalizeStringArray(object.checks ?? object.nextChecks, ["Run the related validation check."]),
      priority: normalizePriority(object.priority)
    };
  });

  if (branches.length > 0) return branches;
  if (isAzureStorageAccessDeniedPrompt(prompt)) return azureStorageFailureBranches();
  return undefined;
}

function normalizeCausalGraph(value: unknown, prompt: string) {
  const graph = asObject(value);
  const inferred = inferCausalGraphFromPrompt(prompt);
  const rawNodes = asArray(graph.nodes);
  const rawEdges = asArray(graph.edges);
  const rawSteps = asArray(graph.simulationSteps);

  if (rawNodes.length < 2 || rawEdges.length < 1 || rawSteps.length < 1) {
    return inferred;
  }

  const nodes = rawNodes.map((item, index) => {
    const object = asObject(item);
    const id = stringValue(object.id, `causal-node-${index + 1}`);
    const kind = stringValue(object.kind).toLowerCase();
    const status = stringValue(object.status).toLowerCase();

    return {
      id,
      label: stringValue(object.label, object.title, object.name, `Causal node ${index + 1}`),
      subtitle: stringValue(object.subtitle, object.summary, object.description) || undefined,
      kind: causalNodeKinds.has(kind) ? kind : "dependency",
      status: causalNodeStatuses.has(status) ? status : "neutral",
      x: normalizeOptionalNumber(object.x),
      y: normalizeOptionalNumber(object.y)
    };
  });
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = rawEdges
    .map((item) => {
      const object = asObject(item);
      const from = stringValue(object.from, object.source);
      const to = stringValue(object.to, object.target);
      if (!nodeIds.has(from) || !nodeIds.has(to)) return null;
      const kind = stringValue(object.kind).toLowerCase();
      const edge: { from: string; to: string; label?: string; kind?: string } = {
        from,
        to
      };

      const label = stringValue(object.label);
      if (label) edge.label = label;
      if (causalEdgeKinds.has(kind)) edge.kind = kind;

      return edge;
    })
    .filter((edge): edge is { from: string; to: string; label?: string; kind?: string } => Boolean(edge));

  const simulationSteps = rawSteps.map((item, index) => {
    const object = asObject(item);
    return {
      id: stringValue(object.id, `causal-step-${index + 1}`),
      title: stringValue(object.title, `Causal step ${index + 1}`),
      description: stringValue(object.description, object.summary, "Validate this causal handoff."),
      activeNodeIds: normalizeStringArray(object.activeNodeIds).filter((id) => nodeIds.has(id)),
      failingNodeIds: normalizeStringArray(object.failingNodeIds).filter((id) => nodeIds.has(id)),
      passingNodeIds: normalizeStringArray(object.passingNodeIds).filter((id) => nodeIds.has(id)),
      branchId: stringValue(object.branchId) || undefined
    };
  });

  if (edges.length < 1 || simulationSteps.length < 1) return inferred;

  return {
    title: stringValue(graph.title, inferred?.title, "Live causal graph"),
    subtitle: stringValue(graph.subtitle, inferred?.subtitle) || undefined,
    confidence: normalizeConfidenceLabel(graph.confidence),
    nodes,
    edges,
    branches: normalizeCausalBranches(graph.branches, nodeIds),
    simulationSteps
  };
}

function normalizeOptionalNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number.parseFloat(stringValue(value));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeCausalBranches(value: unknown, nodeIds: Set<string>) {
  const tones = new Set(["green", "blue", "purple", "neutral"]);
  const branches = asArray(value).map((item, index) => {
    const object = asObject(item);
    const id = stringValue(object.id, `branch-${index + 1}`);
    const tone = stringValue(object.tone).toLowerCase();
    return {
      id,
      label: stringValue(object.label, object.title, `Branch ${index + 1}`),
      nodeIds: normalizeStringArray(object.nodeIds).filter((nodeId) => nodeIds.has(nodeId)),
      tone: tones.has(tone) ? tone : "neutral"
    };
  });

  return branches.length > 0 ? branches : undefined;
}

function isAzureStorageAccessDeniedPrompt(prompt: string): boolean {
  const text = prompt.toLowerCase();
  return /(storage|blob|container)/.test(text) && /(access denied|denied|forbidden|403)/.test(text);
}

export function inferCausalGraphFromPrompt(prompt: string): CausalGraph | undefined {
  const text = prompt.toLowerCase();

  if (/(storage|blob|container)/.test(text) && /(access denied|denied|forbidden|403)/.test(text)) {
    return {
      title: "Storage access causal path",
      subtitle: "Why RBAC and network controls can produce an access denied result.",
      confidence: "high",
      nodes: [
        { id: "caller", label: "Caller", subtitle: "Request source", kind: "source", status: "neutral", x: 6, y: 42 },
        { id: "identity", label: "Identity / Principal", subtitle: "User, app, or managed identity", kind: "dependency", status: "unknown", x: 24, y: 42 },
        { id: "rbac-role", label: "RBAC Role", subtitle: "Data-plane assignment", kind: "dependency", status: "checking", x: 44, y: 42 },
        { id: "storage", label: "Storage", subtitle: "Blob, container, or ADLS endpoint", kind: "target", status: "unknown", x: 66, y: 42 },
        { id: "access-denied", label: "Access Denied", subtitle: "403 or authorization failure", kind: "result", status: "failing", x: 84, y: 42 },
        { id: "missing-rbac", label: "Missing RBAC", subtitle: "Permission branch blocks role check", kind: "failure", status: "failing", x: 34, y: 70 },
        { id: "network-rule", label: "Network Rule", subtitle: "Firewall or private endpoint policy", kind: "dependency", status: "unknown", x: 60, y: 70 }
      ],
      edges: [
        { from: "caller", to: "identity", kind: "request" },
        { from: "identity", to: "rbac-role", kind: "dependency" },
        { from: "rbac-role", to: "storage", kind: "dependency" },
        { from: "identity", to: "missing-rbac", kind: "causes" },
        { from: "missing-rbac", to: "rbac-role", kind: "blocks" },
        { from: "network-rule", to: "storage", kind: "blocks" },
        { from: "storage", to: "access-denied", kind: "causes" }
      ],
      branches: [
        { id: "rbac", label: "RBAC branch", nodeIds: ["identity", "rbac-role", "missing-rbac"], tone: "green" },
        { id: "network", label: "Network branch", nodeIds: ["network-rule", "storage"], tone: "blue" },
        { id: "token", label: "Token/SAS branch", nodeIds: ["identity", "access-denied"], tone: "purple" }
      ],
      simulationSteps: [
        {
          id: "caller-requests-storage",
          title: "Caller requests storage access",
          description: "The request starts from a user, app, automation host, or managed identity.",
          activeNodeIds: ["caller"]
        },
        {
          id: "identity-evaluated",
          title: "Identity is evaluated",
          description: "Azure resolves the principal and determines which identity is making the data-plane request.",
          activeNodeIds: ["caller", "identity"],
          passingNodeIds: ["caller"],
          branchId: "rbac"
        },
        {
          id: "rbac-checked",
          title: "RBAC role is checked",
          description: "Storage data-plane roles are evaluated at account, container, resource group, or subscription scope.",
          activeNodeIds: ["identity", "rbac-role", "missing-rbac"],
          failingNodeIds: ["missing-rbac"],
          branchId: "rbac"
        },
        {
          id: "network-rule-evaluated",
          title: "Network rule is checked",
          description: "Firewall, public network access, VNet rules, or private endpoint path can also block the request.",
          activeNodeIds: ["network-rule", "storage"],
          failingNodeIds: ["network-rule"],
          branchId: "network"
        },
        {
          id: "storage-returns-denied",
          title: "Storage returns access denied",
          description: "If authorization or network controls reject the request, the user sees access denied or a 403 response.",
          activeNodeIds: ["storage", "access-denied"],
          failingNodeIds: ["access-denied"]
        }
      ]
    };
  }

  if (/(api|401|unauthorized)/.test(text) && /(token|refresh)/.test(text)) {
    return {
      title: "API authorization causal path",
      confidence: "medium",
      nodes: [
        { id: "client", label: "Client", kind: "source", status: "neutral" },
        { id: "token-refresh", label: "Token Refresh", kind: "dependency", status: "checking" },
        { id: "access-token", label: "Access Token", kind: "dependency", status: "unknown" },
        { id: "api-gateway", label: "API Gateway", kind: "target", status: "unknown" },
        { id: "authorization-policy", label: "Authorization Policy", kind: "failure", status: "failing" },
        { id: "response-401", label: "401 Response", kind: "result", status: "failing" }
      ],
      edges: [
        { from: "client", to: "token-refresh", kind: "request" },
        { from: "token-refresh", to: "access-token", kind: "dependency" },
        { from: "access-token", to: "api-gateway", kind: "request" },
        { from: "authorization-policy", to: "api-gateway", kind: "blocks" },
        { from: "api-gateway", to: "response-401", kind: "causes" }
      ],
      simulationSteps: [
        { id: "client-request", title: "Client sends request", description: "The client starts with a refreshed or cached token.", activeNodeIds: ["client"] },
        { id: "token-issued", title: "Token is evaluated", description: "Claims, audience, issuer, and expiry are checked.", activeNodeIds: ["token-refresh", "access-token"] },
        { id: "policy-denies", title: "Policy rejects token", description: "Authorization policy may reject the token or missing claim.", activeNodeIds: ["authorization-policy", "api-gateway"], failingNodeIds: ["authorization-policy"] },
        { id: "api-returns-401", title: "API returns 401", description: "The request fails before reaching the protected operation.", activeNodeIds: ["api-gateway", "response-401"], failingNodeIds: ["response-401"] }
      ]
    };
  }

  if (/(kubernetes|pod|restart|crashloop|deployment)/.test(text)) {
    return {
      title: "Kubernetes restart causal path",
      confidence: "medium",
      nodes: [
        { id: "deployment", label: "Deployment", kind: "source", status: "neutral" },
        { id: "pod", label: "Pod", kind: "dependency", status: "checking" },
        { id: "container", label: "Container", kind: "dependency", status: "unknown" },
        { id: "config-secret", label: "Config / Secret", kind: "failure", status: "failing" },
        { id: "resource-limits", label: "Resource Limits", kind: "dependency", status: "unknown" },
        { id: "crashloop-result", label: "CrashLoop Result", kind: "result", status: "failing" }
      ],
      edges: [
        { from: "deployment", to: "pod", kind: "request" },
        { from: "pod", to: "container", kind: "dependency" },
        { from: "config-secret", to: "container", kind: "blocks" },
        { from: "resource-limits", to: "container", kind: "blocks" },
        { from: "container", to: "crashloop-result", kind: "causes" }
      ],
      simulationSteps: [
        { id: "deployment-creates-pod", title: "Deployment creates pod", description: "The controller schedules a new pod.", activeNodeIds: ["deployment", "pod"] },
        { id: "container-starts", title: "Container starts", description: "Runtime starts the container with configured image, env, and secrets.", activeNodeIds: ["pod", "container"] },
        { id: "dependency-fails", title: "Runtime dependency fails", description: "Bad config, missing secret, or resource pressure can stop the container.", activeNodeIds: ["config-secret", "resource-limits", "container"], failingNodeIds: ["config-secret"] },
        { id: "pod-restarts", title: "Pod restarts", description: "The failed container restart loop becomes visible as CrashLoopBackOff.", activeNodeIds: ["container", "crashloop-result"], failingNodeIds: ["crashloop-result"] }
      ]
    };
  }

  return undefined;
}

function azureStorageFailureBranches() {
  return [
    {
      id: "missing-data-plane-permission",
      title: "Missing data-plane permission",
      summary: "The identity can reach the account but does not have blob or container data-plane access.",
      signals: [
        "AuthorizationPermissionMismatch",
        "This request is not authorized",
        "Can see account but cannot open containers/blobs"
      ],
      checks: [
        "Assign Storage Blob Data Reader, Contributor, or Owner as appropriate",
        "Confirm scope: account, container, resource group, or subscription",
        "Re-authenticate after role assignment propagation"
      ],
      priority: "high"
    },
    {
      id: "storage-firewall-network",
      title: "Storage firewall / network restriction",
      summary: "The request may be blocked by storage networking rules before authorization can complete.",
      signals: [
        "IpAddressNotAllowed",
        "Works from one network but not another",
        "Public network access disabled"
      ],
      checks: [
        "Check storage account Networking settings",
        "Confirm client public IP is allowed",
        "Confirm VNet or private endpoint access"
      ],
      priority: "high"
    },
    {
      id: "private-endpoint-dns",
      title: "Private endpoint / DNS issue",
      summary: "Traffic expected to use a private endpoint may be resolving or routing to the wrong address.",
      signals: [
        "Private endpoint exists",
        "Access should come through VNet/VPN",
        "DNS resolves to public IP"
      ],
      checks: [
        "nslookup <storage-account-name>.blob.core.windows.net",
        "nslookup <storage-account-name>.dfs.core.windows.net",
        "Validate privatelink.blob.core.windows.net",
        "Validate privatelink.dfs.core.windows.net for ADLS Gen2"
      ],
      priority: "medium"
    },
    {
      id: "sas-token-issue",
      title: "SAS token issue",
      summary: "A SAS token can fail independently of RBAC when time, permissions, protocol, or IP constraints do not match.",
      signals: [
        "AuthenticationFailed",
        "SAS token used",
        "Works with account key/RBAC but not SAS"
      ],
      checks: [
        "Confirm SAS start and expiry time",
        "Confirm permissions r/w/l/c/d",
        "Confirm allowed IP and protocol",
        "Check clock or timezone skew"
      ],
      priority: "medium"
    }
  ];
}

function asObject(value: unknown): PlainObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as PlainObject : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }

  return "";
}

function normalizeStringArray(value: unknown, fallback: string[] = []): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => stringValue(item)).filter(Boolean);
  }

  if (typeof value === "string" && value.trim()) return [value.trim()];
  return fallback;
}

function slug(value: string, fallback: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 42);

  return normalized || fallback;
}

function normalizeNumericConfidence(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.min(Math.max(value > 1 ? value / 100 : value, 0), 1);
  }

  const text = stringValue(value).toLowerCase();
  if (text === "high") return 0.9;
  if (text === "medium") return 0.7;
  if (text === "low") return 0.45;

  const parsed = Number.parseFloat(text);
  if (Number.isFinite(parsed)) return Math.min(Math.max(parsed > 1 ? parsed / 100 : parsed, 0), 1);

  return 0.78;
}

function normalizeConfidenceLabel(value: unknown): "low" | "medium" | "high" {
  const text = stringValue(value).toLowerCase();
  if (text === "high" || text === "medium" || text === "low") return text;

  const numeric = normalizeNumericConfidence(value);
  if (numeric >= 0.8) return "high";
  if (numeric >= 0.55) return "medium";
  return "low";
}

function normalizeTitle(value: string, prompt: string): string {
  const promptText = prompt.toLowerCase();
  if (/(storage|blob|container)/.test(promptText) && /(access denied|denied|forbidden|403)/.test(promptText)) {
    return "Storage account access denied";
  }
  if (/(api|401|unauthorized)/.test(promptText) && /(token|refresh)/.test(promptText)) {
    return "API 401 after token refresh";
  }
  if (/(kubernetes|pod)/.test(promptText) && /(restart|crashloop|deployment)/.test(promptText)) {
    return "Kubernetes pod restart loop";
  }
  if (/(sso|login|sign in|enterprise application)/.test(promptText)) {
    return "SSO login failure";
  }

  const cleaned = value
    .replace(/^likely issue path for\s+/i, "")
    .replace(/^likely issue path\s*/i, "")
    .replace(/^diagnosis for\s+/i, "")
    .replace(/^troubleshooting path for\s+/i, "")
    .replace(/\b(issue|diagnosis|path)\s+\1\b/gi, "$1")
    .replace(/\s+/g, " ")
    .trim();
  const withoutSuffix = cleaned.replace(/\s+(Diagnosis|Issue|Problem)$/i, "");
  return withoutSuffix.length > 70 ? withoutSuffix.slice(0, 67).trimEnd() + "..." : withoutSuffix;
}

function normalizePriority(value: unknown): "low" | "medium" | "high" {
  const text = stringValue(value).toLowerCase();
  return priorities.has(text) ? text as "low" | "medium" | "high" : "medium";
}

function normalizeCategory(value: unknown) {
  const text = stringValue(value).toLowerCase();
  return categories.has(text) ? text : "generic";
}

function normalizeClassification(value: unknown, prompt: string) {
  const classification = asObject(value);

  return {
    mode: "fix",
    confidence: normalizeNumericConfidence(classification.confidence),
    source: "ai",
    reason: stringValue(classification.reason, "Prompt requires a structured Fix workspace."),
    topic: stringValue(classification.topic, prompt)
  };
}

function normalizeDiagnosis(value: unknown, title: string, prompt: string) {
  const diagnosis = asObject(value);
  const diagnosisTitle = normalizeTitle(
    stringValue(diagnosis.title, diagnosis.heading, title),
    prompt
  );
  const answer = stringValue(
    diagnosis.answer,
    diagnosis.summary,
    domainAwareDiagnosisAnswer(prompt)
  );

  return {
    title: diagnosisTitle,
    answer,
    confidence: normalizeConfidenceLabel(diagnosis.confidence),
    why: normalizeStringArray(diagnosis.why, [
      "The prompt describes a failure state that needs a structured troubleshooting path."
    ]),
    likelyCauses: normalizeLikelyCauses(diagnosis.likelyCauses ?? diagnosis.causes)
  };
}

function domainAwareDiagnosisAnswer(prompt: string): string {
  const text = prompt.toLowerCase();

  if (/(storage|blob|container)/.test(text) && /(access denied|denied|forbidden|403)/.test(text)) {
    return "Access denied on an Azure Storage account usually points to missing data-plane RBAC permissions, storage firewall or network restrictions, private endpoint and DNS mismatch, or an invalid SAS or access token.";
  }

  if (/(401|unauthorized|token|refresh)/.test(text)) {
    return "A 401 after token refresh usually points to an invalid refreshed token, missing audience or scope, expired session state, or an API authorization policy rejecting the new token.";
  }

  if (/(kubernetes|k8s|pod|restart|crashloop|crashloopbackoff|deployment)/.test(text)) {
    return "A pod restart after deployment usually points to container startup failure, a bad image or configuration, a missing secret, a failing probe, resource limits, or a runtime exception.";
  }

  if (/(dns|private endpoint|privatelink|resolves|public ip|private ip)/.test(text)) {
    return "Public resolution in a private endpoint scenario usually points to missing private DNS zone links, an incorrect resolver path, or client traffic not using the expected VNet and DNS path.";
  }

  return "Doc/ReDefined could not confidently infer a specific cause yet. Add error output, logs, or observed behavior so the workspace can create a stronger diagnostic branch.";
}

function normalizeLikelyCauses(value: unknown) {
  const items = asArray(value);
  const causes = items.map((item, index) => {
    if (typeof item === "string") {
      return {
        label: item,
        reason: "This area may explain the observed issue.",
        priority: index === 0 ? "high" : "medium"
      };
    }

    const object = asObject(item);
    const label = stringValue(object.label, object.title, object.name, `Likely cause ${index + 1}`);
    return {
      label,
      reason: stringValue(object.reason, object.description, "This area may explain the observed issue."),
      priority: normalizePriority(object.priority ?? object.risk)
    };
  });

  return causes.length > 0
    ? causes
    : [
        {
          label: "Unvalidated failure branch",
          reason: "The first failed validation check should identify the strongest cause.",
          priority: "medium"
        }
      ];
}

function normalizeIssueMap(value: unknown, prompt: string) {
  const map = asObject(value);
  const inferred = inferIssueMapFromPrompt(prompt);
  const rawNodes = asArray(map.nodes).length > 0 ? asArray(map.nodes) : inferred.nodes;
  const nodes = rawNodes.map((item, index) => {
    const object = asObject(item);
    const label = typeof item === "string"
      ? item
      : stringValue(object.label, object.title, object.name, `Node ${index + 1}`);
    const id = stringValue(object.id, slug(label, `node-${index + 1}`));
    const type = stringValue(object.type).toLowerCase();
    const status = stringValue(object.status).toLowerCase();

    return {
      id,
      label,
      type: nodeTypes.has(type) ? type : "unknown",
      detail: stringValue(object.detail, object.description) || undefined,
      risk: priorities.has(stringValue(object.risk).toLowerCase())
        ? stringValue(object.risk).toLowerCase()
        : index === 1 ? "medium" : undefined,
      status: statuses.has(status) ? status : "neutral",
      reason: stringValue(object.reason) || undefined,
      check: stringValue(object.check) || undefined
    };
  });

  const genericCount = nodes.filter((node) => isGenericNodeLabel(node.label)).length;
  if (nodes.length < 3 || genericCount > 0) {
    return inferred;
  }

  const nodeIds = new Set(nodes.map((node) => node.id));
  const rawEdges = asArray(map.edges);
  const validEdges = rawEdges
    .map((item) => {
      const object = asObject(item);
      const from = stringValue(object.from, object.source);
      const to = stringValue(object.to, object.target);
      if (!nodeIds.has(from) || !nodeIds.has(to)) return null;
      const status = stringValue(object.status).toLowerCase();
      const edge: { from: string; to: string; label?: string; status?: string } = {
        from,
        to
      };

      const label = stringValue(object.label);
      if (label) edge.label = label;
      if (statuses.has(status)) edge.status = status;

      return edge;
    })
    .filter((edge): edge is { from: string; to: string; label?: string; status?: string } => Boolean(edge));

  const edges = validEdges.length > 0
    ? validEdges
    : nodes.slice(0, -1).map((node, index) => ({ from: node.id, to: nodes[index + 1].id }));

  const rawZones = normalizeStringArray(map.likelyFailureZones);
  const riskZones = nodes
    .filter((node) => node.risk === "high" || node.risk === "medium")
    .map((node) => node.id);
  const likelyFailureZones = rawZones.filter((id) => nodeIds.has(id));
  const fallbackZones = riskZones.length > 0 ? riskZones : [nodes[0]?.id, nodes[nodes.length - 1]?.id].filter(Boolean);

  return {
    title: stringValue(map.title, "Issue flow"),
    summary: stringValue(map.summary, nodes.map((node) => node.label).join(" -> "), prompt),
    nodes,
    edges,
    likelyFailureZones: likelyFailureZones.length > 0 ? likelyFailureZones : fallbackZones
  };
}

function inferIssueMapFromPrompt(prompt: string) {
  const text = prompt.toLowerCase();

  if (/(storage|blob|container)/.test(text) && /(access denied|denied|forbidden|403)/.test(text)) {
    return createInferredIssueMap("Storage access flow", [
      ["caller", "Caller", "user", "neutral", "medium"],
      ["identity", "Identity / Principal", "identity", "unknown", "high"],
      ["rbac", "RBAC Role Assignment", "security", "unknown", "high"],
      ["network-rules", "Network Rules", "network", "unknown", "medium"],
      ["storage-account", "Storage Account", "service", "unknown", "medium"],
      ["access-result", "Access Result", "output", "unknown", "medium"]
    ]);
  }

  if (/(sso|login|sign in|enterprise application)/.test(text)) {
    return createInferredIssueMap("Application sign-in flow", [
      ["user", "User", "user", "low"],
      ["application", "Application", "app", "medium"],
      ["identity-provider", "Identity Provider", "identity", "high"],
      ["reply-url", "Reply URL / ACS", "check", "medium"],
      ["claims", "Claims", "security", "high"],
      ["access-result", "Access Result", "output", "medium"]
    ]);
  }

  if (/(401|unauthorized|token|refresh)/.test(text)) {
    return createInferredIssueMap("API authorization flow", [
      ["client", "Client", "app", "medium"],
      ["token-refresh", "Token Refresh", "identity", "high"],
      ["access-token", "Access Token", "security", "high"],
      ["api-gateway", "API Gateway", "service", "medium"],
      ["authorization-policy", "Authorization Policy", "security", "high"],
      ["response", "Response", "output", "medium"]
    ]);
  }

  if (/(kubernetes|pod|restart|crashloop|deployment)/.test(text)) {
    return createInferredIssueMap("Kubernetes restart flow", [
      ["deployment", "Deployment", "app", "medium"],
      ["pod", "Pod", "service", "high"],
      ["container", "Container", "service", "high"],
      ["config-secret", "Config / Secret", "security", "medium"],
      ["resource-limits", "Resource Limits", "check", "medium"],
      ["runtime-logs", "Runtime Logs", "check", "high"],
      ["restart-result", "Restart Result", "output", "medium"]
    ]);
  }

  if (/(dns|private endpoint|resolves|public|private)/.test(text)) {
    return createInferredIssueMap("Private endpoint resolution flow", [
      ["client", "Client", "app", "medium"],
      ["dns-resolver", "DNS Resolver", "network", "high"],
      ["private-dns-zone", "Private DNS Zone", "network", "high"],
      ["network-path", "Network Path", "network", "medium"],
      ["private-endpoint", "Private Endpoint", "service", "high"],
      ["target-resource", "Target Resource", "output", "medium"]
    ]);
  }

  return createInferredIssueMap("Request dependency flow", [
    ["request-source", "Request Source", "user", "medium"],
    ["application-layer", "Application Layer", "app", "medium"],
    ["dependency-check", "Dependency Check", "check", "medium"],
    ["validation-check", "Validation Check", "check", "medium"],
    ["target-resource", "Target Resource", "service", "medium"],
    ["result", "Result", "output", "medium"]
  ]);
}

function createInferredIssueMap(title: string, nodeTuples: string[][]) {
  const nodes = nodeTuples.map(([id, label, type, statusOrRisk, maybeRisk]) => ({
    id,
    label,
    type,
    status: maybeRisk ? statusOrRisk : "neutral",
    risk: maybeRisk ?? statusOrRisk
  }));

  return {
    title,
    summary: nodes.map((node) => node.label).join(" -> "),
    nodes,
    edges: nodes.slice(0, -1).map((node, index) => ({ from: node.id, to: nodes[index + 1].id })),
    likelyFailureZones: nodes
      .filter((node) => node.risk === "high" || node.risk === "medium")
      .slice(1, 5)
      .map((node) => node.id)
  };
}

function isGenericNodeLabel(label: string): boolean {
  const normalized = label.trim().toLowerCase().replace(/\s+/g, " ");
  return [
    "dependency",
    "validation",
    "resolution",
    "context",
    "symptom",
    "output",
    "target",
    "source",
    "check"
  ].includes(normalized) || /^node\s*\d+$/i.test(normalized) || /^step\s*\d+$/i.test(normalized);
}

function normalizeQuickTests(
  value: unknown,
  failureBranches: ReturnType<typeof normalizeFailureBranches>,
  prompt: string
) {
  const items = asArray(value);
  const tests = items.map((item, index) => {
    if (typeof item === "string") {
      return {
        id: `quick-test-${index + 1}`,
        title: item,
        purpose: domainAwareQuickTestPurpose(prompt),
        commands: [item],
        successSignal: domainAwareSuccessSignal(prompt),
        failureMeaning: domainAwareFailureMeaning(prompt),
        category: "generic"
      };
    }

    const object = asObject(item);
    const title = stringValue(object.title, object.name, object.label, `Quick test ${index + 1}`);
    const commands = normalizeStringArray(object.commands ?? object.command, [title]);

    return {
      id: stringValue(object.id, `quick-test-${index + 1}`),
      title,
      purpose: stringValue(object.purpose, object.description, domainAwareQuickTestPurpose(prompt)),
      commands,
      successSignal: stringValue(object.successSignal, object.success, domainAwareSuccessSignal(prompt)),
      failureMeaning: stringValue(object.failureMeaning, object.failure, domainAwareFailureMeaning(prompt)),
      category: normalizeCategory(object.category)
    };
  });

  const branchTests =
    failureBranches
      ?.filter((branch) => branch.priority === "high" || branch.priority === "medium")
      .map((branch, index) => ({
        id: `${branch.id}-test`,
        title: branch.title.includes("RBAC")
          ? "Check RBAC data-plane role assignment"
          : `Check ${branch.title.toLowerCase()}`,
        purpose: branch.summary,
        commands: branch.checks,
        successSignal: domainAwareSuccessSignal(prompt),
        failureMeaning: domainAwareFailureMeaning(prompt),
        category: branch.title.toLowerCase().includes("network") || branch.title.toLowerCase().includes("dns")
          ? "network"
          : branch.title.toLowerCase().includes("permission") || branch.title.toLowerCase().includes("rbac") || branch.title.toLowerCase().includes("sas")
            ? "auth"
            : "generic"
      })) ?? [];

  const merged = [...tests];
  for (const branchTest of branchTests) {
    const exists = merged.some((test) =>
      `${test.title} ${test.purpose} ${test.commands.join(" ")}`.toLowerCase().includes(branchTest.title.toLowerCase().replace(/^check\s+/, ""))
    );
    if (!exists) merged.push(branchTest);
  }

  if (merged.length > 0) return merged;

  if (isAzureStorageAccessDeniedPrompt(prompt)) {
    return normalizeQuickTests([], azureStorageFailureBranches(), prompt);
  }

  return [
        {
          id: "quick-test-1",
          title: "Validate the first failure point",
          purpose: domainAwareQuickTestPurpose(prompt),
          commands: [domainAwareFallbackCommand(prompt)],
          successSignal: domainAwareSuccessSignal(prompt),
          failureMeaning: domainAwareFailureMeaning(prompt),
          category: "generic"
        }
      ];
}

function domainAwareQuickTestPurpose(prompt: string): string {
  const text = prompt.toLowerCase();
  if (/(storage|blob|container)/.test(text) && /(access denied|denied|forbidden|403)/.test(text)) {
    return "Confirm whether the caller has the required data-plane permission and whether storage network controls allow the request path.";
  }
  if (/(401|unauthorized|token|refresh)/.test(text)) {
    return "Confirm whether the refreshed token has the expected audience, scope, expiry, and authorization policy access.";
  }
  if (/(kubernetes|k8s|pod|restart|crashloop|crashloopbackoff|deployment)/.test(text)) {
    return "Inspect pod events and previous container logs to separate image, configuration, probe, resource, and runtime failures.";
  }
  if (/(dns|private endpoint|privatelink|resolves|public ip|private ip)/.test(text)) {
    return "Confirm whether DNS resolves to the expected private endpoint path from the affected client or workload.";
  }
  return "Collect the exact error output and validate the component most directly connected to the reported symptom.";
}

function domainAwareSuccessSignal(prompt: string): string {
  const text = prompt.toLowerCase();
  if (/(storage|blob|container)/.test(text) && /(access denied|denied|forbidden|403)/.test(text)) {
    return "The caller has a Storage Blob Data role at the required scope and the request path is allowed by storage networking.";
  }
  if (/(401|unauthorized|token|refresh)/.test(text)) {
    return "The token contains the expected claims and the protected API accepts it.";
  }
  if (/(kubernetes|k8s|pod|restart|crashloop|crashloopbackoff|deployment)/.test(text)) {
    return "Pod events and previous logs show the container starts cleanly without probe, config, image, or resource errors.";
  }
  if (/(dns|private endpoint|privatelink|resolves|public ip|private ip)/.test(text)) {
    return "The affected client resolves the target to the expected private address and reaches it through the intended network path.";
  }
  return "The collected output confirms the suspected component behaves correctly for the failing request.";
}

function domainAwareFailureMeaning(prompt: string): string {
  const text = prompt.toLowerCase();
  if (/(storage|blob|container)/.test(text) && /(access denied|denied|forbidden|403)/.test(text)) {
    return "A missing data-plane role, blocked storage network path, private endpoint DNS issue, or invalid token remains the likely cause.";
  }
  if (/(401|unauthorized|token|refresh)/.test(text)) {
    return "The refreshed token or API authorization policy is still rejecting the request.";
  }
  if (/(kubernetes|k8s|pod|restart|crashloop|crashloopbackoff|deployment)/.test(text)) {
    return "The failing pod evidence points to the next concrete restart cause to investigate.";
  }
  if (/(dns|private endpoint|privatelink|resolves|public ip|private ip)/.test(text)) {
    return "DNS or network routing is still sending the request through the wrong endpoint path.";
  }
  return "The output identifies the component or dependency that needs the next focused investigation step.";
}

function domainAwareFallbackCommand(prompt: string): string {
  const text = prompt.toLowerCase();
  if (/(storage|blob|container)/.test(text) && /(access denied|denied|forbidden|403)/.test(text)) {
    return "az role assignment list --assignee <principal-id> --scope <storage-scope> -o table";
  }
  if (/(401|unauthorized|token|refresh)/.test(text)) {
    return "Decode the access token and verify aud, scp/roles, exp, and issuer claims.";
  }
  if (/(kubernetes|k8s|pod|restart|crashloop|crashloopbackoff|deployment)/.test(text)) {
    return "kubectl describe pod <pod-name> -n <namespace>";
  }
  if (/(dns|private endpoint|privatelink|resolves|public ip|private ip)/.test(text)) {
    return "nslookup <target-fqdn>";
  }
  return "Paste the exact command output, log line, or error message from the affected system.";
}

function normalizeDecisionPath(value: unknown) {
  const items = asArray(value);
  const decisions = items.map((item, index) => {
    if (typeof item === "string") {
      return {
        id: `decision-${index + 1}`,
        condition: item,
        meaning: "This branch may explain the issue.",
        nextAction: "Run the related validation check and update the workspace with evidence."
      };
    }

    const object = asObject(item);
    return {
      id: stringValue(object.id, `decision-${index + 1}`),
      condition: stringValue(object.condition, object.if, object.title, `If check ${index + 1} fails`),
      meaning: stringValue(object.meaning, object.then, object.description, "This branch may explain the issue."),
      nextAction: stringValue(object.nextAction, object.action, "Run the related validation check and update the workspace with evidence.")
    };
  });

  return decisions.length >= 2
    ? decisions
    : [
        ...decisions,
        {
          id: "decision-fallback-pass",
          condition: "If the first highlighted check passes",
          meaning: "The likely cause shifts to a later branch in the path.",
          nextAction: "Continue with the next validation check and compare expected versus actual behavior."
        }
      ].slice(0, Math.max(2, decisions.length + 1));
}

function normalizePathUpdate(
  value: unknown,
  quickTests: ReturnType<typeof normalizeQuickTests>,
  failureBranches: ReturnType<typeof normalizeFailureBranches>,
  prompt: string
) {
  const object = asObject(value);
  const nextBestAction = asObject(object.nextBestAction);
  const firstTest = quickTests[0];
  const topBranch = failureBranches?.find((branch) => branch.priority === "high") ?? failureBranches?.[0];
  const storageAccessDenied = isAzureStorageAccessDeniedPrompt(prompt);

  return {
    status: normalizePathStatus(object.status),
    title: stringValue(object.title, domainAwarePathTitle(prompt)),
    description: stringValue(object.description, domainAwarePathDescription(prompt)),
    nextBestAction: {
      title: stringValue(
        nextBestAction.title,
        storageAccessDenied ? "Check RBAC data-plane role assignment" : topBranch ? `Check ${topBranch.title.toLowerCase()}` : firstTest.title,
        "Run the first quick test"
      ),
      description: stringValue(
        nextBestAction.description,
        topBranch?.summary,
        firstTest.purpose,
        "Paste the exact output so the diagnosis can recalibrate."
      ),
      commands: normalizeStringArray(nextBestAction.commands, topBranch?.checks ?? firstTest.commands)
    }
  };
}

function domainAwarePathTitle(prompt: string): string {
  if (isAzureStorageAccessDeniedPrompt(prompt)) return "Validate storage data-plane access";
  const text = prompt.toLowerCase();
  if (/(401|unauthorized|token|refresh)/.test(text)) return "Validate token and API authorization";
  if (/(kubernetes|k8s|pod|restart|crashloop|crashloopbackoff|deployment)/.test(text)) return "Inspect pod restart evidence";
  if (/(dns|private endpoint|privatelink|resolves|public ip|private ip)/.test(text)) return "Validate private DNS resolution";
  return "Collect targeted failure evidence";
}

function domainAwarePathDescription(prompt: string): string {
  const text = prompt.toLowerCase();
  if (/(storage|blob|container)/.test(text) && /(access denied|denied|forbidden|403)/.test(text)) {
    return "Check Storage Blob Data role assignment, storage networking, private endpoint DNS, and token/SAS validity using the affected caller and scope.";
  }
  if (/(401|unauthorized|token|refresh)/.test(text)) {
    return "Verify the refreshed token claims, expiry, audience, scope, and the API authorization policy that evaluates the request.";
  }
  if (/(kubernetes|k8s|pod|restart|crashloop|crashloopbackoff|deployment)/.test(text)) {
    return "Use pod events and previous container logs to identify whether the restart comes from image startup, config, probes, resources, or runtime exceptions.";
  }
  if (/(dns|private endpoint|privatelink|resolves|public ip|private ip)/.test(text)) {
    return "Compare DNS results from the affected client with the expected private endpoint record and network route.";
  }
  return "Collect the exact error, log output, and affected component details so the workspace can create a specific diagnostic branch.";
}

function normalizePathStatus(value: unknown) {
  const text = stringValue(value).toLowerCase();
  return ["initial", "narrowed", "resolved", "needs_more_evidence"].includes(text) ? text : "initial";
}

function normalizeScratchpad(value: unknown, prompt: string) {
  if (Array.isArray(value)) {
    return value.map((item, index) => {
      const object = asObject(item);
      return {
        id: stringValue(object.id, `scratchpad-${index + 1}`),
        label: stringValue(object.label, object.key, `value_${index + 1}`),
        value: stringValue(object.value, item),
        source: normalizeScratchpadSource(object.source)
      };
    }).filter((item) => item.value);
  }

  const object = asObject(value);
  const entries = Object.entries(object).map(([key, entry], index) => ({
    id: slug(key, `scratchpad-${index + 1}`),
    label: key,
    value: stringValue(entry),
    source: "ai"
  })).filter((item) => item.value);

  return entries.length > 0
    ? entries
    : [{ id: "original-prompt", label: "original_prompt", value: prompt, source: "prompt" }];
}

function normalizeScratchpadSource(value: unknown) {
  const text = stringValue(value);
  return ["prompt", "ai", "evidence", "user"].includes(text) ? text : "ai";
}

function normalizeTimeline(value: unknown) {
  const items = asArray(value);
  const timeline = items.map((item, index) => {
    const object = asObject(item);
    const type = stringValue(object.type).toLowerCase();
    return {
      id: stringValue(object.id, `timeline-${index + 1}`),
      type: timelineTypes.has(type) ? type : index === 0 ? "initial_diagnosis" : "next_action",
      title: stringValue(object.title, object.label, index === 0 ? "Initial diagnosis path generated" : `Timeline update ${index + 1}`),
      summary: stringValue(object.summary, object.description, "Structured Fix workspace updated from the prompt."),
      timestampLabel: stringValue(object.timestampLabel, object.time, "Just now")
    };
  });

  return timeline.length > 0
    ? timeline
    : [
        {
          id: "initial-diagnosis",
          type: "initial_diagnosis",
          title: "Initial diagnosis path generated",
          summary: "Structured Fix workspace created from the prompt.",
          timestampLabel: "Just now"
        }
      ];
}

function normalizeDiagnosticTerminal(value: unknown, quickTests: ReturnType<typeof normalizeQuickTests>) {
  const object = asObject(value);
  const rawCommands = object.commands ?? object.command ?? quickTests.flatMap((test) => test.commands);
  const commands = normalizeTerminalCommands(rawCommands);
  const shell = stringValue(object.shell).toLowerCase();

  return {
    title: stringValue(object.title, "Diagnostic terminal"),
    shell: shells.has(shell) ? shell : "generic",
    commands,
    notes: normalizeStringArray(object.notes)
  };
}

function normalizeTerminalCommands(value: unknown) {
  const commands = normalizeStringArray(value);
  const objectCommands = asArray(value)
    .map((item, index) => {
      if (typeof item === "string") return null;
      const object = asObject(item);
      const command = stringValue(object.command, object.value);
      if (!command) return null;
      return {
        id: stringValue(object.id, `cmd-${index + 1}`),
        label: stringValue(object.label, object.title, `Command ${index + 1}`),
        command,
        category: normalizeCategory(object.category)
      };
    })
    .filter((command): command is { id: string; label: string; command: string; category: string } => Boolean(command));

  if (objectCommands.length > 0) return objectCommands;

  return (commands.length > 0 ? commands : ["Run the first validation check"]).map((command, index) => ({
    id: `cmd-${index + 1}`,
    label: `Command ${index + 1}`,
    command,
    category: "generic"
  }));
}

function normalizeArtifacts(value: unknown) {
  const items = asArray(value);
  const artifacts = items.map((item) => {
    if (typeof item === "string") {
      return { type: inferArtifactType(item), label: item };
    }

    const object = asObject(item);
    const label = stringValue(object.label, object.title, object.action, "Workspace artifact");
    const type = stringValue(object.type, object.action).toLowerCase();
    return {
      type: artifactTypes.has(type) ? type : inferArtifactType(label),
      label
    };
  });

  return artifacts.length > 0
    ? artifacts
    : [
        { type: "ticket_update", label: "Create ticket update" },
        { type: "runbook", label: "Export executable runbook" },
        { type: "save_journey", label: "Save journey workspace" },
        { type: "share", label: "Share with team" }
      ];
}

function inferArtifactType(value: string) {
  const text = value.toLowerCase();
  if (text.includes("ticket")) return "ticket_update";
  if (text.includes("runbook") || text.includes("command")) return "runbook";
  if (text.includes("save")) return "save_journey";
  if (text.includes("share")) return "share";
  if (text.includes("checklist")) return "checklist";
  if (text.includes("summary")) return "summary";
  return "summary";
}

function normalizeEnvironmentComparison(value: unknown) {
  const object = asObject(value);
  const rows = asArray(object.rows).map((item) => {
    const row = asObject(item);
    const status = stringValue(row.status).toLowerCase();
    return {
      field: stringValue(row.field, row.name),
      leftValue: stringValue(row.leftValue, row.left),
      rightValue: stringValue(row.rightValue, row.right),
      status: ["match", "mismatch", "unknown"].includes(status) ? status : "unknown",
      impact: stringValue(row.impact) || undefined
    };
  }).filter((row) => row.field);

  if (rows.length < 1) return undefined;

  return {
    leftLabel: stringValue(object.leftLabel, "Expected"),
    rightLabel: stringValue(object.rightLabel, "Observed"),
    rows
  };
}

function normalizeSections(value: unknown) {
  return asArray(value).map((item, index) => {
    const object = asObject(item);
    const type = stringValue(object.type).toLowerCase();
    const title = stringValue(object.title, object.label, `Section ${index + 1}`);

    if (type === "checklist") {
      return {
        type: "checklist",
        title,
        items: normalizeStringArray(object.items, [stringValue(object.description, "Review this item")])
      };
    }

    return {
      type: ["diagnostic_step", "implementation_step", "explanation"].includes(type)
        ? type
        : "diagnostic_step",
      title,
      description: stringValue(object.description, object.summary, "Review this diagnostic step.")
    };
  });
}

function normalizeActions(value: unknown) {
  return asArray(value).map((item, index) => {
    if (typeof item === "string") {
      return { label: item, action: slug(item, `action-${index + 1}`) };
    }

    const object = asObject(item);
    const label = stringValue(object.label, object.title, object.action, `Action ${index + 1}`);
    return {
      label,
      action: stringValue(object.action, object.type, slug(label, `action-${index + 1}`))
    };
  });
}
