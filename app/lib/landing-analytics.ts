import { track } from "@vercel/analytics";

/**
 * Landing-page CTA click events, reported to Vercel Web Analytics. The
 * `<Analytics />` component is mounted by the landing page only — the
 * workspace stays tracking-free — and `track()` queues safely before init
 * and no-ops when the site is not running on Vercel (e.g. local dev,
 * self-hosts).
 */
export type LandingCta =
  | "hero-signup"
  | "header-signup"
  | "header-signin"
  | "final-band-signup"
  | "footer-signup"
  | "github-hero"
  | "github-header"
  | "github-footer"
  | "self-host";

export function trackLandingCta(cta: LandingCta): void {
  track("landing_cta", { cta });
}
