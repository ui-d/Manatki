import { useT } from "@agent-native/core/client/i18n";
import { useEffect, useRef } from "react";

import SlideRenderer from "@/components/deck/SlideRenderer";
import type { Slide } from "@/context/DeckContext";
import { createAssetDwellRecorder } from "@/lib/share-view-event";
import { presetLabel } from "@/lib/size-preset-labels";
import { SIZE_PRESETS, type SizePreset } from "@/lib/slide-size";

interface SharedAssetGalleryProps {
  title: string;
  slides: Slide[];
  /** Share token — enables anonymous per-asset dwell analytics. */
  token?: string;
}

/**
 * An asset counts as engaged when it is mostly on screen: half the asset
 * visible, or — for assets taller than the viewport, where a 50% ratio is
 * unreachable — the visible part filling half the viewport.
 */
function isEngaged(entry: IntersectionObserverEntry): boolean {
  if (entry.intersectionRatio >= 0.5) return true;
  if (!entry.rootBounds || entry.rootBounds.height === 0) return false;
  return entry.intersectionRect.height >= entry.rootBounds.height * 0.5;
}

function assetFormatLabel(
  t: ReturnType<typeof useT>,
  slide: Slide,
): string | null {
  const size = slide.size;
  if (!size) return null;
  if (size.preset && size.preset in SIZE_PRESETS) {
    return `${presetLabel(t, size.preset as SizePreset)} · ${size.width}×${size.height}`;
  }
  return `${size.width}×${size.height}`;
}

/**
 * Read-only share view for social projects: every asset at its own native
 * aspect ratio in a grid, instead of the deck presenter (which assumes one
 * uniform canvas).
 */
export default function SharedAssetGallery({
  title,
  slides,
  token,
}: SharedAssetGalleryProps) {
  const t = useT();
  const gridRef = useRef<HTMLDivElement | null>(null);

  // Per-asset dwell via IntersectionObserver — the gallery has no "current
  // slide", so engagement is which assets are actually on screen. The
  // recorder handles preview skip, tab-hide pausing, and unload flushes.
  useEffect(() => {
    if (!token || !gridRef.current) return;
    const recorder = createAssetDwellRecorder(token);
    if (!recorder) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const index = Number(
            (entry.target as HTMLElement).dataset.assetIndex,
          );
          if (!Number.isInteger(index)) continue;
          if (isEngaged(entry)) recorder.enter(index);
          else recorder.leave(index);
        }
      },
      // Graded thresholds so the engaged/disengaged boundary is re-evaluated
      // as scrolling changes visibility, not only at fully-in/fully-out.
      { threshold: [0, 0.25, 0.5, 0.75, 1] },
    );
    for (const el of gridRef.current.querySelectorAll("[data-asset-index]")) {
      observer.observe(el);
    }

    return () => {
      observer.disconnect();
      recorder.destroy();
    };
  }, [token]);

  return (
    <div className="min-h-screen bg-[hsl(240,6%,4%)]">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <header className="mb-8">
          <h1 className="text-xl font-semibold text-white/90">{title}</h1>
          <p className="mt-1 text-sm text-white/50">
            {slides.length} {t("home.assetCount", { count: slides.length })}
          </p>
        </header>

        {/* items-start keeps a 9:16 story from stretching the 728×90 banner
            beside it to the same row height. */}
        <div
          ref={gridRef}
          className="grid grid-cols-1 items-start gap-6 sm:grid-cols-2 lg:grid-cols-3"
        >
          {slides.map((slide, index) => {
            const format = assetFormatLabel(t, slide);
            return (
              <figure
                key={slide.id || index}
                data-asset-index={index}
                className="min-w-0"
              >
                <SlideRenderer
                  slide={slide}
                  className="border border-white/10 bg-black"
                />
                {format && (
                  <figcaption className="mt-2 truncate text-[11px] text-white/40">
                    {format}
                  </figcaption>
                )}
              </figure>
            );
          })}
        </div>
      </div>
    </div>
  );
}
