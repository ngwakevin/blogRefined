import { callAIProvider } from "@/lib/ai-provider";
import { detectRawForbiddenSections, type LensId } from "@/lib/lens-contracts";
import { normalizeFixWorkspaceResult } from "@/lib/normalize-ai-result";
import {
  normalizeFollowUpResult,
  type FollowUpNormalizationDebug
} from "@/lib/normalize-follow-up-result";
import {
  ArtifactWorkspaceResultSchema,
  BuildWorkspaceResultSchema,
  FixWorkspaceResultSchema,
  FollowUpAIResponseSchema,
  FollowUpResultSchema,
  UnderstandWorkspaceResultSchema
} from "@/lib/schemas";
import { validateFixResultQuality, validateFollowUpQuality, validateUnderstandResultQuality } from "@/lib/quality";
import type {
  EvidenceBranch,
  EvidenceSignal,
  FollowUpResult,
  RedefinedResult,
  TimelineEntry
} from "@/lib/redefined";
import type { FixWorkspaceResult } from "@/types/redefined";

/** Append an optional lens-contract instruction to a base system prompt. */
function withLensInstruction(systemPrompt: string, extraInstruction?: string): string {
  return extraInstruction ? `${systemPrompt}\n\n${extraInstruction}` : systemPrompt;
}

/** Record any foreign-lens sections present in the raw output into the caller's sink. */
function collectRawForbidden(rawJson: unknown, lens: LensId, sink?: string[]) {
  if (!sink) return;
  for (const field of detectRawForbiddenSections(rawJson, lens)) {
    if (!sink.includes(field)) sink.push(field);
  }
}

export async function generateFixWorkspaceWithAI(
  prompt: string,
  extraInstruction?: string,
  rawForbiddenOut?: string[]
): Promise<RedefinedResult> {
  const aiText = await callAIProvider({
    systemPrompt: withLensInstruction(buildFixWorkspaceSystemPrompt(), extraInstruction),
    userPrompt: prompt
  });
  const rawJson = safeParseJson(aiText);
  collectRawForbidden(rawJson, "fix", rawForbiddenOut);
  const normalized = normalizeFixWorkspaceResult(rawJson, prompt);

  return FixWorkspaceResultSchema.parse(normalized);
}

export async function generateUnderstandWorkspaceWithAI(
  prompt: string,
  extraInstruction?: string,
  rawForbiddenOut?: string[]
): Promise<RedefinedResult> {
  const aiText = await callAIProvider({
    systemPrompt: withLensInstruction(buildUnderstandWorkspaceSystemPrompt(), extraInstruction),
    userPrompt: prompt
  });
  const rawJson = safeParseJson(aiText);
  collectRawForbidden(rawJson, "understand", rawForbiddenOut);
  const normalized = normalizeUnderstandWorkspaceResult(rawJson, prompt);
  return UnderstandWorkspaceResultSchema.parse(normalized) as RedefinedResult;
}

export async function generateFollowUpWithAI(args: {
  message: string;
  workspaceId?: string;
  originalPrompt?: string;
  currentResult: RedefinedResult;
  evidenceText?: string;
  signals?: EvidenceSignal[];
  localSignals?: EvidenceSignal[];
  localEvidenceBranch?: EvidenceBranch;
  evidenceBranches?: EvidenceBranch[];
  activeEvidenceBranchId?: string;
  timeline?: TimelineEntry[];
}): Promise<{ followUp: FollowUpResult; debug: FollowUpNormalizationDebug }> {
  const aiText = await callAIProvider({
    systemPrompt: buildFollowUpSystemPrompt(),
    userPrompt: JSON.stringify(args)
  });
  const rawJson = safeParseJson(aiText);
  const rawAi = FollowUpAIResponseSchema.parse(rawJson);
  const { normalized, debug } = normalizeFollowUpResult(rawAi, {
    originalPrompt: args.originalPrompt,
    currentResult: args.currentResult,
    evidenceText: args.evidenceText ?? args.message,
    localSignals: args.localSignals ?? args.signals ?? [],
    localEvidenceBranch: args.localEvidenceBranch,
    evidenceBranches: args.evidenceBranches ?? [],
    activeEvidenceBranchId: args.activeEvidenceBranchId,
    timeline: args.timeline
  });

  return {
    followUp: FollowUpResultSchema.parse(normalized),
    debug
  };
}

export async function repairFixWorkspaceWithAI(args: {
  prompt: string;
  previousResult: FixWorkspaceResult;
  qualityIssues: string[];
  qualityWarnings: string[];
}): Promise<FixWorkspaceResult> {
  const aiText = await callAIProvider({
    systemPrompt: buildFixWorkspaceRepairSystemPrompt(),
    userPrompt: JSON.stringify(args)
  });
  const rawJson = safeParseJson(aiText);
  const normalized = normalizeFixWorkspaceResult(rawJson, args.prompt);
  const repaired = FixWorkspaceResultSchema.parse(normalized);
  const quality = validateFixResultQuality(repaired);

  if (!quality.ok) {
    throw new Error(
      `Repaired Fix workspace failed quality validation: ${quality.issues.join("; ")}`
    );
  }

  return repaired;
}

export async function repairFollowUpWithAI(args: {
  message: string;
  currentResult: FixWorkspaceResult;
  previousFollowUp: FollowUpResult;
  qualityIssues: string[];
  qualityWarnings: string[];
}): Promise<FollowUpResult> {
  const aiText = await callAIProvider({
    systemPrompt: buildFollowUpRepairSystemPrompt(),
    userPrompt: JSON.stringify(args)
  });
  const rawJson = safeParseJson(aiText);
  const rawAi = FollowUpAIResponseSchema.parse(rawJson);
  const { normalized } = normalizeFollowUpResult(rawAi, {
    currentResult: args.currentResult,
    evidenceText: args.message,
    localSignals: args.previousFollowUp.signals,
    localEvidenceBranch: args.previousFollowUp.activeEvidenceBranch,
    evidenceBranches: args.previousFollowUp.updatedEvidenceBranches ?? [],
    activeEvidenceBranchId: args.previousFollowUp.activeEvidenceBranch?.id
  });
  const repaired = FollowUpResultSchema.parse(
    normalized
  );
  const quality = validateFollowUpQuality(repaired, args.currentResult);

  if (!quality.ok) {
    throw new Error(
      `Repaired follow-up failed quality validation: ${quality.issues.join("; ")}`
    );
  }

  return repaired;
}

export async function repairUnderstandResultWithAI(args: {
  prompt: string;
  previousResult: RedefinedResult;
  qualityIssues: string[];
  qualityWarnings: string[];
}): Promise<RedefinedResult> {
  const aiText = await callAIProvider({
    systemPrompt: buildUnderstandWorkspaceRepairSystemPrompt(),
    userPrompt: JSON.stringify(args)
  });
  const rawJson = safeParseJson(aiText);
  const normalized = normalizeUnderstandWorkspaceResult(rawJson, args.prompt);
  const repaired = UnderstandWorkspaceResultSchema.parse(normalized) as RedefinedResult;
  const quality = validateUnderstandResultQuality(repaired);

  if (!quality.ok) {
    throw new Error(
      `Repaired Understand workspace failed quality validation: ${quality.issues.join("; ")}`
    );
  }

  return repaired;
}

