import { useSession } from "@agent-native/core/client/hooks";
import { buildSignInReturnHref } from "@agent-native/core/client/ui";
import { IconArrowRight, IconBrandGithub } from "@tabler/icons-react";
import { useEffect, useState } from "react";

import {
  CAPABILITIES,
  DEPLOY_STACK,
  GITHUB_URL,
  LOCAL_SETUP,
  PRESENTER_KEYS,
  PROJECT_KINDS,
  PROMPT_EXAMPLES,
  TAGLINE,
} from "@/lib/landing-content";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { href: "#projects", label: "Projects" },
  { href: "#capabilities", label: "Capabilities" },
  { href: "#present", label: "Present" },
  { href: "#run", label: "Run it" },
];

/**
 * Where "Open the studio" should send someone.
 *
 * `buildSignInReturnHref()` reads `window.location`, so it can only run after
 * mount. Until then the href falls back to `/`, which is correct for signed-in
 * visitors and merely one redirect longer for everyone else.
 */
function useStudioHref(): { href: string; label: string } {
  const { session } = useSession();
  const [signInHref, setSignInHref] = useState("/");

  useEffect(() => {
    setSignInHref(buildSignInReturnHref({ returnTo: "/" }));
  }, []);

  return session
    ? { href: "/", label: "Open the studio" }
    : { href: signInHref, label: "Start with GitHub" };
}

