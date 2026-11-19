import { useCurrentFrame, useVideoConfig } from "remotion";
import { pop } from "../motion.ts";
import { MARK, font, gh, light } from "../theme.ts";
import { TICKET } from "../timeline.ts";

/*
 * The ticket as GitHub shows it. The body follows `renderTicket()` in
 * packages/integrations/src/ticket.ts block for block: image, voice note
 * quote, details table, console errors, footer links.
 */

/** What the end-user said, as the backend transcribed it. */
const TRANSCRIPT = "Hey, so I hit Pay now and nothing happens? I tried it twice. Same thing.";

const ROWS: [string, string, boolean?][] = [
  ["Page", "Checkout · app.acme.dev/checkout"],
  ["Viewport", "1440 × 900 @2x"],
  ["Browser", "Safari 18.4 · macOS"],
  ["Locale", "en-GB, Europe/London"],
  ["User", "Maya Chen <maya@acme.dev>"],
  ["Element", "button.checkout__pay", true],
  ["Reported", "just now"],
];

const ERRORS = [
  "TypeError: Cannot read properties of undefined (reading 'token')",
  "POST /api/pay 500 (Internal Server Error)",
];

export function GithubIssue() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const at = (f: number) => pop(frame, fps, f);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: gh.bg,
        color: gh.text,
        fontFamily: font.sans,
        fontSize: 15,
        lineHeight: 1.5,
      }}
    >
      <Header />
      <div style={{ position: "absolute", left: 200, top: 118, width: 1200 }}>
        <Block t={at(TICKET.title)}>
          <div style={{ fontSize: 32, fontWeight: 400, lineHeight: 1.25 }}>
            Pay now does nothing on the last checkout step{" "}
            <span style={{ color: gh.dim, fontWeight: 300 }}>#482</span>
          </div>
          <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 10, color: gh.dim, fontSize: 14 }}>
            <span
              style={{
                background: gh.open,
                color: "#fff",
                borderRadius: 999,
                padding: "3px 12px",
                fontWeight: 500,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span style={{ width: 10, height: 10, borderRadius: 999, border: "2px solid #fff" }} /> Open
            </span>
            <span>
              <b style={{ color: gh.text, fontWeight: 600 }}>brainbox[bot]</b> opened this just now · via Brainbox
            </span>
            <Label text="bug" color="#d73a4a" />
            <Label text="checkout" color="#1d76db" />
          </div>
        </Block>

        <div
          style={{
            marginTop: 24,
            border: `1px solid ${gh.line}`,
            borderRadius: 8,
            background: gh.bg,
            overflow: "hidden",
            opacity: at(TICKET.image) > 0 ? 1 : 0,
          }}
        >
          <div
            style={{
              background: gh.panel,
              borderBottom: `1px solid ${gh.line}`,
              padding: "8px 16px",
              fontSize: 14,
              color: gh.dim,
            }}
          >
            <b style={{ color: gh.text, fontWeight: 600 }}>brainbox[bot]</b> commented just now
          </div>
          <div style={{ padding: "16px 20px 20px" }}>
            <Block t={at(TICKET.image)}>
              <CroppedScreenshot />
            </Block>

            <Block t={at(TICKET.voice)} style={{ marginTop: 20 }}>
              <div style={{ fontWeight: 600 }}>Voice note</div>
              <div
                style={{
                  marginTop: 8,
                  borderLeft: `4px solid ${gh.line}`,
                  paddingLeft: 16,
                  color: gh.dim,
                  fontSize: 15,
                }}
              >
                {TRANSCRIPT}
              </div>
            </Block>

            <Block t={at(TICKET.table)} style={{ marginTop: 20 }}>
              <table style={{ borderCollapse: "collapse", fontSize: 14 }}>
                <tbody>
                  {ROWS.map(([k, v, code], i) => (
                    <tr key={k} style={{ opacity: at(TICKET.table + i * 2) }}>
                      <td style={{ border: `1px solid ${gh.line}`, padding: "5px 14px", fontWeight: 600 }}>{k}</td>
                      <td
                        style={{
                          border: `1px solid ${gh.line}`,
                          padding: "5px 14px",
                          fontFamily: code ? font.mono : undefined,
                          fontSize: code ? 13 : 14,
                          color: k === "Page" ? gh.link : gh.text,
                        }}
                      >
                        {v}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Block>

            <Block t={at(TICKET.errors)} style={{ marginTop: 20 }}>
              <div id="console-errors">
                <div style={{ fontSize: 14, display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ display: "inline-block", transform: "rotate(90deg)", fontSize: 12 }}>▶</span>
                  <b style={{ fontWeight: 600 }}>2 console errors</b>
                </div>
                <pre
                  style={{
                    margin: "10px 0 0",
                    padding: 16,
                    background: gh.code,
                    border: `1px solid ${gh.line}`,
                    borderRadius: 6,
                    fontFamily: font.mono,
                    fontSize: 14,
                    lineHeight: 1.6,
                    color: gh.red,
                  }}
                >
                  {ERRORS.map((e, i) => (
                    <div key={e} style={{ opacity: at(TICKET.errors + 4 + i * 5) }}>
                      {e}
                    </div>
                  ))}
                </pre>
              </div>
            </Block>

            <Block t={at(TICKET.footer)} style={{ marginTop: 18, fontSize: 14, color: gh.link }}>
              Open in Brainbox <span style={{ color: gh.dim }}>·</span> Full screenshot
            </Block>
          </div>
        </div>
      </div>
      <Sidebar t={at(TICKET.title)} />
    </div>
  );
}

function Block({ t, children, style }: { t: number; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ opacity: t, transform: `translateY(${(1 - t) * 14}px)`, ...style }}>{children}</div>
  );
}

function Label({ text, color }: { text: string; color: string }) {
  return (
    <span
      style={{
        border: `1px solid ${color}`,
        color,
        borderRadius: 999,
        padding: "1px 10px",
        fontSize: 12,
        fontWeight: 500,
        background: `${color}22`,
      }}
    >
      {text}
    </span>
  );
}

function Header() {
  return (
    <div
      style={{
        height: 64,
        borderBottom: `1px solid ${gh.line}`,
        display: "flex",
        alignItems: "center",
        padding: "0 32px",
        gap: 14,
        fontSize: 15,
      }}
    >
      <span style={{ width: 30, height: 30, borderRadius: 999, background: gh.text }} />
      <span style={{ color: gh.dim }}>acme</span>
      <span style={{ color: gh.dim }}>/</span>
      <span style={{ fontWeight: 600 }}>web</span>
      <span style={{ marginLeft: 36, color: gh.dim }}>Code</span>
      <span style={{ fontWeight: 500, borderBottom: "2px solid #f78166", paddingBottom: 2 }}>Issues</span>
      <span style={{ color: gh.dim }}>Pull requests</span>
      <span style={{ color: gh.dim }}>Actions</span>
    </div>
  );
}

function Sidebar({ t }: { t: number }) {
  const row = (k: string, v: string) => (
    <div style={{ borderBottom: `1px solid ${gh.line}`, padding: "14px 0", fontSize: 13 }}>
      <div style={{ color: gh.dim, fontWeight: 600 }}>{k}</div>
      <div style={{ marginTop: 6, color: v === "No one" ? gh.dim : gh.text }}>{v}</div>
    </div>
  );
  return (
    <div style={{ position: "absolute", left: 1450, top: 160, width: 260, opacity: t }}>
      {row("Assignees", "No one")}
      {row("Labels", "bug · checkout")}
      {row("Projects", "Checkout fixes")}
      {row("Milestone", "October")}
    </div>
  );
}

/** The highlighted region crop, the way the ticket links it. */
function CroppedScreenshot() {
  return (
    <div
      style={{
        width: 560,
        borderRadius: 8,
        border: `1px solid ${gh.line}`,
        background: light.page,
        padding: 26,
        boxSizing: "border-box",
      }}
    >
      <div style={{ background: "#fff", borderRadius: 10, padding: 18, boxShadow: "0 1px 2px rgba(0,0,0,0.08)" }}>
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 1, height: 30, border: `1px solid ${light.line}`, borderRadius: 7 }} />
          <div style={{ width: 80, height: 30, border: `1px solid ${light.line}`, borderRadius: 7 }} />
        </div>
        <div style={{ position: "relative", marginTop: 18 }}>
          <div
            style={{
              height: 38,
              borderRadius: 9,
              background: light.brand,
              color: "#fff",
              fontSize: 13,
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            Pay now
          </div>
          <div style={{ position: "absolute", inset: -9, border: `3px solid ${MARK}`, borderRadius: 8 }} />
        </div>
        <div style={{ marginTop: 16, height: 6, width: "60%", background: light.page, borderRadius: 3 }} />
      </div>
    </div>
  );
}
