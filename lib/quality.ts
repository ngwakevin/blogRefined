import type {
  DiagnosticTerminal,
  EnvironmentComparison,
  FixWorkspaceResult,
  FollowUpResult,
  IssueMap
} from "@/types/redefined";
import type { RedefinedResult } from "@/lib/redefined";

export type QualityValidationResult = {
  ok: boolean;
  issues: string[];
  warnings: string[];
};

const genericTextPatterns = [
  /^check the system\.?$/i,
  /^investigate the issue\.?$/i,
  /^review the configuration\.?$/i,
  /^something may be wrong\.?$/i,
  /^check configuration\.?$/i,
  /^investigate further\.?$/i,
  /^contact support\.?$/i
];

const genericCommandPatterns = [
  /^<command>$/i,
  /^<target>$/i,
  /^run diagnostic command$/i,
  /^run check$/i,
  /^check logs$/i,
  /^investigate$/i,
  /^todo$/i,
  /^n\/a$/i
];

const genericConditionPatterns = [
  /^if it fails$/i,
  /^if error occurs$/i,
  /^if problem continues$/i
];

const placeholderValuePatterns = [/^<.+>$/i, /^unknown$/i, /^n\/a$/i, /^todo$/i];

function emptyResult(): QualityValidationResult {
  return {
    ok: true,
    issues: [],
    warnings: []
  };
}

function finalize(result: QualityValidationResult): QualityValidationResult {
  return {
    ...result,
    ok: result.issues.length === 0
  };
}

function isBlank(value: string | undefined): boolean {
  return !value || value.trim().length === 0;
}

function isGenericText(value: string): boolean {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized) return true;
  if (genericTextPatterns.some((pattern) => pattern.test(normalized))) return true;

  const lower = normalized.toLowerCase();
  const genericFragments = [
    "check the system",
    "investigate the issue",
    "review the configuration",
    "something may be wrong"
  ];

  return genericFragments.some((fragment) => lower === fragment || lower.startsWith(`${fragment}.`));
}

export function isGenericGeneratedText(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().replace(/\s+/g, " ").toLowerCase();
  if (!normalized) return false;

  return [
    "mapping the request path",
    "dependency handoffs",
    "validating the first failed branch",
    "validate the first failed branch",
    "practical evidence",
    "highest-risk branch",
    "highest-risk nodes",
    "first focused check",
    "expected access behavior",
    "likely causing the access failure",
    "branch confirms expected behavior",
    "first failed validation check",
    "first failed branch"
  ].some((fragment) => normalized.includes(fragment));
}

export function getGenericGeneratedContentFields(result: FixWorkspaceResult): string[] {
  const fields: string[] = [];

  if (isGenericGeneratedText(result.diagnosis?.answer)) fields.push("diagnosis.answer");
  if (isGenericGeneratedText(result.pathUpdate?.description)) fields.push("pathUpdate.description");
  if (isGenericGeneratedText(result.pathUpdate?.nextBestAction.description)) {
    fields.push("pathUpdate.nextBestAction.description");
  }

  result.quickTests?.forEach((test, index) => {
    if (isGenericGeneratedText(test.purpose)) fields.push(`quickTests.${index}.purpose`);
    if (isGenericGeneratedText(test.successSignal)) fields.push(`quickTests.${index}.successSignal`);
    if (isGenericGeneratedText(test.failureMeaning)) fields.push(`quickTests.${index}.failureMeaning`);
  });

  result.evidenceBranches?.forEach((branch, index) => {
    if (isGenericGeneratedText(branch.summary)) fields.push(`evidenceBranches.${index}.summary`);
    if (isGenericGeneratedText(branch.nextAction)) fields.push(`evidenceBranches.${index}.nextAction`);
  });

  return fields;
}

function isPlaceholderCommand(value: string): boolean {
  const normalized = value.trim().replace(/\s+/g, " ");
  return !normalized || genericCommandPatterns.some((pattern) => pattern.test(normalized));
}

