import { appBasePath } from "@agent-native/core/client/api-path";

import type { ShareLinkEventsRequest } from "@shared/api";

/**
 * Owner previews opened from the Snapshot-link tab carry `?preview=1` and
 * must never count as views.
 */
export function shouldSkipShareView(search: string): boolean {
  return new URLSearchParams(search).has("preview");
}

/**
 * Record one anonymous `view` event per browser session for a share token.
 * PII-free by design: the only identifier sent is a random session id minted
 * here and kept in sessionStorage. Analytics must never break the viewer
 * page, so every failure path is swallowed.
 */
export function recordShareView(token: string): void {
  if (typeof window === "undefined") return;
  try {
    if (shouldSkipShareView(window.location.search)) return;

    const sentKey = `manatki-share-viewed:${token}`;
    if (window.sessionStorage.getItem(sentKey)) return;

    const sessionKey = `manatki-share-session:${token}`;
    const sessionId =
      window.sessionStorage.getItem(sessionKey) ?? window.crypto.randomUUID();
    window.sessionStorage.setItem(sessionKey, sessionId);
    window.sessionStorage.setItem(sentKey, "1");

    const body: ShareLinkEventsRequest = {
      sessionId,
      events: [{ type: "view" }],
    };
    void fetch(
      `${appBasePath()}/api/share/${encodeURIComponent(token)}/events`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        keepalive: true,
      },
    ).catch(() => {});
  } catch {
    // Blocked storage (private mode) or fetch setup errors: skip silently.
  }
}