function buildFixWorkspaceSystemPrompt(): string {
  return `You are Doc/ReDefined's structured technical diagnosis engine.

Return only valid JSON.
Do not return markdown.
Do not include explanations outside JSON.
Do not wrap the JSON in code fences.

The JSON must match the FixWorkspaceResult schema exactly.

The frontend renderer is generic. You must generate all content as structured data.

You must generate:
- id
- mode: "fix"
- originalPrompt
- title
- summary
- classification
- diagnosis
- issueMap nodes and edges
- quickTests
- failureBranches when applicable
- decisionPath
- pathUpdate
- scratchpad variables
- timeline entries
- diagnosticTerminal commands
- causalGraph when applicable
- optional environmentComparison only when useful
- artifacts
- visualFlow as an array of strings
- sections as an array
- actions as an array

Make the result specific to the user's issue.

Do not hardcode Power BI unless the user prompt is about Power BI.
Do not assume the product/vendor unless the prompt clearly mentions it.
Do not invent fake logs, fake commands, or fake source values.
If uncertain, use generic but useful validation checks.

The result must be useful to an engineer.
Prefer practical checks, commands, decision logic, and next actions.
Do not return generic process language as user-facing generated content.
Avoid phrases such as "mapping the request path", "dependency handoffs", "validate the first failed branch", "validating the first failed branch", "practical evidence", "highest-risk branch", or "first focused check".
Instead, explain the concrete technical cause areas for the user's issue.
For every technical Fix result, include practical failureBranches when applicable.
Failure branches should explain what symptom points to that branch and what checks prove or disprove it.
Do not make the result only visual. Include enough technical detail for an engineer to act immediately.
For Azure Storage access denied, always cover RBAC/data-plane permissions, firewall/network rules, private endpoint/DNS, SAS token, and exact error codes where relevant.

Titles:
- Use short, human-readable titles.
- Titles must be short and should not begin with "Likely issue path for".
- Avoid repeating generic words like "Diagnosis", "Issue", "Problem", or "Path" unless required.
- Prefer titles under 70 characters.
- For "storage account access denied", use titles like "Storage account access denied", "Storage access denied path", or "Storage authorization failure".

Issue map:
- Issue map node labels must be specific to the user prompt.
- Never use generic labels like Node 1, Node 2, Node 3, Step 1, Step 2, Step 3, Dependency, Validation, Resolution, Context, or Symptom.
- Never label issueMap nodes as Node 1, Node 2, or Node 3.
- If you cannot infer a label, use the system or handoff name from the prompt.
- Nodes should represent real actors, systems, services, handoffs, or checks.
- For access denied / identity prompts, prefer nodes such as Caller, Application, Identity / Principal, Token / Claims, RBAC Role Assignment, Network Rules, Target Resource, Access Result.
- For Azure Storage access denied, prefer Caller, Identity / Principal, RBAC Role Assignment, Network Rules, Storage Account, Container / Blob, Access Result.
- For Kubernetes pod restart issues, prefer Deployment, Pod, Container, Image Pull, Config / Secret, Resource Limits, Runtime Logs, Restart Result.
- For API 401/token issues, prefer Client, Token Refresh, Access Token, Identity Provider, API Gateway, Authorization Policy, Protected Resource, Response.

Quick tests:
- Quick tests must be practical and issue-specific.
- Quick tests must map directly to failureBranches when failureBranches exist.
- For every high/medium priority failure branch, include at least one quick test.
- Avoid placeholder commands unless the user did not provide actual resource names.
- If placeholder values are necessary, use clear placeholder names like <storage-account-name>, <principal-id>, <resource-group>, <namespace>, <pod-name>.
- For Azure Storage access denied, include checks for RBAC assignment, identity/principal, scope level, network rules/firewall/private endpoint, authentication method, and data-plane permissions.
- For Azure Storage access denied, include quick tests for RBAC role assignment, storage firewall/network rules, private endpoint/DNS if private endpoint is likely, SAS token validity if SAS is mentioned or access token is unclear, and identity/principal verification.

Diagnostic terminal:
- Commands must match the next best action and quick tests.
- Commands must be executable or clearly parameterized.
- Avoid generic commands like "check logs" unless wrapped as a specific instruction.

Path update:
- Next best action should name the concrete branch to validate first.
- Prefer the highest-priority failure branch.
- For Azure Storage access denied, use "Check RBAC data-plane role assignment" before generic validation language.

Live causal graph:
- For technical Fix results, generate causalGraph when the issue involves system dependencies, access failures, network path failures, authentication failures, cloud infrastructure, APIs, or deployment/runtime failures.
- The causalGraph should explain why the issue may happen, not just what to check.
- Use stable node IDs.
- Nodes kind must be "source", "dependency", "failure", "target", or "result".
- Nodes status must be "neutral", "checking", "passing", "failing", or "unknown".
- Edges kind may be "request", "dependency", "blocks", or "causes".
- For Azure Storage access denied, generate nodes: Caller, Identity / Principal, RBAC Role, Missing RBAC, Network Rule, Storage, Access Denied.
- For Azure Storage access denied, generate edges: Caller -> Identity / Principal, Identity / Principal -> RBAC Role, Missing RBAC -> RBAC Role, RBAC Role -> Storage, Network Rule -> Storage, Storage -> Access Denied.
- For Azure Storage access denied, set node coordinates so the graph reads: Caller -> Identity / Principal -> RBAC Role -> Storage, Missing RBAC below Identity pointing back to RBAC Role, and Network Rule pointing to Storage.
- For Azure Storage access denied, include branches: RBAC branch with tone green, Network branch with tone blue, Token/SAS branch with tone purple.
- For Azure Storage access denied, generate simulation steps: Caller requests access; Identity is evaluated; RBAC role is checked; Network rule is checked; Storage denies access.

Compact schema reminder:
classification.source must be one of "rules", "ai", "fallback", "manual", or "simulated-ai".
diagnosis.confidence and likelyCauses.priority must be "low", "medium", or "high".
issueMap.nodes[].type must be one of: "user", "service", "app", "gateway", "database", "network", "identity", "security", "check", "output", "unknown".
issueMap.nodes[].status and issueMap.edges[].status may be: "neutral", "unknown", "checking", "healthy", "warning", "failed".
issueMap.nodes[].id should be stable and short, for example: source, gateway, resolution, network, target, identity, auth, mapping, service, database, webhook, api, queue, storage.
quickTests[].category and diagnosticTerminal.commands[].category may be: "dns", "network", "auth", "config", "service", "generic".
diagnosticTerminal.shell must be "powershell", "bash", "sql", or "generic".
pathUpdate.status must be "initial", "narrowed", "resolved", or "needs_more_evidence".
artifacts[].type must be "ticket_update", "runbook", "save_journey", "share", "checklist", or "summary".
causalGraph.confidence must be "low", "medium", or "high".
causalGraph.nodes[].kind must be "source", "dependency", "failure", "target", or "result".
causalGraph.nodes[].status must be "neutral", "checking", "passing", "failing", or "unknown".
causalGraph.nodes[].x and causalGraph.nodes[].y are optional percentage coordinates from 0 to 100.
causalGraph.branches[].tone must be "green", "blue", "purple", or "neutral".

Compact exact object-array example:
{
  "quickTests": [
    {
      "id": "rbac-check",
      "title": "Check role assignment",
      "purpose": "Confirm the caller has the required data-plane role.",
      "commands": ["az role assignment list --assignee <principal-id> --scope <storage-scope>"],
      "successSignal": "Expected role assignment is present.",
      "failureMeaning": "The caller may not have sufficient access.",
      "category": "auth"
    }
  ],
  "issueMap": {
    "title": "Storage access flow",
    "summary": "Caller -> Identity / Principal -> RBAC Role Assignment -> Network Rules -> Storage Account -> Access Result",
    "nodes": [
      { "id": "caller", "label": "Caller", "type": "user", "status": "neutral", "risk": "medium" },
      { "id": "identity", "label": "Identity / Principal", "type": "identity", "status": "neutral", "risk": "high" },
      { "id": "rbac", "label": "RBAC Role Assignment", "type": "security", "status": "neutral", "risk": "high" },
      { "id": "network-rules", "label": "Network Rules", "type": "network", "status": "neutral", "risk": "medium" },
      { "id": "storage-account", "label": "Storage Account", "type": "database", "status": "neutral", "risk": "medium" },
      { "id": "access-result", "label": "Access Result", "type": "output", "status": "neutral", "risk": "medium" }
    ],
    "edges": [
      { "from": "caller", "to": "identity" },
      { "from": "identity", "to": "rbac" },
      { "from": "rbac", "to": "network-rules" },
      { "from": "network-rules", "to": "storage-account" },
      { "from": "storage-account", "to": "access-result" }
    ],
    "likelyFailureZones": ["identity", "rbac", "network-rules"]
  },
  "failureBranches": [
    {
      "id": "missing-data-plane-permission",
      "title": "Missing data-plane permission",
      "summary": "The caller reaches the storage account but lacks blob/container data-plane access.",
      "signals": ["AuthorizationPermissionMismatch", "This request is not authorized"],
      "checks": ["Confirm Storage Blob Data Reader/Contributor/Owner", "Confirm assignment scope", "Re-authenticate after role assignment"],
      "priority": "high"
    }
  ],
  "decisionPath": [
    {
      "id": "rbac-missing",
      "condition": "If required role assignment is missing",
      "meaning": "Authorization is the leading cause.",
      "nextAction": "Assign or request the correct role and retry the failed access."
    }
  ],
  "timeline": [
    {
      "id": "initial-diagnosis",
      "type": "initial_diagnosis",
      "title": "Initial diagnosis path generated",
      "summary": "Structured Fix workspace created from the prompt.",
      "timestampLabel": "Just now"
    }
  ],
  "diagnosticTerminal": {
    "title": "Diagnostic terminal",
    "shell": "bash",
    "commands": [
      {
        "id": "cmd-rbac",
        "label": "List role assignments",
        "command": "az role assignment list --assignee <principal-id> --scope <storage-scope>",
        "category": "auth"
      }
    ]
  },
  "artifacts": [
    { "type": "ticket_update", "label": "Create ticket update" },
    { "type": "runbook", "label": "Export executable runbook" },
    { "type": "save_journey", "label": "Save journey workspace" },
    { "type": "share", "label": "Share with team" }
  ]
}`;
}

function buildFixWorkspaceRepairSystemPrompt(): string {
  return `You are repairing a Doc/ReDefined structured Fix workspace result.

Return only valid JSON.
Do not return markdown.
Do not include explanations outside JSON.
Do not wrap JSON in code fences.

The previous result already matched the schema but failed quality checks.

Fix the listed quality issues while preserving the original user intent.
Return the full FixWorkspaceResult object.
Do not return only patches.

The corrected result must:
- match FixWorkspaceResult schema exactly
- be specific to the user prompt
- include a useful diagnosis
- include a coherent issue map
- include practical quick tests
- include decision logic
- include a useful next best action
- include diagnostic terminal commands
- include artifact actions
- avoid placeholder values
- avoid generic text
- avoid generic process language such as "mapping the request path", "dependency handoffs", "validating the first failed branch", "practical evidence", "highest-risk branch", or "first focused check"
- replace generic generated text with domain-specific reasoning
- do not change UI labels

When repairing issue map quality:
- Replace every generic node label with a domain-specific label.
- Do not use Node 1, Node 2, Step 1, Dependency, Validation, Resolution, Context, or Symptom.
- The repaired issue map must read like a real system flow.
- For Azure Storage access denied, use Caller -> Identity / Principal -> RBAC Role Assignment -> Network Rules -> Storage Account -> Access Result.
- For SSO login issues, use User -> Application -> Identity Provider -> Reply URL / ACS -> Claims -> Access Result.
- For API 401 issues, use Client -> Token Refresh -> Access Token -> API Gateway -> Authorization Policy -> Response.
- For Kubernetes restart issues, use Deployment -> Pod -> Container -> Config / Secret -> Resource Limits -> Runtime Logs -> Restart Result.

Do not hardcode Power BI unless the original prompt is about Power BI.
Return the full corrected FixWorkspaceResult JSON.`;
}

function buildFollowUpSystemPrompt(): string {
  return `You are Doc/ReDefined OS, updating an existing troubleshooting workspace as a continuation engine.

Return only valid JSON matching FollowUpResult.
Do not return markdown.
Do not include explanations outside JSON.
Do not wrap the JSON in code fences.
Do not regenerate the full workspace.
Only return targeted updates.

Workspace rules:
- Treat currentResult as the source of truth.
- Treat originalPrompt and original diagnosis as historical context.
- Do not overwrite Current Diagnosis unless shouldPromoteDiagnosis is true.
- For normal evidence analysis, shouldPromoteDiagnosis must be false.
- New evidence should create or update an evidence branch.
- If evidence maps to an existing branch type, update that branch instead of creating duplicates.
- Use localSignals first, then reason over evidenceBranches and timeline.
- Keep prior evidenceBranches unless a branch is explicitly dismissed or superseded.
- The evidence branch UI is static, but all branch content must be dynamic.
- Do not hardcode Azure Storage or RBAC answers unless the prompt/evidence is actually about that case.
- Generate activeEvidenceBranch detail from originalPrompt, currentResult, evidenceText, localSignals, existing evidenceBranches, and the active branch.
- activeEvidenceBranch should include dynamic explanation, cliSteps, fixSteps, followUpQuestions, and nextAction when useful.
- explanation must include meaning, whyThisBranch, and likelyRootCause.
- cliSteps must contain practical commands for the user's domain when commands are possible.
- fixSteps must be actionable remediation steps.
- followUpQuestions must ask only missing information needed to continue.
- For Azure Storage RBAC evidence such as AuthorizationPermissionMismatch or no role assignments, use this only as an example quality pattern: explain data-plane RBAC scope, include role assignment list/create checks, suggest re-authentication, and ask for principal/scope/account/container details.
- For other domains such as Kubernetes CrashLoopBackOff, generate domain-specific branch content such as kubectl describe pod, kubectl logs --previous, probes, config maps, secrets, env vars, and resource limits.

Use the currentResult issueMap node IDs when setting issueMapUpdates.
Use parsed evidence signals when helpful.
If evidence narrows the problem, update activeEvidenceBranch, updatedEvidenceBranches, pathUpdate, diagnosticTerminal, and timelineEntries.
If evidence shows a mismatch, include environmentComparison.
If evidence contains new useful values, include scratchpadUpdates.
If issue is resolved, set resolved true.

Required fields:
- id
- parentResultId
- userMessage
- signals
- scratchpadUpdates
- updatedDiagnosis with status
- issueMapUpdates
- nextBestAction
- timelineEntries
- resolved

Optional fields:
- activeEvidenceBranch
- updatedEvidenceBranches
- pathUpdate
- shouldPromoteDiagnosis
- environmentComparison
- diagnosticTerminal`;
}

function buildFollowUpRepairSystemPrompt(): string {
  return `You are repairing a Doc/ReDefined follow-up update.

Return only valid JSON matching FollowUpResult.
Do not return markdown.
Do not include explanations outside JSON.
Do not wrap JSON in code fences.

The previous follow-up already matched the schema but failed quality checks.

Fix the listed quality issues while preserving the user's evidence and current workspace.

The corrected follow-up must:
- reference only issueMap node IDs that exist in currentResult
- include a useful updatedDiagnosis
- include a useful nextBestAction
- include timelineEntries
- include issueMapUpdates when the evidence changes the path
- include scratchpadUpdates when the evidence contains useful values
- avoid placeholder values
- avoid generic text
- avoid generic process language such as "mapping the request path", "dependency handoffs", "validating the first failed branch", "practical evidence", "highest-risk branch", or "first focused check"
- replace generic generated text with domain-specific reasoning
- do not change UI labels
- do not overwrite the original prompt
- keep the original diagnosis stable unless a branch is confirmed

Return only the corrected FollowUpResult JSON.`;
}

