import { Mic } from "lucide-react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { pop, ramp } from "../motion.ts";
import { MARK, dark, font, light } from "../theme.ts";
import { DELIVERED, DELIVERED_STAGGER, DEST, WHIP2 } from "../timeline.ts";
import { Grid } from "./Backdrop.tsx";
import { BRAND, Mark } from "./Icons.tsx";

/*
 * Act four. The same report, as each tool shows it: a Linear issue, a Slack
 * message in #bugs, a Gmail inbox row. Full frame, the tool's own look, one
 * arrival motion each. Then the four marks with their ticks. A diagram was
 * tried here first; it read as a flowchart, not a film.
 *
 * Everything here is laid out at film scale, like the GitHub page before it:
 * type around 22px, generous padding, so the frame is full at 1920×1080.
 */

const TITLE = "Pay now does nothing on the last checkout step";
const TRANSCRIPT = "Hey, so I hit Pay now and nothing happens? I tried it twice. Same thing.";
const ERRORS = ["TypeError: Cannot read properties of undefined (reading 'token')", "POST /api/pay 500 (Internal Server Error)"];

export function Destinations() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (frame < DEST.from) return null;
  const screens = [
    { at: DEST.linear, until: DEST.slack, node: <LinearIssue at={DEST.linear} /> },
    { at: DEST.slack, until: DEST.gmail, node: <SlackMessage at={DEST.slack} /> },
    { at: DEST.gmail, until: DEST.row, node: <GmailInbox at={DEST.gmail} /> },
    { at: DEST.row, until: WHIP2.to, node: <DeliveredRow fps={fps} /> },
  ];
  return (
    <div style={{ position: "absolute", inset: 0, background: dark.bg, fontFamily: font.sans }}>
      {screens.map(({ at, until, node }, i) => {
        if (frame < at || frame >= until + DEST.xfade) return null;
        const fadeIn = ramp(frame, at, DEST.xfade);
        const fadeOut = i === screens.length - 1 ? 1 : 1 - ramp(frame, until, DEST.xfade);
        const life = ramp(frame, at, until - at);
        return (
          <div
            key={at}
            style={{
              position: "absolute",
              inset: 0,
              opacity: Math.min(fadeIn, fadeOut),
              transform: `scale(${1 + life * 0.025})`,
              transformOrigin: "50% 50%",
            }}
          >
            {node}
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */

const linear = { bg: "#0f1011", panel: "#141516", line: "rgba(255,255,255,0.08)", text: "#e3e3e6", dim: "#8a8f98", accent: "#5e6ad2" };

function LinearIssue({ at }: { at: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = (d: number) => pop(frame, fps, at + d);
  const props: [string, string, string, number][] = [
    ["Status", "Todo", "#f2c94c", t(4)],
    ["Priority", "Urgent", "#f2994a", t(6)],
    ["Assignee", "Unassigned", linear.dim, t(8)],
    ["Labels", "Bug", "#eb5757", t(10)],
    ["Project", "Checkout", linear.accent, t(12)],
    ["Source", "Brainbox", "#ffffff", t(14)],
  ];
  return (
    <div style={{ position: "absolute", inset: 0, background: linear.bg, color: linear.text, fontSize: 22 }}>
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 300, background: linear.panel, borderRight: `1px solid ${linear.line}`, padding: "28px 18px 28px 48px", boxSizing: "border-box" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 12px", fontWeight: 600, fontSize: 22 }}>
          <span style={{ width: 28, height: 28, borderRadius: 8, background: linear.accent }} /> Acme
        </div>
        {["Inbox", "My issues", "Views", "Projects", "Cycles", "Triage"].map((item, i) => (
          <div
            key={item}
            style={{
              marginTop: i === 0 ? 28 : 4,
              padding: "10px 14px",
              borderRadius: 8,
              fontSize: 20,
              color: item === "Triage" ? linear.text : linear.dim,
              background: item === "Triage" ? "rgba(255,255,255,0.07)" : undefined,
            }}
          >
            {item}
          </div>
        ))}
      </div>

      <div style={{ position: "absolute", left: 300, right: 460, top: 0, bottom: 0 }}>
        <div style={{ height: 76, display: "flex", alignItems: "center", gap: 14, padding: "0 56px", borderBottom: `1px solid ${linear.line}`, color: linear.dim, fontSize: 20 }}>
          <Mark name="linear" size={20} color={linear.dim} /> Triage <span>›</span> <span style={{ color: linear.text, fontWeight: 500 }}>ACM-482</span>
        </div>
        <div style={{ padding: "52px 64px 0" }}>
          <Rise t={t(2)}>
            <div style={{ fontSize: 46, fontWeight: 600, letterSpacing: "-0.025em", lineHeight: 1.15 }}>{TITLE}</div>
          </Rise>
          <Rise t={t(8)}>
            <div style={{ marginTop: 34, display: "flex", gap: 32 }}>
              <Shot width={420} />
              <div style={{ flex: 1, minWidth: 0, color: linear.dim, lineHeight: 1.5, fontSize: 22 }}>
                <div style={{ color: linear.text, fontWeight: 600 }}>Voice note</div>
                <div style={{ marginTop: 6 }}>{TRANSCRIPT}</div>
                <div style={{ marginTop: 24, color: linear.text, fontWeight: 600 }}>2 console errors</div>
                {ERRORS.map((e) => (
                  <div key={e} style={{ marginTop: 6, fontFamily: font.mono, fontSize: 18, color: "#f0716c", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {e}
                  </div>
                ))}
                <div style={{ marginTop: 24, fontSize: 20 }}>
                  <span style={{ color: linear.accent }}>Open in Brainbox</span> · <span style={{ color: linear.accent }}>GitHub #482</span>
                </div>
              </div>
            </div>
          </Rise>
          <div style={{ marginTop: 56, paddingTop: 28, borderTop: `1px solid ${linear.line}` }}>
            <Rise t={t(16)}>
              <div style={{ color: linear.dim, fontSize: 18, letterSpacing: "0.06em", fontWeight: 600 }}>ACTIVITY</div>
            </Rise>
            {[
              ["Brainbox", "created the issue from Maya Chen's report", t(18)],
              ["Brainbox", "linked GitHub #482 and attached the screenshot", t(20)],
              ["Brainbox", "set priority to Urgent: 2 console errors on checkout", t(22)],
            ].map(([who, what, tt]) => (
              <div key={String(what)} style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 18, fontSize: 20, color: linear.dim, opacity: Number(tt) }}>
                <span style={{ width: 28, height: 28, borderRadius: 7, background: "#fff", color: "#000", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Mic size={15} />
                </span>
                <span>
                  <span style={{ color: linear.text, fontWeight: 600 }}>{who}</span> {what} · <span>just now</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 460, borderLeft: `1px solid ${linear.line}`, padding: "48px 72px 48px 40px", boxSizing: "border-box", fontSize: 22 }}>
        {props.map(([k, v, c, tt]) => (
          <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 0", opacity: tt }}>
            <span style={{ color: linear.dim }}>{k}</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 12 }}>
              <span style={{ width: 14, height: 14, borderRadius: 999, background: c }} /> {v}
            </span>
          </div>
        ))}
        <div style={{ marginTop: 28, paddingTop: 22, borderTop: `1px solid ${linear.line}`, color: linear.dim, fontSize: 19, opacity: t(16) }}>
          Created just now · from a Brainbox report
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

const slack = { side: "#19171d", bg: "#1a1d21", line: "rgba(255,255,255,0.08)", text: "#d1d2d3", dim: "#9a9b9d", link: "#1d9bd1" };

function SlackMessage({ at }: { at: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = pop(frame, fps, at + 4);
  return (
    <div style={{ position: "absolute", inset: 0, background: slack.bg, color: slack.text, fontSize: 22 }}>
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 340, background: slack.side, padding: "28px 20px 28px 52px", boxSizing: "border-box" }}>
        <div style={{ fontWeight: 700, fontSize: 26, padding: "6px 12px" }}>Acme</div>
        <div style={{ marginTop: 34, padding: "6px 12px", color: slack.dim, fontSize: 16, letterSpacing: "0.06em" }}>CHANNELS</div>
        {["general", "bugs", "eng", "support", "design"].map((c) => (
          <div key={c} style={{ padding: "10px 14px", borderRadius: 8, fontSize: 22, background: c === "bugs" ? "#1164a3" : undefined, color: c === "bugs" ? "#fff" : slack.dim }}>
            # {c}
          </div>
        ))}
      </div>
      <div style={{ position: "absolute", left: 340, right: 0, top: 0, bottom: 0 }}>
        <div style={{ height: 76, display: "flex", alignItems: "center", padding: "0 40px", borderBottom: `1px solid ${slack.line}`, fontWeight: 700, fontSize: 26 }}>
          # bugs
        </div>
        <div style={{ position: "absolute", left: 40, right: 90, bottom: 250 }}>
          <OldMessage name="priya" time="1:48 PM" text="shipped the order summary refactor, keep an eye on checkout today" />
          <OldMessage name="sam" time="2:03 PM" text="anyone seeing checkout errors in sentry? nothing on my side" />
          <div style={{ display: "flex", gap: 16, opacity: t, transform: `translateY(${(1 - t) * 36}px)` }}>
            <span style={{ width: 56, height: 56, borderRadius: 10, background: "#fff", color: "#000", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Mic size={28} />
            </span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <b style={{ fontSize: 22 }}>Brainbox</b>
                <span style={{ fontSize: 13, padding: "2px 6px", borderRadius: 4, background: "rgba(255,255,255,0.12)", color: slack.dim }}>APP</span>
                <span style={{ color: slack.dim, fontSize: 16 }}>2:16 PM</span>
              </div>
              <div style={{ marginTop: 4 }}>
                New report from <b>Maya Chen</b> on app.acme.dev/checkout
              </div>
              <div style={{ marginTop: 14, borderLeft: `5px solid ${MARK}`, paddingLeft: 20, display: "flex", gap: 28 }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ color: slack.link, fontWeight: 700, fontSize: 28, lineHeight: 1.2 }}>{TITLE}</div>
                  <div style={{ marginTop: 10, color: slack.dim }}>“{TRANSCRIPT}”</div>
                  <div style={{ marginTop: 16, display: "flex", gap: 36, fontSize: 20 }}>
                    <span>
                      <span style={{ color: slack.dim }}>Browser </span>Safari 18.4 · macOS
                    </span>
                    <span>
                      <span style={{ color: slack.dim }}>Console </span>2 errors
                    </span>
                    <span>
                      <span style={{ color: slack.dim }}>GitHub </span>
                      <span style={{ color: slack.link }}>#482</span>
                    </span>
                  </div>
                  <div style={{ marginTop: 18, display: "flex", gap: 10 }}>
                    <span style={{ padding: "9px 16px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.22)", fontWeight: 600, fontSize: 19 }}>Open in Brainbox</span>
                    <span style={{ padding: "9px 16px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.22)", fontWeight: 600, fontSize: 19 }}>View issue</span>
                  </div>
                </div>
                <Shot width={340} />
              </div>
            </div>
          </div>
        </div>
        <div style={{ position: "absolute", left: 40, right: 40, bottom: 44, height: 68, borderRadius: 10, border: "1px solid rgba(255,255,255,0.18)", display: "flex", alignItems: "center", padding: "0 20px", color: slack.dim, fontSize: 20 }}>
          Message #bugs
        </div>
      </div>
    </div>
  );
}

function OldMessage({ name, time, text }: { name: string; time: string; text: string }) {
  return (
    <div style={{ display: "flex", gap: 16, opacity: 0.45, marginBottom: 30 }}>
      <span style={{ width: 56, height: 56, borderRadius: 10, background: "#3f3f46", flexShrink: 0 }} />
      <span>
        <b>{name}</b> <span style={{ color: slack.dim, fontSize: 16 }}>{time}</span>
        <div style={{ marginTop: 2 }}>{text}</div>
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */

const gmail = { bg: "#111111", line: "rgba(255,255,255,0.08)", text: "#e3e3e3", dim: "#9aa0a6", row: "#1d1d1f" };

const INBOX: readonly [string, string, string, string][] = [
  ["Vercel", "Deployment ready", "acme-web is live on production…", "1:58 PM"],
  ["Linear", "ACM-479 moved to Done", "Sam closed ACM-479: Empty cart state…", "1:41 PM"],
  ["Stripe", "Your October invoice", "Invoice #A1F2 for $348.00 is paid…", "12:20 PM"],
  ["GitHub", "[acme/web] PR #480 merged", "Merged: refactor order summary…", "11:02 AM"],
  ["Postmark", "Bounce report", "1 message bounced in the last 24 hours…", "9:14 AM"],
  ["Notion", "Weekly digest", "3 pages updated in Engineering…", "Yesterday"],
];

function GmailInbox({ at }: { at: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = pop(frame, fps, at + 6);
  const rowH = 92;
  return (
    <div style={{ position: "absolute", inset: 0, background: gmail.bg, color: gmail.text, fontSize: 22 }}>
      <div style={{ height: 96, display: "flex", alignItems: "center", gap: 18, padding: "0 56px", borderBottom: `1px solid ${gmail.line}` }}>
        <Mark name="gmail" size={34} color={BRAND.gmail.bg} />
        <span style={{ fontSize: 28, color: gmail.dim }}>Gmail</span>
        <span style={{ marginLeft: 90, width: 900, height: 56, borderRadius: 28, background: "rgba(255,255,255,0.08)", display: "flex", alignItems: "center", padding: "0 24px", color: gmail.dim, fontSize: 22 }}>
          Search mail
        </span>
      </div>
      <div style={{ position: "absolute", left: 0, top: 96, bottom: 0, width: 320, padding: "26px 20px 26px 56px", boxSizing: "border-box" }}>
        <div style={{ width: 180, height: 64, borderRadius: 20, background: "#c2e7ff", color: "#001d35", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 600, fontSize: 22 }}>
          Compose
        </div>
        {[
          ["Inbox", "1"],
          ["Starred", ""],
          ["Sent", ""],
          ["Drafts", "2"],
        ].map(([k, n], i) => (
          <div
            key={k}
            style={{
              marginTop: i === 0 ? 30 : 4,
              padding: "12px 24px",
              borderRadius: 999,
              display: "flex",
              justifyContent: "space-between",
              fontSize: 22,
              background: i === 0 ? "rgba(194,231,255,0.18)" : undefined,
              fontWeight: i === 0 ? 700 : 400,
              color: i === 0 ? gmail.text : gmail.dim,
            }}
          >
            <span>{k}</span>
            <span>{n}</span>
          </div>
        ))}
      </div>
      <div style={{ position: "absolute", left: 320, right: 72, top: 130 }}>
        <div
          style={{
            height: rowH,
            display: "flex",
            alignItems: "center",
            gap: 26,
            padding: "0 28px",
            borderRadius: 14,
            background: gmail.row,
            boxShadow: `0 0 0 1px rgba(255,255,255,${0.16 * t}), 0 20px 50px -20px rgba(0,0,0,0.8)`,
            fontWeight: 700,
            opacity: t,
            transform: `translateY(${(1 - t) * -30}px)`,
          }}
        >
          <span style={{ width: 12, height: 12, borderRadius: 999, background: "#8ab4f8" }} />
          <span style={{ width: 220 }}>Brainbox</span>
          <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            New report: {TITLE} <span style={{ fontWeight: 400, color: gmail.dim }}>– Maya Chen · app.acme.dev/checkout · {TRANSCRIPT}</span>
          </span>
          <span style={{ width: 100, textAlign: "right" }}>2:16 PM</span>
        </div>
        <div style={{ transform: `translateY(${(1 - t) * -rowH}px)` }}>
          {INBOX.map(([from, subject, preview, time]) => (
            <div key={subject} style={{ height: rowH, display: "flex", alignItems: "center", gap: 26, padding: "0 28px", borderBottom: `1px solid ${gmail.line}`, color: gmail.dim }}>
              <span style={{ width: 12 }} />
              <span style={{ width: 220, color: gmail.text }}>{from}</span>
              <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                <span style={{ color: gmail.text }}>{subject}</span> – {preview}
              </span>
              <span style={{ width: 100, textAlign: "right" }}>{time}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

/** The four marks, lit in order. The "all those icons" frame. */
function DeliveredRow({ fps }: { fps: number }) {
  const frame = useCurrentFrame();
  const label = (n: string) => (n === "github" ? "GitHub" : n === "linear" ? "Linear" : n === "slack" ? "Slack" : "Gmail");
  return (
    <div style={{ position: "absolute", inset: 0, background: dark.bg }}>
      <Grid />
      <div style={{ position: "absolute", left: 0, right: 0, top: 340, display: "flex", justifyContent: "center", gap: 64 }}>
        {DELIVERED.map((name, i) => {
          const t = pop(frame, fps, DEST.row + 4 + i * DELIVERED_STAGGER);
          const tick = pop(frame, fps, DEST.row + 16 + i * DELIVERED_STAGGER);
          return (
            <div key={name} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 22, opacity: t, transform: `translateY(${(1 - t) * 20}px)` }}>
              <span
                style={{
                  position: "relative",
                  width: 176,
                  height: 176,
                  borderRadius: 44,
                  background: BRAND[name].bg,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: `0 34px 80px -20px ${BRAND[name].bg}88`,
                }}
              >
                <Mark name={name} size={88} color={BRAND[name].fg} />
                <span
                  style={{
                    position: "absolute",
                    right: -12,
                    bottom: -12,
                    width: 54,
                    height: 54,
                    borderRadius: 999,
                    background: "#3fb950",
                    border: `5px solid ${dark.bg}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#fff",
                    fontSize: 26,
                    fontWeight: 700,
                    opacity: tick,
                    transform: `scale(${0.6 + 0.4 * tick})`,
                  }}
                >
                  ✓
                </span>
              </span>
              <span style={{ fontSize: 24, fontWeight: 600, color: dark.text, letterSpacing: "-0.01em" }}>{label(name)}</span>
            </div>
          );
        })}
      </div>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 660,
          textAlign: "center",
          fontFamily: font.mono,
          fontSize: 24,
          letterSpacing: "0.04em",
          color: dark.dim,
          opacity: pop(frame, fps, DEST.row + 44),
        }}
      >
        …and anything with a webhook.
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Rise({ t, children }: { t: number; children: React.ReactNode }) {
  return <div style={{ opacity: t, transform: `translateY(${(1 - t) * 14}px)` }}>{children}</div>;
}

/** The captured screenshot with the mark on it, as the tools attach it. */
function Shot({ width }: { width: number }) {
  const k = width / 300;
  return (
    <div style={{ width, flexShrink: 0, borderRadius: 12 * k, background: light.page, padding: 18 * k, boxSizing: "border-box", border: "1px solid rgba(255,255,255,0.1)" }}>
      <div style={{ background: "#fff", borderRadius: 8 * k, padding: 14 * k }}>
        <div style={{ display: "flex", gap: 6 * k }}>
          <div style={{ flex: 1, height: 20 * k, border: `1px solid ${light.line}`, borderRadius: 5 * k }} />
          <div style={{ width: 50 * k, height: 20 * k, border: `1px solid ${light.line}`, borderRadius: 5 * k }} />
        </div>
        <div style={{ position: "relative", marginTop: 14 * k }}>
          <div style={{ height: 28 * k, borderRadius: 6 * k, background: light.brand, color: "#fff", fontSize: 12 * k, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center" }}>
            Pay now
          </div>
          <div style={{ position: "absolute", inset: -7 * k, border: `${2 * k}px solid ${MARK}`, borderRadius: 7 * k }} />
        </div>
      </div>
    </div>
  );
}