function hasPlaceholderOnlyCommand(command: string): boolean {
  return isPlaceholderCommand(command);
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

function isGenericTitle(title: string): boolean {
  return ["issue", "diagnosis", "problem", "troubleshooting"].includes(
    title.trim().toLowerCase()
  );
}

function isCloudAccessDeniedPrompt(result: FixWorkspaceResult): boolean {
  const value = `${result.originalPrompt ?? ""} ${result.title} ${result.summary}`.toLowerCase();
  return /(access denied|denied|forbidden|403)/.test(value) && /(storage|blob|container|account|azure|cloud)/.test(value);
}

function isAzureStorageAccessDeniedPrompt(result: FixWorkspaceResult): boolean {
  const value = `${result.originalPrompt ?? ""} ${result.title} ${result.summary}`.toLowerCase();
  return /(storage|blob|container)/.test(value) && /(access denied|denied|forbidden|403)/.test(value);
}

function isPlaceholderValue(value: string): boolean {
  const normalized = value.trim().replace(/\s+/g, " ");
  return placeholderValuePatterns.some((pattern) => pattern.test(normalized));
}

function getDuplicateValues(values: string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }

  return [...duplicates];
}

function mergeQuality(
  target: QualityValidationResult,
  source: QualityValidationResult
): void {
  target.issues.push(...source.issues);
  target.warnings.push(...source.warnings);
}

function validateIssueMapQuality(issueMap: IssueMap): QualityValidationResult {
  const result = emptyResult();
  const title = issueMap.title.trim();

  if (!title) result.issues.push("Issue map title is empty.");
  if (issueMap.nodes.length < 3) result.issues.push("Issue map must include at least three nodes.");

  const duplicateNodeIds = getDuplicateValues(issueMap.nodes.map((node) => node.id));
  if (duplicateNodeIds.length > 0) {
    result.issues.push(`Issue map contains duplicate node IDs: ${duplicateNodeIds.join(", ")}.`);
  }

  const nodeIds = new Set(issueMap.nodes.map((node) => node.id));
  for (const edge of issueMap.edges) {
    if (!nodeIds.has(edge.from)) {
      result.issues.push(`Issue map edge references missing source node: ${edge.from}.`);
    }
    if (!nodeIds.has(edge.to)) {
      result.issues.push(`Issue map edge references missing target node: ${edge.to}.`);
    }
  }

  const labels = issueMap.nodes.map((node) => node.label.trim()).filter(Boolean);
  const genericLabels = issueMap.nodes.filter((node) => isGenericNodeLabel(node.label));
  if (genericLabels.length > 0) {
    result.issues.push(
      `Issue map contains generic node labels: ${genericLabels.map((node) => node.label).join(", ")}.`
    );
  }
  if (issueMap.nodes.length > 0 && genericLabels.length / issueMap.nodes.length > 0.25) {
    result.issues.push("More than 25% of issue map nodes are generic.");
  }

  const stepLabelCount = labels.filter((label) => /^step\s*\d+$/i.test(label)).length;
  if (labels.length > 0 && stepLabelCount === labels.length) {
    result.issues.push("Issue map node labels are generic step labels.");
  }

  const meaningfulLabels = labels.filter((label) => label.length >= 4 && !/^step\s*\d+$/i.test(label));
  if (meaningfulLabels.length === 0) {
    result.issues.push("Issue map does not include meaningful node labels.");
  }

  if (!issueMap.nodes.some((node) => node.risk === "high" || node.risk === "medium")) {
    result.warnings.push("Issue map has no medium or high risk nodes.");
  }

  if (!issueMap.nodes.some((node) => Boolean(node.status))) {
    result.warnings.push("Issue map nodes do not include status values.");
  }

  for (const zone of issueMap.likelyFailureZones) {
    if (!nodeIds.has(zone)) {
      result.warnings.push(`Likely failure zone references missing node ID: ${zone}.`);
    }
  }

  return finalize(result);
}

