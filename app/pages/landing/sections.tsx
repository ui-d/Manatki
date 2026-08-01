import { IconArrowRight, IconBrandGithub } from "@tabler/icons-react";

import {
  BRAND_SECTION,
  CAPABILITIES,
  FINAL_CTA,
  FREE_SECTION,
  GITHUB_URL,
  LOCAL_SETUP,
  PRESENT_SECTION,
  PRESENTER_KEYS,
  PROJECT_KINDS,
  SCREENSHOT_SHOTS,
  SHARE_SECTION,
  type SectionPoint,
} from "@/lib/landing-content";

import {
  CtaLink,
  ScreenshotFrame,
  Section,
  type StudioTarget,
} from "./primitives";

/** Titled points shared by the brand / present / share bands and subpages. */
export function PointList({
  points,
  columns = 1,
}: {
  points: readonly SectionPoint[];
  columns?: 1 | 2;
}) {
  return (
    <dl
      className={
        columns === 2
          ? "grid gap-x-12 gap-y-7 sm:grid-cols-2"
          : "flex flex-col gap-7"
      }
    >
      {points.map((point) => (
        <div key={point.title}>
          <dt className="landing-display text-[17px] font-semibold">
            {point.title}
          </dt>
          <dd className="mt-2 text-[15px] leading-relaxed text-[var(--landing-muted)]">
            {point.body}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function ProjectsSection() {
  const thumbs = [SCREENSHOT_SHOTS.deckEditor, SCREENSHOT_SHOTS.socialBoard];

  return (
    <Section id="projects" index="01" label="One prompt, two kinds of output">
      <div className="grid gap-10 sm:grid-cols-2 sm:gap-12">
        {PROJECT_KINDS.map((project, i) => (
          <div key={project.name}>
            <ScreenshotFrame shot={thumbs[i]} className="mb-6" />
            <h3 className="landing-display text-xl font-semibold">
              {project.name}
            </h3>
            <p className="landing-mono mt-1.5 text-[11px] text-[var(--landing-gold)]">
              {project.kind}
            </p>
            <p className="mt-4 text-[15px] leading-relaxed text-[var(--landing-muted)]">
              {project.summary}
            </p>
            <ul className="mt-5 flex flex-col gap-2.5">
              {project.points.map((point) => (
                <li key={point} className="flex gap-3 text-[15px] leading-snug">
                  <span
                    aria-hidden="true"
                    className="mt-2 size-1 shrink-0 rounded-full bg-[var(--landing-accent)]"
                  />
                  {point}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Section>
  );
}

export function BrandSection() {
  return (
    <Section
      id="brand"
      index="02"
      label="On brand, provably"
      lede={BRAND_SECTION.lede}
    >
      <div className="grid items-start gap-10 lg:grid-cols-2 lg:gap-12">
        <PointList points={BRAND_SECTION.points} />
        <ScreenshotFrame shot={SCREENSHOT_SHOTS.brandCheck} />
      </div>
    </Section>
  );
}

export function PresentSection() {
  return (
    <Section
      id="present"
      index="03"
      label="Presenting"
      lede={PRESENT_SECTION.lede}
    >
      <ScreenshotFrame shot={SCREENSHOT_SHOTS.presenterStage} className="mb-10" />
      <div className="grid items-start gap-10 lg:grid-cols-2 lg:gap-12">
        <PointList points={PRESENT_SECTION.points} />
        <PresenterKeysTable />
      </div>
    </Section>
  );
}

export function PresenterKeysTable() {
  return (
    <table className="w-full border-collapse text-left">
      <caption className="sr-only">Presenter keyboard shortcuts</caption>
      <tbody>
        {PRESENTER_KEYS.map((row) => (
          <tr
            key={row.action}
            className="border-b border-[var(--landing-line)] last:border-b-0"
          >
            <th scope="row" className="w-1/2 py-3 pr-4 align-top font-normal">
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
  );
}

export function ShareSection() {
  return (
    <Section
      id="share"
      index="04"
      label="Share it, then see what landed"
      lede={SHARE_SECTION.lede}
    >
      <div className="grid items-start gap-10 lg:grid-cols-2 lg:gap-12">
        <ScreenshotFrame shot={SCREENSHOT_SHOTS.shareAnalytics} />
        <PointList points={SHARE_SECTION.points} />
      </div>
    </Section>
  );
}

export function CapabilitiesSection() {
  return (
    <Section id="capabilities" index="05" label="What's inside">
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
  );
}

export function FreeSection({
  studio,
  onSignupClick,
  onSelfHostClick,
}: {
  studio: StudioTarget;
  onSignupClick?: () => void;
  onSelfHostClick?: () => void;
}) {
  return (
    <Section id="free" index="06" label="Free, and yours" lede={FREE_SECTION.lede}>
      <div className="grid items-start gap-10 lg:grid-cols-2 lg:gap-12">
        <PointList points={FREE_SECTION.points} />
        <div>
          <p className="text-[15px] leading-relaxed text-[var(--landing-muted)]">
            {FREE_SECTION.selfHostNote}
          </p>
          <pre className="landing-mono mt-5 overflow-x-auto rounded-md border border-[var(--landing-line)] bg-[var(--landing-raised)] p-4 text-[13px] leading-relaxed">
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
        </div>
      </div>

      <div className="mt-16">
        <CtaBand
          studio={studio}
          title={FINAL_CTA.title}
          body={FINAL_CTA.body}
          secondaryLabel={FINAL_CTA.secondaryLabel}
          secondaryHref="/self-host"
          onSignupClick={onSignupClick}
          onSecondaryClick={onSelfHostClick}
        />
      </div>
    </Section>
  );
}

/** Closing conversion band, shared by the homepage and every subpage. */
export function CtaBand({
  studio,
  title,
  body,
  secondaryLabel,
  secondaryHref = GITHUB_URL,
  onSignupClick,
  onSecondaryClick,
}: {
  studio: StudioTarget;
  title: string;
  body: string;
  secondaryLabel: string;
  secondaryHref?: string;
  onSignupClick?: () => void;
  onSecondaryClick?: () => void;
}) {
  const external = secondaryHref.startsWith("http");
  return (
    <div className="rounded-xl border border-[var(--landing-line)] bg-[var(--landing-raised)] px-8 py-10 text-center">
      <p className="landing-display text-2xl font-extrabold sm:text-3xl">
        {title}
      </p>
      <p className="mx-auto mt-3 max-w-xl text-[15px] leading-relaxed text-[var(--landing-muted)]">
        {body}
      </p>
      <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
        <CtaLink href={studio.href} size="lg" onClick={onSignupClick}>
          {studio.label}
          <IconArrowRight className="size-4" aria-hidden="true" />
        </CtaLink>
        <a
          href={secondaryHref}
          target={external ? "_blank" : undefined}
          rel={external ? "noreferrer noopener" : undefined}
          onClick={onSecondaryClick}
          className="inline-flex items-center gap-2 rounded-md border border-[var(--landing-line)] px-5 py-3 text-[14px] font-medium transition-colors duration-150 hover:border-[var(--landing-muted)]"
        >
          {external && (
            <IconBrandGithub className="size-4" aria-hidden="true" />
          )}
          {secondaryLabel}
        </a>
      </div>
    </div>
  );
}
