import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { Storage } from "./types.ts";

export interface LocalStorageOptions {
  /** Where this API is reachable: files are served from `<publicUrl>/api/files/`. */
  publicUrl: string;
  /** The folder files are written to. Default: backend/.storage/ (gitignored). */
  dir?: string;
}

// Dev driver: writes to a local folder. Same key scheme as every driver, so the
// dashboard's read logic is driver-agnostic.
export class LocalStorage implements Storage {
  private readonly dir: string;
  private readonly publicUrl: string;

  constructor(options: LocalStorageOptions) {
    this.dir = options.dir ?? join(import.meta.dirname, "../../.storage");
    this.publicUrl = options.publicUrl;
  }

  async put(key: string, body: Uint8Array, _contentType: string): Promise<void> {
    const full = join(this.dir, key);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, body);
  }

  // No real signing locally - point at the cookie-gated file route, which
  // re-checks ownership before streaming the bytes (see routes/files.ts).
  async presignGet(key: string): Promise<string> {
    return `${this.publicUrl}/api/files/${key}`;
  }

  async read(key: string): Promise<Uint8Array> {
    return readFile(join(this.dir, key));
  }
}
