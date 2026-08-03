import { useState } from "react";
import { useSearchParams } from "react-router";

import { MarketingShell, useStudioHref } from "./chrome";

type NewsletterMode = "confirm" | "unsubscribe";

type PageState =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "done" }
  | { kind: "invalid" }
  | { kind: "expired" }
  | { kind: "failed" };

const ACTION_BY_MODE: Record<NewsletterMode, string> = {
  confirm: "confirm-newsletter",
  unsubscribe: "unsubscribe-newsletter-by-token",
};

const COPY: Record<
  NewsletterMode,
  {
    title: string;
    body: string;
    button: string;
    done: string;
    doneBody: string;
  }
> = {
  confirm: {
    title: "Confirm your subscription",
    body: "One click and you're on the Manatki newsletter — occasional product news and slide-making tips, unsubscribe anytime.",
    button: "Confirm subscription",
    done: "You're subscribed — welcome!",
    doneBody:
      "Every email includes an unsubscribe link, and you can manage the subscription in Settings → General.",
  },
  unsubscribe: {
    title: "Unsubscribe from the newsletter",
    body: "This removes your address from the Manatki newsletter. You can re-subscribe anytime in Settings → General.",
    button: "Unsubscribe",
    done: "You've been unsubscribed.",
    doneBody:
      "Sorry to see you go. If this was a mistake, you can re-subscribe in Settings → General.",
  },
};

/**
 * The token is applied on an explicit button click, never on page load — mail
 * scanners (Outlook SafeLinks etc.) prefetch links and would otherwise
 * confirm or unsubscribe people who never opened the email.
 *
 * Standalone route: renders outside AppProviders (no QueryClient), so the
 * action is called with plain fetch — same JSON body shape as core's
 * callAction.
 */
async function postNewsletterAction(
  action: string,
  token: string,
): Promise<{ ok: boolean; reason?: string }> {
  const res = await fetch(`/_agent-native/actions/${action}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token }),
  });
  if (!res.ok) throw new Error(`Action ${action} failed: ${res.status}`);
  return (await res.json()) as { ok: boolean; reason?: string };
}

export function NewsletterActionPage({ mode }: { mode: NewsletterMode }) {
  const studio = useStudioHref();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const tokenLooksValid = /^[0-9a-f]{64}$/.test(token);
  const [state, setState] = useState<PageState>(
    tokenLooksValid ? { kind: "idle" } : { kind: "invalid" },
  );
  const copy = COPY[mode];

  const apply = async () => {
    setState({ kind: "busy" });
    try {
      const result = await postNewsletterAction(ACTION_BY_MODE[mode], token);
      if (result.ok) {
        setState({ kind: "done" });
      } else {
        setState({ kind: result.reason === "expired" ? "expired" : "invalid" });
      }
    } catch {
      setState({ kind: "failed" });
    }
  };

  return (
    <MarketingShell studio={studio}>
      <div className="mx-auto max-w-xl px-6 py-24 text-center">
        {(state.kind === "idle" || state.kind === "busy") && (
          <>
            <h1 className="landing-display text-3xl font-extrabold sm:text-4xl">
              {copy.title}
            </h1>
            <p className="mt-5 text-[15px] leading-relaxed text-[var(--landing-muted)]">
              {copy.body}
            </p>
            <button
              type="button"
              onClick={apply}
              disabled={state.kind === "busy"}
              className="mt-9 rounded-md bg-[var(--landing-accent)] px-6 py-3 text-[14px] font-semibold text-[var(--landing-ink)] transition-opacity duration-150 hover:opacity-90 disabled:opacity-60"
            >
              {state.kind === "busy" ? "One moment…" : copy.button}
            </button>
          </>
        )}
        {state.kind === "done" && (
          <>
            <h1 className="landing-display text-3xl font-extrabold sm:text-4xl">
              {copy.done}
            </h1>
            <p className="mt-5 text-[15px] leading-relaxed text-[var(--landing-muted)]">
              {copy.doneBody}
            </p>
            <p className="mt-9">
              <a
                href="/decks"
                className="landing-mono text-[12px] uppercase text-[var(--landing-accent)]"
              >
                Open the studio
              </a>
            </p>
          </>
        )}
        {state.kind === "invalid" && (
          <>
            <h1 className="landing-display text-3xl font-extrabold sm:text-4xl">
              This link is invalid
            </h1>
            <p className="mt-5 text-[15px] leading-relaxed text-[var(--landing-muted)]">
              The link may have already been used or is incomplete. You can
              manage your newsletter subscription anytime in Settings → General.
            </p>
          </>
        )}
        {state.kind === "expired" && (
          <>
            <h1 className="landing-display text-3xl font-extrabold sm:text-4xl">
              This link has expired
            </h1>
            <p className="mt-5 text-[15px] leading-relaxed text-[var(--landing-muted)]">
              Confirmation links are valid for 48 hours. Sign in and re-enable
              the newsletter in Settings → General to get a fresh one.
            </p>
          </>
        )}
        {state.kind === "failed" && (
          <>
            <h1 className="landing-display text-3xl font-extrabold sm:text-4xl">
              Something went wrong
            </h1>
            <p className="mt-5 text-[15px] leading-relaxed text-[var(--landing-muted)]">
              We couldn't reach the server. Please try again in a moment.
            </p>
            <button
              type="button"
              onClick={apply}
              className="mt-9 rounded-md border border-[var(--landing-line)] px-6 py-3 text-[14px] font-medium transition-colors duration-150 hover:border-[var(--landing-muted)]"
            >
              Try again
            </button>
          </>
        )}
        <p className="mt-14">
          <a
            href="/privacy"
            className="landing-mono text-[11px] uppercase text-[var(--landing-muted)] transition-colors duration-150 hover:text-[var(--landing-bone)]"
          >
            Privacy policy
          </a>
        </p>
      </div>
    </MarketingShell>
  );
}
