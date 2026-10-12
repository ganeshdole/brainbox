import { beforeEach, describe, expect, it, vi } from "vitest";

import { app } from "../src/app.ts";
import { stored } from "./harness.ts";
import { getStorage } from "../src/storage/index.ts";
import { LocalStorage } from "../src/storage/local.ts";
import { makeProject, makeUser } from "./helpers.ts";

const { transcribeAudioMock, transcriptionEnabledMock } = vi.hoisted(() => ({
  transcribeAudioMock: vi.fn<(audio: Uint8Array) => Promise<string>>(),
  transcriptionEnabledMock: vi.fn(() => false),
}));
vi.mock("../src/lib/transcription.ts", () => ({
  transcribeAudio: transcribeAudioMock,
  transcriptionEnabled: transcriptionEnabledMock,
}));

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);

function pngFile() {
  return new File([PNG], "s.png", { type: "image/png" });
}

function payload(projectKey: string) {
  return {
    projectKey,
    region: { x: 1, y: 2, width: 3, height: 4 },
    text: "broken",
    metadata: {
      url: "http://host/app",
      title: "App",
      viewport: { width: 800, height: 600 },
      devicePixelRatio: 1,
      userAgent: "UA",
      language: "en",
      timezone: "UTC",
      consoleErrors: ["e1"],
    },
  };
}

function post(fd: FormData, headers: Record<string, string> = {}) {
  return app.request("/ingest", { method: "POST", body: fd, headers });
}

function form(json: object, screenshot: File | null = pngFile()) {
  const fd = new FormData();
  fd.append("json", JSON.stringify(json));
  if (screenshot) fd.append("screenshot", screenshot);
  return fd;
}

describe("POST /ingest", () => {
  it("stores a screenshot and persists an issue (201)", async () => {
    const user = await makeUser();
    const project = await makeProject(user.id);

    const res = await post(form(payload(project.key)));
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string };
    expect(body.id).toBeTruthy();

    const row = (await stored.issues(body.id))[0]!;
    expect(row.projectId).toBe(project.id);
    expect(row.text).toBe("broken");
    expect(row.region).toEqual({ x: 1, y: 2, width: 3, height: 4 });

    const storage = getStorage();
    expect(storage).toBeInstanceOf(LocalStorage);
    const bytes = await (storage as LocalStorage).read(row.screenshotKey ?? "");
    expect([...bytes.slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });

  it("keeps the reporter and the app's own fields exactly as sent", async () => {
    const user = await makeUser();
    const project = await makeProject(user.id);
    const identity = { id: "u1", email: "priya@acme.vet", name: "Priya Shah", phone: "+1 555 0100" };
    const fields = [
      { label: "Clinic", value: "Acme Vet", highlight: true },
      { label: "Tenant ID", value: "t-1", type: "id" },
    ];
    const json = payload(project.key);

    const res = await post(form({ ...json, metadata: { ...json.metadata, identity, fields } }));
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };

    const row = (await stored.issues(id))[0]!;
    expect(row.metadata.identity).toEqual(identity);
    expect(row.metadata.fields).toEqual(fields);
  });

  it("rejects an unknown project key (401)", async () => {
    const res = await post(form(payload("pk_does_not_exist")));
    expect(res.status).toBe(401);
  });

  it("enforces the origin allowlist (403 mismatch, 201 match)", async () => {
    const user = await makeUser();
    const project = await makeProject(user.id, ["https://allowed.example"]);

    const bad = await post(form(payload(project.key)), { origin: "https://evil.example" });
    expect(bad.status).toBe(403);

    const good = await post(form(payload(project.key)), { origin: "https://allowed.example" });
    expect(good.status).toBe(201);
  });

  it("rejects a non-image screenshot (400)", async () => {
    const user = await makeUser();
    const project = await makeProject(user.id);
    const fd = form(payload(project.key), null);
    fd.append("screenshot", new File(["x"], "s.txt", { type: "text/plain" }));
    expect((await post(fd)).status).toBe(400);
  });

  it("rejects a missing json part (400)", async () => {
    const fd = new FormData();
    fd.append("screenshot", pngFile());
    expect((await post(fd)).status).toBe(400);
  });
});

