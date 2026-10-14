import { afterEach, describe, expect, it, vi } from "vitest";

const transcribeMock = vi.hoisted(() => vi.fn());
vi.mock("ai", () => ({ transcribe: transcribeMock }));

// env.ts snapshots process.env at import — stub vars, then re-import fresh.
async function fromEnv(vars: Record<string, string>) {
  vi.resetModules();
  for (const [key, value] of Object.entries(vars)) vi.stubEnv(key, value);
  return import("../from-env.ts");
}

async function providers() {
  vi.resetModules();
  return import("./index.ts");
}

afterEach(() => {
  vi.unstubAllEnvs();
  transcribeMock.mockReset();
});

const audio = new Uint8Array([1, 2, 3]);

function modelId(call = 0): string {
  return (transcribeMock.mock.calls[call]![0] as { model: { modelId: string } }).model.modelId;
}

describe("provider transcribers", () => {
  it("transcribe through groq with its default model", async () => {
    transcribeMock.mockResolvedValue({ text: "hello world" });
    const { groqTranscriber } = await providers();
    await expect(groqTranscriber({ apiKey: "gk_test" }).transcribe(audio)).resolves.toBe("hello world");
    expect(modelId()).toBe("whisper-large-v3-turbo");
    expect((transcribeMock.mock.calls[0]![0] as { audio: Uint8Array }).audio).toBe(audio);
  });

  it("transcribe through openai with its default model", async () => {
    transcribeMock.mockResolvedValue({ text: "hi" });
    const { openaiTranscriber } = await providers();
    await expect(openaiTranscriber({ apiKey: "sk_test" }).transcribe(audio)).resolves.toBe("hi");
    expect(modelId()).toBe("gpt-4o-mini-transcribe");
  });

  it("take another model", async () => {
    transcribeMock.mockResolvedValue({ text: "hi" });
    const { groqTranscriber } = await providers();
    await groqTranscriber({ apiKey: "gk_test", model: "whisper-large-v3" }).transcribe(audio);
    expect(modelId()).toBe("whisper-large-v3");
  });
});

describe("fromEnv's transcriber", () => {
  it("is left out when TRANSCRIPTION_PROVIDER is unset", async () => {
    const { fromEnv: build } = await fromEnv({});
    expect(build().transcriber).toBeUndefined();
  });

  it("rejects an unknown provider when it is used", async () => {
    const { transcriberFromEnv } = await fromEnv({ TRANSCRIPTION_PROVIDER: "nope" });
    await expect(transcriberFromEnv().transcribe(audio)).rejects.toThrow(/Unknown TRANSCRIPTION_PROVIDER/);
  });

  it("rejects when the provider's API key is missing", async () => {
    const { transcriberFromEnv } = await fromEnv({ TRANSCRIPTION_PROVIDER: "groq" });
    await expect(transcriberFromEnv().transcribe(audio)).rejects.toThrow(/requires GROQ_API_KEY/);
  });

  it("is the named provider, with TRANSCRIPTION_MODEL", async () => {
    transcribeMock.mockResolvedValue({ text: "hi" });
    const { fromEnv: build } = await fromEnv({
      TRANSCRIPTION_PROVIDER: "groq",
      TRANSCRIPTION_MODEL: "whisper-large-v3",
      GROQ_API_KEY: "gk_test",
    });
    await expect(build().transcriber?.transcribe(audio)).resolves.toBe("hi");
    expect(modelId()).toBe("whisper-large-v3");
  });
});
