import { useSession } from "@agent-native/core/client/hooks";
import { useEffect, useState } from "react";

import { readAuthHint, writeAuthHint, type AuthHint } from "@/lib/auth-hint";

/**
 * What `/` should paint right now.
 *
 * - `landing` — the public marketing page (visitor, or no session)
 * - `app` — the deck workspace (signed in)
 * - `pending` — session unresolved and no remembered state to guess from
 */
export type HomeGate = "landing" | "app" | "pending";

/**
 * Decide between the landing page and the workspace at `/`.
 *
 * `useSession()` resolves over the network, so the real answer is not available
 * on the first paint. Returning visitors are covered by the remembered
 * {@link AuthHint}; only a genuinely first-ever paint falls through to
 * `pending`, which the caller renders as a quiet splash rather than guessing
 * wrong and flashing the other page.
 *
 * The hint is a rendering shortcut only — the resolved session always wins as
 * soon as it lands, and every action stays gated server-side.
 */
export function useHomeGate(): HomeGate {
  const { session, isLoading } = useSession();
  // Read after mount, not in the initializer: the server has no localStorage,
  // so seeding from it during render would desync hydration.
  const [hint, setHint] = useState<AuthHint>(null);

  useEffect(() => {
    setHint(readAuthHint());
  }, []);

  useEffect(() => {
    if (!isLoading) writeAuthHint(Boolean(session));
  }, [isLoading, session]);

  return resolveHomeGate({ signedIn: Boolean(session), isLoading, hint });
}

export interface HomeGateInput {
  signedIn: boolean;
  isLoading: boolean;
  hint: AuthHint;
}

/** The decision itself, split out from the hook so it can be tested directly. */
export function resolveHomeGate({
  signedIn,
  isLoading,
  hint,
}: HomeGateInput): HomeGate {
  if (!isLoading) return signedIn ? "app" : "landing";
  if (hint === "in") return "app";
  if (hint === "out") return "landing";
  return "pending";
}
