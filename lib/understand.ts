import type {
  RedefinedResult,
  UnderstandBuildingBlock,
  UnderstandComparison,
  UnderstandMentalModelStep,
  UnderstandMisconceptionTrap,
  UnderstandNextAction,
  UnderstandRecallQuestion
} from "@/lib/redefined";

const FOREIGN_FIELDS = [
  "diagnosticTerminal",
  "failureBranches",
  "incidentBrief",
  "ticketUpdate",
  "implementationPhases",
  "artifactPreview",
  "exportSurface",
  "diagnosis",
  "issueMap",
  "quickTests",
  "evidenceBranches",
  "scratchpad",
  "pathUpdate",
  "causalGraph"
] as const;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 36);
}

function stableId(prefix: string, name: string, index: number): string {
  const middle = slug(name);
  return middle ? `${prefix}-${middle}-${index}` : `${prefix}-${index}`;
}

function normalizeFlow(source: Record<string, unknown>, title: string): UnderstandMentalModelStep[] {
  const mental = record(source.mentalModel);
  const rawFlow = Array.isArray(mental.flow)
    ? mental.flow
    : Array.isArray(mental.steps)
      ? mental.steps
      : [];
  const flow = rawFlow.filter((item) => item && typeof item === "object").map((item, index) => {
    const node = record(item);
    const label = text(node.label ?? node.title ?? node.name, `Step ${index + 1}`);
    const description = text(node.description ?? node.whatHappens);
    return {
      id: text(node.id, stableId("mental-node", label, index)),
      label,
      description: description || undefined,
      whatHappens: text(node.whatHappens, description) || undefined,
      whyItExists: text(node.whyItExists, description || label) || undefined,
      whatIsPassed: text(node.whatIsPassed) || undefined,
      commonFailure: text(node.commonFailure) || undefined
    };
  });
  if (flow.length > 0) return flow;
  return [
    ["Input", `A question or need introduces ${title}.`],
    ["Mechanism", `The core parts of ${title} interact.`],
    ["Decision", "Rules and context determine the behavior."],
    ["Outcome", `${title} produces a practical result.`]
  ].map(([label, description], index) => ({
    id: stableId("mental-node", label, index),
    label,
    description,
    whatHappens: description,
    whyItExists: description
  }));
}

function normalizeBlocks(source: Record<string, unknown>, title: string): UnderstandBuildingBlock[] {
  const raw = Array.isArray(source.buildingBlocks)
    ? source.buildingBlocks
    : Array.isArray(source.coreBuildingBlocks)
      ? source.coreBuildingBlocks
      : [];
  const blocks = raw.filter((item) => item && typeof item === "object").map((item, index) => {
    const block = record(item);
    const blockTitle = text(block.title ?? block.name, `Building block ${index + 1}`);
    return {
      ...block,
      id: text(block.id, stableId("block", blockTitle, index)),
      title: blockTitle,
      description: text(block.description, `A core part of ${title}.`)
    } as UnderstandBuildingBlock;
  });
  if (blocks.length > 0) return blocks;
  return ["Purpose", "Inputs", "Mechanism", "Outcome"].map((name, index) => ({
    id: stableId("block", name, index),
    title: name,
    description: `${name} is a core part of understanding ${title}.`,
    blockType: index === 1 ? "input" : index === 2 ? "mechanism" : "concept"
  }));
}

function normalizeMisconceptions(source: Record<string, unknown>): UnderstandMisconceptionTrap[] {
  const raw = Array.isArray(source.commonMisunderstandings)
    ? source.commonMisunderstandings
    : Array.isArray(source.misconceptions)
      ? source.misconceptions
      : [];
  return raw.filter((item) => item && typeof item === "object").map((item, index) => {
    const misconception = record(item);
    const myth = text(misconception.myth ?? misconception.misconception ?? misconception.statement);
    const reality = text(misconception.reality ?? misconception.explanation);
    const statement = text(misconception.statement, myth);
    return {
      id: text(misconception.id, stableId("misconception", statement, index)),
      statement,
      correctAnswer: typeof misconception.correctAnswer === "boolean"
        ? misconception.correctAnswer
        : false,
      explanation: text(misconception.explanation, reality),
      myth: myth || undefined,
      reality: reality || undefined
    };
  }).filter((item) => item.statement);
}

function normalizeRecall(source: Record<string, unknown>): UnderstandRecallQuestion[] {
  const raw = Array.isArray(source.checkYourUnderstanding)
    ? source.checkYourUnderstanding
    : [];
  return raw.filter((item) => item && typeof item === "object").map((item, index) => {
    const recall = record(item);
    const question = text(recall.question ?? recall.prompt, `Recall question ${index + 1}`);
    return {
      id: text(recall.id, stableId("recall", question, index)),
      question,
      expectedKeywords: Array.isArray(recall.expectedKeywords)
        ? recall.expectedKeywords.filter((word): word is string => typeof word === "string")
        : undefined
    };
  });
}

function normalizeComparisons(source: Record<string, unknown>): UnderstandComparison[] {
  if (!Array.isArray(source.compareWith)) return [];
  return source.compareWith.filter((item) => item && typeof item === "object").map((item, index) => {
    const comparison = record(item);
    const concept = text(comparison.concept ?? comparison.title ?? comparison.name, `Comparison ${index + 1}`);
    return {
      id: text(comparison.id, stableId("comparison", concept, index)),
      concept,
      summary: text(comparison.summary, `How this differs from ${concept}.`),
      similarities: Array.isArray(comparison.similarities)
        ? comparison.similarities.filter((value): value is string => typeof value === "string")
        : undefined,
      differences: Array.isArray(comparison.differences)
        ? comparison.differences.filter((value): value is string => typeof value === "string")
        : [],
      whenToUse: text(comparison.whenToUse) || undefined
    };
  });
}

