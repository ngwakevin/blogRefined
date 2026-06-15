import { NextResponse } from "next/server";

type TranscriptionPayload = {
  transcript?: string;
  text?: string;
};

export async function POST(request: Request) {
  const formData = await request.formData().catch(() => null);
  const audioFile = formData?.get("audio");

  if (!(audioFile instanceof File)) {
    return NextResponse.json({ error: "Missing audio file" }, { status: 400 });
  }

  if (audioFile.size <= 0) {
    return NextResponse.json({ error: "Audio file is empty" }, { status: 400 });
  }

  try {
    const transcript = await transcribeAudioFile(audioFile);

    if (!transcript) {
      return NextResponse.json({ error: "No transcript returned" }, { status: 422 });
    }

    return NextResponse.json({ transcript });
  } catch (error) {
    console.error("Voice transcription failed:", error);
    return NextResponse.json({ error: "Transcription failed" }, { status: 500 });
  }
}

async function transcribeAudioFile(audioFile: File): Promise<string> {
  const apiKey = process.env.AI_API_KEY;

  if (!apiKey) {
    throw new Error("AI provider is not configured");
  }

  try {
    return await requestTranscription({
      apiKey,
      model: process.env.AI_TRANSCRIBE_MODEL ?? "gpt-4o-mini-transcribe",
      audioFile
    });
  } catch (primaryError) {
    if (process.env.AI_TRANSCRIBE_MODEL === "whisper-1") throw primaryError;

    return requestTranscription({
      apiKey,
      model: "whisper-1",
      audioFile
    });
  }
}

async function requestTranscription(args: {
  apiKey: string;
  model: string;
  audioFile: File;
}): Promise<string> {
  const body = new FormData();
  body.append("file", args.audioFile, audioFilenameForType(args.audioFile.type));
  body.append("model", args.model);
  body.append("response_format", "json");

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.apiKey}`
    },
    body
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(
      `Transcription request failed with ${response.status}${
        errorBody ? `: ${errorBody.slice(0, 300)}` : ""
      }`
    );
  }

  const parsed = await response.json() as TranscriptionPayload;
  return (parsed.transcript ?? parsed.text ?? "").trim();
}

function audioFilenameForType(mimeType: string): string {
  if (mimeType.includes("mp4")) return "prompt-audio.mp4";
  if (mimeType.includes("mpeg")) return "prompt-audio.mp3";
  if (mimeType.includes("wav")) return "prompt-audio.wav";
  if (mimeType.includes("ogg")) return "prompt-audio.ogg";
  return "prompt-audio.webm";
}