export default function Landing() {
  const studio = useStudioHref();

  return (
    <div className="landing min-h-dvh">
      <a
        href="#main"
        className="landing-mono sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-[var(--landing-lime)] focus:px-3 focus:py-2 focus:text-[11px] focus:uppercase focus:text-[var(--landing-ink)]"
      >
        Skip to content
      </a>

      <SiteHeader studio={studio} />

      <main id="main">
        <Hero studio={studio} />

        <Section id="projects" index="01" label="Two kinds of project">
          <div className="grid gap-10 sm:grid-cols-2 sm:gap-12">
            {PROJECT_KINDS.map((project) => (
              <div key={project.name}>
                <h3 className="landing-display text-xl font-semibold">
                  {project.name}
                </h3>
                <p className="landing-mono mt-1.5 text-[11px] text-[var(--landing-clay)]">
                  {project.kind}
                </p>
                <p className="mt-4 text-[15px] leading-relaxed text-[var(--landing-muted)]">
                  {project.summary}
                </p>
                <ul className="mt-5 flex flex-col gap-2.5">
                  {project.points.map((point) => (
                    <li
                      key={point}
                      className="flex gap-3 text-[15px] leading-snug"
                    >
                      <span
                        aria-hidden="true"
                        className="mt-2 size-1 shrink-0 rounded-full bg-[var(--landing-lime)]"
                      />
                      {point}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Section>

        <Section id="capabilities" index="02" label="What's inside">
          <dl className="grid gap-x-12 gap-y-9 sm:grid-cols-2">
            {CAPABILITIES.map((capability) => (
              <div key={capability.title}>
                <dt className="landing-display text-[17px] font-semibold">
                  {capability.title}
                </dt>
                <dd className="mt-2 text-[15px] leading-relaxed text-[var(--landing-muted)]">
                  {capability.body}
                </dd>
              </div>
            ))}
          </dl>
        </Section>

        <Section
          id="present"
          index="03"
          label="Presenting"
          lede="The presenter stage is keyboard-first — you should never need to reach for the mouse mid-talk."
        >
          <table className="w-full border-collapse text-left">
            <caption className="sr-only">Presenter keyboard shortcuts</caption>
            <tbody>
              {PRESENTER_KEYS.map((row) => (
                <tr
                  key={row.action}
                  className="border-b border-[var(--landing-line)] last:border-b-0"
                >
                  <th
                    scope="row"
                    className="w-1/2 py-3 pr-4 align-top font-normal"
                  >
                    <span className="flex flex-wrap gap-1.5">
                      {row.keys.map((key) => (
                        <kbd
                          key={key}
                          className="landing-mono rounded-[3px] border border-[var(--landing-line)] bg-[var(--landing-raised)] px-2 py-1 text-[11px] text-[var(--landing-bone)]"
                        >
                          {key}
                        </kbd>
                      ))}
                    </span>
                  </th>
                  <td className="py-3 align-middle text-[15px] text-[var(--landing-muted)]">
                    {row.action}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        <Section
          id="keys"
          index="04"
          label="Your key, your data"
          lede="Manatki does not resell tokens. You add your own OpenAI key in Settings and it is stored encrypted, scoped to your account, and used only for your own slide and image generation."
        >
          <p className="text-[15px] leading-relaxed text-[var(--landing-muted)]">
            That means the hosted app needs no server-side AI credentials at
            all, and self-hosters can optionally set a shared{" "}
            <code className="landing-mono text-[13px] text-[var(--landing-clay)]">
              GEMINI_API_KEY
            </code>{" "}
            as a fallback for image generation. Decks live in your own database;
            files live in your own blob storage.
          </p>
        </Section>

        <Section
          id="run"
          index="05"
          label="Run it yourself"
          lede="Manatki is MIT-licensed and self-hostable. Locally it runs on SQLite with auth switched off, so you can be editing a deck a minute after cloning."
        >
          <pre className="landing-mono overflow-x-auto rounded-md border border-[var(--landing-line)] bg-[var(--landing-raised)] p-4 text-[13px] leading-relaxed">
            <code>
              {LOCAL_SETUP.map((line) => (
                <span key={line} className="block">
                  <span
                    aria-hidden="true"
                    className="select-none text-[var(--landing-lime)]"
                  >
                    ${" "}
                  </span>
                  {line}
                </span>
              ))}
            </code>
          </pre>
          <p className="mt-4 text-[15px] leading-relaxed text-[var(--landing-muted)]">
            Serves at{" "}
            <code className="landing-mono text-[13px] text-[var(--landing-bone)]">
              localhost:8080
            </code>
            . For a real deployment, the default target is Vercel:
          </p>
          <dl className="mt-6 border-t border-[var(--landing-line)]">
            {DEPLOY_STACK.map((row) => (
              <div
                key={row.label}
                className="flex flex-col gap-1 border-b border-[var(--landing-line)] py-3 sm:flex-row sm:gap-6"
              >
                <dt className="landing-mono w-32 shrink-0 text-[11px] uppercase text-[var(--landing-muted)]">
                  {row.label}
                </dt>
                <dd className="text-[15px]">{row.value}</dd>
              </div>
            ))}
          </dl>
        </Section>
      </main>

      <SiteFooter studio={studio} />
    </div>
  );
}

interface StudioTarget {
  href: string;
  label: string;
}

function SiteHeader({ studio }: { studio: StudioTarget }) {
  return (
    <header className="border-b border-[var(--landing-line)]">
      <div className="mx-auto flex max-w-5xl items-center gap-6 px-6 py-5">
        <a
          href="/"
          className="landing-display text-[15px] font-bold uppercase tracking-[0.2em]"
        >
          Manatki
        </a>
        <nav
          aria-label="Sections"
          className="ml-auto hidden items-center gap-7 md:flex"
        >
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="landing-mono text-[11px] uppercase text-[var(--landing-muted)] transition-colors duration-150 hover:text-[var(--landing-bone)]"
            >
              {link.label}
            </a>
          ))}
        </nav>
        <a
          href={GITHUB_URL}
          target="_blank"
          rel="noreferrer noopener"
          className="ml-auto text-[var(--landing-muted)] transition-colors duration-150 hover:text-[var(--landing-bone)] md:ml-0"
          aria-label="Manatki on GitHub"
        >
          <IconBrandGithub className="size-[18px]" />
        </a>
        <CtaLink href={studio.href} className="hidden sm:inline-flex">
          {studio.label}
        </CtaLink>
      </div>
    </header>
  );
}

function Hero({ studio }: { studio: StudioTarget }) {
  return (
    <div className="mx-auto max-w-5xl px-6 pb-20 pt-20 md:pb-28 md:pt-32">
      <p className="landing-mono text-[11px] uppercase text-[var(--landing-lime)]">
        Open source · Bring your own key · MIT
      </p>
      <h1 className="landing-display mt-6 max-w-3xl text-4xl font-extrabold leading-[1.05] sm:text-5xl md:text-[64px]">
        Decks and campaigns you build{" "}
        <span className="text-[var(--landing-lime)]">by talking</span> to them.
      </h1>
      <p className="mt-7 max-w-2xl text-[17px] leading-relaxed text-[var(--landing-muted)]">
        {TAGLINE}
      </p>

      <div className="mt-10 flex flex-wrap items-center gap-3">
        <CtaLink href={studio.href} size="lg">
          {studio.label}
          <IconArrowRight className="size-4" aria-hidden="true" />
        </CtaLink>
        <a
          href={GITHUB_URL}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-2 rounded-md border border-[var(--landing-line)] px-5 py-3 text-[14px] font-medium transition-colors duration-150 hover:border-[var(--landing-muted)]"
        >
          <IconBrandGithub className="size-4" aria-hidden="true" />
          Read the source
        </a>
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
                className="landing-mono text-[13px] text-[var(--landing-lime)]"
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

interface SectionProps {
  id: string;
  index: string;
  label: string;
  lede?: string;
  children: React.ReactNode;
}

/**
 * One broadsheet band: a mono section marker in the left rail, content on the
 * right. The rail collapses above the content on narrow screens.
 */
function Section({ id, index, label, lede, children }: SectionProps) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-heading`}
      className="border-t border-[var(--landing-line)]"
    >
      <div className="mx-auto grid max-w-5xl gap-8 px-6 py-16 md:grid-cols-[9rem_minmax(0,1fr)] md:gap-14 md:py-24">
        <div className="flex items-baseline gap-3 md:flex-col md:gap-2">
          <span
            aria-hidden="true"
            className="landing-mono text-[11px] text-[var(--landing-lime)]"
          >
            {index}
          </span>
          <h2
            id={`${id}-heading`}
            className="landing-mono text-[11px] uppercase text-[var(--landing-muted)]"
          >
            {label}
          </h2>
        </div>
        <div>
          {lede && (
            <p className="landing-display mb-9 max-w-2xl text-[21px] font-medium leading-snug">
              {lede}
            </p>
          )}
          {children}
        </div>
      </div>
    </section>
  );
}

function SiteFooter({ studio }: { studio: StudioTarget }) {
  return (
    <footer className="border-t border-[var(--landing-line)]">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-12 sm:flex-row sm:items-center">
        <div>
          <p className="landing-display text-[15px] font-bold uppercase tracking-[0.2em]">
            Manatki
          </p>
          <p className="landing-mono mt-2 text-[11px] uppercase text-[var(--landing-muted)]">
            MIT licensed · Built on Agent Native
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4 sm:ml-auto">
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer noopener"
            className="landing-mono text-[11px] uppercase text-[var(--landing-muted)] transition-colors duration-150 hover:text-[var(--landing-bone)]"
          >
            GitHub
          </a>
          <CtaLink href={studio.href}>{studio.label}</CtaLink>
        </div>
      </div>
    </footer>
  );
}

function CtaLink({
  href,
  children,
  className,
  size = "md",
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
  size?: "md" | "lg";
}) {
  return (
    <a
      href={href}
      className={cn(
        "inline-flex items-center gap-2 rounded-md bg-[var(--landing-lime)] font-medium text-[var(--landing-ink)] transition-opacity duration-150 hover:opacity-85",
        size === "lg" ? "px-5 py-3 text-[14px]" : "px-3.5 py-2 text-[13px]",
        className,
      )}
    >
      {children}
    </a>
  );
}

/**
 * Painted at `/` only on a first-ever visit, while the session resolves and
 * there is no remembered state to pick a side from. Deliberately near-empty:
 * it exists to avoid flashing the wrong page, not to be looked at.
 */
export function LandingSplash() {
  return (
    <div className="landing flex min-h-dvh items-center justify-center">
      <p className="landing-display text-[15px] font-bold uppercase tracking-[0.2em] text-[var(--landing-muted)]">
        Manatki
      </p>
    </div>
  );
}