function validateDiagnosticTerminalQuality(
  terminal: DiagnosticTerminal | undefined,
  result: FixWorkspaceResult
): QualityValidationResult {
  const quality = emptyResult();

  if (!terminal) {
    quality.issues.push("Diagnostic terminal is missing.");
    return finalize(quality);
  }

  if (terminal.commands.length < 1) {
    quality.issues.push("Diagnostic terminal must include at least one command.");
    return finalize(quality);
  }

  const commands = terminal.commands.map((item) => item.command.trim());
  if (commands.every((command) => command.length === 0)) {
    quality.issues.push("Diagnostic terminal commands are empty.");
  }
  if (commands.length > 0 && commands.every((command) => hasPlaceholderOnlyCommand(command))) {
    quality.issues.push("Diagnostic terminal commands are placeholder-only.");
  }

  for (const command of commands) {
    if (isPlaceholderCommand(command)) {
      quality.issues.push(`Diagnostic terminal command is a placeholder: ${command || "(empty)"}.`);
    }
  }

  const promptLooksTechnical = /\b(api|dns|sql|database|gateway|network|server|token|sso|terraform|kubernetes|deployment|endpoint|firewall|auth|login)\b/i.test(
    `${result.originalPrompt ?? ""} ${result.title} ${result.summary}`
  );
  if (terminal.shell === "generic" && promptLooksTechnical) {
    quality.warnings.push("Diagnostic terminal shell is generic for a technical prompt.");
  }

  const quickTestCommands = new Set(
    (result.quickTests ?? []).flatMap((test) => test.commands.map((command) => command.trim()))
  );
  if (
    quickTestCommands.size > 0 &&
    !commands.some((command) => quickTestCommands.has(command))
  ) {
    quality.warnings.push("Diagnostic terminal commands do not correspond to any quick test.");
  }

  return finalize(quality);
}

function validateEnvironmentComparisonQuality(
  comparison: EnvironmentComparison | undefined
): QualityValidationResult {
  const quality = emptyResult();

  if (!comparison) return finalize(quality);

  if (comparison.rows.length < 1) {
    quality.issues.push("Environment comparison exists but has no rows.");
    return finalize(quality);
  }

  if (comparison.rows.every((row) => row.status === "unknown")) {
    quality.warnings.push("Environment comparison rows are all unknown.");
  }

  for (const row of comparison.rows) {
    const left = row.leftValue.trim();
    const right = row.rightValue.trim();
    if (left === right && row.status === "mismatch") {
      quality.warnings.push(`Environment comparison marks identical values as mismatch: ${row.field}.`);
    }
    if (left !== right && row.status === "match") {
      quality.warnings.push(`Environment comparison marks different values as match: ${row.field}.`);
    }
  }

  return finalize(quality);
}

