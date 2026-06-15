import { NextResponse } from "next/server";
import { generateFollowUpWithAI, repairFollowUpWithAI } from "@/lib/ai";
import { parseEvidenceSignals } from "@/lib/evidence";
import { processLocalFollowUp, refineFollowUpForEvidence } from "@/lib/followup";
import { validateFollowUpQuality } from "@/lib/quality";
import type { RedefinedResult } from "@/lib/redefined";
import type { FixWorkspaceResult } from "@/types/redefined";
import { FollowUpResultSchema } from "@/lib/schemas";

function isDebugEnabled() {
  return process.env.NEXT_PUBLIC_DEBUG_OS === "true";
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const evidenceText = typeof body?.evidenceText === "string" ? body.evidenceText : body?.message;

  if (!evidenceText || typeof evidenceText !== "string" || !body?.currentResult) {
    return NextResponse.json({ error: "Missing follow-up message or result" }, { status: 400 });
  }

  const signals = Array.isArray(body.localSignals) && body.localSignals.length > 0
    ? body.localSignals
    : parseEvidenceSignals(evidenceText);
  const currentResult = body.currentResult as FixWorkspaceResult;

  try {
    const localEvidenceBranch = body.localEvidenceBranch ??
      (body.activeEvidenceBranchId
        ? (body.evidenceBranches ?? currentResult.evidenceBranches ?? []).find(
            (branch: { id?: string }) => branch.id === body.activeEvidenceBranchId
          )
        : undefined);
    const aiResult = await generateFollowUpWithAI({
      message: evidenceText,
      workspaceId: body.workspaceId,
      originalPrompt: body.originalPrompt ?? currentResult.originalPrompt,
      currentResult: currentResult as RedefinedResult,
      evidenceText,
      signals,
      localSignals: signals,
      localEvidenceBranch,
      evidenceBranches: body.evidenceBranches ?? currentResult.evidenceBranches ?? [],
      activeEvidenceBranchId: body.activeEvidenceBranchId ?? currentResult.activeEvidenceBranchId,
      timeline: body.timeline ?? currentResult.timeline ?? []
    });
    const aiFollowUp = aiResult.followUp;
    const followUp = refineFollowUpForEvidence(
      FollowUpResultSchema.parse(aiFollowUp),
      signals,
      evidenceText,
      currentResult as RedefinedResult
    );
    const quality = validateFollowUpQuality(followUp, currentResult);

    if (quality.ok) {
      return NextResponse.json({
        followUp: {
          ...followUp,
          signals: followUp.signals.length > 0 ? followUp.signals : signals
        },
        source: "ai",
        debug: isDebugEnabled()
          ? {
              ...aiResult.debug,
              fallbackUsed: false
            }
          : undefined
      });
    }

    console.warn("AI follow-up failed quality validation.", quality);

    try {
      const repairedFollowUp = refineFollowUpForEvidence(
        await repairFollowUpWithAI({
        message: evidenceText,
        currentResult,
        previousFollowUp: followUp,
        qualityIssues: quality.issues,
        qualityWarnings: quality.warnings
        }),
        signals,
        evidenceText,
        currentResult as RedefinedResult
      );

      return NextResponse.json({
        followUp: {
          ...repairedFollowUp,
          signals: repairedFollowUp.signals.length > 0 ? repairedFollowUp.signals : signals
        },
        source: "repaired",
        warning: "Structured path corrected before rendering"
      });
    } catch (repairError) {
      console.error("AI follow-up repair failed.", repairError);
    }

    throw new Error("AI follow-up failed quality validation and repair failed.");
  } catch (error) {
    console.error("AI follow-up failed. Falling back to local follow-up.", error);

    const localFollowUp = processLocalFollowUp(evidenceText, currentResult);
    const followUp = FollowUpResultSchema.parse({
      ...localFollowUp,
      signals
    });
    const localQuality = validateFollowUpQuality(followUp, currentResult);

    if (!localQuality.ok) {
      console.error("Local follow-up failed quality validation.", localQuality);
    }

    return NextResponse.json({
      followUp,
      source: "local",
      warning: "Evidence processed locally",
      debug: isDebugEnabled()
        ? {
            followUpSource: "local",
            aiRawParsed: false,
            normalized: false,
            usedLocalBranchBase: Boolean(body.localEvidenceBranch),
            aiReturnedActiveBranch: false,
            missingFieldsFilled: [],
            fallbackUsed: true,
            fallbackReason: "ai_request_failed"
          }
        : undefined
    });
  }
}
