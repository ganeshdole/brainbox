import { useEffect, useState } from "react";
import type { WidgetTheme } from "@ganeshdole/brainbox-shared";
import { keepOnPage } from "./keep-on-page.ts";
import { createShadowHost, type ShadowHost } from "./shadow-host.ts";
import { applyTheme } from "./theme.ts";

/** A shadow host on `<body>` for as long as the calling component is mounted,
 *  with `theme` kept on its container. Uses `given` when there is one (a host
 *  that needs the element first, to exclude it from a draft's screenshots),
 *  else builds its own, with `id` if one is given. Null on the server. */
export function useShadowHost(
  theme: WidgetTheme,
  { given, id }: { given?: ShadowHost; id?: string } = {},
): ShadowHost | null {
  // Built detached during render (nothing on the page changes yet, and there
  // is no document on the server), attached by the effect below.
  const [own] = useState<ShadowHost | null>(() =>
    given || typeof document === "undefined" ? null : createShadowHost({ id }),
  );
  const host = given ?? own;

  useEffect(() => {
    if (!host) return;
    document.body.appendChild(host.element);
    // a host app that swaps <body> on navigation must not take it with it
    const release = keepOnPage(host.element);
    return () => {
      release();
      host.element.remove();
    };
  }, [host]);

  useEffect(() => {
    if (!host) return;
    return applyTheme(host.container, theme);
  }, [host, theme]);

  return host;
}
