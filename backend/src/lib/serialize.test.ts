import { describe, expect, it } from "vitest";
import type { CapturedMetadata, Region } from "@ganeshdole/brainbox-shared";

import type { IssueRecord, ProjectRecord } from "../store/types.ts";
import type { Storage } from "../storage/types.ts";
import { toIssue, toIssueEvent, toProject } from "./serialize.ts";

const region: Region = { x: 0, y: 0, width: 10, height: 10 };
const metadata: CapturedMetadata = {
  url: "http://host/app",
  title: "App",
  viewport: { width: 1, height: 1 },
  devicePixelRatio: 1,
  userAgent: "x",
  language: "en",
  timezone: "UTC",
  consoleErrors: [],
};

// Storage stub - toIssue should only call presignGet.
const storage: Storage = {
  put: async () => {},
  presignGet: async (key) => `https://signed/${key}`,
};

describe("toProject", () => {
  it("maps a row 1:1 with an ISO createdAt and the caller's view of its team", () => {
    const row: ProjectRecord = {
      id: "p1",
      teamId: "t1",
      name: "N",
      key: "pk_x",
      allowedOrigins: ["a.com"],
      createdAt: new Date("2024-01-01T00:00:00Z"),
    };
    const team = { id: "t1", name: "Acme", role: "member" as const };
    expect(toProject(row, team)).toEqual({
      id: "p1",
      name: "N",
      key: "pk_x",
      allowedOrigins: ["a.com"],
      team,
      createdAt: "2024-01-01T00:00:00.000Z",
    });
  });
});

describe("toIssue", () => {
  const base: IssueRecord = {
    id: "i1",
    projectId: "p1",
    createdAt: new Date("2024-01-01T00:00:00Z"),
    status: "new",
    priority: "none",
    closeReason: null,
    statusChangedAt: null,
    kind: "bug",
    importance: null,
    featureId: null,
    text: "hi",
    screenshotKey: "p1/i1/s.png",
    cropKey: null,
    videoKey: null,
    videoMime: null,
    videoTranscript: null,
    videoTranscriptStatus: null,
    sessionKey: null,
    audioKey: "p1/i1/a.webm",
    audioMime: "audio/webm",
    audioTranscript: null,
    audioTranscriptStatus: null,
    region,
    metadata,
  };

  it("builds screenshot + audio with signed urls and an ISO date", async () => {
    const issue = await toIssue(base, storage);
    expect(issue.createdAt).toBe("2024-01-01T00:00:00.000Z");
    expect(issue.screenshot).toEqual({ key: "p1/i1/s.png", url: "https://signed/p1/i1/s.png" });
    expect(issue.audio).toEqual({
      key: "p1/i1/a.webm",
      url: "https://signed/p1/i1/a.webm",
      mime: "audio/webm",
    });
    expect(issue.text).toBe("hi");
  });

  it("carries the kind, and a feature request's importance", async () => {
    expect(await toIssue(base, storage)).toMatchObject({ kind: "bug" });
    expect((await toIssue(base, storage)).importance).toBeUndefined();
    const feature = await toIssue({ ...base, kind: "feature", importance: "critical" }, storage);
    expect(feature).toMatchObject({ kind: "feature", importance: "critical" });
  });

  it("omits audio when there is no audioKey", async () => {
    const issue = await toIssue({ ...base, audioKey: null, audioMime: null }, storage);
    expect(issue.audio).toBeUndefined();
  });

  it("maps a finished transcript onto audio", async () => {
    const issue = await toIssue(
      { ...base, audioTranscript: "the save button is broken", audioTranscriptStatus: "done" },
      storage,
    );
    expect(issue.audio?.transcript).toBe("the save button is broken");
    expect(issue.audio?.transcriptStatus).toBe("done");
  });

  it("maps a pending transcription with no transcript text", async () => {
    const issue = await toIssue({ ...base, audioTranscriptStatus: "pending" }, storage);
    expect(issue.audio?.transcript).toBeUndefined();
    expect(issue.audio?.transcriptStatus).toBe("pending");
  });

  it("maps a finished transcript onto video", async () => {
    const issue = await toIssue(
      {
        ...base,
        videoKey: "p1/i1/rec.webm",
        videoMime: "video/webm",
        videoTranscript: "so I click save and nothing happens",
        videoTranscriptStatus: "done",
      },
      storage,
    );
    expect(issue.video?.transcript).toBe("so I click save and nothing happens");
    expect(issue.video?.transcriptStatus).toBe("done");
  });

  it("includes the crop with a signed url when cropKey is set", async () => {
    const issue = await toIssue({ ...base, cropKey: "p1/i1/crop.png" }, storage);
    expect(issue.crop).toEqual({ key: "p1/i1/crop.png", url: "https://signed/p1/i1/crop.png" });
  });

  it("omits crop when there is no cropKey", async () => {
    const issue = await toIssue(base, storage);
    expect(issue.crop).toBeUndefined();
  });

  it("maps a session recording: session present with a signed url", async () => {
    const issue = await toIssue(
      { ...base, screenshotKey: null, region: null, sessionKey: "p1/i1/session.json.gz" },
      storage,
    );
    expect(issue.screenshot).toBeUndefined();
    expect(issue.session).toEqual({
      key: "p1/i1/session.json.gz",
      url: "https://signed/p1/i1/session.json.gz",
    });
  });

  it("maps a recording: video present, screenshot/region absent", async () => {
    const issue = await toIssue(
      { ...base, screenshotKey: null, region: null, videoKey: "p1/i1/rec.webm", videoMime: "video/webm" },
      storage,
    );
    expect(issue.screenshot).toBeUndefined();
    expect(issue.region).toBeUndefined();
    expect(issue.video).toEqual({
      key: "p1/i1/rec.webm",
      url: "https://signed/p1/i1/rec.webm",
      mime: "video/webm",
    });
  });

  it("passes triage through, omitting a close reason and change time it lacks", async () => {
    const issue = await toIssue(base, storage);
    expect(issue.status).toBe("new");
    expect(issue.priority).toBe("none");
    expect(issue.closeReason).toBeUndefined();
    expect(issue.statusChangedAt).toBeUndefined();
  });

  it("maps a closed issue's reason and when it changed", async () => {
    const issue = await toIssue(
      { ...base, status: "closed", closeReason: "duplicate", statusChangedAt: new Date("2024-01-02T00:00:00Z") },
      storage,
    );
    expect(issue.closeReason).toBe("duplicate");
    expect(issue.statusChangedAt).toBe("2024-01-02T00:00:00.000Z");
  });

  it("maps null text to undefined", async () => {
    const issue = await toIssue({ ...base, text: null }, storage);
    expect(issue.text).toBeUndefined();
  });
});

describe("toIssueEvent", () => {
  const row = {
    id: "e1",
    issueId: "i1",
    actorId: "u1",
    kind: "status" as const,
    from: "new",
    to: "open",
    createdAt: new Date("2024-01-01T00:00:00Z"),
  };

  it("names the actor when the name is known", () => {
    expect(toIssueEvent(row, new Map([["u1", "Ada"]]))).toEqual({
      id: "e1",
      issueId: "i1",
      kind: "status",
      from: "new",
      to: "open",
      actor: { id: "u1", name: "Ada" },
      createdAt: "2024-01-01T00:00:00.000Z",
    });
  });

  it("keeps an unnamed actor by id, and leaves a system change without one", () => {
    expect(toIssueEvent(row, new Map()).actor).toEqual({ id: "u1" });
    expect(toIssueEvent({ ...row, actorId: null }, new Map())).not.toHaveProperty("actor");
  });
});