describe("POST /ingest — voice note transcription", () => {
  beforeEach(() => {
    transcribeAudioMock.mockReset();
    transcriptionEnabledMock.mockReset();
    transcriptionEnabledMock.mockReturnValue(false);
  });

  function audioForm(projectKey: string) {
    const fd = form(payload(projectKey));
    fd.append("audio", new File([new Uint8Array([9, 8, 7])], "a.webm", { type: "audio/webm" }));
    return fd;
  }

  async function issueRow(id: string) {
    return (await stored.issues(id))[0]!;
  }

  it("leaves transcript status null when transcription is disabled", async () => {
    const user = await makeUser();
    const project = await makeProject(user.id);

    const res = await post(audioForm(project.key));
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };

    const row = await issueRow(id);
    expect(row.audioKey).toContain("audio.webm");
    expect(row.audioTranscriptStatus).toBeNull();
    expect(transcribeAudioMock).not.toHaveBeenCalled();
  });

  it("transcribes the audio in the background and stores the text", async () => {
    transcriptionEnabledMock.mockReturnValue(true);
    transcribeAudioMock.mockResolvedValue("the checkout page crashes");
    const user = await makeUser();
    const project = await makeProject(user.id);

    const res = await post(audioForm(project.key));
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };

    await vi.waitFor(async () => {
      const row = await issueRow(id);
      expect(row.audioTranscriptStatus).toBe("done");
      expect(row.audioTranscript).toBe("the checkout page crashes");
    });
    expect(transcribeAudioMock).toHaveBeenCalledWith(new Uint8Array([9, 8, 7]));
  });

  it("marks the transcription failed when the provider errors", async () => {
    transcriptionEnabledMock.mockReturnValue(true);
    transcribeAudioMock.mockRejectedValue(new Error("provider down"));
    const user = await makeUser();
    const project = await makeProject(user.id);

    const res = await post(audioForm(project.key));
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };

    await vi.waitFor(async () => {
      const row = await issueRow(id);
      expect(row.audioTranscriptStatus).toBe("failed");
      expect(row.audioTranscript).toBeNull();
    });
  });

  it("transcribes a screen recording's audio track and stores it on video", async () => {
    transcriptionEnabledMock.mockReturnValue(true);
    transcribeAudioMock.mockResolvedValue("so I click save and nothing happens");
    const user = await makeUser();
    const project = await makeProject(user.id);

    const fd = form(payload(project.key), null);
    fd.append("video", new File([new Uint8Array([1, 2, 3])], "r.webm", { type: "video/webm" }));
    const res = await post(fd);
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };

    await vi.waitFor(async () => {
      const row = await issueRow(id);
      expect(row.videoTranscriptStatus).toBe("done");
      expect(row.videoTranscript).toBe("so I click save and nothing happens");
    });
    expect(transcribeAudioMock).toHaveBeenCalledWith(new Uint8Array([1, 2, 3]));
    const row = await issueRow(id);
    expect(row.audioTranscriptStatus).toBeNull();
  });

  it("marks a failed recording transcription on the video fields", async () => {
    transcriptionEnabledMock.mockReturnValue(true);
    transcribeAudioMock.mockRejectedValue(new Error("provider down"));
    const user = await makeUser();
    const project = await makeProject(user.id);

    const fd = form(payload(project.key), null);
    fd.append("video", new File([new Uint8Array([1, 2, 3])], "r.webm", { type: "video/webm" }));
    const res = await post(fd);
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };

    await vi.waitFor(async () => {
      const row = await issueRow(id);
      expect(row.videoTranscriptStatus).toBe("failed");
      expect(row.videoTranscript).toBeNull();
    });
  });

  it("does not transcribe issues without audio even when enabled", async () => {
    transcriptionEnabledMock.mockReturnValue(true);
    const user = await makeUser();
    const project = await makeProject(user.id);

    const res = await post(form(payload(project.key)));
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };

    const row = await issueRow(id);
    expect(row.audioTranscriptStatus).toBeNull();
    expect(transcribeAudioMock).not.toHaveBeenCalled();
  });
});
