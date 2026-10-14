// Dev harness for the bricks (`compose.html`, entry `compose.tsx`): a widget with one step
// replaced, and the markup step on its own over a draft and over an image.
// Reports go to the page, not a backend.
import { useMemo, useState } from "react";
import type { Draft, Mark, Report, Transport } from "@ganeshdole/brainbox-core";
import { BrainboxProvider, useBrainbox, useDraft } from "@ganeshdole/brainbox-react";
import { BrainboxWidget, useBrainboxWidget, type ComposerProps } from "../index.ts";
import {
  BrainboxShadow,
  createShadowHost,
  DraftMarkup,
  MarkupOverlay,
  type ShadowHost,
} from "../markup.ts";

const composerCss = `
  .my-composer { position: fixed; bottom: 20px; right: 20px; width: 320px; padding: 16px;
    border-radius: 12px; background: #fef3c7; color: #451a03; font: 14px system-ui; }
  .my-composer textarea { width: 100%; height: 72px; box-sizing: border-box; }
  .my-composer img { width: 100%; border-radius: 6px; }
  .my-composer button { margin-top: 8px; margin-right: 8px; }
`;

/** A host's own composer: its own look, our markup before it. */
function MyComposer({ screenshotUrl, capturePending, onSubmit, onCancel }: ComposerProps) {
  const [text, setText] = useState("");
  return (
    <div className="my-composer">
      <style>{composerCss}</style>
      <strong>Our own composer</strong>
      {capturePending ? <p>Baking your marks…</p> : screenshotUrl && <img src={screenshotUrl} alt="" />}
      <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="What broke?" />
      <button onClick={() => onSubmit(text, null)}>Send it</button>
      <button onClick={onCancel}>Never mind</button>
    </div>
  );
}

const components = { Composer: MyComposer };

/** The markup brick over a core draft, outside the widget. */
function StandaloneMarkup({ onClose }: { onClose: () => void }) {
  const brainbox = useBrainbox();
  // The host first, so the draft can keep the overlay out of its screenshot.
  const [host] = useState(createShadowHost);
  const draft = useMemo(() => brainbox?.draft({ exclude: host.element }), [brainbox, host]);
  return draft ? <DraftPanel draft={draft} host={host} onClose={onClose} /> : null;
}

function DraftPanel({ draft, host, onClose }: { draft: Draft; host: ShadowHost; onClose: () => void }) {
  const [marking, setMarking] = useState(true);
  const state = useDraft(draft);
  return (
    <div className="card">
      <p>Standalone markup over a draft</p>
      {marking ? (
        <BrainboxShadow host={host} theme="light">
          <DraftMarkup
            draft={draft}
            hint="Standalone markup: draw, then Next"
            onDone={() => setMarking(false)}
            onCancel={() => {
              draft.cancel();
              onClose();
            }}
          />
        </BrainboxShadow>
      ) : (
        <>
          {state.screenshotPending && <p>Baking…</p>}
          {state.screenshotUrl && <img className="result" src={state.screenshotUrl} alt="baked" />}
          <button className="host" onClick={() => void draft.submit({ text: "from the markup brick" }).then(onClose)}>
            Submit the draft
          </button>
        </>
      )}
    </div>
  );
}

/** The overlay over a plain image, marks back as JSON. */
function ImageMarkup({ onDone }: { onDone: (marks: Mark[]) => void }) {
  const url = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 1200;
    c.height = 800;
    const ctx = c.getContext("2d");
    if (ctx) {
      const g = ctx.createLinearGradient(0, 0, 1200, 800);
      g.addColorStop(0, "#1e3a8a");
      g.addColorStop(1, "#9d174d");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 1200, 800);
      ctx.fillStyle = "#fff";
      ctx.font = "bold 64px system-ui";
      ctx.fillText("A design mock", 80, 140);
    }
    return c.toDataURL();
  }, []);
  return (
    <BrainboxShadow>
      <MarkupOverlay screenshotUrl={url} hint="Circle what to change" onDone={onDone} onCancel={() => onDone([])} />
    </BrainboxShadow>
  );
}

function Page({ sent }: { sent: Report[] }) {
  const { open, start } = useBrainboxWidget();
  const [mode, setMode] = useState<"none" | "draft" | "image">("none");
  const [marks, setMarks] = useState<Mark[] | null>(null);
  return (
    <>
      <div className="card">
        <button className="host" onClick={open}>Open the widget</button>
        <button className="host" onClick={() => start("screenshot")}>Screenshot (custom composer)</button>
        <button className="host" onClick={() => setMode("draft")}>Markup brick over a draft</button>
        <button className="host" onClick={() => setMode("image")}>Markup over an image</button>
        <button className="host" onClick={() => document.body.classList.toggle("purple")}>Toggle purple brand</button>
      </div>
      {mode === "draft" && <StandaloneMarkup onClose={() => setMode("none")} />}
      {mode === "image" && (
        <ImageMarkup
          onDone={(m) => {
            setMarks(m);
            setMode("none");
          }}
        />
      )}
      {marks && (
        <div className="card">
          <p>Marks from the image</p>
          <pre id="marks">{JSON.stringify(marks, null, 2)}</pre>
        </div>
      )}
      <div className="card">
        <p>Reports sent: {sent.length}</p>
        <pre id="sent">{JSON.stringify(sent.map(({ text, kind, region }) => ({ text, kind, region })), null, 2)}</pre>
      </div>
    </>
  );
}

export function Harness() {
  const [sent, setSent] = useState<Report[]>([]);
  const transport = useMemo<Transport>(
    () => ({
      send: async (report) => {
        setSent((s) => [...s, report]);
        return { id: crypto.randomUUID() };
      },
    }),
    [],
  );
  return (
    <BrainboxProvider transport={transport}>
      <Page sent={sent} />
      <BrainboxWidget components={components} />
    </BrainboxProvider>
  );
}
