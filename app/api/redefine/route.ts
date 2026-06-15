import { NextResponse } from "next/server";
import {
  generateArtifactWorkspaceWithAI,
  generateBuildWorkspaceWithAI,
  generateFixWorkspaceWithAI,
  generateUnderstandWorkspaceWithAI,
  repairFixWorkspaceWithAI,
  repairUnderstandResultWithAI
} from "@/lib/ai";
import { enrichFixResultForKnownPatterns } from "@/lib/enrich-fix-result";
import { getGenericGeneratedContentFields, validateFixResultQuality, validateUnderstandResultQuality } from "@/lib/quality";
import { buildLocalRedefinedResult, classifyWithRules, createLocalId } from "@/lib/redefined";
import { ArtifactWorkspaceResultSchema, BuildWorkspaceResultSchema, FixWorkspaceResultSchema, UnderstandWorkspaceResultSchema } from "@/lib/schemas";
import type { RedefinedResult } from "@/lib/redefined";

type DebugFallbackReason =
  | "provider_not_configured"
  | "provider_request_failed"
  | "json_parse_failed"
  | "zod_failed"
  | "quality_failed"
  | "repair_failed"
  | "unknown";

function isDebugEnabled() {
  return process.env.NEXT_PUBLIC_DEBUG_OS === "true";
}

function buildLocalArtifactResult(prompt: string, classification: ReturnType<typeof classifyWithRules>): RedefinedResult {
  const topic = classification.topic || prompt.replace(/\?$/, "").trim();
  return {
    id: `artifact-local-${createLocalId()}`,
    mode: "artifact",
    originalPrompt: prompt,
    title: topic,
    summary: `A reusable artifact prepared from: ${topic}`,
    domain: "general",
    classification: { ...classification, mode: "artifact" as const },
    visualFlow: ["Input", "Structure", "Checklist", "Review", "Export"],
    sections: [
      {
        type: "checklist",
        title: "Core checklist",
        items: [
          "Define scope and purpose",
          "Identify the audience",
          "Structure the content clearly",
          "Review for completeness",
          "Export or share"
        ]
      }
    ],
    actions: [
      { label: "Open artifact", action: "open_artifact" },
      { label: "Export summary", action: "export_summary" }
    ]
  };
}

function buildLocalUnderstandResult(prompt: string, classification: ReturnType<typeof classifyWithRules>) {
  const topic = classification.topic || prompt.replace(/\?$/, "").trim();
  return {
    id: `understand-local-${Date.now().toString(36)}`,
    mode: "understand" as const,
    originalPrompt: prompt,
    title: topic,
    summary: `A structured explanation of ${topic} with key concepts, mental model, and practical examples.`,
    domain: "general",
    classification: { ...classification, mode: "understand" as const },
    clarity: { level: "medium" as const, score: 70 },
    mentalModel: {
      title: `How ${topic} works`,
      steps: [
        { id: "step-0", label: "Concept", description: `What ${topic} is at its core.` },
        { id: "step-1", label: "Structure", description: "The key parts and how they relate." },
        { id: "step-2", label: "Behavior", description: "How it works in practice." },
        { id: "step-3", label: "Outcome", description: "What it produces or enables." }
      ]
    },
    coreBuildingBlocks: [
      { id: "block-0", title: topic, description: `The core concept. Paste real evidence or a specific question to get a detailed breakdown.` }
    ],
    misconceptions: [],
    realWorldExample: {
      title: "Example scenario",
      scenario: `A practical situation involving ${topic}.`,
      explanation: "Paste a real scenario to get a domain-specific example."
    },
    decisionQuestions: [
      `Does ${topic} apply to your current situation?`,
      "What outcome are you trying to achieve?",
      "What context or constraints do you have?"
    ],
    nextActions: [
      { label: "Build from this", targetMode: "build" as const, prompt: `Help me implement ${topic}` },
      { label: "Create artifact", targetMode: "artifact" as const, prompt: `Create a summary of ${topic}` },
      { label: "Troubleshoot related issue", targetMode: "fix" as const, prompt: `I'm having an issue related to ${topic}` }
    ],
    visualFlow: ["Concept", "Structure", "Example", "Apply"],
    sections: [],
    actions: []
  };
}

function classifyFallbackReason(error: unknown): DebugFallbackReason {
  if (error instanceof SyntaxError) return "json_parse_failed";
  if (error instanceof Error) {
    if (error.message.includes("AI provider is not configured")) return "provider_not_configured";
    if (error.message.includes("AI provider request failed")) return "provider_request_failed";
    if (error.name === "ZodError") return "zod_failed";
  }

  return "unknown";
}

