import { NextResponse } from "next/server";
import { LENS_CONTRACTS, type LensId } from "@/lib/lens-contracts";
import { runLensPipeline } from "@/lib/lens-pipeline";
import { getGenericGeneratedContentFields } from "@/lib/quality";
import { classifyWithRules } from "@/lib/redefined";
import type { FixWorkspaceResult } from "@/types/redefined";

function isDebugEnabled() {
  return process.env.NEXT_PUBLIC_DEBUG_OS === "true";
}

const VALID_LENSES: readonly LensId[] = ["understand", "build", "fix", "artifact"];

/** Resolve an explicit lens from the request body. Aliases: path, lens, selectedMode, preferredMode. */
function resolveExplicitLens(body: Record<string, unknown>): LensId | null {
  const candidates = [body.path, body.lens, body.selectedMode, body.preferredMode];
  const found = candidates.find(
    (value): value is LensId => typeof value === "string" && (VALID_LENSES as readonly string[]).includes(value)
  );
  return found ?? null;
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;

  if (!body?.prompt || typeof body.prompt !== "string") {
    return NextResponse.json({ error: "Missing prompt" }, { status: 400 });
  }

  const prompt = body.prompt;
  const sourceContext = (body.sourceContext ?? undefined) as Parameters<typeof runLensPipeline>[0]["sourceContext"];

  // Lens Contract: an explicit workspace path/lens locks the lens. Only auto-classify when none
  // was provided (dashboard prompt with no path, or a brand-new workspace being created).
  const explicitLens = resolveExplicitLens(body);
  const lens: LensId = explicitLens ?? classifyWithRules(prompt).mode;

  if (!explicitLens && process.env.NODE_ENV !== "production") {
    console.warn(`No explicit lens provided; auto-classified prompt as ${lens}.`);
  }

  const outcome = await runLensPipeline({ lens, prompt, sourceContext });

  const debug = isDebugEnabled()
    ? {
        source: outcome.source,
        lens: outcome.lens,
        explicitLens: explicitLens ?? null,
        repairAttempted: outcome.repairAttempted,
        qualityIssues: outcome.qualityIssues,
        qualityWarnings: outcome.qualityWarnings,
        forbiddenFields: outcome.forbidden,
        genericContentDetected:
          lens === "fix" && getGenericGeneratedContentFields(outcome.result as unknown as FixWorkspaceResult).length > 0,
        provider: {
          hasKey: Boolean(process.env.AI_API_KEY),
          model: process.env.AI_MODEL ?? null
        }
      }
    : undefined;

  return NextResponse.json({
    result: outcome.result,
    source: outcome.source,
    ...(outcome.source !== "ai"
      ? { warning: `${LENS_CONTRACTS[lens].label} ${outcome.source === "repaired" ? "corrected" : "fallback"} path` }
      : {}),
    debug
  });
}
