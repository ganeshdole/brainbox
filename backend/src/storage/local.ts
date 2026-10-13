import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { env } from "../env.ts";
import type { Storage } from "./index.ts";

// Dev driver: writes under backend/.storage/ (gitignored). Same key scheme as
// every driver, so the dashboard's read logic is driver-agnostic.
const BASE = join(import.meta.dirname, "../../.storage");

export class LocalStorage implements Storage {
  async put(key: string, body: Uint8Array, _contentType: string): Promise<void> {
    const full = join(BASE, key);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, body);
  }

  // No real signing locally - point at the cookie-gated file route, which
  // re-checks ownership before streaming the bytes (see routes/files.ts).
  async presignGet(key: string): Promise<string> {
    return `${env.PUBLIC_API_URL}/api/files/${key}`;
  }

  async read(key: string): Promise<Uint8Array> {
    return readFile(join(BASE, key));
  }
}
