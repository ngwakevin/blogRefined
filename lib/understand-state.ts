import type {
  RedefinedResult,
  UnderstandDepth,
  UnderstandDepthProfile,
  UnderstandNextAction,
  UnderstandRating,
  UnderstandState
} from "@/lib/redefined";

export const UNDERSTAND_STATE_KEY_PREFIX = "docredefined.understand";

export function createDefaultUnderstandState(result?: RedefinedResult): UnderstandState {
  return {
    selectedDepth: "practitioner",
    anchorContext: "new_to_this",
    customAnchorContext: "",
    traceStepIndex: 0,
    selectedMentalModelNode: result?.mentalModel?.flow?.[0]?.id ?? result?.mentalModel?.steps?.[0]?.id,
    isTracePlaying: false,
    scenarioMode: false,
    blockConfidence: {},
    misconceptionAnswers: {},
    recallAnswers: {},
    recallRatings: {},
    teachBackAnswer: "",
    selectedComparisonId: result?.compareWith?.[0]?.id
  };
}

export function getUnderstandStateStorageKey(workspaceId: string): string {
  return `${UNDERSTAND_STATE_KEY_PREFIX}.${workspaceId}`;
}

function isRating(value: unknown): value is UnderstandRating {
  return value === "solid" || value === "fuzzy" || value === "lost";
}

export function validateUnderstandState(value: unknown, result?: RedefinedResult): UnderstandState | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const base = createDefaultUnderstandState(result);
  const depths = ["eli5", "practitioner", "expert"];
  const anchors = ["new_to_this", "networking", "web_development", "azure", "security", "databases", "custom"];
  const ratingRecord = (candidate: unknown): Record<string, UnderstandRating> => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return {};
    return Object.fromEntries(Object.entries(candidate).filter((entry): entry is [string, UnderstandRating] => isRating(entry[1])));
  };
  const booleanRecord = (candidate: unknown): Record<string, boolean> => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return {};
    return Object.fromEntries(Object.entries(candidate).filter((entry): entry is [string, boolean] => typeof entry[1] === "boolean"));
  };
  const stringRecord = (candidate: unknown): Record<string, string> => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return {};
    return Object.fromEntries(Object.entries(candidate).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  };
  return {
    ...base,
    selectedDepth: depths.includes(raw.selectedDepth as string) ? raw.selectedDepth as UnderstandDepth : base.selectedDepth,
    anchorContext: anchors.includes(raw.anchorContext as string)
      ? raw.anchorContext as UnderstandState["anchorContext"]
      : base.anchorContext,
    customAnchorContext: typeof raw.customAnchorContext === "string" ? raw.customAnchorContext : "",
    traceStepIndex: typeof raw.traceStepIndex === "number" && Number.isInteger(raw.traceStepIndex)
      ? Math.max(0, raw.traceStepIndex)
      : 0,
    selectedMentalModelNode: typeof raw.selectedMentalModelNode === "string" ? raw.selectedMentalModelNode : base.selectedMentalModelNode,
    isTracePlaying: raw.isTracePlaying === true,
    scenarioMode: raw.scenarioMode === true,
    blockConfidence: ratingRecord(raw.blockConfidence),
    misconceptionAnswers: booleanRecord(raw.misconceptionAnswers),
    recallAnswers: stringRecord(raw.recallAnswers),
    recallRatings: ratingRecord(raw.recallRatings),
    teachBackAnswer: typeof raw.teachBackAnswer === "string" ? raw.teachBackAnswer : "",
    teachBackFeedback: raw.teachBackFeedback && typeof raw.teachBackFeedback === "object"
      ? raw.teachBackFeedback as UnderstandState["teachBackFeedback"]
      : undefined,
    selectedComparisonId: typeof raw.selectedComparisonId === "string" ? raw.selectedComparisonId : base.selectedComparisonId
  };
}

export function cleanUnderstandState(state: UnderstandState, result: RedefinedResult): UnderstandState {
  const blocks = new Set((result.buildingBlocks ?? result.coreBuildingBlocks ?? []).map((item) => item.id));
  const misconceptions = new Set((result.commonMisunderstandings ?? []).map((item) => item.id));
  const recall = new Set((result.checkYourUnderstanding ?? []).map((item) => item.id));
  const flow = result.mentalModel?.flow ?? result.mentalModel?.steps ?? [];
  const flowIds = new Set(flow.map((item) => item.id));
  const comparisons = new Set((result.compareWith ?? []).map((item) => item.id));
  const filter = <T>(items: Record<string, T>, ids: Set<string>): Record<string, T> =>
    Object.fromEntries(Object.entries(items).filter(([id]) => ids.has(id)));
  const traceStepIndex = Math.min(Math.max(0, state.traceStepIndex), Math.max(0, flow.length - 1));
  return {
    ...state,
    traceStepIndex,
    selectedMentalModelNode: state.selectedMentalModelNode && flowIds.has(state.selectedMentalModelNode)
      ? state.selectedMentalModelNode
      : flow[traceStepIndex]?.id,
    isTracePlaying: flow.length > 0 && traceStepIndex < flow.length - 1 ? state.isTracePlaying : false,
    blockConfidence: filter(state.blockConfidence, blocks),
    misconceptionAnswers: filter(state.misconceptionAnswers, misconceptions),
    recallAnswers: filter(state.recallAnswers, recall),
    recallRatings: filter(state.recallRatings, recall),
    selectedComparisonId: state.selectedComparisonId && comparisons.has(state.selectedComparisonId)
      ? state.selectedComparisonId
      : result.compareWith?.[0]?.id
  };
}

