import { useCallback, useEffect, useMemo, useRef } from "react";

/* Screenshot-grid choreography. The first two mirror --shot-fade / --shot-out. */
const SHOT_STAGGER_MS = 55; // gap between neighbours entering
const SHOT_STAGGER_CAP = 5; // cap the ramp so a 6-up grid isn't slower than a 2-up
const SHOT_OUT_MS = 220; // block fade-out before the grid is swapped
const SHOT_DECODE_MS = 1200; // stop holding the reveal for a stalled shot

/* Magnified screenshot; both mirror the durations on .pr-zoom. */
const ZOOM_MS = 340; // grow out of the cell, and retract back into it
const ZOOM_SWAP_MS = 130; // dip out and back when stepping to another shot

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/* Ready to measure — or waited long enough that holding the whole grid for one
   slow shot costs more than it buys. decode() rejects on a broken image. */
const settled = (img: HTMLImageElement) =>
  Promise.race([img.decode().catch(() => {}), wait(SHOT_DECODE_MS)]);

interface PaintedRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Where a contain-fitted image actually paints inside its box. */
const paintedRect = (img: HTMLImageElement): PaintedRect => {
  const box = img.getBoundingClientRect();
  if (!img.naturalWidth || box.width === 0) return box;
  const ratio = img.naturalHeight / img.naturalWidth;
  const width = ratio > box.height / box.width ? box.height / ratio : box.width;
  const height = width * ratio;
  return {
    left: box.left + (box.width - width) / 2,
    top: box.top + (box.height - height) / 2,
    width,
    height,
  };
};

interface Refs {
  root: React.RefObject<HTMLDivElement | null>;
  shots: React.RefObject<HTMLDivElement | null>;
  zoom: React.RefObject<HTMLDivElement | null>;
  zoomImg: React.RefObject<HTMLImageElement | null>;
  zoomCount: React.RefObject<HTMLDivElement | null>;
}

/**
 * Imperative port of the original screenshot grid + FLIP zoom. The grid is
 * built off-DOM, waits for every shot to decode so the column split is made
 * once from real proportions, then lets them in one after another. A clicked
 * shot is lifted out of its cell to fill the screen; the arrow keys walk the
 * rest of the slide's set.
 *
 * React owns only the static shells (.pr-shots / .pr-zoom); the choreography
 * (async decodes, staggered class flips, transform measurement) stays
 * imperative, guarded by generation tokens exactly like the original.
 */
