import { useSession } from "@agent-native/core/client/hooks";
import { IconArrowRight, IconBrandGithub } from "@tabler/icons-react";
import { useEffect } from "react";
import { useNavigate } from "react-router";

import { trackLandingCta } from "@/lib/landing-analytics";
import {
  EYEBROW,
  GITHUB_URL,
  PROMPT_EXAMPLES,
  SCREENSHOT_SHOTS,
  TAGLINE,
} from "@/lib/landing-content";

import { MarketingShell, STUDIO_PATH, useStudioHref } from "./landing/chrome";
import {
  CtaLink,
  ScreenshotFrame,
  type StudioTarget,
} from "./landing/primitives";
import {
  BrandSection,
  CapabilitiesSection,
  FreeSection,
  PresentSection,
  ProjectsSection,
  ShareSection,
} from "./landing/sections";

/**
 * Send signed-in visitors on to the workspace.
 *
 * `/` is a static marketing page for everyone, so someone whose bookmark still
 * points here would otherwise land on the pitch for a product they already
 * use. The forward waits for the session to actually resolve — guessing from a
 * cached hint would send signed-out visitors to a sign-in bounce. Subpages do
 * NOT forward: a signed-in user clicking "Self-host" wants to read the page.
 */
function useForwardSignedInToStudio(): void {
  const { session, isLoading } = useSession();
  const navigate = useNavigate();

  useEffect(() => {
    if (isLoading || !session) return;
    navigate(STUDIO_PATH, { replace: true });
  }, [isLoading, session, navigate]);
}

export default function Landing() {
  const studio = useStudioHref();
  useForwardSignedInToStudio();

  return (
    <MarketingShell studio={studio}>
      <Hero studio={studio} />
      <ProjectsSection />
      <BrandSection />
      <PresentSection />
      <ShareSection />
      <CapabilitiesSection />
      <FreeSection
        studio={studio}
        onSignupClick={() => trackLandingCta("final-band-signup")}
        onSelfHostClick={() => trackLandingCta("self-host")}
      />
    </MarketingShell>
  );
}

function Hero({ studio }: { studio: StudioTarget }) {
  return (
    <div className="mx-auto max-w-6xl px-6 pb-20 pt-16 md:pb-28 md:pt-24">
      <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)] lg:gap-16">
        <div>
          <p className="landing-mono text-[11px] uppercase text-[var(--landing-gold)]">
            {EYEBROW}
          </p>
          <h1 className="landing-display mt-6 max-w-3xl text-4xl font-extrabold leading-[1.05] sm:text-5xl md:text-[60px]">
            Your next deck is{" "}
            <span className="bg-gradient-to-r from-[var(--landing-gold)] to-[var(--landing-accent)] bg-clip-text text-transparent">
              one prompt
            </span>{" "}
            away.
          </h1>
          <p className="mt-7 max-w-2xl text-[17px] leading-relaxed text-[var(--landing-muted)]">
            {TAGLINE}
          </p>

          <div className="mt-10 flex flex-wrap items-center gap-3">
            <CtaLink
              href={studio.href}
              size="lg"
              onClick={() => trackLandingCta("hero-signup")}
            >
              {studio.label}
              <IconArrowRight className="size-4" aria-hidden="true" />
            </CtaLink>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer noopener"
              onClick={() => trackLandingCta("github-hero")}
              className="inline-flex items-center gap-2 rounded-md border border-[var(--landing-line)] px-5 py-3 text-[14px] font-medium transition-colors duration-150 hover:border-[var(--landing-muted)]"
            >
              <IconBrandGithub className="size-4" aria-hidden="true" />
              Star on GitHub
            </a>
          </div>
        </div>

        <HeroVisual />
      </div>

      <div className="mt-16 border-t border-[var(--landing-line)] pt-8">
        <p className="landing-mono text-[11px] uppercase text-[var(--landing-muted)]">
          Everything the editor can do, chat can do too
        </p>
        <ul className="mt-5 flex flex-col gap-3">
          {PROMPT_EXAMPLES.map((prompt) => (
            <li key={prompt} className="flex items-baseline gap-3">
              <span
                aria-hidden="true"
                className="landing-mono text-[13px] text-[var(--landing-gold)]"
              >
                &gt;
              </span>
              <span className="landing-mono text-[13px] leading-relaxed tracking-normal text-[var(--landing-bone)]">
                {prompt}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/**
 * The hero product shot, kept inside the decorative rotated frames that echo
 * the logo mark. Hidden from single-column layouts, where the copy carries
 * the hero alone.
 */
function HeroVisual() {
  return (
    <div className="relative hidden lg:block">
      <div
        aria-hidden="true"
        className="absolute -inset-10 rounded-full bg-[radial-gradient(closest-side,rgba(255,90,43,0.20),transparent)]"
      />
      <div
        aria-hidden="true"
        className="absolute -left-5 top-12 h-56 w-44 -rotate-6 rounded-2xl border-2 border-[var(--landing-gold)]/35"
      />
      <div
        aria-hidden="true"
        className="absolute -right-3 -top-4 h-44 w-56 rotate-3 rounded-2xl border-2 border-[var(--landing-accent-strong)]/45"
      />
      <ScreenshotFrame
        shot={SCREENSHOT_SHOTS.heroEditor}
        eager
        className="relative"
      />
    </div>
  );
}