function buildUnderstandWorkspaceSystemPrompt(): string {
  return `You are Doc/ReDefined's structured concept explanation engine.

Return only valid JSON. Do not return markdown. Do not include explanations outside JSON. Do not wrap the JSON in code fences.

The JSON must match the UnderstandWorkspaceResult schema exactly.

You must generate:
- id: short slug like "understand-<topic>-abc123"
- mode: "understand"
- originalPrompt: the user's exact question
- title: short, human-readable concept name (not a sentence)
- summary: 2-3 sentences: what it is, why it matters, who cares. Keep it description-rich; do not make it dictionary-like (e.g., do not start with "[Title] refers to...", "[Title] is a...", "refers to", "is defined as", or use format "Title: explanation").
- domain: one of cloud, business, finance, product, education, operations, general
- classification: { mode: "understand", confidence: 0.9, source: "ai", reason: "...", topic: "..." }
- clarity: { level: "high" | "medium" | "low", score: 0-100 }
- mentalModel: { title: "...", steps: [ { id, label, description } ] }
  - 4-7 steps forming a logical causal chain showing HOW the concept works
  - cloud networking: Client → VNet → Private Endpoint → DNS resolution → Target service
  - business strategy: Market → Problem → Differentiation → Capabilities → Trade-offs → Execution → Metrics
  - finance: Money in → Money out → Timing gap → Net cash position → Cash runway
  - Adapt to the topic. Never use generic steps like Step 1, Step 2.
- coreBuildingBlocks: 4-6 objects { id, title, description, blockType, confidence }
  - blockType: "output" | "result" | "mechanism" | "process" | "concept" | "constraint" | "risk" | "input" | "component" | "principle" | "term" | "pattern"
    - output/result = what the concept produces or enables
    - mechanism/process/component = how it works internally
    - concept/principle/term/pattern = the idea itself
    - constraint/risk = what limits or threatens it
    - input = what feeds into it
  - confidence: 0-100 (how well-understood this block tends to be)
  - Descriptions must be practical, not dictionary-style
  - Vary blockType across cards so the workspace shows a mix of colors
- misconceptions: 2-4 objects { id, misconception, reality }. Generate at least 2 misconceptions.
  - Real wrong beliefs, not trivially obvious ones
- realWorldExample: { title, scenario, explanation }
  - Concrete domain-specific example. scenario is 1-2 sentences. explanation applies the concept.
- decisionQuestions: 4-6 strings, actionable and specific
- nextActions: 3-5 objects { label, targetMode, prompt }
  - targetMode: "build" | "fix" | "artifact" | "understand"
  - prompt: a ready-to-use prompt string for the target mode
- userLevelCheck: { question: string, options: [ { id, label, description } ] }
  - A single question to calibrate the user's existing knowledge level
  - 3-4 options ranging from "Never heard of it" to "I use it daily"
  - Example question: "How familiar are you with [concept]?"
  - Options: { id: "beginner", label: "Just starting out", description: "..." }
  - This section appears at the top of the workspace to personalize the explanation depth
- analogySwitcher: { title, subtitle, analogies: [ { id, label, analogyTitle, explanation, keyTakeaway, isDefault } ] }
  - 3-4 analogies from different contexts (tech, everyday life, business, nature). Generate at least 3 analogies.
  - One analogy (isDefault: true) shown by default; others revealed on click
  - analogyTitle: the thing being compared (e.g. "A city's water pipes")
  - explanation: 2-3 sentences showing the parallel
  - keyTakeaway: one sentence on what the analogy clarifies
- thinkingSparks: 4-5 objects { id, type, prompt, targetPrompt }
  - type: "challenge" | "scenario" | "what_if" | "compare"
  - prompt: a short card title (e.g. "What if this failed silently?")
  - targetPrompt: a ready-to-use prompt for the user to launch a new query
  - Mix types: at least one challenge, one scenario, one what_if
- blindSpot: { title, description, whyItMatters, revealPrompt }
  - The single most common non-obvious mistake or gap in understanding
  - whyItMatters: why this gap causes real problems
  - revealPrompt: optional prompt to explore this blind spot further
- conceptConfidenceMap: { title, items: [ { id, label, confidence, reason, suggestedAction } ], lowestConfidenceAction }
  - Items are the coreBuildingBlocks mapped to a confidence score (how well the AI can explain each). Generate at least 4 items.
  - confidence: 0-100 (use 60-95 range; avoid 0 or 100)
  - reason: one sentence on what makes this hard
  - suggestedAction: what the user could do to fill this gap
  - lowestConfidenceAction: { label, prompt } — a shortcut to explore the lowest-confidence concept
- teachBack: { challenge, placeholder, expertVersion }
  - challenge: a 1-2 sentence prompt asking the user to explain the concept in their own words
  - placeholder: example text showing the expected format of a good explanation
  - expertVersion: (optional) how an expert would explain it, shown after user submits
- shareableInsight: { title, insight, supportingLine, tags, actions }
  - title: a catchy title for the shareable card
  - insight: 1-2 sentence distillation of the most important thing to know
  - supportingLine: optional short complementary line
  - tags: 2-4 topic tags (e.g. ["cloud", "networking", "azure"])
  - actions: [ { label, type } ] where type is "copy" | "notion" | "linkedin" | "save" | "post"
  - Always include at least: copy, linkedin, save
- resultGuide: { sectionExplanations, differentiation, promptDepth, refinementOptions }
  - sectionExplanations: explain each major section for the user (7-9 entries)
  - differentiation: { title, description } — what makes this result different from a generic search
  - promptDepth: { level: "shallow" | "moderate" | "deep", suggestion } — how detailed the user's prompt was
  - refinementOptions: 3-5 options the user can select to regenerate with a different angle
    - e.g. "Go deeper on analogies", "Focus on implementation", "Add more examples", "Simplify language"
- visualFlow: 4-5 short strings (breadcrumb labels for concept flow)
- sections: []
- actions: []

Rules:
- All content must be specific to the user's question. No generic filler.
- Do not import Fix workspace patterns or terms. Never use terms like: "diagnosis", "failure branch", "diagnostic terminal", "logs", "evidence", "root cause".
- Never use generic or rejected phrases: "this concept is important", "it depends on context", "you should understand the basics", "a key concept in this field", "this is used in many situations".
- Domain guidelines:
  - If domain is business, you MUST mention some of: customer, market, value, trade-off, choice, advantage, revenue, execution.
  - If domain is cloud, you MUST mention some of: resource, network, identity, policy, configuration, dependency, validation.
  - If domain is finance, you MUST mention some of: money flow, revenue, cost, timing, risk, cash, margin, decision impact.
- Analogy explanations must be concrete and non-trivial.
- Thinking sparks must be genuinely thought-provoking, not obvious questions.
- The blind spot must be non-obvious — not something the user already knows they don't know.
- Confidence map scores should vary meaningfully (not all 75).
- Do not hardcode examples to a specific company unless the user prompt mentions them.
- Domain-specific terminology: cloud → cloud terms, finance → finance terms, business → strategy terms.

Make every section specific to the user's question. Do not return generic content.`;
}

function buildUnderstandWorkspaceRepairSystemPrompt(): string {
  return `You are repairing a Doc/ReDefined structured Understand workspace result.

Return only valid JSON.
Do not return markdown.
Do not include explanations outside JSON.
Do not wrap JSON in code fences.

The previous result already matched the schema but failed quality checks.

Fix the listed quality issues while preserving the original user intent.
Return the full UnderstandWorkspaceResult object.
Do not return only patches.

The corrected result must:
- match UnderstandWorkspaceResult schema exactly
- be specific to the user prompt
- have a detailed summary (at least 2-3 sentences: what it is, why it matters, who cares) that is not generic or dictionary-like (e.g., do not start with "[Title] refers to...", "[Title] is a...", "refers to", "is defined as", or use format "Title: explanation")
- have a mentalModel with at least 4-7 steps showing how the concept works
- have at least 4 core building blocks
- have at least 2 misconceptions
- have at least 3 analogies in analogySwitcher
- have a non-missing blindSpot
- have at least 4 items in conceptConfidenceMap
- have at least 4 thinking sparks prompts
- have a non-missing teachBack section
- have a non-missing shareableInsight
- have at least 3 nextActions
- never use Fix-only terms like: diagnosis, failure branch, diagnostic terminal, logs, evidence, root cause
- never use generic or rejected phrases like: "This concept is important", "It depends on context", "You should understand the basics", "A key concept in this field", "This is used in many situations"
- align with the domain guidelines:
  - Business domain results must mention some of: customer, market, value, trade-off, choice, advantage, revenue, execution
  - Cloud domain results must mention some of: resource, network, identity, policy, configuration, dependency, validation
  - Finance domain results must mention some of: money flow, revenue, cost, timing, risk, cash, margin, decision impact

Do not return generic placeholder content. Keep it highly specific to the user's topic.`;
}