function buildDebugPayload(args: {
  source: "ai" | "repaired" | "fallback";
  fallbackReason?: DebugFallbackReason;
  repairAttempted: boolean;
  qualityIssues?: string[];
  qualityWarnings?: string[];
  genericContentFields?: string[];
}) {
  if (!isDebugEnabled()) return undefined;

  return {
    source: args.source,
    fallbackReason: args.fallbackReason,
    repairAttempted: args.repairAttempted,
    qualityIssues: args.qualityIssues ?? [],
    qualityWarnings: args.qualityWarnings ?? [],
    genericContentDetected: (args.genericContentFields ?? []).length > 0,
    genericContentFields: args.genericContentFields ?? [],
    provider: {
      hasKey: Boolean(process.env.AI_API_KEY),
      model: process.env.AI_MODEL ?? null
    }
  };
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  if (!body?.prompt || typeof body.prompt !== "string") {
    return NextResponse.json({ error: "Missing prompt" }, { status: 400 });
  }

  // Optional source context for context-aware artifact generation (from Build/Fix workspaces)
  body.sourceContext = body.sourceContext ?? null;

  const classification = classifyWithRules(body.prompt);

  if (classification.mode === "understand") {
    let fallbackReason: DebugFallbackReason | undefined;
    let repairAttempted = false;
    let qualityIssues: string[] = [];
    let qualityWarnings: string[] = [];

    try {
      const understandResult = await generateUnderstandWorkspaceWithAI(body.prompt);
      const parsed = UnderstandWorkspaceResultSchema.parse(understandResult);
      const quality = validateUnderstandResultQuality(parsed);

      if (quality.ok) {
        return NextResponse.json({
          result: parsed,
          source: "ai",
          debug: buildDebugPayload({
            source: "ai",
            repairAttempted: false
          })
        });
      }

      fallbackReason = "quality_failed";
      qualityIssues = quality.issues;
      qualityWarnings = quality.warnings;
      console.warn("AI Understand result failed quality validation.", quality);

      try {
        repairAttempted = true;
        const repaired = await repairUnderstandResultWithAI({
          prompt: body.prompt,
          previousResult: parsed,
          qualityIssues: quality.issues,
          qualityWarnings: quality.warnings
        });
        const parsedRepaired = UnderstandWorkspaceResultSchema.parse(repaired);
        const repairedQuality = validateUnderstandResultQuality(parsedRepaired);

        if (!repairedQuality.ok) {
          throw new Error(
            `Repaired Understand workspace failed quality validation: ${repairedQuality.issues.join("; ")}`
          );
        }

        return NextResponse.json({
          result: parsedRepaired,
          source: "repaired",
          warning: "Understand path corrected before rendering",
          debug: buildDebugPayload({
            source: "repaired",
            fallbackReason: "quality_failed",
            repairAttempted,
            qualityIssues,
            qualityWarnings
          })
        });
      } catch (repairError) {
        fallbackReason = "repair_failed";
        console.error("AI Understand repair failed.", repairError);
      }

      throw new Error("AI Understand result failed quality validation and repair failed.");
    } catch (understandError) {
      fallbackReason = fallbackReason ?? classifyFallbackReason(understandError);
      console.error("Understand workspace generation failed, falling back to local.", understandError);
      const fallback = buildLocalUnderstandResult(body.prompt, classification);
      const parsedFallback = UnderstandWorkspaceResultSchema.parse(fallback);
      return NextResponse.json({
        result: parsedFallback,
        source: "fallback",
        warning: "Understand fallback path generated",
        debug: buildDebugPayload({
          source: "fallback",
          fallbackReason,
          repairAttempted,
          qualityIssues,
          qualityWarnings
        })
      });
    }
  }

  if (classification.mode === "build") {
    try {
      const buildResult = await generateBuildWorkspaceWithAI(body.prompt);
      const parsed = BuildWorkspaceResultSchema.parse(buildResult);
      return NextResponse.json({
        result: parsed,
        source: "ai",
        debug: buildDebugPayload({ source: "ai", repairAttempted: false })
      });
    } catch (buildError) {
      console.error("Build workspace generation failed, falling back to local.", buildError);
      const fallback = buildLocalRedefinedResult(body.prompt, { ...classification, mode: "build" as const });
      return NextResponse.json({
        result: fallback,
        source: "fallback",
        warning: "Build fallback path generated",
        debug: buildDebugPayload({
          source: "fallback",
          fallbackReason: "provider_request_failed",
          repairAttempted: false
        })
      });
    }
  }

  if (classification.mode === "artifact") {
    const sourceContext = body.sourceContext ?? null;
    try {
      const artifactResult = await generateArtifactWorkspaceWithAI(body.prompt, sourceContext);
      const parsed = ArtifactWorkspaceResultSchema.parse(artifactResult);
      return NextResponse.json({
        result: parsed,
        source: "ai",
        debug: buildDebugPayload({ source: "ai", repairAttempted: false })
      });
    } catch (artifactError) {
      console.error("Artifact workspace generation failed, falling back to local.", artifactError);
      const fallback = buildLocalArtifactResult(body.prompt, classification);
      return NextResponse.json({
        result: fallback,
        source: "fallback",
        warning: "Artifact fallback path generated",
        debug: buildDebugPayload({ source: "fallback", fallbackReason: "provider_request_failed", repairAttempted: false })
      });
    }
  }

  let fallbackReason: DebugFallbackReason | undefined;
  let repairAttempted = false;
  let qualityIssues: string[] = [];
  let qualityWarnings: string[] = [];

  try {
    const aiResult = await generateFixWorkspaceWithAI(body.prompt);
    const enrichedAiResult = FixWorkspaceResultSchema.parse(
      enrichFixResultForKnownPatterns(aiResult, body.prompt)
    );
    const quality = validateFixResultQuality(enrichedAiResult);

    if (quality.ok) {
      return NextResponse.json({
        result: enrichedAiResult,
        source: "ai",
        debug: buildDebugPayload({
          source: "ai",
          repairAttempted: false,
          genericContentFields: getGenericGeneratedContentFields(enrichedAiResult)
        })
      });
    }

    fallbackReason = "quality_failed";
    qualityIssues = quality.issues;
    qualityWarnings = quality.warnings;
    console.warn("AI result failed quality validation.", quality);

    try {
      repairAttempted = true;
      const repaired = await repairFixWorkspaceWithAI({
        prompt: body.prompt,
        previousResult: enrichedAiResult,
        qualityIssues: quality.issues,
        qualityWarnings: quality.warnings
      });
      const enrichedRepaired = FixWorkspaceResultSchema.parse(
        enrichFixResultForKnownPatterns(repaired, body.prompt)
      );
      const repairedQuality = validateFixResultQuality(enrichedRepaired);

      if (!repairedQuality.ok) {
        throw new Error(
          `Enriched repaired Fix workspace failed quality validation: ${repairedQuality.issues.join("; ")}`
        );
      }

      return NextResponse.json({
        result: enrichedRepaired,
        source: "repaired",
        warning: "Structured path corrected before rendering",
        debug: buildDebugPayload({
          source: "repaired",
          fallbackReason: "quality_failed",
          repairAttempted,
          qualityIssues,
          qualityWarnings,
          genericContentFields: getGenericGeneratedContentFields(enrichedRepaired)
        })
      });
    } catch (repairError) {
      fallbackReason = "repair_failed";
      console.error("AI repair failed.", repairError);
    }

    throw new Error("AI result failed quality validation and repair failed.");
  } catch (error) {
    fallbackReason = fallbackReason ?? classifyFallbackReason(error);
    console.error("Doc/ReDefined OS generation fallback reason:", {
      reason: fallbackReason,
      repairAttempted,
      error
    });
    console.error("AI generation failed. Falling back to local result.", error);

    const classification = classifyWithRules(body.prompt);
    const fallback = buildLocalRedefinedResult(body.prompt, {
      ...classification,
      mode: "fix",
      source: "fallback",
      reason: "Structured fallback path generated."
    });
    const parsedFallback = FixWorkspaceResultSchema.parse(fallback);
    const result = FixWorkspaceResultSchema.parse(
      enrichFixResultForKnownPatterns(parsedFallback, body.prompt)
    );
    const fallbackQuality = validateFixResultQuality(result);

    if (!fallbackQuality.ok) {
      console.error("Local fallback failed quality validation.", fallbackQuality);
    }

    return NextResponse.json({
      result,
      source: "fallback",
      warning: "Structured fallback path generated",
      debug: buildDebugPayload({
        source: "fallback",
        fallbackReason,
        repairAttempted,
        qualityIssues,
        qualityWarnings,
        genericContentFields: getGenericGeneratedContentFields(result)
      })
    });
  }
}
