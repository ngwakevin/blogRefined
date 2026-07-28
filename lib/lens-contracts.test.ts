import { describe, expect, it } from "vitest";
import {
  LENS_CONTRACTS,
  coerceResultToLens,
  detectForbiddenSections,
  detectRawForbiddenSections,
  resolveLensPath
} from "@/lib/lens-contracts";
import type { RedefinedResult } from "@/lib/redefined";

/** Minimal result fixtures — only the signature fields each lens checks need to be present. */
function understandShaped(overrides: Partial<RedefinedResult> = {}): RedefinedResult {
  return {
    id: "r-understand",
    mode: "understand",
    title: "Explain Azure Managed Instance connectivity",
    summary: "A learning explanation.",
    originalPrompt: "Explain Azure Managed Instance connectivity",
    mentalModel: { title: "How it works", steps: [{ id: "s0", label: "Concept", description: "..." }] },
    coreBuildingBlocks: [{ id: "b0", title: "Concept", description: "..." }],
    ...overrides
  } as unknown as RedefinedResult;
}

function fixShaped(overrides: Partial<RedefinedResult> = {}): RedefinedResult {
  return {
    id: "r-fix",
    mode: "fix",
    title: "AMI not accessible",
    summary: "A diagnostic.",
    originalPrompt: "Azure Managed Instance is not accessible from web application",
    diagnosis: { title: "Access issue", summary: "...", confidence: "medium" },
    issueMap: { nodes: [], edges: [] },
    diagnosticTerminal: { commands: [] },
    failureBranches: [{ title: "RBAC", summary: "...", signals: [], checks: [], severity: "high" }],
    ...overrides
  } as unknown as RedefinedResult;
}

function artifactShaped(overrides: Partial<RedefinedResult> = {}): RedefinedResult {
  return {
    id: "r-artifact",
    mode: "artifact",
    title: "Runbook",
    summary: "An artifact.",
    originalPrompt: "Create a runbook for AMI connectivity troubleshooting",
    outline: [{ id: "o0", heading: "Step 1", summary: "..." }],
    ...overrides
  } as unknown as RedefinedResult;
}

describe("resolveLensPath — workspace path is the source of truth", () => {
  it("Case 1: workspace.path=fix wins over an understand-shaped result", () => {
    expect(resolveLensPath({ workspacePath: "fix", resultMode: "understand" })).toBe("fix");
  });

  it("Case 2: workspace.path=understand wins over a fix-shaped result", () => {
    expect(resolveLensPath({ workspacePath: "understand", resultMode: "fix" })).toBe("understand");
  });

  it("Case 3: workspace.path=build wins over an artifact-shaped result", () => {
    expect(resolveLensPath({ workspacePath: "build", resultMode: "artifact" })).toBe("build");
  });

  it("Case 4: workspace.path=artifact wins over an understand-shaped result", () => {
    expect(resolveLensPath({ workspacePath: "artifact", resultMode: "understand" })).toBe("artifact");
  });

  it("Case 5: promptRun.path wins when workspace.path is missing", () => {
    expect(resolveLensPath({ promptRunPath: "fix", resultMode: "understand" })).toBe("fix");
  });

  it("Case 6: defaults to understand when nothing is provided", () => {
    expect(resolveLensPath({})).toBe("understand");
  });
});

