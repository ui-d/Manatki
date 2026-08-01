import { appPath } from "@agent-native/core/client/api-path";
import { useSession } from "@agent-native/core/client/hooks";
import { buildSignInReturnHref } from "@agent-native/core/client/ui";
import { IconBrandGithub, IconMenu2, IconX } from "@tabler/icons-react";
import { Analytics } from "@vercel/analytics/react";
import { useEffect, useState } from "react";

import { trackLandingCta } from "@/lib/landing-analytics";
import { GITHUB_URL } from "@/lib/landing-content";

import { PixelManatee } from "./pixel-art";
import { CtaLink, type StudioTarget } from "./primitives";

/** The workspace. Marketing routes only point at it. */
export const STUDIO_PATH = "/decks";

/** Marketing pages, shared between the header nav and the footer. */
const MARKETING_NAV = [
  { href: "/presentations", label: "Presentations" },
  { href: "/social-assets", label: "Social assets" },
  { href: "/self-host", label: "Self-host" },
];

/**
 * Where "Open the studio" should send someone.
 *
 * `buildSignInReturnHref()` reads `window.location`, so it can only run after
 * mount. Until then the href falls back to the workspace, which is correct for
 * signed-in visitors and merely one redirect longer for everyone else.
 */
export function useStudioHref(): StudioTarget {
  const { session } = useSession();
  const [signInHref, setSignInHref] = useState(STUDIO_PATH);

  useEffect(() => {
    setSignInHref(buildSignInReturnHref({ returnTo: STUDIO_PATH }));
  }, []);

  return session
    ? { href: STUDIO_PATH, label: "Open the studio", signInHref: null }
    : { href: signInHref, label: "Sign up with GitHub", signInHref };
}

/**
 * Shared frame for every marketing page: skip link, header with the
 * cross-page nav, footer, and the marketing-only analytics mount. The
 * workspace itself stays tracking-free.
 */
export function MarketingShell({
  studio,
  children,
}: {
  studio: StudioTarget;
  children: React.ReactNode;
}) {
  return (
    <div className="landing min-h-dvh">
      <a
        href="#main"
        className="landing-mono sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-[var(--landing-accent)] focus:px-3 focus:py-2 focus:text-[11px] focus:uppercase focus:text-[var(--landing-ink)]"
      >
        Skip to content
      </a>
      <SiteHeader studio={studio} />
      <main id="main">{children}</main>
      <SiteFooter studio={studio} />
      <Analytics />
    </div>
  );
}

function NavLinks({ className }: { className?: string }) {
  return (
    <>
      {MARKETING_NAV.map((link) => (
        <a
          key={link.href}
          href={link.href}
          className={
            className ??
            "landing-mono text-[11px] uppercase text-[var(--landing-muted)] transition-colors duration-150 hover:text-[var(--landing-bone)]"
          }
        >
          {link.label}
        </a>
      ))}
    </>
  );
}

function SiteHeader({ studio }: { studio: StudioTarget }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="border-b border-[var(--landing-line)]">
      <div className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-5">
        <a
          href="/"
          className="landing-display flex items-center gap-2.5 text-[15px] font-bold uppercase tracking-[0.2em]"
        >
          <img
            src={appPath("/manatki-icon.svg")}
            alt=""
            aria-hidden="true"
            className="block h-5 w-auto"
          />
          Manatki
        </a>
        <nav
          aria-label="Pages"
          className="ml-auto hidden items-center gap-7 md:flex"
        >
          <NavLinks />
        </nav>
        <a
          href={GITHUB_URL}
          target="_blank"
          rel="noreferrer noopener"
          onClick={() => trackLandingCta("github-header")}
          className="ml-auto text-[var(--landing-muted)] transition-colors duration-150 hover:text-[var(--landing-bone)] md:ml-0"
          aria-label="Manatki on GitHub"
        >
          <IconBrandGithub className="size-[18px]" />
        </a>
        {studio.signInHref && (
          <a
            href={studio.signInHref}
            onClick={() => trackLandingCta("header-signin")}
            className="hidden rounded-md border border-[var(--landing-line)] px-3.5 py-2 text-[13px] font-medium transition-colors duration-150 hover:border-[var(--landing-muted)] sm:inline-flex"
          >
            Sign in
          </a>
        )}
        <CtaLink
          href={studio.href}
          onClick={() => trackLandingCta("header-signup")}
        >
          {studio.signInHref ? "Sign up" : studio.label}
        </CtaLink>
        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          aria-expanded={menuOpen}
          aria-controls="marketing-menu"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          className="text-[var(--landing-muted)] transition-colors duration-150 hover:text-[var(--landing-bone)] md:hidden"
        >
          {menuOpen ? (
            <IconX className="size-5" />
          ) : (
            <IconMenu2 className="size-5" />
          )}
        </button>
      </div>
      {menuOpen && (
        <nav
          id="marketing-menu"
          aria-label="Pages"
          className="border-t border-[var(--landing-line)] md:hidden"
        >
          <div className="mx-auto flex max-w-6xl flex-col gap-1 px-6 py-4">
            <NavLinks className="landing-mono py-2 text-[12px] uppercase text-[var(--landing-bone)] transition-colors duration-150 hover:text-[var(--landing-accent)]" />
            {studio.signInHref && (
              <a
                href={studio.signInHref}
                onClick={() => trackLandingCta("header-signin")}
                className="landing-mono py-2 text-[12px] uppercase text-[var(--landing-bone)] transition-colors duration-150 hover:text-[var(--landing-accent)] sm:hidden"
              >
                Sign in
              </a>
            )}
          </div>
        </nav>
      )}
    </header>
  );
}

function SiteFooter({ studio }: { studio: StudioTarget }) {
  return (
    <footer className="border-t border-[var(--landing-line)]">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-12 sm:flex-row sm:items-center">
        <div>
          <p className="landing-display flex items-center gap-3 text-[15px] font-bold uppercase tracking-[0.2em]">
            Manatki
            <PixelManatee scale={2} />
          </p>
          <p className="landing-mono mt-2 text-[11px] uppercase text-[var(--landing-muted)]">
            MIT licensed · Built on Agent Native
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4 sm:ml-auto">
          <NavLinks />
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer noopener"
            onClick={() => trackLandingCta("github-footer")}
            className="landing-mono text-[11px] uppercase text-[var(--landing-muted)] transition-colors duration-150 hover:text-[var(--landing-bone)]"
          >
            GitHub
          </a>
          <CtaLink
            href={studio.href}
            onClick={() => trackLandingCta("footer-signup")}
          >
            {studio.label}
          </CtaLink>
        </div>
      </div>
    </footer>
  );
}