function normalizeUnderstandWorkspaceResult(raw: unknown, prompt: string): unknown {
  const source = isObj(raw) ? (raw as Record<string, unknown>) : {};
  const id = typeof source.id === "string" ? source.id : `understand-${Date.now().toString(36)}`;
  const title = typeof source.title === "string" && source.title ? source.title : extractUnderstandTopic(prompt);
  const domain = typeof source.domain === "string" && source.domain ? source.domain : "general";

  const clarityRaw = isObj(source.clarity) ? (source.clarity as Record<string, unknown>) : {};
  const clarityLevel = ["high", "medium", "low"].includes(clarityRaw.level as string)
    ? clarityRaw.level as "high" | "medium" | "low"
    : "medium";

  const mentalModelRaw = isObj(source.mentalModel) ? (source.mentalModel as Record<string, unknown>) : {};
  const rawSteps = Array.isArray(mentalModelRaw.steps) ? mentalModelRaw.steps : [];
  const steps = rawSteps
    .filter(isObj)
    .map((step, i) => {
      const s = step as Record<string, unknown>;
      return {
        id: typeof s.id === "string" ? s.id : `step-${i}`,
        label: typeof s.label === "string" ? s.label : `Step ${i + 1}`,
        description: typeof s.description === "string" ? s.description : undefined
      };
    });

  const validBlockTypes = [
    "output",
    "result",
    "mechanism",
    "process",
    "concept",
    "constraint",
    "risk",
    "input",
    "component",
    "principle",
    "term",
    "pattern"
  ];
  const rawBlocks = Array.isArray(source.coreBuildingBlocks) ? source.coreBuildingBlocks : [];
  const coreBuildingBlocks = rawBlocks
    .filter(isObj)
    .map((block, i) => {
      const b = block as Record<string, unknown>;
      return {
        id: typeof b.id === "string" ? b.id : `block-${i}`,
        title: typeof b.title === "string" ? b.title : `Block ${i + 1}`,
        description: typeof b.description === "string" ? b.description : "",
        blockType: validBlockTypes.includes(b.blockType as string) ? b.blockType as string : undefined,
        confidence: typeof b.confidence === "number" ? Math.round(Math.min(100, Math.max(0, b.confidence))) : undefined
      };
    });

  const rawMisconceptions = Array.isArray(source.misconceptions) ? source.misconceptions : [];
  const misconceptions = rawMisconceptions
    .filter(isObj)
    .map((m, i) => {
      const mc = m as Record<string, unknown>;
      return {
        id: typeof mc.id === "string" ? mc.id : `misconception-${i}`,
        misconception: typeof mc.misconception === "string" ? mc.misconception : "",
        reality: typeof mc.reality === "string" ? mc.reality : ""
      };
    })
    .filter((m) => m.misconception && m.reality);

  const realWorldRaw = isObj(source.realWorldExample) ? (source.realWorldExample as Record<string, unknown>) : {};
  const realWorldExample = {
    title: typeof realWorldRaw.title === "string" ? realWorldRaw.title : "Real world example",
    scenario: typeof realWorldRaw.scenario === "string" ? realWorldRaw.scenario : "",
    explanation: typeof realWorldRaw.explanation === "string" ? realWorldRaw.explanation : ""
  };

  const decisionQuestions = Array.isArray(source.decisionQuestions)
    ? source.decisionQuestions.filter((q): q is string => typeof q === "string")
    : [];

  const rawNextActions = Array.isArray(source.nextActions) ? source.nextActions : [];
  const nextActions = rawNextActions
    .filter(isObj)
    .map((action) => {
      const a = action as Record<string, unknown>;
      const validModes = ["understand", "build", "fix", "artifact"];
      return {
        label: typeof a.label === "string" ? a.label : "Learn more",
        targetMode: validModes.includes(a.targetMode as string) ? a.targetMode as "understand" | "build" | "fix" | "artifact" : "understand",
        prompt: typeof a.prompt === "string" ? a.prompt : prompt
      };
    });

  const classificationRaw = isObj(source.classification) ? (source.classification as Record<string, unknown>) : {};

  // userLevelCheck
  const userLevelCheckRaw = isObj(source.userLevelCheck) ? (source.userLevelCheck as Record<string, unknown>) : null;
  const userLevelCheck = userLevelCheckRaw && typeof userLevelCheckRaw.question === "string" && Array.isArray(userLevelCheckRaw.options)
    ? {
        question: userLevelCheckRaw.question,
        options: (userLevelCheckRaw.options as unknown[])
          .filter(isObj)
          .map((opt, i) => {
            const o = opt as Record<string, unknown>;
            return {
              id: typeof o.id === "string" ? o.id : `level-${i}`,
              label: typeof o.label === "string" ? o.label : `Level ${i + 1}`,
              description: typeof o.description === "string" ? o.description : "",
              selected: typeof o.selected === "boolean" ? o.selected : undefined
            };
          })
      }
    : undefined;

  // analogySwitcher
  const analogySwitcherRaw = isObj(source.analogySwitcher) ? (source.analogySwitcher as Record<string, unknown>) : null;
  const analogySwitcher = analogySwitcherRaw && Array.isArray(analogySwitcherRaw.analogies)
    ? {
        title: typeof analogySwitcherRaw.title === "string" ? analogySwitcherRaw.title : "Understand through analogy",
        subtitle: typeof analogySwitcherRaw.subtitle === "string" ? analogySwitcherRaw.subtitle : undefined,
        analogies: (analogySwitcherRaw.analogies as unknown[])
          .filter(isObj)
          .map((analogy, i) => {
            const a = analogy as Record<string, unknown>;
            return {
              id: typeof a.id === "string" ? a.id : `analogy-${i}`,
              label: typeof a.label === "string" ? a.label : `Analogy ${i + 1}`,
              analogyTitle: typeof a.analogyTitle === "string" ? a.analogyTitle : "",
              explanation: typeof a.explanation === "string" ? a.explanation : "",
              keyTakeaway: typeof a.keyTakeaway === "string" ? a.keyTakeaway : "",
              isDefault: i === 0 ? true : (typeof a.isDefault === "boolean" ? a.isDefault : undefined)
            };
          })
          .filter((a) => a.explanation)
      }
    : undefined;

  // thinkingSparks
  const validSparkTypes = ["challenge", "scenario", "what_if", "compare"];
  const rawSparks = Array.isArray(source.thinkingSparks) ? source.thinkingSparks : [];
  const thinkingSparks = rawSparks
    .filter(isObj)
    .map((spark, i) => {
      const s = spark as Record<string, unknown>;
      return {
        id: typeof s.id === "string" ? s.id : `spark-${i}`,
        type: validSparkTypes.includes(s.type as string) ? s.type as "challenge" | "scenario" | "what_if" | "compare" : "scenario",
        prompt: typeof s.prompt === "string" ? s.prompt : "",
        targetPrompt: typeof s.targetPrompt === "string" ? s.targetPrompt : prompt
      };
    })
    .filter((s) => s.prompt);

  const completeThinkingSparks = ensureUnderstandThinkingSparks(
    thinkingSparks,
    title,
    prompt
  );

  // blindSpot
  const blindSpotRaw = isObj(source.blindSpot) ? (source.blindSpot as Record<string, unknown>) : null;
  const blindSpot = blindSpotRaw && typeof blindSpotRaw.title === "string"
    ? {
        title: blindSpotRaw.title,
        description: typeof blindSpotRaw.description === "string" ? blindSpotRaw.description : "",
        whyItMatters: typeof blindSpotRaw.whyItMatters === "string" ? blindSpotRaw.whyItMatters : "",
        revealPrompt: typeof blindSpotRaw.revealPrompt === "string" ? blindSpotRaw.revealPrompt : undefined
      }
    : undefined;

  // conceptConfidenceMap
  const confidenceMapRaw = isObj(source.conceptConfidenceMap) ? (source.conceptConfidenceMap as Record<string, unknown>) : null;
  const conceptConfidenceMap = confidenceMapRaw && Array.isArray(confidenceMapRaw.items)
    ? {
        title: typeof confidenceMapRaw.title === "string" ? confidenceMapRaw.title : "Concept confidence",
        items: (confidenceMapRaw.items as unknown[])
          .filter(isObj)
          .map((item, i) => {
            const it = item as Record<string, unknown>;
            return {
              id: typeof it.id === "string" ? it.id : `conf-${i}`,
              label: typeof it.label === "string" ? it.label : `Concept ${i + 1}`,
              confidence: typeof it.confidence === "number" ? Math.round(Math.min(100, Math.max(0, it.confidence))) : 70,
              reason: typeof it.reason === "string" ? it.reason : undefined,
              suggestedAction: typeof it.suggestedAction === "string" ? it.suggestedAction : undefined
            };
          }),
        lowestConfidenceAction: isObj(confidenceMapRaw.lowestConfidenceAction)
          ? {
              label: typeof (confidenceMapRaw.lowestConfidenceAction as Record<string, unknown>).label === "string"
                ? (confidenceMapRaw.lowestConfidenceAction as Record<string, unknown>).label as string
                : "Explore this",
              prompt: typeof (confidenceMapRaw.lowestConfidenceAction as Record<string, unknown>).prompt === "string"
                ? (confidenceMapRaw.lowestConfidenceAction as Record<string, unknown>).prompt as string
                : prompt
            }
          : undefined
      }
    : undefined;

  // teachBack
  const teachBackRaw = isObj(source.teachBack) ? (source.teachBack as Record<string, unknown>) : null;
  const teachBack = teachBackRaw && typeof teachBackRaw.challenge === "string"
    ? {
        challenge: teachBackRaw.challenge,
        placeholder: typeof teachBackRaw.placeholder === "string" ? teachBackRaw.placeholder : `Explain ${title} as if you're teaching a colleague...`,
        expertVersion: typeof teachBackRaw.expertVersion === "string" ? teachBackRaw.expertVersion : undefined
      }
    : undefined;

  // shareableInsight
  const shareableInsightRaw = isObj(source.shareableInsight) ? (source.shareableInsight as Record<string, unknown>) : null;
  const shareableInsight = shareableInsightRaw && typeof shareableInsightRaw.insight === "string"
    ? {
        title: typeof shareableInsightRaw.title === "string" ? shareableInsightRaw.title : title,
        insight: shareableInsightRaw.insight,
        supportingLine: typeof shareableInsightRaw.supportingLine === "string" ? shareableInsightRaw.supportingLine : undefined,
        tags: Array.isArray(shareableInsightRaw.tags)
          ? (shareableInsightRaw.tags as unknown[]).filter((t): t is string => typeof t === "string")
          : [domain],
        actions: Array.isArray(shareableInsightRaw.actions)
          ? (shareableInsightRaw.actions as unknown[])
              .filter(isObj)
              .map((act) => {
                const a = act as Record<string, unknown>;
                const validTypes = ["copy", "notion", "linkedin", "save", "post"];
                return {
                  label: typeof a.label === "string" ? a.label : "Copy",
                  type: validTypes.includes(a.type as string) ? a.type as "copy" | "notion" | "linkedin" | "save" | "post" : "copy"
                };
              })
          : [{ label: "Copy insight", type: "copy" as const }, { label: "Share on LinkedIn", type: "linkedin" as const }, { label: "Save", type: "save" as const }]
      }
    : undefined;

  // resultGuide
  const resultGuideRaw = isObj(source.resultGuide) ? (source.resultGuide as Record<string, unknown>) : null;
  const resultGuide = resultGuideRaw
    ? {
        sectionExplanations: Array.isArray(resultGuideRaw.sectionExplanations)
          ? (resultGuideRaw.sectionExplanations as unknown[])
              .filter(isObj)
              .map((se) => {
                const s = se as Record<string, unknown>;
                return {
                  section: typeof s.section === "string" ? s.section : "",
                  explanation: typeof s.explanation === "string" ? s.explanation : ""
                };
              })
              .filter((se) => se.section && se.explanation)
          : [],
        differentiation: isObj(resultGuideRaw.differentiation)
          ? {
              title: typeof (resultGuideRaw.differentiation as Record<string, unknown>).title === "string"
                ? (resultGuideRaw.differentiation as Record<string, unknown>).title as string
                : "What makes this different",
              description: typeof (resultGuideRaw.differentiation as Record<string, unknown>).description === "string"
                ? (resultGuideRaw.differentiation as Record<string, unknown>).description as string
                : ""
            }
          : { title: "What makes this different", description: "" },
        promptDepth: isObj(resultGuideRaw.promptDepth)
          ? {
              level: (["shallow", "moderate", "deep"] as const).includes((resultGuideRaw.promptDepth as Record<string, unknown>).level as "shallow" | "moderate" | "deep")
                ? (resultGuideRaw.promptDepth as Record<string, unknown>).level as "shallow" | "moderate" | "deep"
                : "moderate",
              suggestion: typeof (resultGuideRaw.promptDepth as Record<string, unknown>).suggestion === "string"
                ? (resultGuideRaw.promptDepth as Record<string, unknown>).suggestion as string
                : ""
            }
          : { level: "moderate" as const, suggestion: "" },
        refinementOptions: Array.isArray(resultGuideRaw.refinementOptions)
          ? (resultGuideRaw.refinementOptions as unknown[])
              .filter(isObj)
              .map((opt, i) => {
                const o = opt as Record<string, unknown>;
                return {
                  id: typeof o.id === "string" ? o.id : `refine-${i}`,
                  label: typeof o.label === "string" ? o.label : `Option ${i + 1}`,
                  description: typeof o.description === "string" ? o.description : ""
                };
              })
          : []
      }
    : undefined;

  const completeResultGuide = ensureUnderstandResultGuide(
    resultGuide,
    title,
    prompt
  );
  const summary =
    typeof source.summary === "string" && source.summary
      ? improveUnderstandSummary(source.summary, title, prompt, domain)
      : buildSpecificUnderstandSummary(title, prompt, domain);

  return {
    id,
    mode: "understand",
    originalPrompt: typeof source.originalPrompt === "string" ? source.originalPrompt : prompt,
    title,
    summary,
    domain,
    classification: {
      mode: "understand",
      confidence: typeof classificationRaw.confidence === "number" ? classificationRaw.confidence : 0.9,
      source: "ai",
      reason: typeof classificationRaw.reason === "string" ? classificationRaw.reason : "Explanation intent detected.",
      topic: typeof classificationRaw.topic === "string" ? classificationRaw.topic : title
    },
    clarity: {
      level: clarityLevel,
      score: typeof clarityRaw.score === "number" ? clarityRaw.score : undefined
    },
    mentalModel: {
      title: typeof mentalModelRaw.title === "string" ? mentalModelRaw.title : `How ${title} works`,
      steps: steps.length > 0 ? steps : [{ id: "step-0", label: title, description: undefined }]
    },
    coreBuildingBlocks: coreBuildingBlocks.length > 0 ? coreBuildingBlocks : [
      { id: "block-0", title: title, description: `The core concept of ${title}.` }
    ],
    misconceptions,
    realWorldExample,
    decisionQuestions,
    nextActions,
    userLevelCheck,
    analogySwitcher,
    thinkingSparks: completeThinkingSparks,
    blindSpot,
    conceptConfidenceMap,
    teachBack,
    shareableInsight,
    resultGuide: completeResultGuide,
    visualFlow: Array.isArray(source.visualFlow) ? source.visualFlow : ["Concept", "Structure", "Example", "Apply"],
    sections: [],
    actions: []
  };
}