export function validateFixResultQuality(
  result: FixWorkspaceResult
): QualityValidationResult {
  const quality = emptyResult();

  if (!result.diagnosis) {
    quality.issues.push("Diagnosis is missing.");
  } else {
    if (isGenericTitle(result.diagnosis.title)) {
      quality.issues.push("Diagnosis title is generic.");
    }
    if (result.diagnosis.title.trim().length < 8) {
      quality.issues.push("Diagnosis title is empty or too short.");
    }
    if (result.diagnosis.title.trim().length > 80) {
      quality.warnings.push("Diagnosis title is longer than 80 characters.");
    }
    if (/\b(issue|diagnosis|path)\s+\1\b/i.test(result.diagnosis.title)) {
      quality.warnings.push("Diagnosis title contains repeated generic words.");
    }
    if (/\bdiagnosis$/i.test(result.diagnosis.title.trim())) {
      quality.warnings.push("Diagnosis title ends with Diagnosis.");
    }
    if (result.diagnosis.answer.trim().length < 40) {
      quality.issues.push("Diagnosis answer is empty or too short.");
    }
    if (isGenericText(result.diagnosis.answer)) {
      quality.warnings.push("Diagnosis answer is overly generic.");
    }
    if (isGenericGeneratedText(result.diagnosis.answer)) {
      quality.issues.push("Diagnosis answer contains generic generated process language.");
    }
  }

  if (!result.issueMap) {
    quality.issues.push("Issue map is missing.");
  } else {
    mergeQuality(quality, validateIssueMapQuality(result.issueMap));
  }

  const failureBranches = result.failureBranches ?? [];
  if (isCloudAccessDeniedPrompt(result) && failureBranches.length < 1) {
    quality.issues.push("Cloud access denied result requires failure branches.");
  }
  if (isAzureStorageAccessDeniedPrompt(result)) {
    if (failureBranches.length < 3) {
      quality.issues.push("Azure Storage access denied result requires at least three failure branches.");
    }
    const branchText = failureBranches
      .map((branch) => `${branch.title} ${branch.summary} ${branch.signals.join(" ")} ${branch.checks.join(" ")}`)
      .join(" ")
      .toLowerCase();
    if (!/(rbac|role assignment|data-plane|data plane|permission)/.test(branchText)) {
      quality.issues.push("Azure Storage access denied result requires an RBAC/data-plane permission branch.");
    }
    if (!/(network|firewall|private endpoint|dns)/.test(branchText)) {
      quality.issues.push("Azure Storage access denied result requires a network/private endpoint branch.");
    }
  }

  const quickTests = result.quickTests ?? [];
  if (quickTests.length < 1) {
    quality.issues.push("At least one quick test is required.");
  } else {
    if (quickTests.every((test) => test.commands.length === 0)) {
      quality.issues.push("Every quick test is missing commands or validation instructions.");
    }
    if (quickTests.every((test) => isGenericText(test.title) || isGenericTitle(test.title))) {
      quality.issues.push("All quick test titles are generic.");
    }

    for (const test of quickTests) {
      if (
        isBlank(test.title) ||
        isBlank(test.purpose) ||
        isBlank(test.successSignal) ||
        isBlank(test.failureMeaning)
      ) {
        quality.issues.push(`Quick test has empty required fields: ${test.id || test.title || "unknown"}.`);
      }
      if (isGenericGeneratedText(test.purpose)) {
        quality.issues.push(`Quick test purpose contains generic generated process language: ${test.id || test.title}.`);
      }
      if (isGenericGeneratedText(test.successSignal)) {
        quality.issues.push(`Quick test success signal contains generic generated process language: ${test.id || test.title}.`);
      }
      if (isGenericGeneratedText(test.failureMeaning)) {
        quality.issues.push(`Quick test failure meaning contains generic generated process language: ${test.id || test.title}.`);
      }
    }

    const allCommands = quickTests.flatMap((test) => test.commands);
    if (allCommands.length > 0 && allCommands.every((command) => hasPlaceholderOnlyCommand(command))) {
      quality.issues.push("All quick test commands are placeholder-only.");
    }
    if (allCommands.length > 0 && allCommands.every((command) => isPlaceholderCommand(command))) {
      quality.warnings.push("Quick test commands are all generic placeholders.");
    }
  }

  if (failureBranches.length > 0) {
    const highMediumBranches = failureBranches.filter(
      (branch) => branch.priority === "high" || branch.priority === "medium"
    );
    if (quickTests.length < highMediumBranches.length) {
      quality.issues.push("Quick tests must cover each high or medium priority failure branch.");
    }
  }

  if (isAzureStorageAccessDeniedPrompt(result)) {
    const quickTestText = quickTests
      .map((test) => `${test.title} ${test.purpose} ${test.commands.join(" ")}`)
      .join(" ")
      .toLowerCase();
    if (!/(rbac|role assignment|data-plane|data plane|permission)/.test(quickTestText)) {
      quality.issues.push("Azure Storage access denied quick tests require an RBAC/data-plane check.");
    }
    if (!/(network|firewall|private endpoint|dns)/.test(quickTestText)) {
      quality.issues.push("Azure Storage access denied quick tests require a network or private endpoint check.");
    }
    const branchText = failureBranches
      .map((branch) => `${branch.title} ${branch.summary}`)
      .join(" ")
      .toLowerCase();
    if (/(sas|shared access signature)/.test(branchText) && !/(sas|shared access signature)/.test(quickTestText)) {
      quality.issues.push("SAS failure branch requires a SAS validation quick test.");
    }
  }

  if (isCloudAccessDeniedPrompt(result) && !result.causalGraph) {
    quality.warnings.push("Cloud access denied result is missing a causal graph.");
  }
  if (isAzureStorageAccessDeniedPrompt(result)) {
    if (!result.causalGraph) {
      quality.warnings.push("Azure Storage access denied result is missing a causal graph.");
    } else {
      if (result.causalGraph.nodes.length < 5) {
        quality.warnings.push("Azure Storage causal graph has fewer than five nodes.");
      }
      if (!result.causalGraph.nodes.some((node) => node.kind === "failure")) {
        quality.warnings.push("Azure Storage causal graph has no failure node.");
      }
    }
  }

  const decisionPath = result.decisionPath ?? [];
  if (decisionPath.length < 2) {
    quality.issues.push("Decision path must include at least two branches.");
  }

  for (const item of decisionPath) {
    if (isBlank(item.condition) || isBlank(item.meaning) || isBlank(item.nextAction)) {
      quality.issues.push(`Decision path item has empty required fields: ${item.id || "unknown"}.`);
    }
  }

  if (
    decisionPath.length > 0 &&
    decisionPath.every((item) =>
      genericConditionPatterns.some((pattern) => pattern.test(item.condition.trim()))
    )
  ) {
    quality.warnings.push("Decision path conditions are all generic.");
  }

  if (!result.pathUpdate) {
    quality.issues.push("Path update is missing.");
  } else {
    if (isBlank(result.pathUpdate.title)) quality.issues.push("Path update title is empty.");
    if (isBlank(result.pathUpdate.description)) quality.issues.push("Path update description is empty.");
    if (isGenericGeneratedText(result.pathUpdate.description)) {
      quality.issues.push("Path update description contains generic generated process language.");
    }
    if (isBlank(result.pathUpdate.nextBestAction.title)) {
      quality.issues.push("Next best action title is empty.");
    }
    if (isBlank(result.pathUpdate.nextBestAction.description)) {
      quality.issues.push("Next best action description is empty.");
    }
    if (isGenericGeneratedText(result.pathUpdate.nextBestAction.description)) {
      quality.issues.push("Next best action description contains generic generated process language.");
    }
    if (isGenericText(result.pathUpdate.nextBestAction.title)) {
      quality.warnings.push("Next best action title is too generic.");
    }
  }

  mergeQuality(quality, validateDiagnosticTerminalQuality(result.diagnosticTerminal, result));

  const scratchpad = result.scratchpad ?? [];
  if (scratchpad.length < 1) {
    quality.warnings.push("Scratchpad is empty.");
  } else {
    const duplicatedValues = getDuplicateValues(scratchpad.map((item) => item.value.trim()));
    if (duplicatedValues.length > 0) {
      quality.warnings.push(`Scratchpad contains duplicated values: ${duplicatedValues.join(", ")}.`);
    }
    for (const item of scratchpad) {
      if (isPlaceholderValue(item.value)) {
        quality.warnings.push(`Scratchpad value looks like a placeholder: ${item.label}.`);
      }
    }
  }

  const timeline = result.timeline ?? [];
  if (timeline.length < 1) {
    quality.issues.push("Timeline must include at least one entry.");
  } else {
    if (isBlank(timeline[0].title) || isBlank(timeline[0].summary)) {
      quality.issues.push("First timeline entry is missing title or summary.");
    }
    if (timeline.every((entry) => isBlank(entry.timestampLabel))) {
      quality.warnings.push("Timeline entries have empty timestamp labels.");
    }
    if (!timeline.some((entry) => entry.type === "initial_diagnosis")) {
      quality.warnings.push("Timeline does not include an initial diagnosis entry.");
    }
  }

  const artifacts = result.artifacts ?? [];
  if (artifacts.length < 1) {
    quality.issues.push("At least one artifact action is required.");
  } else {
    if (artifacts.some((artifact) => isBlank(artifact.label))) {
      quality.warnings.push("One or more artifact labels are empty.");
    }
    if (!artifacts.some((artifact) => artifact.type === "ticket_update" || artifact.type === "runbook")) {
      quality.warnings.push("No ticket update or runbook artifact action exists.");
    }
  }

  mergeQuality(
    quality,
    validateEnvironmentComparisonQuality(result.environmentComparison)
  );

  const genericContentFields = getGenericGeneratedContentFields(result);
  if (genericContentFields.length > 0) {
    quality.issues.push(
      `Generic generated content detected in: ${genericContentFields.join(", ")}.`
    );
  }

  return finalize(quality);
}

