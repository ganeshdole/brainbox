// Dev utility: time the screenshot path end to end on a real page, and break
// down where modern-screenshot spends it. Not part of `pnpm verify`.
//
//   node scripts/measure-capture.mjs http://localhost:5199
import puppeteer from "puppeteer-core";

const TARGET = process.argv[2] ?? "http://localhost:5199";
const CHROME =
  process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
});
const page = await browser.newPage();
const THROTTLE = Number(process.env.CPU_THROTTLE ?? 1);
if (THROTTLE > 1) {
  const cdp = await page.createCDPSession();
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: THROTTLE });
  console.log(`cpu throttle: ${THROTTLE}x`);
}
await page.setViewport({ width: 1440, height: 900 });
await page.goto(TARGET, { waitUntil: "networkidle2" });

// How much page are we asking the renderer to walk?
const size = await page.evaluate(() => ({
  scrollHeight: document.documentElement.scrollHeight,
  viewportHeight: window.innerHeight,
  elements: document.querySelectorAll("*").length,
  images: document.images.length,
  styleSheets: document.styleSheets.length,
}));
console.log("page:");
console.log(`  scroll height   ${size.scrollHeight}px (${(size.scrollHeight / size.viewportHeight).toFixed(1)}x viewport)`);
console.log(`  elements        ${size.elements}`);
console.log(`  images          ${size.images}`);
console.log(`  stylesheets     ${size.styleSheets}`);

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// The widget script loads async from app.brainbox.ganeshdole.com - driving it before it
// mounts measures nothing.
await page.waitForFunction(
  () => !!document.getElementById("brainbox-widget")?.shadowRoot?.querySelector("button"),
  { timeout: 20000 },
);
const clickButton = (label) =>
  page.evaluate((l) => {
    const root = document.getElementById("brainbox-widget")?.shadowRoot;
    const btn = [...(root?.querySelectorAll("button") ?? [])].find((b) =>
      `${b.getAttribute("aria-label") ?? ""} ${b.textContent ?? ""}`.includes(l),
    );
    if (btn instanceof HTMLElement) {
      btn.click();
      return true;
    }
    return false;
  }, label);

// Watch the shadow tree for the thumbnail landing.
await page.evaluate(() => {
  window.__thumbAt = null;
  const tick = () => {
    const root = document.getElementById("brainbox-widget")?.shadowRoot;
    if (root?.querySelector('img[alt="Captured screenshot"]') && window.__thumbAt === null) {
      window.__thumbAt = performance.now();
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});

await page.evaluate(() => window.Brainbox?.open());
await wait(300);
await clickButton("Screenshot");
await wait(300);

await page.mouse.move(300, 300);
await page.mouse.down();
await page.mouse.move(900, 520, { steps: 8 });
await page.evaluate(() => {
  window.__startAt = performance.now();
});
await page.mouse.up();

// Poll until the thumbnail shows or we give up.
let elapsed = null;
for (let i = 0; i < 120; i += 1) {
  elapsed = await page.evaluate(() =>
    window.__thumbAt === null ? null : window.__thumbAt - window.__startAt,
  );
  if (elapsed !== null) break;
  await wait(250);
}

console.log("\ncapture:");
console.log(
  elapsed === null
    ? "  thumbnail never appeared within 30s"
    : `  region released -> thumbnail visible   ${Math.round(elapsed)}ms`,
);

await browser.close();
