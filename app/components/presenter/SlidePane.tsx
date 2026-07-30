import SlideRenderer from "@/components/deck/SlideRenderer";
import type { Slide } from "@/context/DeckContext";
import type { AspectRatio } from "@/lib/aspect-ratios";

interface SlidePaneProps {
  slide: Slide;
  active: boolean;
  /** Transparent generated closer — no frame, rim, glass or shadow. */
  plain: boolean;
  /** Outside the lazy load window panes keep their footprint but stay empty. */
  loaded: boolean;
  /** The bevel only sells the frosted variants; skip the duplicate render
   * (and for HTML slides its full second SlideRenderer) elsewhere. */
  withGlass: boolean;
  aspectRatio?: AspectRatio;
  /** First image of an image deck reports its natural ratio so the panes can
   * adopt the deck's real proportions (the original adoptRatio). */
  onImageLoad?: (img: HTMLImageElement) => void;
}

export default function SlidePane({
  slide,
  active,
  plain,
  loaded,
  withGlass,
  aspectRatio,
  onImageLoad,
}: SlidePaneProps) {
  const isImage = slide.kind === "image";

  /* Same slide twice: flat underneath, refracted through the bevel on top.
     For images the second copy costs no extra fetch or decode — same URL. */
  const layer = (className: "plate" | "glass") =>
    !loaded ? (
      <div className={className} />
    ) : isImage ? (
      <div className={className}>
        <img
          className="pr-fill"
          src={slide.imageUrl}
          alt=""
          decoding="async"
          draggable={false}
          onLoad={
            className === "plate" && onImageLoad
              ? (event) => onImageLoad(event.currentTarget)
              : undefined
          }
        />
      </div>
    ) : (
      <div className={className}>
        <SlideRenderer
          slide={slide}
          thumbnail={false}
          aspectRatio={aspectRatio}
        />
      </div>
    );

  return (
    <div
      className={`slide${active ? " is-active" : ""}${plain ? " plain" : ""}`}
    >
      {layer("plate")}
      {withGlass && !plain ? layer("glass") : null}
    </div>
  );
}