export function useShotsZoom({ root, shots, zoom, zoomImg, zoomCount }: Refs) {
  const shotToken = useRef(0);
  const zoomToken = useRef(0);
  const zoomOpenRef = useRef(false);
  const zoomIndexRef = useRef(0);
  /* The magnified shot's box with nothing applied to it. Both the grow and the
     retract are measured against this one fixed reference rather than the live
     box, so closing part-way through the grow still lands on the right cell. */
  const zoomRect = useRef<PaintedRect | null>(null);

  const reducedMotion = useMemo(
    () =>
      typeof window !== "undefined"
        ? matchMedia("(prefers-reduced-motion: reduce)")
        : null,
    [],
  );

  /* Column count that lets the screenshots fill the pane best: try each
     split and keep the one whose cells give a shot of the given shape the
     most area. The pane's height ÷ width comes from --ratio; contain-fit
     absorbs shots that stray from that shape. */
  const bestColumns = useCallback(
    (count: number, shotRatio: number) => {
      const paneRatio =
        parseFloat(
          root.current
            ? getComputedStyle(root.current).getPropertyValue("--ratio")
            : "",
        ) || 1.4142;
      let best = 1;
      let bestArea = 0;
      for (let cols = 1; cols <= count; cols++) {
        const rows = Math.ceil(count / cols);
        const width = Math.min(1 / cols, paneRatio / rows / shotRatio);
        const area = width * width * shotRatio;
        if (area > bestArea) {
          bestArea = area;
          best = cols;
        }
      }
      return best;
    },
    [root],
  );

  /**
   * The transform that parks the magnified shot exactly over `target`. Short
   * because .pr-zoom img is sized so its box is the picture — with nothing
   * letterboxed inside it, the corner the origin sits on is the corner the
   * picture starts at, and a plain offset plus scale lines the two up.
   */
  const parkOn = useCallback((target: PaintedRect) => {
    const rect = zoomRect.current;
    if (!rect || rect.width === 0 || target.width === 0) return "";
    return (
      `translate(${target.left - rect.left}px, ${target.top - rect.top}px) ` +
      `scale(${target.width / rect.width})`
    );
  }, []);

  const zoomTeardown = useCallback(() => {
    const zoomEl = zoom.current;
    const imgEl = zoomImg.current;
    if (!zoomEl || !imgEl) return;
    zoomEl.hidden = true;
    imgEl.style.transition = "none";
    imgEl.style.transform = "";
    imgEl.removeAttribute("src");
  }, [zoom, zoomImg]);

  const closeZoom = useCallback(
    (instant = false) => {
      if (!zoomOpenRef.current) return;
      zoomOpenRef.current = false;
      const token = ++zoomToken.current;
      const zoomEl = zoom.current;
      const imgEl = zoomImg.current;
      const shotsEl = shots.current;
      if (!zoomEl || !imgEl || !shotsEl) return;
      zoomEl.classList.remove("is-open");
      imgEl.classList.remove("is-swapping");

      const thumb = shotsEl.children[zoomIndexRef.current] as
        | HTMLImageElement
        | undefined;
      const transform = thumb ? parkOn(paintedRect(thumb)) : "";
      if (instant || reducedMotion?.matches || transform === "") {
        zoomTeardown();
        return;
      }
      imgEl.style.transform = transform;
      setTimeout(() => {
        if (token === zoomToken.current) zoomTeardown();
      }, ZOOM_MS);
    },
    [zoom, zoomImg, shots, parkOn, reducedMotion, zoomTeardown],
  );

  const openZoom = useCallback(
    async (i: number) => {
      const shotsEl = shots.current;
      const zoomEl = zoom.current;
      const imgEl = zoomImg.current;
      const countEl = zoomCount.current;
      const thumb = shotsEl?.children[i] as HTMLImageElement | undefined;
      if (!thumb || !zoomEl || !imgEl || !countEl || !shotsEl) return;
      const token = ++zoomToken.current;
      zoomOpenRef.current = true;
      zoomIndexRef.current = i;
      zoomRect.current = null;
      imgEl.classList.remove("is-swapping");
      imgEl.src = thumb.src;
      zoomEl.hidden = false;
      // showShots() already decoded every shot, so this is all but instant — but
      // it is what guarantees there is a size to measure before we measure it.
      await imgEl.decode().catch(() => {});
      if (token !== zoomToken.current) return;

      countEl.textContent =
        shotsEl.childElementCount > 1
          ? `${i + 1} / ${shotsEl.childElementCount}`
          : "";
      // FLIP: park the picture on its cell, commit that as the starting point,
      // then clear the transform so it travels out to full size.
      imgEl.style.transition = "none";
      imgEl.style.transform = "";
      zoomRect.current = imgEl.getBoundingClientRect();
      if (!reducedMotion?.matches) {
        imgEl.style.transform = parkOn(paintedRect(thumb));
        void imgEl.offsetWidth;
      }
      imgEl.style.transition = "";
      imgEl.style.transform = "";
      zoomEl.classList.add("is-open");
    },
    [shots, zoom, zoomImg, zoomCount, parkOn, reducedMotion],
  );

  /** Walk the slide's other screenshots at full size; off the end closes. */
  const stepZoom = useCallback(
    async (delta: number) => {
      const shotsEl = shots.current;
      const imgEl = zoomImg.current;
      const countEl = zoomCount.current;
      if (!shotsEl || !imgEl || !countEl) return;
      const thumb = shotsEl.children[zoomIndexRef.current + delta] as
        | HTMLImageElement
        | undefined;
      if (!thumb) {
        closeZoom();
        return;
      }
      const token = ++zoomToken.current;
      zoomIndexRef.current += delta;
      countEl.textContent = `${zoomIndexRef.current + 1} / ${shotsEl.childElementCount}`;

      // Dip out before the swap, so the change of shape happens unseen.
      imgEl.classList.add("is-swapping");
      await wait(reducedMotion?.matches ? 0 : ZOOM_SWAP_MS);
      if (token !== zoomToken.current) return;
      imgEl.src = thumb.src;
      await imgEl.decode().catch(() => {});
      if (token !== zoomToken.current) return;

      // Re-measure for the retract. Killing the transition first matters: a step
      // taken while the grow is still running would otherwise measure it midway.
      imgEl.style.transition = "none";
      imgEl.style.transform = "";
      zoomRect.current = imgEl.getBoundingClientRect();
      void imgEl.offsetWidth;
      imgEl.style.transition = "";
      imgEl.classList.remove("is-swapping");
    },
    [shots, zoomImg, zoomCount, closeZoom, reducedMotion],
  );

  /**
   * Build the grid off-DOM, decode, split into columns once, then stagger the
   * shots in. Bumped token per call; an in-flight grid whose token is stale
   * drops out at its next await rather than landing on the slide that
   * replaced it.
   */
  const showShots = useCallback(
    async (list: string[]) => {
      const token = ++shotToken.current;
      const shotsEl = shots.current;
      const rootEl = root.current;
      if (!shotsEl || !rootEl) return;
      // The cell a magnified shot would retract into is about to be thrown away.
      closeZoom(true);

      if (shotsEl.childElementCount > 0) {
        shotsEl.classList.add("is-leaving");
        // Hand the pane back to the blurred preview only when nothing replaces
        // the grid; on a shots → shots swap the pane stays the grid's throughout.
        if (list.length === 0) rootEl.classList.remove("has-shots");
        await wait(SHOT_OUT_MS);
        if (token !== shotToken.current) return;
        shotsEl.replaceChildren();
        shotsEl.classList.remove("is-leaving");
      }

      if (list.length === 0) {
        rootEl.classList.remove("has-shots");
        return;
      }

      const imgs = list.map((src) => {
        const img = document.createElement("img");
        img.alt = "";
        img.decoding = "async";
        img.draggable = false;
        img.src = src;
        return img;
      });
      await Promise.all(imgs.map(settled));
      if (token !== shotToken.current) return;

      // A shot that failed to load reports no size; it still takes a cell, it
      // just doesn't get a say in the shape of them.
      const ratios = imgs
        .filter((img) => img.naturalWidth)
        .map((img) => img.naturalHeight / img.naturalWidth);
      const avg =
        ratios.length > 0
          ? ratios.reduce((sum, r) => sum + r, 0) / ratios.length
          : 9 / 16;
      const cols = bestColumns(list.length, avg);
      shotsEl.style.setProperty("--shot-cols", String(cols));
      shotsEl.style.setProperty(
        "--shot-rows",
        String(Math.ceil(list.length / cols)),
      );
      shotsEl.append(...imgs);
      rootEl.classList.add("has-shots");

      // Next frame, so the shots have their hidden resting state committed and
      // the browser has something to transition from.
      requestAnimationFrame(() => {
        if (token !== shotToken.current) return;
        imgs.forEach((img, i) => {
          img.style.transitionDelay = `${Math.min(i, SHOT_STAGGER_CAP) * SHOT_STAGGER_MS}ms`;
          img.classList.add("is-in");
        });
      });
    },
    [shots, root, closeZoom, bestColumns],
  );

  // A resize moves every cell the shot could retract into, and fullscreen
  // counts as one. Cheaper to put it away than to re-measure mid-flight.
  useEffect(() => {
    const onResize = () => closeZoom(true);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [closeZoom]);

  const isZoomOpen = useCallback(() => zoomOpenRef.current, []);

  return { showShots, openZoom, stepZoom, closeZoom, isZoomOpen };
}
