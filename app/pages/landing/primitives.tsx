import { appPath } from "@agent-native/core/client/api-path";

import type { ScreenshotShot } from "@/lib/landing-content";
import { cn } from "@/lib/utils";

/** Where the header/hero/footer CTAs point, resolved from the session. */
export interface StudioTarget {
  href: string;
  label: string;
  /** Sign-in link for the header; null once a session exists. */
  signInHref: string | null;
}

interface CtaLinkProps {
  href: string;
  children: React.ReactNode;
  className?: string;
  size?: "md" | "lg";
  onClick?: () => void;
}

export function CtaLink({
  href,
  children,
  className,
  size = "md",
  onClick,
}: CtaLinkProps) {
  return (
    <a
      href={href}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 rounded-md bg-[var(--landing-accent)] font-medium text-[var(--landing-on-accent)] transition-opacity duration-150 hover:opacity-85",
        size === "lg" ? "px-5 py-3 text-[14px]" : "px-3.5 py-2 text-[13px]",
        className,
      )}
    >
      {children}
    </a>
  );
}

export interface SectionProps {
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
export function Section({ id, index, label, lede, children }: SectionProps) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-heading`}
      className="border-t border-[var(--landing-line)]"
    >
      <div className="mx-auto grid max-w-6xl gap-8 px-6 py-16 md:grid-cols-[9rem_minmax(0,1fr)] md:gap-14 md:py-24">
        <div className="flex items-baseline gap-3 md:flex-col md:gap-2">
          <span
            aria-hidden="true"
            className="landing-mono text-[11px] text-[var(--landing-gold)]"
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

interface ScreenshotFrameProps {
  shot: ScreenshotShot;
  /** Hero image loads eagerly with high priority; everything else lazily. */
  eager?: boolean;
  className?: string;
}

/**
 * A product screenshot in a CSS browser-chrome frame matching the landing
 * palette. Explicit width/height (from the shot metadata) keep CLS at zero;
 * while a shot's asset has not been captured yet (`src: null`) it renders a
 * same-aspect skeleton so the layout holds.
 */
export function ScreenshotFrame({ shot, eager, className }: ScreenshotFrameProps) {
  return (
    <figure
      className={cn(
        "overflow-hidden rounded-xl border border-[var(--landing-line)] bg-[var(--landing-raised)] shadow-2xl",
        className,
      )}
    >
      <div
        aria-hidden="true"
        className="flex items-center gap-1.5 border-b border-[var(--landing-line)] px-3.5 py-2.5"
      >
        {[0, 1, 2].map((dot) => (
          <span
            key={dot}
            className="size-2 rounded-full border border-[var(--landing-line)] bg-[var(--landing-ink)]"
          />
        ))}
        <span className="landing-mono ml-2 truncate text-[10px] text-[var(--landing-muted)]">
          manatki.xyz
        </span>
      </div>
      {shot.src ? (
        <picture>
          {shot.avifSrc && (
            <source type="image/avif" srcSet={appPath(shot.avifSrc)} />
          )}
          <img
            src={appPath(shot.src)}
            alt={shot.alt}
            width={shot.width}
            height={shot.height}
            loading={eager ? "eager" : "lazy"}
            fetchPriority={eager ? "high" : "auto"}
            decoding={eager ? "sync" : "async"}
            className="block h-auto w-full"
          />
        </picture>
      ) : (
        <div
          role="img"
          aria-label={shot.alt}
          style={{ aspectRatio: `${shot.width} / ${shot.height}` }}
          className="flex w-full flex-col gap-2.5 p-7"
        >
          <div className="h-3 w-2/3 rounded-sm bg-gradient-to-r from-[var(--landing-gold)]/70 to-[var(--landing-accent-strong)]/70" />
          <div className="mt-2 h-2 w-full rounded-sm bg-[var(--landing-line)]" />
          <div className="h-2 w-5/6 rounded-sm bg-[var(--landing-line)]" />
          <div className="h-2 w-3/5 rounded-sm bg-[var(--landing-line)]" />
          <div className="mt-auto grid grid-cols-3 gap-3">
            {[0, 1, 2].map((tile) => (
              <div
                key={tile}
                className="h-12 rounded-md border border-[var(--landing-line)] bg-[var(--landing-ink)]"
              />
            ))}
          </div>
        </div>
      )}
      {shot.caption && (
        <figcaption className="landing-mono border-t border-[var(--landing-line)] px-3.5 py-2 text-[10px] uppercase text-[var(--landing-muted)]">
          {shot.caption}
        </figcaption>
      )}
    </figure>
  );
}
