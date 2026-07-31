import { useT } from "@agent-native/core/client/i18n";

import SlideRenderer from "@/components/deck/SlideRenderer";
import type { Slide } from "@/context/DeckContext";
import { SIZE_PRESETS, type SizePreset } from "@/lib/slide-size";
import { presetLabel } from "@/lib/size-preset-labels";

interface SharedAssetGalleryProps {
  title: string;
  slides: Slide[];
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
}: SharedAssetGalleryProps) {
  const t = useT();

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
        <div className="grid grid-cols-1 items-start gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {slides.map((slide, index) => {
            const format = assetFormatLabel(t, slide);
            return (
              <figure key={slide.id || index} className="min-w-0">
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
