import { createGroq } from "@ai-sdk/groq";
import { createOpenAI } from "@ai-sdk/openai";
import { transcribe } from "ai";
import type { TranscriptionModel } from "ai";

/** Speech to text for voice notes and screen recordings. Optional: without
 *  one, reports arrive with no transcript. */
export interface Transcriber {
  /** The words spoken in `media`: an audio note (webm/mp4/mpeg/ogg/wav) or a
   *  screen recording's container (webm/mp4), whose audio track is the one to
   *  transcribe. Throws when it can't; the issue's transcript is then marked
   *  failed. */
  transcribe(media: Uint8Array): Promise<string>;
}

export interface ProviderOptions {
  apiKey: string;
  /** The provider's default unless set. */
  model?: string;
}

/** Any Vercel AI SDK transcription model. The SDK detects the audio format
 *  from the file signature, so raw bytes are enough. */
export function aiSdkTranscriber(model: TranscriptionModel): Transcriber {
  return {
    async transcribe(media) {
      const { text } = await transcribe({ model, audio: media });
      return text;
    },
  };
}

/** Groq's hosted Whisper. */
export function groqTranscriber({ apiKey, model }: ProviderOptions): Transcriber {
  return aiSdkTranscriber(createGroq({ apiKey }).transcription(model || "whisper-large-v3-turbo"));
}

/** OpenAI's transcription models. */
export function openaiTranscriber({ apiKey, model }: ProviderOptions): Transcriber {
  return aiSdkTranscriber(createOpenAI({ apiKey }).transcription(model || "gpt-4o-mini-transcribe"));
}

/** The providers TRANSCRIPTION_PROVIDER can name, with the env var holding
 *  each one's key. Adding a provider = one entry here + its key in env.ts. */
export const TRANSCRIPTION_PROVIDERS = {
  groq: { create: groqTranscriber, keyVar: "GROQ_API_KEY" },
  openai: { create: openaiTranscriber, keyVar: "OPENAI_API_KEY" },
} as const;
