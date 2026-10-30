// Product screenshots ship as `<name>-<width>.<avif|webp>` in src/assets/shots,
// each at a few widths. These group one name's files into the srcsets a
// <picture> needs.

export interface ShotSources {
  avif: string;
  webp: string;
  /** The smallest WebP, for browsers that ignore srcset. */
  fallback: string;
}

const FILE = /\/([a-z0-9-]+)-(\d+)\.(avif|webp)$/;

/** `files` maps a module path to its built URL, as `import.meta.glob` returns it. */
export function shotSources(files: Record<string, string>, name: string): ShotSources {
  const found: Record<"avif" | "webp", { width: number; url: string }[]> = { avif: [], webp: [] };
  for (const [path, url] of Object.entries(files)) {
    const match = FILE.exec(path);
    if (!match || match[1] !== name) continue;
    const format = match[3] === "avif" ? "avif" : "webp";
    found[format].push({ width: Number(match[2]), url });
  }

  const srcSet = (list: { width: number; url: string }[]) =>
    list
      .sort((a, b) => a.width - b.width)
      .map((f) => `${f.url} ${f.width}w`)
      .join(", ");

  const webp = srcSet(found.webp);
  const smallest = found.webp[0];
  // A missing shot is a build-time mistake; fail loudly rather than render a broken image.
  if (!smallest || found.avif.length === 0) throw new Error(`No AVIF and WebP files for shot "${name}"`);
  return { avif: srcSet(found.avif), webp, fallback: smallest.url };
}
