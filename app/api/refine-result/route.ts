import { NextResponse } from "next/server";
import { callAIProvider } from "@/lib/ai-provider";
import { UnderstandWorkspaceResultSchema } from "@/lib/schemas";
import type { RedefinedResult } from "@/lib/redefined";

function buildRefineSystemPrompt(selectedOptions: string[]): string {
  const optionsList = selectedOptions.map((o) => `- ${o}`).join("\n");
  return `You are Doc/ReDefined's structured concept explanation engine.

The user wants to refine their Understand workspace result with these specific angles:
${optionsList}

Return only valid JSON matching the UnderstandWorkspaceResult schema exactly.
Apply the selected refinement options to make the content richer and more specific.
Keep the same topic, mode, id prefix, and originalPrompt.
Do not return markdown. Do not wrap in code fences.

Rules:
- If "Go deeper on analogies" is selected: provide 4 distinct analogies in analogySwitcher with richer explanations
- If "Focus on implementation" is selected: nextActions should all point to build/fix modes; add more actionable decisionQuestions
- If "Add more examples" is selected: provide a more detailed realWorldExample and add more thinkingSparks of type "scenario"
- If "Simplify language" is selected: use plain language in all descriptions; clarity.level should be "high"
- If "Challenge my assumptions" is selected: add a stronger blindSpot and more "challenge" type thinkingSparks
- Apply all selected options together. Do not ignore any selected option.`;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  if (!body?.prompt || typeof body.prompt !== "string") {
    return NextResponse.json({ error: "Missing prompt" }, { status: 400 });
  }
  if (!Array.isArray(body.selectedOptions) || body.selectedOptions.length === 0) {
    return NextResponse.json({ error: "Missing selectedOptions" }, { status: 400 });
  }

  const selectedOptions = (body.selectedOptions as unknown[]).filter((o): o is string => typeof o === "string");
  const currentResult: RedefinedResult | null = body.currentResult ?? null;

  const userPrompt = JSON.stringify({
    prompt: body.prompt,
    selectedRefinements: selectedOptions,
    currentResult: currentResult ? {
      title: currentResult.title,
      domain: currentResult.domain,
      summary: currentResult.summary
    } : null
  });

  try {
    const aiText = await callAIProvider({
      systemPrompt: buildRefineSystemPrompt(selectedOptions),
      userPrompt
    });

    let parsed: unknown;
    try {
      parsed = JSON.parse(aiText);
    } catch {
      return NextResponse.json({ error: "Failed to parse AI response" }, { status: 500 });
    }

    try {
      const validated = UnderstandWorkspaceResultSchema.parse(parsed);
      return NextResponse.json({ result: validated, source: "ai" });
    } catch (zodError) {
      console.error("Refine result Zod validation failed:", zodError);
      return NextResponse.json({ error: "Result validation failed" }, { status: 500 });
    }
  } catch (error) {
    console.error("Refine result generation failed:", error);
    return NextResponse.json({ error: "Refinement failed" }, { status: 500 });
  }
}
