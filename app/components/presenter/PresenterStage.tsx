import { callAction } from "@agent-native/core/client/hooks";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useNavigate } from "react-router";

import type { Slide } from "@/context/DeckContext";
import { getAspectRatioDims, type AspectRatio } from "@/lib/aspect-ratios";

import GlassFilter from "./GlassFilter";
import PresenterTimer from "./PresenterTimer";
import SlidePane from "./SlidePane";
import { useShotsZoom } from "./useShotsZoom";

import "./presenter.css";

const PRELOAD_BEHIND = 2;
const PRELOAD_AHEAD = 3;
const COUNTER_IDLE_MS = 2500;

/* Treatments for the upcoming pane; each maps to a CSS block in presenter.css. */
export const PRESENTER_VARIANTS = [
  "combo",
  "soft",
  "dim",
  "fade",
  "card",
] as const;
export type PresenterVariant = (typeof PRESENTER_VARIANTS)[number];
const VARIANT_KEY = "slideshow.variant";

/* The deck always closes on a generated "Thank you" slide — a transparent
   SVG, so only the text shows against the page background. */
const THANK_YOU_SRC =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1250">' +
      '<text x="500" y="642" text-anchor="middle" ' +
      "font-family=\"Georgia, 'Times New Roman', serif\" font-size='118' " +
      'fill="#e7e7ea">Thank you<tspan fill="#2440d8">.</tspan></text>' +
      "</svg>",
  );

const storedVariant = (): PresenterVariant => {
  /* localStorage throws in some private contexts; the variant then simply
     resets to the default on reload. */
  try {
    const value = localStorage.getItem(VARIANT_KEY);
    if ((PRESENTER_VARIANTS as readonly string[]).includes(value ?? "")) {
      return value as PresenterVariant;
    }
  } catch {
    /* fall through to default */
  }
  return PRESENTER_VARIANTS[0];
};

interface StageEntry {
  slide: Slide;
  plain: boolean;
}

interface PresenterStageProps {
  slides: Slide[];
  deckId: string;
  startIndex?: number;
  aspectRatio?: AspectRatio;
}

/**
 * Two-pane presenter: the current slide sharp on the left, a treated preview
 * of the next on the right. Ported from the original standalone slideshow —
 * see presenter.css for the five preview treatments.
 */
