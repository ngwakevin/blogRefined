import {
  generateArtifactWorkspaceWithAI,
  generateBuildWorkspaceWithAI,
  generateFixWorkspaceWithAI,
  generateUnderstandWorkspaceWithAI
} from "@/lib/ai";
import { repairFixWorkspaceWithAI, repairUnderstandResultWithAI } from "@/lib/ai";
import { enrichFixResultForKnownPatterns } from "@/lib/enrich-fix-result";
import { detectForbiddenSections, LENS_CONTRACTS, type LensId } from "@/lib/lens-contracts";
import { validateFixResultQuality, validateUnderstandResultQuality } from "@/lib/quality";
import { FixWorkspaceResultSchema } from "@/lib/schemas";
import type { RedefinedResult } from "@/lib/redefined";
import type { FixWorkspaceResult } from "@/types/redefined";

type ArtifactSourceContext = Parameters<typeof generateArtifactWorkspaceWithAI>[1];

export type LensPipelineSource = "ai" | "repaired" | "fallback";

export type LensPipelineOutcome = {
  result: RedefinedResult;
  source: LensPipelineSource;
  lens: LensId;
  repairAttempted: boolean;
  forbidden: string[];
  qualityIssues: string[];
  qualityWarnings: string[];
};

const isDev = process.env.NODE_ENV !== "production";

function devWarn(message: string) {
  if (isDev) console.warn(message);
}

type QualityOutcome = { ok: boolean; issues: string[]; warnings: string[]; score?: number };

function qualityFor(lens: LensId, result: RedefinedResult): QualityOutcome {
  if (lens === "fix") return validateFixResultQuality(result as unknown as FixWorkspaceResult);
  if (lens === "understand") return validateUnderstandResultQuality(result);
  return { ok: true, issues: [], warnings: [], score: 100 };
}

function hasRepairableIssues(quality: QualityOutcome, forbidden: string[]): boolean {
  return forbidden.length > 0 || quality.issues.length > 0;
}

async function attemptTargetedRepair(
  lens: LensId,
  prompt: string,
  sourceContext: ArtifactSourceContext,
  result: RedefinedResult,
  quality: QualityOutcome,
  forbidden: string[]
): Promise<{ repaired: RedefinedResult; quality: QualityOutcome; forbidden: string[] } | null> {
  if (lens === "fix") {
    try {
      const repaired = await repairFixWorkspaceWithAI({
        prompt,
        previousResult: result as FixWorkspaceResult,
        qualityIssues: quality.issues,
        qualityWarnings: quality.warnings
      });
      const repairedForbidden = detectForbiddenSections(repaired, lens);
      return {
        repaired,
        quality: qualityFor(lens, repaired),
        forbidden: repairedForbidden
      };
    } catch {
      return null;
    }
  }

  if (lens === "understand") {
    try {
      const repaired = await repairUnderstandResultWithAI({
        prompt,
        previousResult: result,
        qualityIssues: quality.issues,
        qualityWarnings: quality.warnings
      });
      const repairedForbidden = detectForbiddenSections(repaired, lens);
      return {
        repaired,
        quality: qualityFor(lens, repaired),
        forbidden: repairedForbidden
      };
    } catch {
      return null;
    }
  }

  try {
    const repairRawForbidden: string[] = [];
    const repaired = await generateForLens(
      lens,
      prompt,
      sourceContext,
      strictRepairInstruction(lens, forbidden),
      repairRawForbidden
    );
    const repairedForbidden = Array.from(new Set([...detectForbiddenSections(repaired, lens), ...repairRawForbidden]));
    return {
      repaired,
      quality: qualityFor(lens, repaired),
      forbidden: repairedForbidden
    };
  } catch {
    return null;
  }
}

async function generateForLens(
  lens: LensId,
  prompt: string,
  sourceContext: ArtifactSourceContext,
  extraInstruction: string | undefined,
  rawForbidden: string[]
): Promise<RedefinedResult> {
  switch (lens) {
    case "fix": {
      const generated = await generateFixWorkspaceWithAI(prompt, extraInstruction, rawForbidden);
      return FixWorkspaceResultSchema.parse(
        enrichFixResultForKnownPatterns(generated as unknown as FixWorkspaceResult, prompt)
      ) as RedefinedResult;
    }
    case "understand":
      return generateUnderstandWorkspaceWithAI(prompt, extraInstruction, rawForbidden);
    case "build":
      return generateBuildWorkspaceWithAI(prompt, extraInstruction, rawForbidden);
    case "artifact":
    default:
      return generateArtifactWorkspaceWithAI(prompt, sourceContext, extraInstruction, rawForbidden);
  }
}

