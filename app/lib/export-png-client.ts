/**
 * Client-side PNG export for social-asset projects. Renders each slide's
 * [data-slide-canvas] element at its own intrinsic canvas size via
 * modern-screenshot — the same DOM-capture pipeline as the PDF exporter,
 * minus the uniform-page assumption, so mixed-size assets export correctly.
 */
import { importExportModule } from "./dynamic-import";
import {
  type ExportImageReport,
  findSlideExportSource,
  preloadImagesWithCors,
} from "./export-pdf-client";

export interface PngExportSlide {
  id: string;
  /** Intrinsic canvas width in pixels (from getSlideDims). */
  width: number;
  /** Intrinsic canvas height in pixels (from getSlideDims). */
  height: number;
}

function safeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, "-");
}

function triggerDownload(url: string, filename: string): void {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * Rasterize one rendered slide to a PNG data URL at its intrinsic size.
 * Throws with a user-facing message when the slide isn't in the DOM
 * (collapsed sidebar) — same contract as the PDF exporter.
 */
export async function rasterizeSlideToPng(
  slide: PngExportSlide,
  slideIndex: number,
  slideCount: number,
  scale = 2,
  onTaintedImages?: (srcs: string[]) => void,
): Promise<string> {
  const { domToPng } = await importExportModule(
    () => import("modern-screenshot"),
  );

  // Web fonts must be settled before capture or text draws with fallback
  // metrics (see export-pdf-client for the history of this bug).
  if (typeof document !== "undefined" && document.fonts?.ready) {
    await document.fonts.ready;
  }

  const source = findSlideExportSource(slide.id, slideIndex, slideCount);
  const tainted = await preloadImagesWithCors(source);
  if (tainted.length > 0) onTaintedImages?.(tainted);

  return domToPng(source, {
    width: slide.width,
    height: slide.height,
    scale,
    fetch: {
      requestInit: { cache: "no-cache", mode: "cors", credentials: "omit" },
    },
  });
}

/** Download a single slide as a PNG file. */
export async function exportSlideAsPng(
  deckTitle: string,
  slide: PngExportSlide,
  slideIndex: number,
  slideCount: number,
): Promise<ExportImageReport> {
  const taintedImages: string[] = [];
  const dataUrl = await rasterizeSlideToPng(
    slide,
    slideIndex,
    slideCount,
    2,
    (srcs) => taintedImages.push(...srcs),
  );
  triggerDownload(
    dataUrl,
    `${safeFileName(deckTitle)}-${slideIndex + 1}-${slide.width}x${slide.height}.png`,
  );
  return { taintedImages: [...new Set(taintedImages)] };
}

/** Download every slide as a PNG inside one ZIP archive. */
export async function exportSlidesAsZip(
  deckTitle: string,
  slides: PngExportSlide[],
): Promise<ExportImageReport> {
  const { default: JSZip } = await importExportModule(
    () => import("jszip"),
  );
  const zip = new JSZip();

  const taintedImages: string[] = [];
  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i];
    const dataUrl = await rasterizeSlideToPng(slide, i, slides.length, 2, (srcs) =>
      taintedImages.push(...srcs),
    );
    const base64 = dataUrl.split(",")[1];
    if (!base64) {
      throw new Error(`Slide ${i + 1} produced an empty render.`);
    }
    zip.file(
      `${String(i + 1).padStart(2, "0")}-${slide.width}x${slide.height}.png`,
      base64,
      { base64: true },
    );
  }

  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  triggerDownload(url, `${safeFileName(deckTitle)}.zip`);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { taintedImages: [...new Set(taintedImages)] };
}