export function validateUnderstandResultQuality(result: RedefinedResult): QualityValidationResult {
  const quality = emptyResult();

  if (!result.title || result.title.trim().length < 3) {
    quality.issues.push("Understand result title is missing or too short.");
  }

  if (!result.summary || result.summary.trim().length < 20) {
    quality.issues.push("Understand result summary is missing or too short.");
  } else {
    const summaryLower = result.summary.toLowerCase().trim();
    const titleLower = (result.title || "").toLowerCase().trim();
    const isDictionaryLike = 
      summaryLower.startsWith(`${titleLower} is `) ||
      summaryLower.startsWith(`${titleLower} refers to`) ||
      summaryLower.startsWith(`${titleLower} means`) ||
      summaryLower.startsWith(`refers to `) ||
      summaryLower.startsWith(`is defined as`) ||
      /^[a-zA-Z0-9\s]+:\s/.test(result.summary);
    if (isDictionaryLike) {
      quality.issues.push("Understand summary is generic or dictionary-like.");
    }
  }

  const mentalModel = result.mentalModel;
  if (!mentalModel || mentalModel.steps.length < 4) {
    quality.issues.push("Mental model must have at least 4 steps.");
  } else {
    const genericSteps = mentalModel.steps.filter((s) => /^step\s*\d+$/i.test(s.label.trim()));
    if (genericSteps.length > 0) {
      quality.issues.push("Mental model has generic step labels.");
    }
  }

  const blocks = result.coreBuildingBlocks ?? [];
  if (blocks.length < 4) {
    quality.issues.push("Core building blocks must have at least 4 items.");
  }
  if (blocks.length > 0 && blocks.every((b) => b.description.trim().length < 10)) {
    quality.warnings.push("All building block descriptions are very short.");
  }

  const misconceptions = result.misconceptions ?? [];
  if (misconceptions.length < 2) {
    quality.issues.push("Misconceptions must have at least 2 items.");
  }

  const example = result.realWorldExample;
  if (!example || !example.scenario || !example.explanation) {
    quality.warnings.push("Real world example is incomplete.");
  }

  const questions = result.decisionQuestions ?? [];
  if (questions.length < 2) {
    quality.warnings.push("Fewer than 2 decision questions provided.");
  }

  const actions = result.nextActions ?? [];
  if (actions.length < 3) {
    quality.issues.push("Next actions must have at least 3 actions.");
  }

  if (!result.analogySwitcher || result.analogySwitcher.analogies.length < 3) {
    quality.issues.push("Analogy switcher must have at least 3 analogies.");
  } else {
    const missingExplanations = result.analogySwitcher.analogies.filter((a) => !a.explanation.trim());
    if (missingExplanations.length > 0) {
      quality.issues.push("Some analogies are missing explanations.");
    }
  }

  if (!result.blindSpot) {
    quality.issues.push("Blind spot is missing.");
  }

  if (!result.conceptConfidenceMap || result.conceptConfidenceMap.items.length < 4) {
    quality.issues.push("Concept confidence map must have at least 4 items.");
  } else {
    const allSame = result.conceptConfidenceMap.items.every(
      (item) => item.confidence === result.conceptConfidenceMap!.items[0].confidence
    );
    if (allSame && result.conceptConfidenceMap.items.length > 1) {
      quality.warnings.push("All confidence map items have identical scores.");
    }
  }

  if (!result.thinkingSparks || result.thinkingSparks.length < 4) {
    quality.issues.push("Thinking sparks must have at least 4 prompts.");
  }

  if (!result.teachBack) {
    quality.issues.push("Teach-back is missing.");
  } else if (!result.teachBack.challenge.trim()) {
    quality.issues.push("Teach-back challenge is empty.");
  }

  if (!result.shareableInsight) {
    quality.issues.push("Shareable insight is missing.");
  } else if (!result.shareableInsight.insight.trim()) {
    quality.issues.push("Shareable insight text is empty.");
  }

  if (result.resultGuide) {
    if (result.resultGuide.refinementOptions.length === 0) {
      quality.warnings.push("Result guide has no refinement options.");
    }
  }

  // Content contains Fix-only terms check
  const fullText = JSON.stringify(result).toLowerCase();
  
  // Terms: diagnosis, failure branch, diagnostic terminal, logs, evidence, root cause
  const fixOnlyTerms = [
    "diagnosis",
    "failure branch",
    "diagnostic terminal",
    "logs",
    "evidence",
    "root cause"
  ];
  const foundFixTerms = fixOnlyTerms.filter(term => {
    const regex = new RegExp(`\\b${term}s?\\b`, "i");
    return regex.test(fullText);
  });
  if (foundFixTerms.length > 0) {
    quality.issues.push(`Content contains Fix-only terms: ${foundFixTerms.join(", ")}.`);
  }

  // Reject generic phrases
  const genericPhrases = [
    "this concept is important",
    "it depends on context",
    "you should understand the basics",
    "a key concept in this field",
    "this is used in many situations"
  ];
  const foundGenericPhrases = genericPhrases.filter(phrase => fullText.includes(phrase));
  if (foundGenericPhrases.length > 0) {
    quality.issues.push(`Content contains rejected generic phrases: "${foundGenericPhrases.join('", "')}".`);
  }

  // Domain checks
  const domainLower = (result.domain || "").toLowerCase().trim();
  if (domainLower === "business") {
    const keywords = ["customer", "market", "value", "trade-off", "choice", "advantage", "revenue", "execution"];
    if (!keywords.some(k => fullText.includes(k))) {
      quality.issues.push("Business domain result must mention at least one of: customer, market, value, trade-off, choice, advantage, revenue, execution.");
    }
  } else if (domainLower === "cloud") {
    const keywords = ["resource", "network", "identity", "policy", "configuration", "dependency", "validation"];
    if (!keywords.some(k => fullText.includes(k))) {
      quality.issues.push("Cloud domain result must mention at least one of: resource, network, identity, policy, configuration, dependency, validation.");
    }
  } else if (domainLower === "finance") {
    const keywords = ["money flow", "revenue", "cost", "timing", "risk", "cash", "margin", "decision impact"];
    if (!keywords.some(k => fullText.includes(k))) {
      quality.issues.push("Finance domain result must mention at least one of: money flow, revenue, cost, timing, risk, cash, margin, decision impact.");
    }
  }

  return finalize(quality);
}

