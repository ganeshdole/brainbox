import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { cropRegion } from "./crop.ts";

function png(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 0, g: 0, b: 0 } },
  })
    .png()
    .toBuffer();
}

async function size(buf: Buffer | null) {
  if (!buf) return null;
  const { width, height } = await sharp(buf).metadata();
  return { width, height };
}

const region = { x: 10, y: 20, width: 100, height: 50 };

describe("cropRegion", () => {
  it("crops CSS pixels 1:1 from a 1x shot", async () => {
    const crop = await cropRegion(await png(400, 300), region, 400);
    expect(await size(crop)).toEqual({ width: 100, height: 50 });
  });

  it("scales the region up for a 2x (Retina) shot", async () => {
    const crop = await cropRegion(await png(800, 600), region, 400);
    expect(await size(crop)).toEqual({ width: 200, height: 100 });
  });

  it("clamps a region that runs past the edge", async () => {
    const crop = await cropRegion(await png(800, 600), { x: 350, y: 0, width: 200, height: 50 }, 400);
    expect(await size(crop)).toEqual({ width: 100, height: 100 });
  });

  it("returns null for a degenerate region", async () => {
    expect(await cropRegion(await png(400, 300), { x: 0, y: 0, width: 1, height: 1 }, 400)).toBeNull();
  });
});
