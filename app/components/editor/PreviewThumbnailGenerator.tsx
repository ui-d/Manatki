/**
 * PreviewThumbnailGenerator — keeps the deck's library-grid thumbnail fresh.
 *
 * Watches the first slide while the editor is open; after edits settle it
 * rasterizes slide 1 on an offscreen stage, uploads the PNG, and stores the
 * hosted URL via set-deck-preview. The grid then renders a lazy <img>
 * instead of a full-resolution live slide DOM per card.
 */
import { appBasePath } from "@agent-native/core/client/api-path";
import { callAction } from "@agent-native/core/client/hooks";
import { useEffect, useRef, useState } from "react";

import type { Deck, Slide } from "@/context/DeckContext";
import { rasterizeSlideToPng } from "@/lib/export-png-client";
import { getSlideDims } from "@/lib/slide-size";
import { parseUploadResponse } from "@/lib/upload-response";

import type { DesignSystemData } from "../../../shared/api";
import { OffscreenSlideStage } from "./OffscreenSlideStage";

/** Debounce after the last first-slide change before re-rasterizing. */
const PREVIEW_DEBOUNCE_MS = 8_000;
/** Target thumbnail width — grid cards render at ~300-400 CSS px. */
const PREVIEW_TARGET_WIDTH = 640;

export function PreviewThumbnailGenerator({
  deck,
  designSystem,
  canEdit,
}: {
  deck: Deck;
  designSystem?: DesignSystemData;
  canEdit: boolean;
}) {
  const [stageSlide, setStageSlide] = useState<Slide | null>(null);
  const lastKeyRef = useRef<string | null>(null);
  const runningRef = useRef(false);
  const deckRef = useRef(deck);
  deckRef.current = deck;

  const first = deck.slides[0];
  const dims = first ? getSlideDims(first, deck.aspectRatio) : null;
  const key =
    first && dims
      ? [
          deck.id,
          first.id,
          first.content,
          first.background ?? "",
          first.imageUrl ?? "",
          dims.width,
          dims.height,
        ].join("|")
      : null;

  // A deck that already has a stored preview is assumed current on mount —
  // only regenerate when the first slide actually changes in this session.
  if (lastKeyRef.current === null && deck.previewUrl && key) {
    lastKeyRef.current = key;
  }

  useEffect(() => {
    if (!canEdit || !key || deck.partialSlides) return;
    if (lastKeyRef.current === key) return;

    const timer = setTimeout(() => {
      if (runningRef.current) return;
      runningRef.current = true;
      const snapshot = deckRef.current;
      const slide = snapshot.slides[0];
      if (!slide) {
        runningRef.current = false;
        return;
      }
      setStageSlide(slide);
      void (async () => {
        try {
          // Two frames so the offscreen stage is mounted and laid out.
          await new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          );
          const slideDims = getSlideDims(slide, snapshot.aspectRatio);
          const scale = Math.min(1, PREVIEW_TARGET_WIDTH / slideDims.width);
          const dataUrl = await rasterizeSlideToPng(
            { id: slide.id, ...slideDims },
            0,
            snapshot.slides.length,
            scale,
          );
          const blob = await (await fetch(dataUrl)).blob();
          const formData = new FormData();
          formData.append(
            "file",
            new File([blob], `preview-${snapshot.id}.png`, {
              type: "image/png",
            }),
          );
          const res = await fetch(`${appBasePath()}/api/uploads`, {
            method: "POST",
            body: formData,
          });
          const data = await parseUploadResponse(
            res,
            "Preview upload failed",
          );
          if (!res.ok) {
            throw new Error(data?.error || "Preview upload failed");
          }
          const uploaded = (Array.isArray(data) ? data[0] : data) as {
            url?: string;
            path?: string;
          } | null;
          const url = uploaded?.url ?? uploaded?.path;
          if (!url) throw new Error("Preview upload returned no URL");
          await callAction("set-deck-preview", {
            deckId: snapshot.id,
            previewUrl: url,
          });
          lastKeyRef.current = key;
        } catch (err) {
          // Thumbnails are cosmetic — never surface an error to the user,
          // but keep the failure visible for debugging.
          console.warn("[preview-thumbnail] generation failed:", err);
        } finally {
          runningRef.current = false;
          setStageSlide(null);
        }
      })();
    }, PREVIEW_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [key, canEdit, deck.partialSlides]);

  if (!stageSlide) return null;
  return (
    <OffscreenSlideStage
      slides={[stageSlide]}
      deck={deck}
      designSystem={designSystem}
    />
  );
}
