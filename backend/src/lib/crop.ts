import { convertIndexedToRgb, decode, encode } from "fast-png";
import type { Region } from "@ganeshdole/brainbox-shared";

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(v, max));
}

/** Crop the highlighted region out of a screenshot into its own PNG. The region is
 *  in CSS pixels, scaled by the shot's width over the viewport width.
 *  Best-effort: returns null for a degenerate/out-of-bounds region; callers ignore
 *  errors so a crop failure never blocks ingest. The widget sends PNG, so this
 *  only reads PNG; it is plain JavaScript, so it runs on Workers as well as Node. */
export async function cropRegion(
  image: Uint8Array,
  region: Region,
  viewportWidth: number,
): Promise<Uint8Array | null> {
  const png = decode(image);
  const W = png.width;
  const H = png.height;
  if (W === 0 || H === 0) return null;
  const scale = viewportWidth > 0 ? W / viewportWidth : 1;

  const left = clamp(Math.round(region.x * scale), 0, W - 1);
  const top = clamp(Math.round(region.y * scale), 0, H - 1);
  const width = clamp(Math.round(region.width * scale), 1, W - left);
  const height = clamp(Math.round(region.height * scale), 1, H - top);
  if (width < 2 || height < 2) return null;

  // A palette image crops as plain RGB(A): its indexes mean nothing without it.
  const palette = png.palette;
  const data = palette ? convertIndexedToRgb(png) : png.data;
  const channels = palette ? (palette[0]?.length ?? 3) : png.channels;
  const depth = palette ? 8 : png.depth;

  const row = W * channels;
  const out = new (data.constructor as Uint8ArrayConstructor | Uint16ArrayConstructor)(
    width * height * channels,
  );
  for (let y = 0; y < height; y++) {
    const from = (top + y) * row + left * channels;
    out.set(data.subarray(from, from + width * channels), y * width * channels);
  }
  return encode({ width, height, data: out, channels, depth });
}
