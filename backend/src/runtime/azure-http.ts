import type { Cookie, HttpRequest, HttpResponseInit } from "@azure/functions";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";

// Converts between Azure Functions' HTTP types and the web-standard Request
// and Response the Hono app speaks. Used by the Azure entry (src/azure.ts).

/** An Azure request as a web Request, with the body streamed through. */
export function toWebRequest(req: HttpRequest): Request {
  const hasBody = req.method !== "GET" && req.method !== "HEAD" && req.body !== null;
  return new Request(req.url, {
    method: req.method,
    headers: req.headers,
    ...(hasBody && { body: req.body as ReadableStream<Uint8Array>, duplex: "half" }),
  });
}

/**
 * A web Response as an Azure response. Azure drops all but one `Set-Cookie`
 * header, so cookies travel in its separate `cookies` field instead; sign-in
 * sets several at once.
 */
export function toResponseInit(res: Response): HttpResponseInit {
  const headers = new Headers(res.headers);
  headers.delete("set-cookie");
  const cookies = res.headers
    .getSetCookie()
    .map(parseSetCookie)
    .filter((cookie): cookie is Cookie => cookie !== null);
  return {
    status: res.status,
    headers,
    cookies,
    body: res.body as NodeReadableStream<Uint8Array> | null,
  };
}

const SAME_SITE: Record<string, Cookie["sameSite"]> = {
  strict: "Strict",
  lax: "Lax",
  none: "None",
};

/** One `Set-Cookie` header value as an Azure cookie; null if it has no name. */
export function parseSetCookie(header: string): Cookie | null {
  const [pair = "", ...attributes] = header.split(";");
  // Split on the first "=" only: values such as tokens may contain more.
  const eq = pair.indexOf("=");
  if (eq <= 0) return null;
  const cookie: Cookie = {
    name: pair.slice(0, eq).trim(),
    // Azure encodes the value again when it writes the header.
    value: decode(pair.slice(eq + 1).trim()),
  };

  for (const attribute of attributes) {
    const sep = attribute.indexOf("=");
    const key = (sep === -1 ? attribute : attribute.slice(0, sep)).trim().toLowerCase();
    const value = sep === -1 ? "" : attribute.slice(sep + 1).trim();
    switch (key) {
      case "path":
        cookie.path = value;
        break;
      case "domain":
        cookie.domain = value;
        break;
      case "expires": {
        const date = new Date(value);
        if (!Number.isNaN(date.getTime())) cookie.expires = date;
        break;
      }
      case "max-age": {
        const seconds = Number(value);
        if (Number.isFinite(seconds)) cookie.maxAge = seconds;
        break;
      }
      case "secure":
        cookie.secure = true;
        break;
      case "httponly":
        cookie.httpOnly = true;
        break;
      case "samesite": {
        const sameSite = SAME_SITE[value.toLowerCase()];
        if (sameSite) cookie.sameSite = sameSite;
        break;
      }
    }
  }
  return cookie;
}

function decode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
