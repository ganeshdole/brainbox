import { decode, encode } from "fast-png";
import { describe, expect, it } from "vitest";

import { cropRegion } from "./crop.ts";

/** An RGBA PNG whose every pixel encodes its own position: R = x, G = y. */
function png(width: number, height: number): Uint8Array {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      data[i] = x % 256;
      data[i + 1] = y % 256;
      data[i + 3] = 255;
    }
  }
  return encode({ width, height, data, channels: 4, depth: 8 });
}

function size(buf: Uint8Array | null) {
  if (!buf) return null;
  const { width, height } = decode(buf);
  return { width, height };
}

/** The [R, G] of the crop's top-left pixel: where it was in the original. */
function origin(buf: Uint8Array | null) {
  if (!buf) return null;
  const { data } = decode(buf);
  return [data[0], data[1]];
}

const region = { x: 10, y: 20, width: 100, height: 50 };

describe("cropRegion", () => {
  it("crops CSS pixels 1:1 from a 1x shot", async () => {
    const crop = await cropRegion(png(400, 300), region, 400);
    expect(size(crop)).toEqual({ width: 100, height: 50 });
    expect(origin(crop)).toEqual([10, 20]);
  });

  it("scales the region up for a 2x (Retina) shot", async () => {
    const crop = await cropRegion(png(800, 600), region, 400);
    expect(size(crop)).toEqual({ width: 200, height: 100 });
    expect(origin(crop)).toEqual([20, 40]);
  });

  it("clamps a region that runs past the edge", async () => {
    const crop = await cropRegion(png(800, 600), { x: 350, y: 0, width: 200, height: 50 }, 400);
    expect(size(crop)).toEqual({ width: 100, height: 100 });
  });

  it("returns null for a degenerate region", async () => {
    expect(await cropRegion(png(400, 300), { x: 0, y: 0, width: 1, height: 1 }, 400)).toBeNull();
  });

  it("crops a palette PNG into plain RGB", async () => {
    const indexes = new Uint8Array(40 * 30).map((_, i) => (i % 40 < 20 ? 0 : 1));
    const image = encode({
      width: 40,
      height: 30,
      data: indexes,
      channels: 1,
      depth: 8,
      palette: [
        [255, 0, 0],
        [0, 0, 255],
      ],
    });
    const crop = await cropRegion(image, { x: 18, y: 0, width: 4, height: 4 }, 40);
    const out = crop && decode(crop);
    expect(out?.channels).toBe(3);
    // Columns 18-19 are red, 20-21 blue.
    expect(Array.from(out?.data.subarray(0, 12) ?? [])).toEqual([255, 0, 0, 255, 0, 0, 0, 0, 255, 0, 0, 255]);
  });

  it("throws on bytes that are not a PNG, for the caller to log and skip", async () => {
    await expect(cropRegion(new Uint8Array([1, 2, 3]), region, 400)).rejects.toThrow();
  });
});