export default function PresenterStage({
  slides,
  deckId,
  startIndex = 0,
  aspectRatio,
}: PresenterStageProps) {
  const navigate = useNavigate();

  const entries = useMemo<StageEntry[]>(() => {
    const thankYou: Slide = {
      id: "__thank-you__",
      content: "",
      notes: "",
      layout: "full-image",
      kind: "image",
      imageUrl: THANK_YOU_SRC,
    };
    return [
      ...slides.map((slide) => ({ slide, plain: false })),
      { slide: thankYou, plain: true },
    ];
  }, [slides]);

  const isImageDeck = useMemo(
    () => slides.length > 0 && slides.every((slide) => slide.kind === "image"),
    [slides],
  );

  const [index, setIndex] = useState(() =>
    Math.min(Math.max(startIndex, 0), Math.max(entries.length - 1, 0)),
  );
  const [variant, setVariant] = useState<PresenterVariant>(() =>
    typeof window === "undefined" ? PRESENTER_VARIANTS[0] : storedVariant(),
  );
  const [timerOn, setTimerOn] = useState(false);
  const [counter, setCounter] = useState({ text: "", show: false });

  /* Panes adopt the first slide's real proportions for image decks; HTML decks
     take the deck's aspect ratio directly. null = the CSS default (A4). */
  const [ratio, setRatio] = useState<number | null>(() => {
    if (isImageDeck) return null;
    const dims = getAspectRatioDims(aspectRatio);
    return dims.height / dims.width;
  });
  const ratioLocked = useRef(false);
  const adoptRatio = useCallback((img: HTMLImageElement) => {
    if (ratioLocked.current || !img.naturalWidth || !img.naturalHeight) return;
    ratioLocked.current = true;
    setRatio(img.naturalHeight / img.naturalWidth);
  }, []);

  const rootRef = useRef<HTMLDivElement>(null);
  const shotsRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef<HTMLDivElement>(null);
  const zoomImgRef = useRef<HTMLImageElement>(null);
  const zoomCountRef = useRef<HTMLDivElement>(null);

  const { showShots, openZoom, stepZoom, closeZoom, isZoomOpen } = useShotsZoom(
    {
      root: rootRef,
      shots: shotsRef,
      zoom: zoomRef,
      zoomImg: zoomImgRef,
      zoomCount: zoomCountRef,
    },
  );

  /* Once a pane has entered the load window it keeps its content, mirroring
     the original, where a src assigned once was never taken away. */
  const loadedRef = useRef(new Set<number>());
  const from = Math.max(0, index - PRELOAD_BEHIND);
  const to = Math.min(entries.length - 1, index + PRELOAD_AHEAD);
  for (let i = from; i <= to; i++) loadedRef.current.add(i);

  const counterTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const flashCounter = useCallback((text: string) => {
    setCounter({ text, show: true });
    clearTimeout(counterTimeout.current);
    counterTimeout.current = setTimeout(
      () => setCounter((current) => ({ ...current, show: false })),
      COUNTER_IDLE_MS,
    );
  }, []);

  const goTo = useCallback(
    (next: number) => {
      setIndex((current) => {
        const clamped = Math.min(
          Math.max(next, 0),
          Math.max(entries.length - 1, 0),
        );
        return clamped;
      });
    },
    [entries.length],
  );

  /* has-next / on-plain / has-shots are classList toggles rather than JSX
     className: has-shots is flipped imperatively by the grid choreography and
     a React-rendered className would wipe it on every commit. */
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    el.classList.toggle(
      "has-next",
      index < entries.length - 1 && !entries[index + 1].plain,
    );
    el.classList.toggle("on-plain", entries[index].plain);
  }, [index, entries]);

  /* has-shots is left to showShots(): the class means "the grid is ready and
     owns the right pane", not "this slide has screenshots". */
  useEffect(() => {
    void showShots(entries[index].slide.screenshots ?? []);
    // Warm the cache either side, so the neighbouring grids are decoded by the
    // time they're asked for and their reveal starts straight away.
    for (const src of [
      ...(entries[index + 1]?.slide.screenshots ?? []),
      ...(entries[index - 1]?.slide.screenshots ?? []),
    ]) {
      new Image().src = src;
    }
  }, [index, entries, showShots]);

  useEffect(() => {
    flashCounter(`${index + 1} / ${entries.length}`);
  }, [index, entries.length, flashCounter]);

  /* The saved per-user setting wins over the localStorage mirror, so a
     variant chosen from chat ("set preview style to dim") or on another
     device is picked up on the next presenter load. */
  useEffect(() => {
    let cancelled = false;
    callAction<{ variant: string | null }>(
      "get-presenter-variant",
      {},
      { method: "GET" },
    )
      .then(({ variant: saved }) => {
        if (cancelled || !saved) return;
        if ((PRESENTER_VARIANTS as readonly string[]).includes(saved)) {
          setVariant(saved as PresenterVariant);
          try {
            localStorage.setItem(VARIANT_KEY, saved);
          } catch {
            /* see storedVariant */
          }
        }
      })
      .catch(() => {
        /* offline/share contexts have no settings — localStorage stands */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const cycleVariant = useCallback(() => {
    const next =
      PRESENTER_VARIANTS[
        (PRESENTER_VARIANTS.indexOf(variant) + 1) % PRESENTER_VARIANTS.length
      ];
    setVariant(next);
    try {
      localStorage.setItem(VARIANT_KEY, next);
    } catch {
      /* see storedVariant */
    }
    // Write-through to the per-user setting; localStorage already has it,
    // so a failed write only costs cross-device sync.
    callAction("set-presenter-variant", { variant: next }).catch(() => {});
    flashCounter(`preview: ${next}`);
  }, [variant, flashCounter]);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      // Rejects when the browser withholds permission; nothing else to do.
      document.documentElement.requestFullscreen().catch(() => {});
    }
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      // A magnified shot owns the keyboard while it is up: the arrows walk the
      // rest of the grid, anything else puts it away. Nothing reaches the deck,
      // so the presenter can never advance a slide they can't see.
      if (isZoomOpen()) {
        event.preventDefault();
        if (event.key === "ArrowRight") void stepZoom(1);
        else if (event.key === "ArrowLeft") void stepZoom(-1);
        else closeZoom();
        return;
      }

      switch (event.key) {
        case " ":
        case "Spacebar":
        case "ArrowRight":
        case "PageDown":
          event.preventDefault();
          setIndex((i) => Math.min(i + 1, entries.length - 1));
          break;
        case "ArrowLeft":
        case "Backspace":
        case "PageUp":
          event.preventDefault();
          setIndex((i) => Math.max(i - 1, 0));
          break;
        case "Home":
          event.preventDefault();
          setIndex(0);
          break;
        case "End":
          event.preventDefault();
          setIndex(entries.length - 1);
          break;
        case "f":
        case "F":
          event.preventDefault();
          toggleFullscreen();
          break;
        case "v":
        case "V":
          event.preventDefault();
          cycleVariant();
          break;
        case "t":
        case "T":
          event.preventDefault();
          setTimerOn((on) => !on);
          break;
        case "Escape":
          event.preventDefault();
          navigate(`/deck/${deckId}`);
          break;
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [
    entries.length,
    isZoomOpen,
    stepZoom,
    closeZoom,
    toggleFullscreen,
    cycleVariant,
    navigate,
    deckId,
  ]);

  const rootStyle =
    ratio !== null
      ? ({ "--ratio": ratio.toFixed(4) } as CSSProperties)
      : undefined;

  const withGlass = variant === "combo" || variant === "soft";

  return (
    <div
      ref={rootRef}
      className="presenter-root"
      data-variant={variant}
      style={rootStyle}
    >
      <GlassFilter />

      <div className="pr-stage">
        <div className="viewport">
          <div
            className="track"
            style={{ "--i": String(index) } as CSSProperties}
          >
            {entries.map((entry, i) => (
              <SlidePane
                key={entry.slide.id}
                slide={entry.slide}
                active={i === index}
                plain={entry.plain}
                loaded={loadedRef.current.has(i)}
                withGlass={withGlass}
                aspectRatio={aspectRatio}
                onImageLoad={i === 0 && isImageDeck ? adoptRatio : undefined}
              />
            ))}
          </div>
        </div>
      </div>

      <div
        ref={shotsRef}
        className="pr-shots"
        onClick={(event) => {
          const el = shotsRef.current;
          if (!el) return;
          const i = Array.prototype.indexOf.call(el.children, event.target);
          if (i >= 0) void openZoom(i);
        }}
      />

      <div className={`pr-counter${counter.show ? " show" : ""}`}>
        {counter.text}
      </div>
      <PresenterTimer on={timerOn} />
      <div className="pr-next-tag">NEXT</div>

      {/* A screenshot clicked in the grid, magnified. Grows out of the cell it
          came from; while it is up, the arrow keys walk the slide's set. */}
      <div ref={zoomRef} className="pr-zoom" hidden onClick={() => closeZoom()}>
        <img ref={zoomImgRef} alt="" draggable={false} decoding="async" />
        <div ref={zoomCountRef} className="pr-zoom-count" />
      </div>
    </div>
  );
}

export { THANK_YOU_SRC };
