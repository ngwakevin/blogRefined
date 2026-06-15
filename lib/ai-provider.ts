export async function callAIProvider(args: {
  systemPrompt: string;
  userPrompt: string;
}): Promise<string> {
  const apiKey = process.env.AI_API_KEY;
  const model = process.env.AI_MODEL;

  console.log("AI provider check", {
    hasKey: Boolean(apiKey),
    model
  });

  if (!apiKey || !model) {
    throw new Error("AI provider is not configured");
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: args.systemPrompt },
        { role: "user", content: args.userPrompt }
      ]
    })
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(
      `AI provider request failed with ${response.status}${
        errorBody ? `: ${errorBody.slice(0, 300)}` : ""
      }`
    );
  }

  const data = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("AI provider returned no content");
  }

  return content;
}