function isObj(value: unknown): value is object {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

type NormalizedUnderstandSpark = {
  id: string;
  type: "challenge" | "scenario" | "what_if" | "compare";
  prompt: string;
  targetPrompt: string;
};

type NormalizedUnderstandResultGuide = {
  sectionExplanations: { section: string; explanation: string }[];
  differentiation: { title: string; description: string };
  promptDepth: { level: "shallow" | "moderate" | "deep"; suggestion: string };
  refinementOptions: { id: string; label: string; description: string }[];
};

function isDictionaryLikeUnderstandSummary(summary: string, title: string): boolean {
  const summaryLower = summary.toLowerCase().trim();
  const titleLower = title.toLowerCase().trim();

  return (
    summaryLower.startsWith(`${titleLower} is `) ||
    summaryLower.startsWith(`${titleLower} refers to`) ||
    summaryLower.startsWith(`${titleLower} means`) ||
    summaryLower.startsWith("refers to ") ||
    summaryLower.startsWith("is defined as") ||
    /^[a-zA-Z0-9\s]+:\s/.test(summary)
  );
}

function buildSpecificUnderstandSummary(title: string, prompt: string, domain: string): string {
  const topic = title || extractUnderstandTopic(prompt);
  const normalizedDomain = domain.toLowerCase();

  if (normalizedDomain === "business") {
    return `Use ${topic} to connect customer needs, market choices, value creation, and execution trade-offs into one decision frame. The useful part is seeing how the concept changes revenue, advantage, or operating choices in a real plan.`;
  }

  if (normalizedDomain === "cloud") {
    return `Use ${topic} to trace how resources, identity, network paths, policy, configuration, and dependencies work together. The practical value is knowing which part to validate first when behavior changes or a deployment path is unclear.`;
  }

  if (normalizedDomain === "finance") {
    return `Use ${topic} to connect money flow, revenue, cost, timing, cash, margin, and risk into a clearer decision impact. The useful part is seeing which assumptions change the financial outcome and where trade-offs appear.`;
  }

  return `Use ${topic} as a practical decision lens: identify the moving parts, how they relate, and what trade-offs change the outcome. The goal is to move from a label to a working mental model you can apply, question, and explain.`;
}

function improveUnderstandSummary(
  summary: string,
  title: string,
  prompt: string,
  domain: string
): string {
  const normalized = summary.trim().replace(/\s+/g, " ");

  if (normalized.length >= 80 && !isDictionaryLikeUnderstandSummary(normalized, title)) {
    return normalized;
  }

  return buildSpecificUnderstandSummary(title, prompt, domain);
}

function ensureUnderstandThinkingSparks(
  existing: NormalizedUnderstandSpark[],
  title: string,
  prompt: string
): NormalizedUnderstandSpark[] {
  const sparks = existing.filter((spark) => spark.prompt.trim());
  const seen = new Set(sparks.map((spark) => spark.prompt.trim().toLowerCase()));
  const defaults: Omit<NormalizedUnderstandSpark, "id">[] = [
    {
      type: "challenge",
      prompt: "What assumption should you test first?",
      targetPrompt: `Challenge the weakest assumption behind ${title}.`
    },
    {
      type: "scenario",
      prompt: "Where would this show up in practice?",
      targetPrompt: `Show a realistic scenario where ${title} changes the decision.`
    },
    {
      type: "what_if",
      prompt: "What changes if the context shifts?",
      targetPrompt: `Explain how ${title} changes when the constraints or audience change.`
    },
    {
      type: "compare",
      prompt: "What is it often confused with?",
      targetPrompt: `Compare ${title} with the closest related concept and show the difference.`
    }
  ];

  for (const fallback of defaults) {
    if (sparks.length >= 4) break;
    const key = fallback.prompt.toLowerCase();
    if (seen.has(key)) continue;
    sparks.push({
      id: `spark-normalized-${sparks.length}`,
      ...fallback,
      targetPrompt: fallback.targetPrompt || prompt
    });
    seen.add(key);
  }

  return sparks;
}

function ensureUnderstandResultGuide(
  resultGuide: NormalizedUnderstandResultGuide | undefined,
  title: string,
  prompt: string
): NormalizedUnderstandResultGuide {
  const refinementOptions =
    resultGuide?.refinementOptions.filter((option) => option.label.trim()) ?? [];
  const fallbackRefinements = [
    {
      id: "refine-mechanisms",
      label: "Go deeper on mechanisms",
      description: `Explain the moving parts behind ${title} in more detail.`
    },
    {
      id: "refine-examples",
      label: "Add practical examples",
      description: `Show how ${title} appears in realistic situations.`
    },
    {
      id: "refine-assumptions",
      label: "Challenge assumptions",
      description: `Surface what could be wrong or incomplete about the current framing.`
    },
    {
      id: "refine-simplify",
      label: "Simplify language",
      description: `Restate ${title} in clearer terms without losing the key relationships.`
    }
  ];

  return {
    sectionExplanations: resultGuide?.sectionExplanations.length
      ? resultGuide.sectionExplanations
      : [
          {
            section: "Mental model",
            explanation: `Shows how ${title} works as a sequence of related ideas.`
          },
          {
            section: "Application",
            explanation: "Turns the concept into questions, examples, and next actions."
          }
        ],
    differentiation: resultGuide?.differentiation.description.trim()
      ? resultGuide.differentiation
      : {
          title: "What makes this useful",
          description: `This explains ${title} through relationships, trade-offs, and application instead of a flat definition.`
        },
    promptDepth: resultGuide?.promptDepth.suggestion.trim()
      ? resultGuide.promptDepth
      : {
          level: prompt.trim().split(/\s+/).length > 10 ? "moderate" : "shallow",
          suggestion: "Add a concrete situation, audience, or constraint to get a more tailored explanation."
        },
    refinementOptions: refinementOptions.length > 0 ? refinementOptions : fallbackRefinements
  };
}

function extractUnderstandTopic(prompt: string): string {
  return prompt
    .replace(/^(what is|what does|what are|explain|describe|help me understand|how does|overview of)\s+/i, "")
    .replace(/\?$/, "")
    .trim()
    .split(" ")
    .slice(0, 6)
    .join(" ");
}

type ArtifactSourceContextInput = {
  sourceMode?: string;
  sourceTitle?: string;
  workspaceType?: string;
  requiredInputs?: string[];
  sectionNames?: string[];
  buildFlow?: string[];
} | null;

export async function generateArtifactWorkspaceWithAI(
  prompt: string,
  sourceContext?: ArtifactSourceContextInput,
  extraInstruction?: string,
  rawForbiddenOut?: string[]
): Promise<RedefinedResult> {
  const userPayload = sourceContext
    ? JSON.stringify({ prompt, sourceContext })
    : prompt;
  const aiText = await callAIProvider({
    systemPrompt: withLensInstruction(buildArtifactWorkspaceSystemPrompt(prompt, sourceContext), extraInstruction),
    userPrompt: userPayload
  });
  const rawJson = safeParseJson(aiText);
  collectRawForbidden(rawJson, "artifact", rawForbiddenOut);
  const normalized = normalizeArtifactWorkspaceResult(rawJson, prompt, sourceContext);
  return ArtifactWorkspaceResultSchema.parse(normalized) as RedefinedResult;
}

function detectArtifactWorkspaceType(prompt: string, ctx?: ArtifactSourceContextInput): string {
  const v = prompt.toLowerCase();
  if (v.includes("business plan")) return "business_plan_artifact";
  if (v.includes("ticket") || v.includes("incident update")) return "ticket_update";
  if (v.includes("runbook")) return "runbook_artifact";
  if (v.includes("terraform") || v.includes("implementation plan")) return "implementation_plan";
  if (v.includes("checklist")) return "checklist";
  if (v.includes("summary")) return "summary";
  if (ctx?.workspaceType === "business_plan_builder") return "business_plan_artifact";
  if (ctx?.workspaceType?.includes("terraform") || ctx?.workspaceType?.includes("implementation")) return "implementation_plan";
  return "generic_artifact";
}

function buildArtifactWorkspaceSystemPrompt(prompt: string, ctx?: ArtifactSourceContextInput): string {
  const workspaceType = detectArtifactWorkspaceType(prompt, ctx);
  const contextBlock = ctx
    ? `\nSource context provided:\n- Source mode: ${ctx.sourceMode ?? "unknown"}\n- Source title: ${ctx.sourceTitle ?? "unknown"}\n- Required inputs: ${(ctx.requiredInputs ?? []).join(", ") || "none"}\n- Section names: ${(ctx.sectionNames ?? []).join(", ") || "none"}\n`
    : "";

  return `You are Doc/ReDefined's Artifact engine. Your job is to generate a structured artifact workspace.
${contextBlock}
Return ONLY valid JSON. No markdown, no code fences.

The artifact type for this request is: ${workspaceType}

Generate this JSON structure:
{
  "id": "artifact-[unique 6 char string]",
  "mode": "artifact",
  "domain": "[business / technology / operations / general]",
  "workspaceType": "${workspaceType}",
  "originalPrompt": "[exact prompt]",
  "title": "[3-6 word artifact title]",
  "summary": "[1-2 sentences describing what this artifact is and what it helps achieve]",
  "classification": {
    "mode": "artifact",
    "confidence": 0.88,
    "source": "ai",
    "reason": "Artifact generation requested",
    "topic": "[topic]"
  },
  "sourceContext": {
    "sourceMode": "${ctx?.sourceMode ?? "artifact"}",
    "sourceTitle": "${ctx?.sourceTitle ?? ""}",
    "keyInputs": [${(ctx?.requiredInputs ?? []).map(i => `"${i}"`).join(", ")}],
    "assumptions": ["[assumption 1 about missing details]", "[assumption 2]", "[assumption 3]"]
  },
  "missingDetails": [
    {
      "id": "md-1",
      "label": "[detail label, e.g. Business name]",
      "whyNeeded": "[why this is needed for the artifact]",
      "placeholder": "[example placeholder text]",
      "status": "missing"
    }
    // 3-6 missing detail items. Use "missing" for truly unknown items, "assumed" for sensible defaults
  ],
  "outline": [
    { "id": "out-1", "title": "[Section name]", "purpose": "[What this section covers]" }
    // 6-10 outline items matching the document type
  ],
  "artifactPreview": {
    "format": "[document / markdown / ticket / checklist / code]",
    "title": "[artifact title]",
    "body": "[Full draft content using [bracketed placeholders] for missing details. Must be 600-1200 chars. Use real document structure.]"
  },
  "formatOptions": [
    { "id": "fmt-1", "label": "[Primary format label]", "description": "[what this format produces]", "targetFormat": "[format]" },
    { "id": "fmt-2", "label": "[Alt format label]", "description": "[what this format produces]", "targetFormat": "[format]" }
    // 3-4 format options
  ],
  "exportActions": [
    { "label": "Copy", "action": "copy" },
    { "label": "Download", "action": "download" },
    { "label": "Save artifact", "action": "save" },
    { "label": "Regenerate", "action": "regenerate" }
  ],
  "visualFlow": ["Context", "Inputs", "Draft", "Review", "Export"],
  "sections": [],
  "actions": []
}

${workspaceType === "business_plan_artifact" ? `
BUSINESS PLAN RULES:
- outline must cover: Executive Summary, Business Description, Problem/Opportunity, Product or Service, Target Market, Competitive Landscape, Revenue Model, Marketing Strategy, Operations, Financial Projections, Risks
- artifactPreview.body must be a real business plan draft starting with # [Business Name] Business Plan
- Use [Business Name], [Target Customer], [Product/Service], [Revenue Model] as placeholders
- missingDetails must include: business name, target customer description, revenue model, competitive advantage, financial projections baseline
- formatOptions: Full document, Investor summary (1-page), Bank loan version, One-page brief
- artifactPreview.format: "document"
` : ""}
${workspaceType === "ticket_update" ? `
TICKET UPDATE RULES:
- outline: Incident Summary, Current Status, Investigation Findings, Root Cause, Next Actions, Resolution
- artifactPreview.body must be a formatted ticket update with ## headers
- Use [TICKET-XXXX], [issue description], [impact], [next action] placeholders
- missingDetails: ticket number, issue description, root cause confirmation, assigned owner
- formatOptions: Jira comment, ServiceNow update, Slack brief, Email summary
- artifactPreview.format: "ticket"
` : ""}
${workspaceType === "runbook_artifact" ? `
RUNBOOK RULES:
- outline: When to Use, Prerequisites, Symptoms, Investigation Steps, Resolution, Validation, Escalation
- artifactPreview.body must include # [Issue] Runbook header, numbered steps with commands
- Use realistic shell commands with [placeholder] values
- missingDetails: system name, affected service, expected command output, escalation contact
- formatOptions: Markdown runbook, Step checklist, Commands only, Change request
- artifactPreview.format: "markdown"
` : ""}
${workspaceType === "implementation_plan" ? `
IMPLEMENTATION PLAN RULES:
- outline: Overview, Prerequisites, Architecture, Implementation Steps, Validation, Rollback
- artifactPreview.body includes numbered implementation steps with code/commands where applicable
- missingDetails: environment details, resource names, access credentials placeholder, validation targets
- formatOptions: Terraform file, Implementation runbook, Validation checklist, Change request summary
- artifactPreview.format: "code"
` : ""}

Critical rules:
- NEVER invent specific numbers, names, or data — use [bracketed placeholders] instead
- missingDetails must list every unknown value used as a placeholder
- The artifactPreview.body must be a real, usable draft — not a description of what a draft would contain
- Assumptions in sourceContext should state what defaults you used (e.g. "Assumed for-profit business structure")
- Keep language professional, clear, and free of filler`;
}

function normalizeArtifactWorkspaceResult(
  source: unknown,
  prompt: string,
  ctx?: ArtifactSourceContextInput
): unknown {
  const s = isObj(source) ? (source as Record<string, unknown>) : {};

  const id = typeof s.id === "string" && s.id ? s.id : `artifact-${Date.now().toString(36)}`;
  const title = typeof s.title === "string" ? s.title : "Artifact";
  const summary = typeof s.summary === "string" ? s.summary : `A structured artifact for: ${prompt}`;
  const domain = typeof s.domain === "string" ? s.domain : "general";
  const validTypes = ["business_plan_artifact","runbook_artifact","ticket_update","implementation_plan","checklist","summary","generic_artifact"];
  const workspaceType = typeof s.workspaceType === "string" && validTypes.includes(s.workspaceType)
    ? s.workspaceType
    : detectArtifactWorkspaceType(prompt, ctx);

  const classification = isObj(s.classification)
    ? s.classification
    : { mode: "artifact", confidence: 0.85, source: "ai", reason: "Artifact workspace generated", topic: prompt };

  const normalizeSourceCtx = (raw: unknown) => {
    if (!isObj(raw)) return ctx ? {
      sourceMode: ctx.sourceMode,
      sourceTitle: ctx.sourceTitle,
      keyInputs: ctx.requiredInputs ?? [],
      assumptions: []
    } : undefined;
    const r = raw as Record<string, unknown>;
    const validModes = ["understand","build","fix","artifact"];
    return {
      ...(validModes.includes(r.sourceMode as string) ? { sourceMode: r.sourceMode as string } : {}),
      ...(typeof r.sourceTitle === "string" ? { sourceTitle: r.sourceTitle } : {}),
      keyInputs: Array.isArray(r.keyInputs) ? r.keyInputs.filter((x): x is string => typeof x === "string") : [],
      assumptions: Array.isArray(r.assumptions) ? r.assumptions.filter((x): x is string => typeof x === "string") : [],
      evidence: Array.isArray(r.evidence) ? r.evidence.filter((x): x is string => typeof x === "string") : undefined,
      commands: Array.isArray(r.commands) ? r.commands.filter((x): x is string => typeof x === "string") : undefined
    };
  };

  const missingDetails = Array.isArray(s.missingDetails)
    ? s.missingDetails.filter(isObj).map((item, i) => {
        const d = item as Record<string, unknown>;
        const validStatus = ["missing","provided","assumed"];
        return {
          id: typeof d.id === "string" ? d.id : `md-${i}`,
          label: typeof d.label === "string" ? d.label : "Detail",
          whyNeeded: typeof d.whyNeeded === "string" ? d.whyNeeded : "",
          ...(typeof d.placeholder === "string" ? { placeholder: d.placeholder } : {}),
          status: validStatus.includes(d.status as string) ? d.status as string : "missing"
        };
      })
    : [];

  const outline = Array.isArray(s.outline)
    ? s.outline.filter(isObj).map((item, i) => {
        const o = item as Record<string, unknown>;
        return {
          id: typeof o.id === "string" ? o.id : `out-${i}`,
          title: typeof o.title === "string" ? o.title : `Section ${i + 1}`,
          purpose: typeof o.purpose === "string" ? o.purpose : ""
        };
      })
    : [];

  const validFormats = ["markdown","document","email","ticket","checklist","code"];
  const rawPreview = isObj(s.artifactPreview) ? (s.artifactPreview as Record<string, unknown>) : {};
  const artifactPreview = {
    format: validFormats.includes(rawPreview.format as string) ? rawPreview.format as string : "document",
    title: typeof rawPreview.title === "string" ? rawPreview.title : title,
    body: typeof rawPreview.body === "string" ? rawPreview.body : `[${title} content — please provide details to generate draft]`
  };

  const formatOptions = Array.isArray(s.formatOptions)
    ? s.formatOptions.filter(isObj).map((item, i) => {
        const f = item as Record<string, unknown>;
        return {
          id: typeof f.id === "string" ? f.id : `fmt-${i}`,
          label: typeof f.label === "string" ? f.label : `Format ${i + 1}`,
          description: typeof f.description === "string" ? f.description : "",
          targetFormat: validFormats.includes(f.targetFormat as string) ? f.targetFormat as string : "document"
        };
      })
    : [{ id: "fmt-default", label: "Full document", description: "Complete artifact", targetFormat: "document" }];

  const validActions = ["copy","download","save","share","regenerate"];
  const exportActions = Array.isArray(s.exportActions)
    ? s.exportActions.filter(isObj).map((item) => {
        const a = item as Record<string, unknown>;
        return {
          label: typeof a.label === "string" ? a.label : "Export",
          action: validActions.includes(a.action as string) ? a.action as string : "copy"
        };
      })
    : [
        { label: "Copy", action: "copy" },
        { label: "Download", action: "download" },
        { label: "Save artifact", action: "save" },
        { label: "Regenerate", action: "regenerate" }
      ];

  return {
    id,
    mode: "artifact",
    originalPrompt: prompt,
    title,
    summary,
    domain,
    workspaceType,
    classification,
    sourceContext: normalizeSourceCtx(s.sourceContext),
    missingDetails: missingDetails.length > 0 ? missingDetails : undefined,
    outline,
    artifactPreview,
    formatOptions,
    exportActions,
    visualFlow: Array.isArray(s.visualFlow)
      ? (s.visualFlow as unknown[]).filter((x): x is string => typeof x === "string")
      : ["Context", "Inputs", "Draft", "Review", "Export"],
    sections: [],
    actions: []
  };
}

export async function generateBuildWorkspaceWithAI(
  prompt: string,
  extraInstruction?: string,
  rawForbiddenOut?: string[]
): Promise<RedefinedResult> {
  const aiText = await callAIProvider({
    systemPrompt: withLensInstruction(buildBuildWorkspaceSystemPrompt(), extraInstruction),
    userPrompt: prompt
  });
  const rawJson = safeParseJson(aiText);
  collectRawForbidden(rawJson, "build", rawForbiddenOut);
  const normalized = normalizeBuildWorkspaceResult(rawJson, prompt);
  return BuildWorkspaceResultSchema.parse(normalized) as RedefinedResult;
}

function buildBuildWorkspaceSystemPrompt(): string {
  return `You are Doc/ReDefined's Build Workspace engine for guided creation and implementation.

The user wants guidance on HOW to create, draft, configure, or implement something.
Your job is to return a structured JSON workspace that guides them through the process.

Return ONLY valid JSON. Do not return markdown. Do not wrap in code fences.

Title rules:
- "How to draft best business plan" -> "Business Plan Builder"
- "How can I create a Terraform private endpoint block?" -> "Azure Private Endpoint Terraform Builder"

Content rules:
- requiredInputs is an active missing-input panel. Every item must include label, whyNeeded, placeholder, and status.
- status must be "missing", "provided", or "assumed"; use "missing" unless the prompt provides the value.
- buildFlow must be a connected progress map, not generic advice.
- sectionBlueprint must include sectionName, purpose, keyQuestions, and outputExpected.
- qualityChecklist must include item, reason, and status "pending".
- buildNextActions must include an artifact action to generate the final artifact.
- For business plans, include inputs for business name, product/service, target customer, market/location, revenue model, pricing, startup costs, marketing channel, and funding purpose.
- For Terraform private endpoints, include infrastructure-specific inputs, a Terraform/private endpoint flow, and DNS/private endpoint validation checks.

The JSON must have exactly this structure:
{
  "id": "build-[unique 6 char string]",
  "mode": "build",
  "domain": "business",
  "workspaceType": "business_plan_builder",
  "originalPrompt": "[exact user prompt]",
  "title": "[3-6 word title, e.g. 'Business Plan Builder']",
  "summary": "[1-2 sentences describing what this workspace helps the user achieve]",
  "classification": {
    "mode": "build",
    "confidence": 0.87,
    "source": "ai",
    "reason": "User asked for guidance on building a business plan",
    "topic": "[topic extracted from prompt]"
  },
  "requiredInputs": [
    {
      "id": "input-1",
      "label": "Business concept or idea",
      "whyNeeded": "Defines the core value proposition and what the business does",
      "placeholder": "What is your business about? What problem does it solve?",
      "status": "missing"
    },
    {
      "id": "input-2",
      "label": "Target customers or market",
      "whyNeeded": "Identifies who the business serves and what they need",
      "placeholder": "Who are your primary customers? What industry?"
    },
    {
      "id": "input-3",
      "label": "Revenue model",
      "whyNeeded": "Explains how the business generates income",
      "placeholder": "How does the business make money? Subscriptions, sales, services?"
    },
    {
      "id": "input-4",
      "label": "Competitive advantage",
      "whyNeeded": "Defines why customers would choose this business over alternatives",
      "placeholder": "What makes this business different or better than competitors?"
    },
    {
      "id": "input-5",
      "label": "Available resources or funding",
      "whyNeeded": "Sets realistic financial and operational constraints for the plan",
      "placeholder": "Starting capital, team size, existing assets?"
    }
  ],
  "buildFlow": [
    { "id": "flow-1", "label": "Gather information", "description": "Collect all business details: idea, market, competitors, financials, and team." },
    { "id": "flow-2", "label": "Research the market", "description": "Validate market size, target customers, and competitor landscape." },
    { "id": "flow-3", "label": "Structure the plan", "description": "Organize the business plan sections in a logical order." },
    { "id": "flow-4", "label": "Draft each section", "description": "Write each section following the drafting steps below." },
    { "id": "flow-5", "label": "Review quality", "description": "Check the plan against the quality checklist before finalizing." },
    { "id": "flow-6", "label": "Export and share", "description": "Generate the final document and share it with stakeholders." }
  ],
  "draftingSteps": [
    {
      "id": "draft-1",
      "title": "Write the executive summary",
      "description": "Summarize the entire business plan in one page: the concept, opportunity, target market, revenue model, and funding ask.",
      "outputHint": "Output: 1-2 paragraphs. Write this LAST, after all other sections are complete."
    },
    {
      "id": "draft-2",
      "title": "Describe the business and problem",
      "description": "Explain what the business does, the problem it solves, and the opportunity in the market.",
      "outputHint": "Output: 2-3 paragraphs with a clear problem-solution statement."
    },
    {
      "id": "draft-3",
      "title": "Conduct market analysis",
      "description": "Research the total addressable market, target segment, customer personas, and competitive landscape.",
      "outputHint": "Output: Market size estimate, 3-5 competitor profiles, customer persona description."
    },
    {
      "id": "draft-4",
      "title": "Define the product or service",
      "description": "Describe what is being sold, its features, differentiators, and development or delivery stage.",
      "outputHint": "Output: Product/service description with pricing and delivery model."
    },
    {
      "id": "draft-5",
      "title": "Outline the marketing and sales strategy",
      "description": "Explain how customers will be acquired, what channels will be used, and how sales will be closed.",
      "outputHint": "Output: Go-to-market plan with acquisition channels, CAC estimate, and conversion approach."
    },
    {
      "id": "draft-6",
      "title": "Build the financial projections",
      "description": "Project revenue, costs, and profit for 3 years. Include startup costs, burn rate, and break-even point.",
      "outputHint": "Output: 3-year revenue model, monthly cash flow for year 1, and break-even analysis."
    },
    {
      "id": "draft-7",
      "title": "Introduce the team and operations",
      "description": "Describe the founding team, key hires needed, and how the business will operate day-to-day.",
      "outputHint": "Output: Team bios, org chart or roles needed, and operational workflow."
    }
  ],
  "sectionBlueprint": [
    {
      "id": "sec-1",
      "sectionName": "Executive Summary",
      "purpose": "A high-level snapshot that captures the reader's attention and conveys the business opportunity.",
      "keyQuestions": [
        "What is the business and what problem does it solve?",
        "Who are the target customers?",
        "What is the revenue model and funding ask?"
      ],
      "outputExpected": "A concise one-page summary."
    },
    {
      "id": "sec-2",
      "sectionName": "Company Description",
      "purpose": "Explains the business concept, mission, and legal structure.",
      "keyQuestions": [
        "What does the company do?",
        "What is the mission statement?",
        "What is the legal structure (LLC, corporation, etc.)?"
      ]
    },
    {
      "id": "sec-3",
      "sectionName": "Market Analysis",
      "purpose": "Demonstrates understanding of the market, customers, and competitors.",
      "keyQuestions": [
        "What is the total addressable market size?",
        "Who are the primary customer segments?",
        "Who are the top competitors and what are their weaknesses?"
      ]
    },
    {
      "id": "sec-4",
      "sectionName": "Products and Services",
      "purpose": "Describes what is being sold and why customers will pay for it.",
      "keyQuestions": [
        "What is the product or service?",
        "What makes it different from alternatives?",
        "What is the pricing model?"
      ]
    },
    {
      "id": "sec-5",
      "sectionName": "Marketing and Sales Strategy",
      "purpose": "Explains how customers will be acquired and retained.",
      "keyQuestions": [
        "Which channels will be used to reach customers?",
        "What is the customer acquisition strategy?",
        "How will the business retain customers?"
      ]
    },
    {
      "id": "sec-6",
      "sectionName": "Financial Projections",
      "purpose": "Shows the financial viability of the business over 3 years.",
      "keyQuestions": [
        "What are the projected revenues for years 1, 2, and 3?",
        "What are the startup and operating costs?",
        "When will the business reach break-even?"
      ]
    },
    {
      "id": "sec-7",
      "sectionName": "Team and Operations",
      "purpose": "Demonstrates the capability of the team and how the business will operate.",
      "keyQuestions": [
        "Who are the founders and what are their relevant backgrounds?",
        "What key roles still need to be filled?",
        "How will the business deliver its product or service?"
      ]
    }
  ],
  "qualityChecklist": [
    {
      "id": "check-1",
      "item": "Executive summary is clear in under 2 minutes of reading",
      "reason": "Investors and reviewers often read only the executive summary before deciding to continue",
      "status": "pending"
    },
    {
      "id": "check-2",
      "item": "Market size is supported by a credible source or calculation",
      "reason": "An unvalidated market size claim undermines the entire plan's credibility"
    },
    {
      "id": "check-3",
      "item": "Financial projections show a realistic path to profitability",
      "reason": "Overly optimistic projections without assumptions listed raise red flags"
    },
    {
      "id": "check-4",
      "item": "Competitive landscape identifies at least 3 alternatives",
      "reason": "Claiming no competition suggests the market or the analysis is insufficient"
    },
    {
      "id": "check-5",
      "item": "Revenue model is explained with specific numbers",
      "reason": "Vague descriptions like 'charge for our service' are not convincing to investors or lenders"
    },
    {
      "id": "check-6",
      "item": "The problem and solution are clearly connected",
      "reason": "A strong plan makes it obvious why this solution addresses this specific problem"
    }
  ],
  "buildNextActions": [
    {
      "label": "Generate the business plan document",
      "targetMode": "artifact",
      "prompt": "Draft a complete business plan for me"
    },
    {
      "label": "Understand what a business plan includes",
      "targetMode": "understand",
      "prompt": "What is a business plan and what should it include?"
    },
    {
      "label": "Fix a problem with my business plan",
      "targetMode": "fix",
      "prompt": "My business plan has a weakness I need to address"
    }
  ],
  "visualFlow": ["Inputs", "Research", "Structure", "Draft", "Review", "Export"],
  "sections": [],
  "actions": []
}

Rules:
- Make all content specific to the user's topic. If they mention a tech startup, use tech-specific examples.
- Do not use Fix sections, failure branches, evidence branches, or diagnostic terminals.
- If the prompt is about Terraform private endpoints, return an Azure/Terraform implementation workspace instead of a business plan.
- draftingSteps must cover ALL standard business plan sections in writing order
- sectionBlueprint keyQuestions must be practical and answerable by someone writing their first plan
- qualityChecklist items must check for the most common weaknesses in business plans
- buildNextActions must always include an artifact action to generate the document
- Keep all descriptions concise, actionable, and free of corporate jargon`;
}

function normalizeBuildWorkspaceResult(source: unknown, prompt: string): unknown {
  const s = isObj(source) ? (source as Record<string, unknown>) : {};
  const promptLower = prompt.toLowerCase();
  const isTerraformPrivateEndpoint =
    /terraform/.test(promptLower) && /private\s+endpoint|privatelink|private\s+link/.test(promptLower);
  const isBusinessPlan = /business\s+plan|business/.test(promptLower);

  const id = typeof s.id === "string" && s.id ? s.id : `build-${Date.now().toString(36)}`;
  const inferredTitle = isTerraformPrivateEndpoint
    ? "Azure Private Endpoint Terraform Builder"
    : isBusinessPlan
      ? "Business Plan Builder"
      : "Build Workspace";
  const title = typeof s.title === "string" && s.title ? normalizeBuildTitle(s.title, prompt) : inferredTitle;
  const summary = typeof s.summary === "string" ? s.summary : `A guided workspace for building ${title}.`;
  const domain = typeof s.domain === "string" ? s.domain : isTerraformPrivateEndpoint ? "azure_infrastructure" : "business";
  const workspaceType = typeof s.workspaceType === "string" ? s.workspaceType : isTerraformPrivateEndpoint ? "terraform_private_endpoint_builder" : "business_plan_builder";

  const classification = isObj(s.classification)
    ? s.classification
    : { mode: "build", confidence: 0.85, source: "ai", reason: "Build workspace generated", topic: prompt };

  function normalizeStringArray(arr: unknown): string[] {
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : [];
  }

  const requiredInputs = Array.isArray(s.requiredInputs)
    ? s.requiredInputs.filter(isObj).map((item, i) => {
        const r = item as Record<string, unknown>;
        return {
          id: typeof r.id === "string" ? r.id : `input-${i}`,
          label: typeof r.label === "string" ? r.label : "Input",
          whyNeeded: typeof r.whyNeeded === "string" ? r.whyNeeded : "Required for the plan",
          ...(typeof r.placeholder === "string" ? { placeholder: r.placeholder } : {}),
          status: ["missing", "provided", "assumed"].includes(r.status as string)
            ? (r.status as "missing" | "provided" | "assumed")
            : "missing"
        };
      })
    : defaultBuildInputs(prompt);

  const buildFlow = Array.isArray(s.buildFlow)
    ? s.buildFlow.filter(isObj).map((item, i) => {
        const f = item as Record<string, unknown>;
        return {
          id: typeof f.id === "string" ? f.id : `flow-${i}`,
          label: typeof f.label === "string" ? f.label : `Step ${i + 1}`,
          description: typeof f.description === "string" ? f.description : ""
        };
      })
    : defaultBuildFlow(prompt);

  const draftingSteps = Array.isArray(s.draftingSteps)
    ? s.draftingSteps.filter(isObj).map((item, i) => {
        const d = item as Record<string, unknown>;
        return {
          id: typeof d.id === "string" ? d.id : `draft-${i}`,
          title: typeof d.title === "string" ? d.title : `Step ${i + 1}`,
          description: typeof d.description === "string" ? d.description : "",
          outputHint: typeof d.outputHint === "string" ? d.outputHint : ""
        };
      })
    : [];

  const sectionBlueprint = Array.isArray(s.sectionBlueprint)
    ? s.sectionBlueprint.filter(isObj).map((item, i) => {
        const b = item as Record<string, unknown>;
        return {
          id: typeof b.id === "string" ? b.id : `sec-${i}`,
          sectionName: typeof b.sectionName === "string" ? b.sectionName : `Section ${i + 1}`,
          purpose: typeof b.purpose === "string" ? b.purpose : "",
          keyQuestions: normalizeStringArray(b.keyQuestions),
          ...(typeof b.outputExpected === "string" ? { outputExpected: b.outputExpected } : {})
        };
      })
    : defaultSectionBlueprint(prompt);

  const qualityChecklist = Array.isArray(s.qualityChecklist)
    ? s.qualityChecklist.filter(isObj).map((item, i) => {
        const c = item as Record<string, unknown>;
        return {
          id: typeof c.id === "string" ? c.id : `check-${i}`,
          item: typeof c.item === "string" ? c.item : "Quality check",
          reason: typeof c.reason === "string" ? c.reason : "",
          status: ["pending", "passed", "needs_work"].includes(c.status as string)
            ? (c.status as "pending" | "passed" | "needs_work")
            : "pending"
        };
      })
    : defaultQualityChecklist(prompt);

  const buildNextActions = Array.isArray(s.buildNextActions)
    ? s.buildNextActions.filter(isObj).map((item) => {
        const a = item as Record<string, unknown>;
        const validModes = ["build", "artifact", "understand", "fix"];
        return {
          label: typeof a.label === "string" ? a.label : "Next action",
          targetMode: validModes.includes(a.targetMode as string) ? (a.targetMode as "build" | "artifact" | "understand" | "fix") : "artifact",
          prompt: typeof a.prompt === "string" ? a.prompt : prompt
        };
      })
    : [
        { label: "Generate the business plan document", targetMode: "artifact" as const, prompt: `Draft a complete business plan for ${prompt}` }
      ];

  return {
    id,
    mode: "build",
    originalPrompt: prompt,
    title,
    summary,
    domain,
    workspaceType,
    classification,
    requiredInputs: requiredInputs.length ? requiredInputs : defaultBuildInputs(prompt),
    buildFlow: buildFlow.length ? buildFlow : defaultBuildFlow(prompt),
    draftingSteps,
    sectionBlueprint: sectionBlueprint.length ? sectionBlueprint : defaultSectionBlueprint(prompt),
    qualityChecklist: qualityChecklist.length ? qualityChecklist : defaultQualityChecklist(prompt),
    buildNextActions,
    visualFlow: Array.isArray(s.visualFlow) ? normalizeStringArray(s.visualFlow) : ["Inputs", "Research", "Structure", "Draft", "Review", "Export"],
    sections: [],
    actions: []
  };
}

function normalizeBuildTitle(title: string, prompt: string): string {
  const value = `${title} ${prompt}`.toLowerCase();
  if (/terraform/.test(value) && /private\s+endpoint|privatelink|private\s+link/.test(value)) {
    return "Azure Private Endpoint Terraform Builder";
  }
  if (/business\s+plan|business/.test(value)) {
    return "Business Plan Builder";
  }
  return title.replace(/^how\s+(to|can i)\s+/i, "").trim() || "Build Workspace";
}

function defaultBuildInputs(prompt: string) {
  const value = prompt.toLowerCase();
  if (/terraform/.test(value) && /private\s+endpoint|privatelink|private\s+link/.test(value)) {
    return [
      { id: "input-subscription", label: "Azure subscription and resource group", whyNeeded: "Terraform needs the deployment scope and target resource group.", placeholder: "Subscription ID and resource group name", status: "missing" as const },
      { id: "input-vnet", label: "Virtual network and subnet", whyNeeded: "Private endpoints must attach to a subnet with compatible network policies.", placeholder: "vnet-prod / subnet-private-endpoints", status: "missing" as const },
      { id: "input-target", label: "Target Azure resource", whyNeeded: "The private endpoint requires the resource ID and subresource name.", placeholder: "Storage account, SQL server, Key Vault, etc.", status: "missing" as const },
      { id: "input-dns", label: "Private DNS zone", whyNeeded: "Name resolution must map the public FQDN to the private endpoint IP.", placeholder: "privatelink.blob.core.windows.net", status: "missing" as const },
      { id: "input-tags", label: "Naming and tags", whyNeeded: "Keeps Terraform resources consistent and traceable.", placeholder: "env, owner, cost center", status: "assumed" as const }
    ];
  }

  return [
    { id: "input-business-name", label: "Business name", whyNeeded: "Anchors the plan and keeps every section specific.", placeholder: "Name or working title", status: "missing" as const },
    { id: "input-product", label: "Product or service", whyNeeded: "Defines what the business sells and the value it delivers.", placeholder: "What are you offering?", status: "missing" as const },
    { id: "input-customer", label: "Target customer", whyNeeded: "Shapes market analysis, messaging, channels, and pricing.", placeholder: "Who buys this and why?", status: "missing" as const },
    { id: "input-market", label: "Market or location", whyNeeded: "Sets the competitive and geographic context.", placeholder: "City, country, industry, or niche", status: "missing" as const },
    { id: "input-revenue", label: "Revenue model", whyNeeded: "Explains how money is made and what financial assumptions matter.", placeholder: "Subscriptions, services, retail, marketplace", status: "missing" as const },
    { id: "input-pricing", label: "Pricing", whyNeeded: "Turns the offer into measurable revenue projections.", placeholder: "$49/month, $2,500/project, etc.", status: "missing" as const },
    { id: "input-costs", label: "Startup costs", whyNeeded: "Shows funding needs and break-even pressure.", placeholder: "Launch budget, tools, inventory, payroll", status: "missing" as const },
    { id: "input-channel", label: "Marketing channel", whyNeeded: "Clarifies how customers will be reached and acquired.", placeholder: "SEO, partnerships, ads, direct sales", status: "missing" as const },
    { id: "input-funding", label: "Funding purpose", whyNeeded: "Connects the plan to loans, investors, grants, or internal approval.", placeholder: "Loan, investor pitch, internal plan", status: "missing" as const }
  ];
}

function defaultBuildFlow(prompt: string) {
  const value = prompt.toLowerCase();
  const labels = /terraform/.test(value) && /private\s+endpoint|privatelink|private\s+link/.test(value)
    ? ["Variables", "Resource group", "Subnet", "Private endpoint", "DNS zone group", "VNet link", "Validation"]
    : ["Idea", "Customer", "Market", "Offer", "Revenue model", "Operations", "Financials", "Executive summary"];

  return labels.map((label, index) => ({
    id: `flow-${index + 1}`,
    label,
    description: index === 0 ? "Start with the required inputs." : `Build and validate the ${label.toLowerCase()} layer.`
  }));
}

function defaultSectionBlueprint(prompt: string) {
  const value = prompt.toLowerCase();
  if (/terraform/.test(value) && /private\s+endpoint|privatelink|private\s+link/.test(value)) {
    return [
      { id: "sec-variables", sectionName: "Variables", purpose: "Expose names, IDs, locations, and DNS settings as reusable inputs.", keyQuestions: ["Which values differ per environment?", "Which resource ID is the private endpoint targeting?"], outputExpected: "A variables.tf block with clear types and descriptions." },
      { id: "sec-endpoint", sectionName: "Private Endpoint", purpose: "Create the endpoint and private service connection.", keyQuestions: ["Which subnet will host the endpoint?", "Which subresource names are required?"], outputExpected: "A private endpoint resource with service connection." },
      { id: "sec-dns", sectionName: "DNS Zone Group", purpose: "Attach the private DNS zone to the endpoint for name resolution.", keyQuestions: ["Which privatelink zone is required?", "Is the VNet linked to the zone?"], outputExpected: "DNS zone group and VNet link resources." },
      { id: "sec-validation", sectionName: "Validation", purpose: "Prove that traffic resolves to the private IP and reaches the service.", keyQuestions: ["Does nslookup return a private IP?", "Does the client connect over the expected route?"], outputExpected: "Terraform outputs and validation commands." }
    ];
  }

  return [
    { id: "sec-executive-summary", sectionName: "Executive Summary", purpose: "Summarize the business, market, offer, traction, and ask.", keyQuestions: ["What is the business?", "Why now?", "What result are you asking for?"], outputExpected: "A concise one-page summary." },
    { id: "sec-business-description", sectionName: "Business Description", purpose: "Explain the company, mission, problem, and solution.", keyQuestions: ["What problem exists?", "How does the business solve it?", "What makes it credible?"], outputExpected: "A clear company and problem-solution narrative." },
    { id: "sec-market-analysis", sectionName: "Market Analysis", purpose: "Prove there is a reachable market and real demand.", keyQuestions: ["Who is the customer?", "How large is the market?", "Who else serves them?"], outputExpected: "Customer segments, market size, and competitors." },
    { id: "sec-product-service", sectionName: "Product/Service", purpose: "Describe the offer, pricing, and differentiators.", keyQuestions: ["What is sold?", "What does it cost?", "Why choose it?"], outputExpected: "Offer details with pricing and positioning." },
    { id: "sec-marketing", sectionName: "Marketing Strategy", purpose: "Show how customers will be acquired and retained.", keyQuestions: ["Which channels will work first?", "What message converts?", "How will retention happen?"], outputExpected: "A practical go-to-market plan." },
    { id: "sec-operations", sectionName: "Operations Plan", purpose: "Define how the business delivers reliably.", keyQuestions: ["Who does what?", "Which tools or suppliers matter?", "What process creates the output?"], outputExpected: "Roles, workflow, partners, and operating model." },
    { id: "sec-financial", sectionName: "Financial Plan", purpose: "Translate assumptions into revenue, cost, and cash-flow projections.", keyQuestions: ["What are the main costs?", "What drives revenue?", "When does break-even happen?"], outputExpected: "Startup costs, revenue model, and projections." },
    { id: "sec-risks", sectionName: "Risks/Milestones", purpose: "Identify key risks and the next proof points.", keyQuestions: ["What could fail?", "How will you reduce risk?", "What milestones show progress?"], outputExpected: "Risk table and milestone roadmap." }
  ];
}

function defaultQualityChecklist(prompt: string) {
  const value = prompt.toLowerCase();
  const items = /terraform/.test(value) && /private\s+endpoint|privatelink|private\s+link/.test(value)
    ? [
        ["DNS resolves privately", "Private endpoint deployments fail in practice when DNS still resolves to the public endpoint."],
        ["Subnet and network policies are compatible", "The endpoint must be placed in a subnet that supports the intended private endpoint behavior."],
        ["Target subresource is correct", "Incorrect group IDs create resources that deploy but do not connect to the expected service plane."],
        ["Terraform variables are environment-safe", "Hardcoded names and IDs make the block difficult to reuse across dev, test, and prod."],
        ["Validation commands are included", "The implementation should prove name resolution and connectivity after apply."]
      ]
    : [
        ["Customer and problem are specific", "Generic customer definitions make market, pricing, and marketing sections weak."],
        ["Revenue assumptions are measurable", "The plan needs numbers that can be tested and adjusted."],
        ["Startup costs and break-even are visible", "Readers need to understand funding need and cash-flow pressure."],
        ["Marketing channel is realistic", "A plan without a believable acquisition path is incomplete."],
        ["Risks and milestones are explicit", "The strongest plans show what must be proven next."]
      ];

  return items.map(([item, reason], index) => ({
    id: `check-${index + 1}`,
    item,
    reason,
    status: "pending" as const
  }));
}

function safeParseJson(value: string): unknown {
  const trimmed = value.trim();
  const unfenced = trimmed
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  return JSON.parse(unfenced);
}
