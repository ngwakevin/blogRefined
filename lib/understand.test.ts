import { describe, expect, it } from "vitest";
import type { RedefinedResult, UnderstandState } from "@/lib/redefined";
import { coerceResultToLens, detectForbiddenSections, resolveLensPath } from "@/lib/lens-contracts";
import { getUnderstandRepairPlan, validateUnderstandResultQuality } from "@/lib/quality";
import {
  cleanUnderstandState,
  createDefaultUnderstandState,
  getAdaptiveNextAction,
  getDepthContent,
  getMasterySummary,
  getWeakestBlock,
  updateBlockConfidence,
  validateUnderstandState
} from "@/lib/understand-state";
import { normalizeUnderstandResult } from "@/lib/understand";

function enhancedResult(overrides: Partial<RedefinedResult> = {}): RedefinedResult {
  return normalizeUnderstandResult({
    id: "understand-oauth",
    mode: "understand",
    originalPrompt: "Explain OAuth authorization code flow for a backend developer",
    title: "OAuth authorization code flow",
    summary: "A browser delegates authorization while the backend exchanges a short-lived code for tokens, keeping credentials away from the client. This matters because identity boundaries and token handling determine application security.",
    domain: "security",
    conceptSnapshot: {
      oneLineMeaning: "A delegated authorization flow that exchanges a temporary code for tokens.",
      whyItMatters: "It separates user authentication from application authorization."
    },
    depthProfiles: {
      eli5: { summary: "A safe permission slip exchange." },
      expert: { summary: "A front-channel authorization response followed by a back-channel token exchange." }
    },
    mentalModel: {
      title: "OAuth flow",
      flow: ["Request", "Authorize", "Code", "Exchange"].map((label, index) => ({
        id: `mental-${index}`,
        label,
        description: `${label} detail`,
        whatHappens: `${label} happens`,
        whyItExists: `${label} protects the boundary`
      }))
    },
    buildingBlocks: ["Client", "Authorization server", "Code", "Token"].map((title, index) => ({
      id: `block-${index}`,
      title,
      description: `${title} has a specific responsibility in the authorization flow.`
    })),
    practicalExample: {
      title: "Calendar access",
      scenario: "A scheduling app requests calendar access.",
      steps: ["Redirect", "Consent", "Exchange"],
      outcome: "The app receives a scoped access token."
    },
    commonMisunderstandings: [{
      id: "misconception-0",
      statement: "The authorization code is the access token.",
      correctAnswer: false,
      explanation: "The backend exchanges the code for a token."
    }],
    checkYourUnderstanding: [{
      id: "recall-0",
      question: "Why is the code exchanged by the backend?",
      expectedKeywords: ["secret", "token"]
    }],
    compareWith: [{
      id: "comparison-implicit",
      concept: "Implicit flow",
      summary: "Implicit flow returns tokens through the browser.",
      differences: ["Authorization code uses a back-channel exchange."]
    }],
    whereToGoNext: [{
      label: "Build an OAuth client",
      targetMode: "build",
      prompt: "Build an OAuth client."
    }],
    rail: { nextBestQuestion: "Where is PKCE verified?" },
    ...overrides
  }, "Explain OAuth authorization code flow for a backend developer");
}

describe("Understand normalization", () => {
  it("normalizes legacy results without IDs into stable enhanced fields", () => {
    const old = {
      title: "Managed identity",
      summary: "A workload obtains tokens without storing an application secret.",
      mentalModel: { steps: [{ label: "Token request", description: "The workload asks Azure for a token." }] },
      coreBuildingBlocks: [{ title: "Managed identity", description: "An identity attached to a resource." }]
    };
    const first = normalizeUnderstandResult(old, "Explain managed identity");
    const second = normalizeUnderstandResult(old, "Explain managed identity");
    expect(first.mentalModel?.flow?.[0].id).toBe("mental-node-token-request-0");
    expect(first.buildingBlocks?.[0].id).toBe("block-managed-identity-0");
    expect(first.mentalModel?.flow?.[0].whatHappens).toBe("The workload asks Azure for a token.");
    expect(second.mentalModel?.flow?.[0].id).toBe(first.mentalModel?.flow?.[0].id);
  });

  it("normalizes myth/reality misconceptions into traps", () => {
    const result = normalizeUnderstandResult({
      title: "OAuth",
      summary: "OAuth delegates access.",
      commonMisunderstandings: [{ myth: "OAuth sends passwords to apps.", reality: "OAuth uses delegated tokens." }]
    }, "Explain OAuth");
    expect(result.commonMisunderstandings?.[0]).toMatchObject({
      correctAnswer: false,
      statement: "OAuth sends passwords to apps.",
      reality: "OAuth uses delegated tokens."
    });
  });

  it("allows a missing comparison and removes foreign lens fields", () => {
    const result = normalizeUnderstandResult({
      title: "DNS",
      summary: "DNS resolves names.",
      diagnosticTerminal: { commands: ["dig"] },
      artifactPreview: { body: "x" }
    }, "Explain DNS");
    expect(result.compareWith).toEqual([]);
    expect(detectForbiddenSections(result, "understand")).toEqual([]);
    expect((result as unknown as Record<string, unknown>).artifactPreview).toBeUndefined();
  });
});

