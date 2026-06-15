"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type VoiceInputState = "idle" | "recording" | "transcribing" | "ready" | "error";

type UseVoiceRecorderArgs = {
  onTranscript: (transcript: string) => void;
  listeningMessage: string;
  transcribingMessage: string;
  readyMessage: string;
  errorMessage: string;
};

export function useVoiceRecorder({
  onTranscript,
  listeningMessage,
  transcribingMessage,
  readyMessage,
  errorMessage
}: UseVoiceRecorderArgs) {
  const [voiceInputState, setVoiceInputState] = useState<VoiceInputState>("idle");
  const [voiceStatusMessage, setVoiceStatusMessage] = useState("");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const skipNextTranscriptionRef = useRef(false);

  const transcribeAudio = useCallback(async (audioBlob: Blob) => {
    if (audioBlob.size <= 0) {
      setVoiceInputState("error");
      setVoiceStatusMessage(errorMessage);
      return;
    }

    setVoiceInputState("transcribing");
    setVoiceStatusMessage(transcribingMessage);

    try {
      const formData = new FormData();
      formData.append("audio", audioBlob, "voice-input.webm");
      const response = await fetch("/api/voice/transcribe", {
        method: "POST",
        body: formData
      });
      const payload = await response.json() as {
        transcript?: string;
        error?: string;
      };
      const transcript = payload.transcript?.trim();

      if (!response.ok || !transcript) {
        throw new Error(payload.error ?? "No transcript returned");
      }

      onTranscript(transcript);
      setVoiceInputState("ready");
      setVoiceStatusMessage(readyMessage);
    } catch (error) {
      console.error("Voice transcription failed:", error);
      setVoiceInputState("error");
      setVoiceStatusMessage(errorMessage);
    }
  }, [errorMessage, onTranscript, readyMessage, transcribingMessage]);

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;

    if (recorder && recorder.state === "recording") {
      recorder.stop();
    }
  }, []);

  const startRecording = useCallback(async () => {
    if (voiceInputState === "transcribing") return;

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setVoiceInputState("error");
      setVoiceStatusMessage("Voice input is not available in this browser");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      mediaStreamRef.current = stream;
      mediaRecorderRef.current = recorder;

      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      });
      recorder.addEventListener("stop", () => {
        if (skipNextTranscriptionRef.current) {
          skipNextTranscriptionRef.current = false;
          stream.getTracks().forEach((track) => track.stop());
          mediaRecorderRef.current = null;
          mediaStreamRef.current = null;
          audioChunksRef.current = [];
          return;
        }

        const audioBlob = new Blob(audioChunksRef.current, {
          type: recorder.mimeType || "audio/webm"
        });

        stream.getTracks().forEach((track) => track.stop());
        mediaRecorderRef.current = null;
        mediaStreamRef.current = null;
        void transcribeAudio(audioBlob);
      });

      recorder.start();
      setVoiceInputState("recording");
      setVoiceStatusMessage(listeningMessage);
    } catch (error) {
      console.error("Microphone permission failed:", error);
      setVoiceInputState("error");
      setVoiceStatusMessage("Microphone permission was denied");
    }
  }, [listeningMessage, transcribeAudio, voiceInputState]);

  const handleVoiceInputClick = useCallback(() => {
    if (voiceInputState === "recording") {
      stopRecording();
      return;
    }

    void startRecording();
  }, [startRecording, stopRecording, voiceInputState]);

  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current?.state === "recording") {
        skipNextTranscriptionRef.current = true;
        mediaRecorderRef.current.stop();
      }
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  return {
    voiceInputState,
    voiceStatusMessage,
    handleVoiceInputClick,
    isVoiceBusy: voiceInputState === "recording" || voiceInputState === "transcribing"
  };
}