/** Strict regeneration instruction — same lens only, no forbidden sections, no reclassification. */
function strictRepairInstruction(lens: LensId, forbidden: string[]): string {
  const contract = LENS_CONTRACTS[lens];
  const forbiddenLine = forbidden.length
    ? `\nThe previous result included forbidden sections: ${forbidden.join(", ")}. Remove them.`
    : "";
  return [
    contract.instruction,
    "",
    `REPAIR: The selected lens is ${lens}. Regenerate the result using only the ${lens} contract.${forbiddenLine}`,
    `Return only schema-valid ${lens} content. Do not switch lens. Do not reclassify the prompt.`
  ].join("\n");
}

function seedResult(lens: LensId, prompt: string): RedefinedResult {
  const topic = prompt.slice(0, 80) || lens;
  return {
    id: `seed-${Date.now().toString(36)}`,
    mode: lens,
    title: topic,
    summary: prompt,
    originalPrompt: prompt,
    classification: {
      mode: lens,
      confidence: 0.4,
      source: "fallback",
      reason: "Lens pipeline fallback seed.",
      topic
    },
    visualFlow: [],
    sections: [],
    actions: []
  } as RedefinedResult;
}

/**
 * Uniform server-side pipeline applied to ALL four lenses:
 *   generate (with lens instruction) → validate + detect forbidden → repair once → normalize fallback.
 * The lens is fixed by the caller (the workspace path / explicit request) and is never changed here.
 */
export async function runLensPipeline(args: {
  lens: LensId;
  prompt: string;
  sourceContext?: ArtifactSourceContext;
}): Promise<LensPipelineOutcome> {
  const { lens, prompt } = args;
  const sourceContext = args.sourceContext;
  const contract = LENS_CONTRACTS[lens];

  try {
    // Attempt 1 — generate with the lens contract instruction. `rawForbidden` captures foreign
    // sections present in the raw model output BEFORE the schema strips unknown keys.
    const rawForbidden: string[] = [];
    const result = await generateForLens(lens, prompt, sourceContext, contract.instruction, rawForbidden);
    const forbidden = Array.from(new Set([...detectForbiddenSections(result, lens), ...rawForbidden]));
    const quality = qualityFor(lens, result);

    const isRepairable = hasRepairableIssues(quality, forbidden);

    if (quality.ok && forbidden.length === 0) {
      return {
        result,
        source: "ai",
        lens,
        repairAttempted: false,
        forbidden,
        qualityIssues: quality.issues,
        qualityWarnings: quality.warnings
      };
    }

    if (rawForbidden.length > 0) {
      devWarn(
        `Raw lens mismatch detected: selected lens=${lens}, forbidden fields found: ${rawForbidden.join(", ")}. Repair attempt triggered.`
      );
    }
    if (forbidden.length > 0) {
      devWarn(`Forbidden fields detected for ${lens} lens: ${forbidden.join(", ")}.`);
    }
    if (!quality.ok) {
      devWarn(`Lens mismatch / quality failure for ${lens} lens: ${quality.issues.join("; ")}.`);
    }
    devWarn(`Repair attempt triggered for ${lens} lens.`);

    // Attempt 2 — repair once with a stricter instruction.
    if (isRepairable) {
      const repairResult = await attemptTargetedRepair(lens, prompt, sourceContext, result, quality, forbidden);
      if (repairResult) {
        const { repaired, quality: repairedQuality, forbidden: repairedForbidden } = repairResult;
        if (repairedQuality.ok && repairedForbidden.length === 0) {
          return {
            result: repaired,
            source: "repaired",
            lens,
            repairAttempted: true,
            forbidden,
            qualityIssues: repairedQuality.issues,
            qualityWarnings: repairedQuality.warnings
          };
        }
        devWarn(`Repair attempt did not fully pass quality for ${lens} lens: ${repairedQuality.issues.join("; ")}`);
      } else {
        devWarn(`Repair attempt failed for ${lens} lens.`);
      }
    }

    // Attempt 3 — normalize the best available result into the selected lens.
    devWarn(`Fallback normalization used for ${lens} lens.`);
    return {
      result: contract.normalize({ rawResult: result, originalPrompt: prompt }),
      source: "fallback",
      lens,
      repairAttempted: true,
      forbidden,
      qualityIssues: quality.issues,
      qualityWarnings: quality.warnings
    };
  } catch {
    // Generation threw (provider down, invalid JSON, schema failure) → normalize a seed result.
    devWarn(`Generation failed for ${lens} lens; fallback normalization used.`);
    return {
      result: contract.normalize({ rawResult: seedResult(lens, prompt), originalPrompt: prompt }),
      source: "fallback",
      lens,
      repairAttempted: false,
      forbidden: [],
      qualityIssues: [],
      qualityWarnings: []
    };
  }
}