describe("Understand state", () => {
  it("creates and validates the default state", () => {
    const result = enhancedResult();
    expect(validateUnderstandState(createDefaultUnderstandState(result), result)).toBeTruthy();
  });

  it("updates confidence, mastery, and weakest block", () => {
    const result = enhancedResult();
    let state = createDefaultUnderstandState(result);
    state = updateBlockConfidence(state, result, "block-0", "solid");
    state = updateBlockConfidence(state, result, "block-1", "lost");
    expect(getMasterySummary(result, state)).toMatchObject({ solidCount: 1, lostCount: 1, masteryPercent: 25 });
    expect(getWeakestBlock(result, state)?.id).toBe("block-1");
  });

  it("selects depth content and lets recall ratings change the adaptive action", () => {
    const result = enhancedResult();
    const state: UnderstandState = {
      ...createDefaultUnderstandState(result),
      recallRatings: { "recall-0": "fuzzy" }
    };
    expect(getDepthContent(result, "eli5").summary).toBe("A safe permission slip exchange.");
    expect(getAdaptiveNextAction(result, state).label).toBe("Retry active recall");
  });

  it("cleans stale result IDs and clamps trace state", () => {
    const result = enhancedResult();
    const state: UnderstandState = {
      ...createDefaultUnderstandState(result),
      traceStepIndex: 99,
      blockConfidence: { missing: "solid", "block-0": "fuzzy" },
      recallAnswers: { missing: "x" },
      misconceptionAnswers: { missing: true }
    };
    expect(cleanUnderstandState(state, result)).toMatchObject({
      traceStepIndex: 3,
      blockConfidence: { "block-0": "fuzzy" },
      recallAnswers: {},
      misconceptionAnswers: {}
    });
  });
});

describe("Understand fallback, quality, and renderer contract", () => {
  it("builds a complete isolated fallback", () => {
    const result = normalizeUnderstandResult({}, "Explain private endpoints");
    expect(result.conceptSnapshot).toBeTruthy();
    expect(result.mentalModel?.flow).toHaveLength(4);
    expect(result.buildingBlocks).toHaveLength(4);
    expect(result.practicalExample).toBeTruthy();
    expect(result.commonMisunderstandings?.length).toBeGreaterThan(0);
    expect(result.checkYourUnderstanding?.length).toBeGreaterThan(0);
    expect(result.rail).toBeTruthy();
    expect(detectForbiddenSections(result, "understand")).toHaveLength(0);
  });

  it("identifies targeted and full repair sections", () => {
    const good = enhancedResult();
    expect(validateUnderstandResultQuality(good).score).toBeGreaterThanOrEqual(75);

    const noFlow = {
      ...enhancedResult(),
      mentalModel: { title: "x", steps: good.mentalModel!.steps, flow: [] }
    };
    expect(getUnderstandRepairPlan(noFlow).weakSections).toContain("mentalModel");

    const genericSummary = {
      ...enhancedResult(),
      summary: "OAuth authorization code flow is a concept."
    };
    expect(getUnderstandRepairPlan(genericSummary).weakSections).toContain("conceptSnapshot");

    const noMisconceptions = {
      ...enhancedResult(),
      misconceptions: [],
      commonMisunderstandings: []
    };
    expect(getUnderstandRepairPlan(noMisconceptions).weakSections).toContain("commonMisunderstandings");

    const noCompare = enhancedResult({ compareWith: [] });
    expect(getUnderstandRepairPlan(noCompare).weakSections).toContain("compareWith");

    const broken = {
      ...good,
      conceptSnapshot: undefined,
      mentalModel: { title: "x", steps: [{ id: "x", label: "x" }] },
      buildingBlocks: [],
      practicalExample: undefined,
      commonMisunderstandings: [],
      checkYourUnderstanding: [],
      compareWith: [],
      whereToGoNext: [],
      rail: undefined
    };
    expect(["full", "fallback"]).toContain(getUnderstandRepairPlan(broken).mode);
  });

  it("uses workspace path and coerces foreign or legacy results to Understand", () => {
    expect(resolveLensPath({ workspacePath: "understand", resultMode: "fix" })).toBe("understand");
    const foreign = enhancedResult({
      mode: "fix",
      diagnosis: { title: "x", answer: "x", confidence: "low", why: [], likelyCauses: [] }
    });
    const coerced = coerceResultToLens(foreign, "understand");
    expect(coerced.result.mode).toBe("understand");
    expect(coerced.result.diagnosis).toBeUndefined();

    const legacy = coerceResultToLens({
      id: "old",
      mode: "understand",
      title: "Legacy",
      summary: "A legacy Understand result.",
      mentalModel: { title: "Legacy", steps: [{ id: "x", label: "x", description: "x" }] },
      coreBuildingBlocks: [{ id: "b", title: "b", description: "b" }]
    } as RedefinedResult, "understand");
    expect(legacy.result.conceptSnapshot).toBeTruthy();
  });
});
