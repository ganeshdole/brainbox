import sharp from "sharp";
import type { Region } from "@brainbox/shared";

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(v, max));
}

/** Crop the highlighted region out of a screenshot into its own PNG. The region is
 *  in CSS pixels, scaled by the shot's width over the viewport width.
 *  Best-effort: returns null for a degenerate/out-of-bounds region; callers ignore
 *  errors so a crop failure never blocks ingest. */
export async function cropRegion(
  image: Uint8Array,
  region: Region,
  viewportWidth: number,
): Promise<Buffer | null> {
  const meta = await sharp(Buffer.from(image)).metadata();
  const W = meta.width ?? 0;
  const H = meta.height ?? 0;
  if (W === 0 || H === 0) return null;
  const scale = viewportWidth > 0 ? W / viewportWidth : 1;

  const left = clamp(Math.round(region.x * scale), 0, W - 1);
  const top = clamp(Math.round(region.y * scale), 0, H - 1);
  const width = clamp(Math.round(region.width * scale), 1, W - left);
  const height = clamp(Math.round(region.height * scale), 1, H - top);
  if (width < 2 || height < 2) return null;

  return sharp(Buffer.from(image)).extract({ left, top, width, height }).png().toBuffer();
}
