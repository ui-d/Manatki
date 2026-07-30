/**
 * Remembered sign-in state, used purely as a *rendering* hint.
 *
 * `useSession()` resolves over the network, so the first paint of `/` never
 * knows yet whether to show the public landing page or the deck workspace.
 * Without a hint we would either flash the landing at signed-in users or flash
 * the workspace at visitors. We therefore remember the last resolved state and
 * use it to pick what to paint while the real session is in flight.
 *
 * This is not an authorization decision and must never be treated as one:
 * every action and route stays gated by the server-side session. The worst a
 * tampered hint can do is paint the wrong page for a few hundred milliseconds
 * before `useSession()` corrects it.
 */

const AUTH_HINT_KEY = "manatki:auth-hint";

export type AuthHint = "in" | "out" | null;

export function readAuthHint(): AuthHint {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem(AUTH_HINT_KEY);
    return stored === "in" || stored === "out" ? stored : null;
  } catch {
    // Private mode / blocked storage: fall back to "unknown".
    return null;
  }
}

export function writeAuthHint(signedIn: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(AUTH_HINT_KEY, signedIn ? "in" : "out");
  } catch {}
}
