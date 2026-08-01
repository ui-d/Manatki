import { appBasePath } from "@agent-native/core/client/api-path";
import type { ShareLinkEventsRequest } from "@shared/api";

/**
 * Owner previews opened from the Snapshot-link tab carry `?preview=1` and
 * must never count as views.
 */
export function shouldSkipShareView(search: string): boolean {
  return new URLSearchParams(search).has("preview");
}

/** Dwells shorter than this are rapid flips, not engagement — skipped. */
export const MIN_DWELL_MS = 500;
/** The events endpoint rejects dwells above one hour; clamp before sending. */
export const MAX_DWELL_MS = 60 * 60 * 1000;

/** Clamp a measured dwell into the range the beacon endpoint accepts. */
export function clampDwellMs(ms: number): number {
  if (!Number.isFinite(ms) || ms < 0) return 0;
  return Math.min(Math.round(ms), MAX_DWELL_MS);
}

/**
 * The anonymous per-token viewer id: a random UUID minted client-side and
 * kept in sessionStorage so views and slide dwells from one visit correlate
 * without any PII.
 */
function getShareSessionId(token: string): string {
  const sessionKey = `manatki-share-session:${token}`;
  const existing = window.sessionStorage.getItem(sessionKey);
  if (existing) return existing;
  const minted = window.crypto.randomUUID();
  window.sessionStorage.setItem(sessionKey, minted);
  return minted;
}

/**
 * Fire-and-forget beacon post. Analytics must never break the viewer page,
 * so every failure is swallowed; keepalive lets the request survive
 * navigation and tab close.
 */
function postShareEvents(token: string, body: ShareLinkEventsRequest): void {
  void fetch(`${appBasePath()}/api/share/${encodeURIComponent(token)}/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    keepalive: true,
  }).catch(() => {});
}

/**
 * Record one anonymous `view` event per browser session for a share token.
 */
export function recordShareView(token: string): void {
  if (typeof window === "undefined") return;
  try {
    if (shouldSkipShareView(window.location.search)) return;

    const sentKey = `manatki-share-viewed:${token}`;
    if (window.sessionStorage.getItem(sentKey)) return;

    const sessionId = getShareSessionId(token);
    window.sessionStorage.setItem(sentKey, "1");

    postShareEvents(token, { sessionId, events: [{ type: "view" }] });
  } catch {
    // Blocked storage (private mode) or fetch setup errors: skip silently.
  }
}

export interface ShareDwellTracker {
  /** Report the slide the viewer is now on; flushes the previous dwell. */
  onSlideChange: (index: number) => void;
  /** Detach listeners and flush the in-progress dwell (unmount). */
  destroy: () => void;
}

/**
 * Track per-slide dwell for an anonymous share-link viewing session. Each
 * finished dwell is sent immediately as a `slide` event (small audiences,
 * and per-change posts survive tab close better than batches); the
 * in-progress dwell is flushed on hide/pagehide/unmount. Returns null for
 * owner previews and when storage is unavailable — tracking is best-effort.
 */
export function createShareDwellTracker(
  token: string,
): ShareDwellTracker | null {
  if (typeof window === "undefined") return null;
  try {
    if (shouldSkipShareView(window.location.search)) return null;
    const sessionId = getShareSessionId(token);

    let currentIndex = 0;
    let enteredAt: number | null = performance.now();

    const flush = () => {
      if (enteredAt === null) return;
      const dwellMs = clampDwellMs(performance.now() - enteredAt);
      enteredAt = null;
      if (dwellMs < MIN_DWELL_MS) return;
      postShareEvents(token, {
        sessionId,
        events: [{ type: "slide", slideIndex: currentIndex, dwellMs }],
      });
    };

    // A hidden tab is not viewing: close the dwell there, and restart the
    // clock when the tab becomes visible again (a second event for the same
    // slide is fine — the server sums them).
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") flush();
      else if (enteredAt === null) enteredAt = performance.now();
    };
    const handlePageHide = () => flush();

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("pagehide", handlePageHide);

    return {
      onSlideChange(index: number) {
        if (index === currentIndex) return;
        flush();
        currentIndex = index;
        enteredAt = performance.now();
      },
      destroy() {
        document.removeEventListener("visibilitychange", handleVisibility);
        window.removeEventListener("pagehide", handlePageHide);
        flush();
      },
    };
  } catch {
    return null;
  }
}
