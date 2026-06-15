import { NextResponse } from "next/server";
import { callAIProvider } from "@/lib/ai-provider";

type TeachBackFeedback = {
  score: number;
  feedback: string;
  gaps: string[];
  strengths: string[];
  expertVersion?: string;
};

function buildTeachBackSystemPrompt(): string {
  return `You are an expert evaluator of concept explanations.

Return only valid JSON. Do not return markdown. Do not wrap in code fences.

Given a user's teach-back explanation, evaluate it honestly and helpfully.

Return JSON with exactly these fields:
{
  "score": 0-100 (how well the user explained the concept — be fair but not lenient),
  "feedback": "2-3 sentence summary of the explanation quality",
  "gaps": ["specific concept or point they missed or got wrong"],
  "strengths": ["specific things they explained correctly"],
  "expertVersion": "A clear, expert-level explanation of the same concept in 2-4 sentences"
}

Rules:
- score 80-100: covers the key points, good mental model, no major gaps
- score 60-79: partially correct, missing 1-2 key ideas
- score 40-59: some correct elements but missing core concepts
- score 0-39: mostly off or missing the point
- Gaps and strengths should be specific, not generic.
- The expertVersion should be tight and precise.
- Do not be harsh or discouraging. Be constructive.`;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  if (!body?.explanation || typeof body.explanation !== "string") {
    return NextResponse.json({ error: "Missing explanation" }, { status: 400 });
  }
  if (!body?.concept || typeof body.concept !== "string") {
    return NextResponse.json({ error: "Missing concept" }, { status: 400 });
  }

  const userPrompt = JSON.stringify({
    concept: body.concept,
    challenge: body.challenge ?? `Explain ${body.concept} in your own words`,
    userExplanation: body.explanation,
    expertVersion: body.expertVersion ?? null
  });

  try {
    const aiText = await callAIProvider({
      systemPrompt: buildTeachBackSystemPrompt(),
      userPrompt
    });

    let feedback: TeachBackFeedback;
    try {
      const parsed = JSON.parse(aiText);
      feedback = {
        score: typeof parsed.score === "number" ? Math.round(Math.min(100, Math.max(0, parsed.score))) : 60,
        feedback: typeof parsed.feedback === "string" ? parsed.feedback : "Your explanation was evaluated.",
        gaps: Array.isArray(parsed.gaps) ? parsed.gaps.filter((g: unknown): g is string => typeof g === "string") : [],
        strengths: Array.isArray(parsed.strengths) ? parsed.strengths.filter((s: unknown): s is string => typeof s === "string") : [],
        expertVersion: typeof parsed.expertVersion === "string" ? parsed.expertVersion : body.expertVersion
      };
    } catch {
      return NextResponse.json({ error: "Failed to parse AI response" }, { status: 500 });
    }

    return NextResponse.json({ feedback });
  } catch (error) {
    console.error("Teach-back evaluation failed:", error);
    return NextResponse.json({ error: "Evaluation failed" }, { status: 500 });
  }
}