export function validateFollowUpQuality(
  followUp: FollowUpResult,
  currentResult: FixWorkspaceResult
): QualityValidationResult {
  const quality = emptyResult();

  if (isBlank(followUp.updatedDiagnosis.title)) {
    quality.issues.push("Follow-up diagnosis title is empty.");
  }
  if (isBlank(followUp.updatedDiagnosis.answer)) {
    quality.issues.push("Follow-up diagnosis answer is empty.");
  }
  if (isBlank(followUp.nextBestAction.title)) {
    quality.issues.push("Follow-up next best action title is empty.");
  }
  if (isBlank(followUp.nextBestAction.description)) {
    quality.issues.push("Follow-up next best action description is empty.");
  }

  const knownNodeIds = new Set((currentResult.issueMap?.nodes ?? []).map((node) => node.id));
  for (const update of followUp.issueMapUpdates) {
    if (!knownNodeIds.has(update.nodeId)) {
      quality.issues.push(`Follow-up issue map update references unknown node ID: ${update.nodeId}.`);
    }
  }

  if (followUp.timelineEntries.length < 1) {
    quality.issues.push("Follow-up must include at least one timeline entry.");
  }

  const duplicateScratchpadIds = getDuplicateValues(
    followUp.scratchpadUpdates.map((item) => item.id)
  );
  if (duplicateScratchpadIds.length > 0) {
    quality.issues.push(`Follow-up scratchpad updates contain duplicate IDs: ${duplicateScratchpadIds.join(", ")}.`);
  }

  if (followUp.issueMapUpdates.length < 1) {
    quality.warnings.push("Follow-up did not include issue map updates.");
  }
  if (followUp.scratchpadUpdates.length < 1) {
    quality.warnings.push("Follow-up did not include scratchpad updates.");
  }

  const changesSomething =
    followUp.issueMapUpdates.length > 0 ||
    followUp.scratchpadUpdates.length > 0 ||
    Boolean(followUp.diagnosticTerminal) ||
    Boolean(followUp.environmentComparison) ||
    followUp.resolved === true ||
    followUp.updatedDiagnosis.title !== currentResult.diagnosis?.title ||
    followUp.updatedDiagnosis.answer !== currentResult.diagnosis?.answer ||
    followUp.nextBestAction.title !== currentResult.pathUpdate?.nextBestAction.title ||
    followUp.nextBestAction.description !== currentResult.pathUpdate?.nextBestAction.description;
  if (!changesSomething) {
    quality.warnings.push("Follow-up does not change anything meaningful.");
  }

  if (followUp.diagnosticTerminal && followUp.diagnosticTerminal.commands.length < 1) {
    quality.warnings.push("Follow-up diagnostic terminal exists but has no commands.");
  }
  if (followUp.environmentComparison && followUp.environmentComparison.rows.length < 1) {
    quality.warnings.push("Follow-up environment comparison exists but has no rows.");
  }

  return finalize(quality);
}