describe("coerceResultToLens — normalizes into the selected lens, never another", () => {
  it("Case 1: fix lens + understand-shaped result → Fix-shaped output", () => {
    const { result, normalized } = coerceResultToLens(understandShaped(), "fix");
    expect(normalized).toBe(true);
    expect(result.mode).toBe("fix");
    expect(result.diagnosis).toBeTruthy();
    expect(result.issueMap).toBeTruthy();
    expect(result.diagnosticTerminal).toBeTruthy();
    expect(LENS_CONTRACTS.fix.matches(result)).toBe(true);
  });

  it("Case 2: understand lens + fix-shaped result → Understand-shaped output, no fix sections", () => {
    const { result, normalized } = coerceResultToLens(fixShaped(), "understand");
    expect(normalized).toBe(true);
    expect(result.mode).toBe("understand");
    expect(result.mentalModel).toBeTruthy();
    expect(detectForbiddenSections(result, "understand")).toHaveLength(0);
    expect(LENS_CONTRACTS.understand.matches(result)).toBe(true);
  });

  it("Case 3: build lens + artifact-shaped result → Build-shaped output", () => {
    const { result, normalized } = coerceResultToLens(artifactShaped(), "build");
    expect(normalized).toBe(true);
    expect(result.mode).toBe("build");
    expect(LENS_CONTRACTS.build.matches(result)).toBe(true);
  });

  it("Case 4: artifact lens + understand-shaped result → Artifact mode, not Understand", () => {
    const { result, normalized } = coerceResultToLens(understandShaped(), "artifact");
    expect(normalized).toBe(true);
    expect(result.mode).toBe("artifact");
    expect(LENS_CONTRACTS.understand.matches(result)).toBe(false);
  });

  it("leaves a correctly-shaped result untouched", () => {
    const fix = fixShaped();
    const { result, normalized } = coerceResultToLens(fix, "fix");
    expect(normalized).toBe(false);
    expect(result).toBe(fix);
  });
});

describe("detectForbiddenSections", () => {
  it("Case 7: Fix lens flags Understand-only fields", () => {
    const result = fixShaped({
      mentalModel: { title: "x", steps: [{ id: "s", label: "l", description: "d" }] },
      coreBuildingBlocks: [{ id: "b", title: "t", description: "d" }],
      shareableInsight: { title: "x", insight: "y", tags: [], actions: [] }
    } as Partial<RedefinedResult>);
    const forbidden = detectForbiddenSections(result, "fix");
    expect(forbidden).toEqual(
      expect.arrayContaining(["mentalModel", "coreBuildingBlocks", "shareableInsight"])
    );
  });

  it("Case 8: Understand lens flags Fix-only fields", () => {
    const result = understandShaped({
      failureBranches: [{ title: "t", summary: "s", signals: [], checks: [], severity: "high" }],
      diagnosticTerminal: { commands: [] },
      issueMap: { nodes: [], edges: [] }
    } as Partial<RedefinedResult>);
    const forbidden = detectForbiddenSections(result, "understand");
    expect(forbidden).toEqual(
      expect.arrayContaining(["failureBranches", "diagnosticTerminal", "issueMap"])
    );
  });
});

describe("detectRawForbiddenSections — pre-schema raw output drift", () => {
  it("flags conceptual Understand sections on raw Fix output that the schema would strip", () => {
    const rawFixOutput = {
      mode: "fix",
      diagnosis: { title: "x" },
      // Foreign sections a model might emit; these never survive the Fix schema.
      conceptSnapshot: { title: "What is X" },
      mentalModel: { steps: [{ id: "s" }] },
      testYourUnderstanding: [{ q: "?" }],
      shareableInsight: { insight: "y" }
    };
    expect(detectRawForbiddenSections(rawFixOutput, "fix")).toEqual(
      expect.arrayContaining(["conceptSnapshot", "mentalModel", "testYourUnderstanding", "shareableInsight"])
    );
  });

  it("flags Fix sections on raw Understand output", () => {
    const rawUnderstandOutput = {
      mode: "understand",
      mentalModel: { steps: [] },
      diagnosticTerminal: { commands: ["x"] },
      incidentBrief: { summary: "y" }
    };
    expect(detectRawForbiddenSections(rawUnderstandOutput, "understand")).toEqual(
      expect.arrayContaining(["diagnosticTerminal", "incidentBrief"])
    );
  });

  it("returns nothing for clean output or non-objects", () => {
    expect(detectRawForbiddenSections({ mode: "fix", diagnosis: {} }, "fix")).toHaveLength(0);
    expect(detectRawForbiddenSections(null, "fix")).toHaveLength(0);
    expect(detectRawForbiddenSections("text", "fix")).toHaveLength(0);
  });
});
