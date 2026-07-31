/**
 * OffscreenSlideStage — full-resolution, unscaled copies of slides rendered
 * far off-viewport so DOM-capture pipelines (PNG export, preview thumbnails,
 * PPTX/PDF clones) always find an intrinsic-size [data-slide-canvas] source,
 * independent of what the sidebar rail or main canvas currently has mounted.
 */
import { SlideInner } from "@/components/deck/SlideRenderer";
import type { Deck, Slide } from "@/context/DeckContext";
import { getSlideDims } from "@/lib/slide-size";

import type { DesignSystemData } from "../../../shared/api";

export function OffscreenSlideStage({
  slides,
  deck,
  designSystem,
}: {
  slides: Slide[];
  deck: Deck;
  designSystem?: DesignSystemData;
}) {
  if (slides.length === 0) return null;
  return (
    <div
      aria-hidden
      data-offscreen-slide-stage
      style={{
        position: "fixed",
        left: -100000,
        top: 0,
        pointerEvents: "none",
      }}
    >
      {slides.map((slide) => (
        <div
          key={slide.id}
          style={{ width: getSlideDims(slide, deck.aspectRatio).width }}
        >
          <SlideInner
            slide={slide}
            aspectRatio={deck.aspectRatio}
            designSystem={designSystem}
          />
        </div>
      ))}
    </div>
  );
}
