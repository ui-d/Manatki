import { IconArrowRight } from "@tabler/icons-react";

import { trackLandingCta } from "@/lib/landing-analytics";
import {
  LOCAL_SETUP,
  SCREENSHOT_SHOTS,
  type ScreenshotShot,
} from "@/lib/landing-content";
import {
  PRESENTATIONS_PAGE,
  SELF_HOST_PAGE,
  SOCIAL_PAGE,
} from "@/lib/landing-subpages";

import { MarketingShell, useStudioHref } from "./chrome";
import {
  CtaLink,
  ScreenshotFrame,
  Section,
  type StudioTarget,
} from "./primitives";
import { CtaBand, PointList } from "./sections";

/**
 * Hero for a marketing subpage: narrower than the homepage hero, with an
 * optional product shot (or any visual) on the right. Vercel Analytics
 * events reuse the homepage CTA names — the event's page path tells the
 * pages apart.
 */
function PageHero({
  eyebrow,
  title,
  tagline,
  studio,
  shot,
  visual,
}: {
  eyebrow: string;
  title: string;
  tagline: string;
  studio: StudioTarget;
  shot?: ScreenshotShot;
  visual?: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-6xl px-6 pb-16 pt-14 md:pb-24 md:pt-20">
      <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:gap-16">
        <div>
          <p className="landing-mono text-[11px] uppercase text-[var(--landing-gold)]">
            {eyebrow}
          </p>
          <h1 className="landing-display mt-6 max-w-3xl text-4xl font-extrabold leading-[1.08] sm:text-5xl">
            {title}
          </h1>
          <p className="mt-6 max-w-2xl text-[17px] leading-relaxed text-[var(--landing-muted)]">
            {tagline}
          </p>
          <div className="mt-9">
            <CtaLink
              href={studio.href}
              size="lg"
              onClick={() => trackLandingCta("hero-signup")}
            >
              {studio.label}
              <IconArrowRight className="size-4" aria-hidden="true" />
            </CtaLink>
          </div>
        </div>
        <div className="hidden lg:block">
          {shot ? <ScreenshotFrame shot={shot} eager /> : visual}
        </div>
      </div>
    </div>
  );
}

function SubpageCtaBand({
  studio,
  title,
  body,
  secondaryLabel,
  secondaryHref,
}: {
  studio: StudioTarget;
  title: string;
  body: string;
  secondaryLabel: string;
  secondaryHref?: string;
}) {
  return (
    <div className="border-t border-[var(--landing-line)]">
      <div className="mx-auto max-w-6xl px-6 py-16 md:py-20">
        <CtaBand
          studio={studio}
          title={title}
          body={body}
          secondaryLabel={secondaryLabel}
          secondaryHref={secondaryHref}
          onSignupClick={() => trackLandingCta("final-band-signup")}
          onSecondaryClick={() => trackLandingCta("self-host")}
        />
      </div>
    </div>
  );
}

export function PresentationsPage() {
  const studio = useStudioHref();
  const page = PRESENTATIONS_PAGE;

  return (
    <MarketingShell studio={studio}>
      <PageHero
        eyebrow={page.eyebrow}
        title={page.title}
        tagline={page.tagline}
        studio={studio}
        shot={SCREENSHOT_SHOTS.deckEditor}
      />
      <Section id="start" index="01" label="Start" lede={page.start.lede}>
        <PointList points={page.start.points} />
      </Section>
      <Section
        id="present"
        index="02"
        label="Presenting"
        lede={page.presenting.lede}
      >
        <ScreenshotFrame
          shot={SCREENSHOT_SHOTS.presenterStageAlt}
          className="mb-10"
        />
        <PointList points={page.presenting.points} />
      </Section>
      <Section id="exports" index="03" label="Exports" lede={page.exports.lede}>
        <PointList points={page.exports.points} />
      </Section>
      <SubpageCtaBand
        studio={studio}
        title={page.cta.title}
        body={page.cta.body}
        secondaryLabel={page.cta.secondaryLabel}
        secondaryHref="/self-host"
      />
    </MarketingShell>
  );
}

export function SocialAssetsPage() {
  const studio = useStudioHref();
  const page = SOCIAL_PAGE;

  return (
    <MarketingShell studio={studio}>
      <PageHero
        eyebrow={page.eyebrow}
        title={page.title}
        tagline={page.tagline}
        studio={studio}
        shot={SCREENSHOT_SHOTS.socialBoard}
      />
      <Section id="presets" index="01" label="Formats" lede={page.presets.lede}>
        <PointList points={page.presets.points} columns={2} />
      </Section>
      <Section
        id="composition"
        index="02"
        label="Composition"
        lede={page.composed.lede}
      >
        <PointList points={page.composed.points} />
      </Section>
      <SubpageCtaBand
        studio={studio}
        title={page.cta.title}
        body={page.cta.body}
        secondaryLabel={page.cta.secondaryLabel}
        secondaryHref="/self-host"
      />
    </MarketingShell>
  );
}

export function SelfHostPage() {
  const studio = useStudioHref();
  const page = SELF_HOST_PAGE;

  return (
    <MarketingShell studio={studio}>
      <PageHero
        eyebrow={page.eyebrow}
        title={page.title}
        tagline={page.tagline}
        studio={studio}
        visual={<LocalSetupBlock />}
      />
      <Section id="stack" index="01" label="Your stack">
        <dl className="border-t border-[var(--landing-line)]">
          {page.stack.map((row) => (
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
      <Section id="keys" index="02" label="Keys and data" lede={page.keys.lede}>
        <PointList points={page.keys.points} />
      </Section>
      <SubpageCtaBand
        studio={studio}
        title={page.cta.title}
        body={page.cta.body}
        secondaryLabel={page.cta.secondaryLabel}
      />
    </MarketingShell>
  );
}

function LocalSetupBlock() {
  return (
    <div>
      <pre className="landing-mono overflow-x-auto rounded-md border border-[var(--landing-line)] bg-[var(--landing-raised)] p-4 text-[13px] leading-relaxed">
        <code>
          {LOCAL_SETUP.map((line) => (
            <span key={line} className="block">
              <span
                aria-hidden="true"
                className="select-none text-[var(--landing-gold)]"
              >
                ${" "}
              </span>
              {line}
            </span>
          ))}
        </code>
      </pre>
      <p className="mt-4 text-[14px] leading-relaxed text-[var(--landing-muted)]">
        {SELF_HOST_PAGE.localNote}
      </p>
    </div>
  );
}
