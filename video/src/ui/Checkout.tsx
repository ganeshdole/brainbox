import { useCurrentFrame } from "remotion";
import { font, light } from "../theme.ts";
import { CLICKS, PAY_NOW } from "../timeline.ts";

/**
 * The host app: a plain, believable checkout. Light, so the dark widget and
 * the red mark read against it, and so the dark GitHub page is a hard cut.
 */
export function Checkout() {
  const frame = useCurrentFrame();
  const pressed = [CLICKS.payNow1, CLICKS.payNow2].some((c) => frame >= c && frame < c + 6);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: light.page,
        fontFamily: font.sans,
        color: light.text,
        letterSpacing: "-0.011em",
      }}
    >
      <TopBar />
      <div
        style={{
          position: "absolute",
          left: PAY_NOW.x - 260,
          top: 200,
          width: 520,
          background: light.card,
          borderRadius: 20,
          boxShadow: "0 1px 2px rgba(0,0,0,0.06), 0 12px 40px -16px rgba(0,0,0,0.16)",
          padding: 36,
          boxSizing: "border-box",
        }}
      >
        <div style={{ fontSize: 24, fontWeight: 600 }}>Checkout</div>
        <div style={{ marginTop: 6, fontSize: 15, color: light.dim }}>Order #10482 · 2 items</div>

        <Row label="Pro plan · yearly" value="$290.00" top={28} />
        <Row label="Extra seat" value="$58.00" />
        <Row label="Total" value="$348.00" bold />

        <div style={{ marginTop: 30, fontSize: 13, fontWeight: 600, color: light.dim, letterSpacing: "0.02em" }}>
          PAYMENT
        </div>
        <Field top={10}>
          <span style={{ fontFamily: font.mono, fontSize: 15, color: light.dim }}>•••• •••• •••• 4242</span>
          <span style={{ marginLeft: "auto", width: 36, height: 22, borderRadius: 4, background: light.line }} />
        </Field>
        <div style={{ display: "flex", gap: 12 }}>
          <Field grow>
            <span style={{ fontSize: 15, color: light.dim }}>12 / 28</span>
          </Field>
          <Field width={120}>
            <span style={{ fontSize: 15, color: light.dim }}>•••</span>
          </Field>
        </div>

        <div
          style={{
            marginTop: 26,
            height: PAY_NOW.h,
            borderRadius: 12,
            background: light.brand,
            color: "#fff",
            fontSize: 16,
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transform: `scale(${pressed ? 0.985 : 1})`,
            opacity: pressed ? 0.85 : 1,
          }}
        >
          Pay now
        </div>
        <div style={{ marginTop: 14, textAlign: "center", fontSize: 12, color: light.faint }}>
          Secured by Acme Pay · You won&apos;t be charged twice
        </div>
      </div>
    </div>
  );
}

function TopBar() {
  return (
    <div
      style={{
        height: 64,
        background: light.card,
        borderBottom: `1px solid ${light.line}`,
        display: "flex",
        alignItems: "center",
        padding: "0 40px",
        gap: 10,
      }}
    >
      <span style={{ width: 22, height: 22, borderRadius: 6, background: light.text }} />
      <span style={{ fontSize: 16, fontWeight: 600 }}>Acme</span>
      <span style={{ marginLeft: 28, fontSize: 14, color: light.dim }}>Projects</span>
      <span style={{ fontSize: 14, color: light.dim }}>Billing</span>
      <span style={{ fontSize: 14, color: light.text, fontWeight: 500 }}>Checkout</span>
      <span style={{ marginLeft: "auto", width: 30, height: 30, borderRadius: 999, background: light.line }} />
    </div>
  );
}

function Row({ label, value, bold, top = 10 }: { label: string; value: string; bold?: boolean; top?: number }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        marginTop: top,
        fontSize: 15,
        fontWeight: bold ? 600 : 400,
        color: bold ? light.text : light.dim,
        borderTop: bold ? `1px solid ${light.line}` : undefined,
        paddingTop: bold ? 12 : 0,
      }}
    >
      <span>{label}</span>
      <span style={{ fontVariantNumeric: "tabular-nums", color: light.text }}>{value}</span>
    </div>
  );
}

function Field({
  children,
  top = 12,
  grow,
  width,
}: {
  children: React.ReactNode;
  top?: number;
  grow?: boolean;
  width?: number;
}) {
  return (
    <div
      style={{
        marginTop: top,
        height: 44,
        borderRadius: 10,
        border: `1px solid ${light.line}`,
        display: "flex",
        alignItems: "center",
        padding: "0 14px",
        flex: grow ? 1 : undefined,
        width,
        boxSizing: "border-box",
      }}
    >
      {children}
    </div>
  );
}
