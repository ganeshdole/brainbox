import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";

/** Paths the API owns. The dashboard never answers them, even when unknown. */
const API_PATHS = ["/api", "/ingest", "/f", "/auth-error", "/health", "/waitlist", "/webhooks"];

function isApiPath(path: string): boolean {
  return API_PATHS.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

/**
 * The built dashboard, served by the API itself (DASHBOARD_DIR). One origin
 * then hosts both, so the dashboard's sign-in cookie is same-site without any
 * custom domains, e.g. on a bare Azure Functions URL. Files are served as
 * they are; any other GET is a client-side route and gets index.html. Mount
 * it after every API route.
 */
export function dashboardRoute(dir: string) {
  return new Hono().get(
    "*",
    async (c, next) => {
      if (isApiPath(c.req.path)) return c.notFound();
      await next();
      // Set here: serveStatic builds its own response and drops headers set
      // during it. Vite fingerprints everything under /assets/, so those never
      // change; index.html must always be fetched fresh to pick up new builds.
      if (c.res.ok) {
        c.res.headers.set(
          "Cache-Control",
          c.req.path.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-cache",
        );
      }
      return undefined;
    },
    serveStatic({ root: dir }),
    serveStatic({ root: dir, path: "index.html" }),
  );
}