export function normalizeUnderstandResult(raw: unknown, originalPrompt = ""): RedefinedResult {
  const source = record(raw);
  const prompt = text(source.originalPrompt, originalPrompt);
  const title = text(source.title, prompt || "Understand this concept");
  const summary = text(source.summary, `Learn how ${title} works, why it matters, and how to apply it.`);
  const flow = normalizeFlow(source, title);
  const blocks = normalizeBlocks(source, title);
  const traps = normalizeMisconceptions(source);
  const completeTraps = traps.length ? traps : [
    {
      id: "misconception-0",
      statement: `${title} works the same way in every context.`,
      correctAnswer: false,
      explanation: "Its behavior depends on inputs, constraints, and the surrounding system."
    },
    {
      id: "misconception-1",
      statement: `Knowing the definition of ${title} is enough to apply it.`,
      correctAnswer: false,
      explanation: "Application requires tracing the mechanism and recognizing its trade-offs."
    }
  ];
  const recall = normalizeRecall(source);
  const completeRecall = recall.length ? recall : [
    { id: "recall-0", question: `What problem does ${title} solve?` },
    { id: "recall-1", question: `Trace ${title} from input to outcome.` }
  ];
  const comparisons = normalizeComparisons(source);
  const realWorld = record(source.realWorldExample);
  const practical = record(source.practicalExample);
  const snapshot = record(source.conceptSnapshot);
  const mental = record(source.mentalModel);
  const parsedNextActions = (Array.isArray(source.whereToGoNext)
    ? source.whereToGoNext
    : Array.isArray(source.nextActions)
      ? source.nextActions
      : []) as UnderstandNextAction[];
  const nextActions = parsedNextActions.length ? parsedNextActions : [
    { label: "Apply it in a small build", targetMode: "build", prompt: `Build a small example using ${title}.` },
    { label: "Test a failure case", targetMode: "fix", prompt: `Diagnose a common failure involving ${title}.` },
    { label: "Create a reference", targetMode: "artifact", prompt: `Create a concise reference guide for ${title}.` }
  ] satisfies UnderstandNextAction[];

  const normalized: Record<string, unknown> = {
    ...source,
    id: text(source.id, stableId("understand", title, 0)),
    mode: "understand",
    originalPrompt: prompt,
    title,
    summary,
    domain: text(source.domain, "general"),
    classification: {
      ...record(source.classification),
      mode: "understand",
      confidence: typeof record(source.classification).confidence === "number"
        ? record(source.classification).confidence
        : 0.5,
      source: text(record(source.classification).source, "fallback"),
      reason: text(record(source.classification).reason, "Normalized as an Understand result."),
      topic: text(record(source.classification).topic, title)
    },
    clarity: Object.keys(record(source.clarity)).length ? source.clarity : { level: "medium", score: 70 },
    conceptSnapshot: {
      oneLineMeaning: text(snapshot.oneLineMeaning, summary),
      whyItMatters: text(snapshot.whyItMatters, summary),
      keyIdea: text(snapshot.keyIdea) || undefined
    },
    depthProfiles: Object.keys(record(source.depthProfiles)).length ? source.depthProfiles : undefined,
    mentalModel: {
      ...mental,
      title: text(mental.title, `How ${title} works`),
      steps: flow,
      flow,
      analogy: text(mental.analogy) || undefined
    },
    coreBuildingBlocks: blocks,
    buildingBlocks: blocks,
    misconceptions: completeTraps.map((trap) => ({
      id: trap.id,
      misconception: trap.myth ?? trap.statement,
      reality: trap.reality ?? trap.explanation
    })),
    commonMisunderstandings: completeTraps,
    realWorldExample: {
      title: text(realWorld.title ?? practical.title, "Practical example"),
      scenario: text(realWorld.scenario ?? practical.scenario, `Apply ${title} in a realistic situation.`),
      explanation: text(realWorld.explanation ?? practical.outcome, `The result shows how ${title} changes the outcome.`)
    },
    practicalExample: {
      title: text(practical.title ?? realWorld.title, "Practical example"),
      scenario: text(practical.scenario ?? realWorld.scenario, `Apply ${title} in a realistic situation.`),
      steps: Array.isArray(practical.steps)
        ? practical.steps.filter((step): step is string => typeof step === "string")
        : undefined,
      outcome: text(practical.outcome ?? realWorld.explanation, `The scenario demonstrates ${title} in practice.`)
    },
    decisionQuestions: Array.isArray(source.decisionQuestions)
      ? source.decisionQuestions.filter((item): item is string => typeof item === "string")
      : [],
    checkYourUnderstanding: completeRecall,
    compareWith: comparisons,
    nextActions,
    whereToGoNext: nextActions,
    rail: Object.keys(record(source.rail)).length
      ? source.rail
      : {
          nextBestQuestion: nextActions[0]?.prompt ?? `Can you trace how ${title} works from input to outcome?`,
          relatedPrompts: nextActions.map((action) => action.prompt)
        },
    visualFlow: Array.isArray(source.visualFlow) ? source.visualFlow : flow.map((node) => node.label),
    sections: Array.isArray(source.sections) ? source.sections : [],
    actions: Array.isArray(source.actions) ? source.actions : []
  };

  for (const field of FOREIGN_FIELDS) delete normalized[field];
  return normalized as unknown as RedefinedResult;
}

export const UNDERSTAND_FOREIGN_FIELDS = [...FOREIGN_FIELDS];