export function loadUnderstandState(workspaceId: string | undefined, result: RedefinedResult): UnderstandState {
  const fallback = createDefaultUnderstandState(result);
  if (!workspaceId || typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(getUnderstandStateStorageKey(workspaceId));
    if (!raw) return fallback;
    return cleanUnderstandState(validateUnderstandState(JSON.parse(raw), result) ?? fallback, result);
  } catch {
    return fallback;
  }
}

export function saveUnderstandState(workspaceId: string | undefined, state: UnderstandState): boolean {
  if (!workspaceId || typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(getUnderstandStateStorageKey(workspaceId), JSON.stringify({
      ...state,
      isTracePlaying: false
    }));
    return true;
  } catch {
    return false;
  }
}

export function updateBlockConfidence(
  state: UnderstandState,
  result: RedefinedResult,
  blockId: string,
  rating: UnderstandRating
): UnderstandState {
  const validIds = new Set((result.buildingBlocks ?? result.coreBuildingBlocks ?? []).map((item) => item.id));
  if (!validIds.has(blockId)) return state;
  return { ...state, blockConfidence: { ...state.blockConfidence, [blockId]: rating } };
}

export function getMasterySummary(result: RedefinedResult, state: UnderstandState) {
  const blocks = result.buildingBlocks ?? result.coreBuildingBlocks ?? [];
  const solidCount = blocks.filter((block) => state.blockConfidence[block.id] === "solid").length;
  const fuzzyCount = blocks.filter((block) => state.blockConfidence[block.id] === "fuzzy").length;
  const lostCount = blocks.filter((block) => state.blockConfidence[block.id] === "lost").length;
  const unratedCount = Math.max(0, blocks.length - solidCount - fuzzyCount - lostCount);
  return {
    totalBlocks: blocks.length,
    solidCount,
    fuzzyCount,
    lostCount,
    unratedCount,
    masteryPercent: blocks.length ? Math.round((solidCount / blocks.length) * 100) : 0
  };
}

export function getWeakestBlock(result: RedefinedResult, state: UnderstandState) {
  const blocks = result.buildingBlocks ?? result.coreBuildingBlocks ?? [];
  return blocks.find((block) => state.blockConfidence[block.id] === "lost")
    ?? blocks.find((block) => state.blockConfidence[block.id] === "fuzzy")
    ?? blocks.find((block) => !state.blockConfidence[block.id]);
}

export function getDepthContent(result: RedefinedResult, depth: UnderstandDepth): UnderstandDepthProfile {
  const profile = result.depthProfiles?.[depth];
  if (profile) return profile;
  return {
    summary: result.summary || result.conceptSnapshot?.oneLineMeaning || "",
    analogy: result.mentalModel?.analogy,
    example: result.practicalExample?.scenario || result.practicalExample?.outcome
  };
}

export function getAdaptiveNextAction(result: RedefinedResult, state: UnderstandState): UnderstandNextAction {
  const mastery = getMasterySummary(result, state);
  const weakest = getWeakestBlock(result, state);
  if (mastery.lostCount >= 2) {
    return {
      label: weakest ? `Review ${weakest.title} in ELI5 mode` : "Switch to ELI5",
      targetMode: "understand",
      prompt: `Explain ${weakest?.title ?? result.title} in ELI5 terms.`
    };
  }
  if (mastery.fuzzyCount >= 2) {
    const comparison = result.compareWith?.[0];
    return comparison
      ? { label: `Compare with ${comparison.concept}`, targetMode: "understand", prompt: comparison.summary }
      : { label: "Replay the mental model", targetMode: "understand", prompt: `Trace ${result.title} step by step.` };
  }
  if (Object.values(state.recallRatings).some((rating) => rating === "lost" || rating === "fuzzy")) {
    return { label: "Retry active recall", targetMode: "understand", prompt: `Test me again on ${result.title}.` };
  }
  if (mastery.totalBlocks > 0 && mastery.solidCount >= Math.ceil(mastery.totalBlocks * 0.75)) {
    return result.whereToGoNext?.find((action) => action.targetMode !== "understand")
      ?? { label: `Build with ${result.title}`, targetMode: "build", prompt: `Build a practical example using ${result.title}.` };
  }
  return { label: "Run the mental model trace", targetMode: "understand", prompt: `Trace how ${result.title} works.` };
}

export function getNextTraceIndex(index: number, flowLength: number): number {
  if (flowLength <= 0) return 0;
  return Math.min(flowLength - 1, Math.max(0, index + 1));
}

export function startScenarioTrace(state: UnderstandState): UnderstandState {
  return { ...state, traceStepIndex: 0, isTracePlaying: true, scenarioMode: true };
}

export function keywordCoverage(answer: string, expectedKeywords?: string[]): number | undefined {
  if (!expectedKeywords?.length) return undefined;
  const normalized = answer.toLowerCase();
  const matches = expectedKeywords.filter((keyword) => normalized.includes(keyword.toLowerCase())).length;
  return Math.round((matches / expectedKeywords.length) * 100);
}
