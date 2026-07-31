/**
 * PngExportListener — the editor half of the agent-triggered PNG export.
 *
 * The `export-asset-images` action writes a one-shot request into
 * application state; this listener (mounted in DeckEditor) picks it up,
 * renders the requested slides offscreen at their intrinsic canvas sizes,
 * rasterizes each with the same pipeline as the manual Export menu, uploads
 * the PNGs, and writes a hosted-URL result back for the action to return.
 * Offscreen rendering keeps the export correct even when the sidebar rail
 * doesn't have every slide mounted.
 */
import { agentNativePath, appBasePath } from "@agent-native/core/client/api-path";
import { appStateKeyForBrowserTab } from "@shared/app-state-tabs";
import {
  PNG_EXPORT_REQUEST_KEY,
  PNG_EXPORT_RESULT_KEY,
  isPngExportRequest,
  type PngExportedImage,
  type PngExportRequest,
  type PngExportResult,
} from "@shared/png-export";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import type { Deck } from "@/context/DeckContext";
import { rasterizeSlideToPng } from "@/lib/export-png-client";
import { getSlideDims } from "@/lib/slide-size";
import { parseUploadResponse } from "@/lib/upload-response";
import { TAB_ID } from "@/lib/tab-id";

import type { DesignSystemData } from "../../../shared/api";
import { OffscreenSlideStage } from "./OffscreenSlideStage";

interface PendingPickup {
  key: string;
  request: PngExportRequest;
}

function appStateUrl(key: string): string {
  return agentNativePath(`/_agent-native/application-state/${key}`);
}

function deleteAppState(key: string): void {
  fetch(appStateUrl(key), {
    method: "DELETE",
    headers: { "X-Agent-Native-CSRF": "1", "X-Request-Source": TAB_ID },
  }).catch(() => {});
}

async function writeExportResult(result: PngExportResult): Promise<void> {
  const body = JSON.stringify(result);
  // Both keys, mirroring the fit-check writer: the action reads its own
  // tab-scoped key first and falls back to the global one.
  const keys = Array.from(
    new Set([
      appStateKeyForBrowserTab(PNG_EXPORT_RESULT_KEY, TAB_ID),
      PNG_EXPORT_RESULT_KEY,
    ]),
  );
  await Promise.all(
    keys.map((key) =>
      fetch(appStateUrl(key), {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-Request-Source": TAB_ID,
        },
        body,
      }).catch(() => {}),
    ),
  );
}

async function uploadPng(dataUrl: string, fileName: string): Promise<string> {
  const blob = await (await fetch(dataUrl)).blob();
  const formData = new FormData();
  formData.append("file", new File([blob], fileName, { type: "image/png" }));
  const res = await fetch(`${appBasePath()}/api/uploads`, {
    method: "POST",
    body: formData,
  });
  const data = await parseUploadResponse(res, `Upload failed for ${fileName}`);
  if (!res.ok) {
    throw new Error(data?.error || `Upload failed for ${fileName}`);
  }
  const uploaded = (Array.isArray(data) ? data[0] : data) as {
    url?: string;
    path?: string;
  } | null;
  const url = uploaded?.url ?? uploaded?.path;
  if (!url) throw new Error(`Upload for ${fileName} returned no URL`);
  return url;
}

export function PngExportListener({
  deck,
  designSystem,
}: {
  deck: Deck;
  designSystem?: DesignSystemData;
}) {
  const [job, setJob] = useState<PngExportRequest | null>(null);
  const processedRef = useRef<string | null>(null);
  // The export runs against the deck as of job pickup; a ref keeps the job
  // effect from restarting when polling refreshes the deck object mid-run.
  const deckRef = useRef(deck);
  deckRef.current = deck;

  const { data: pending } = useQuery<PendingPickup | null>({
    queryKey: ["png-export-request", TAB_ID, deck.id],
    refetchInterval: 1500,
    queryFn: async () => {
      const read = async (key: string): Promise<PendingPickup | null> => {
        const res = await fetch(appStateUrl(key));
        if (!res.ok) return null;
        const text = await res.text();
        if (!text) return null;
        try {
          const data = JSON.parse(text);
          return isPngExportRequest(data) ? { key, request: data } : null;
        } catch {
          return null;
        }
      };
      return (
        (await read(appStateKeyForBrowserTab(PNG_EXPORT_REQUEST_KEY, TAB_ID))) ??
        (await read(PNG_EXPORT_REQUEST_KEY))
      );
    },
  });

  useEffect(() => {
    if (!pending) return;
    const { request } = pending;
    // A request for another project is left for that project's editor tab.
    if (request.deckId !== deck.id) return;
    if (processedRef.current === request.requestId) {
      // Re-read of a request we already handled (DELETE lost its race).
      deleteAppState(pending.key);
      return;
    }
    processedRef.current = request.requestId;
    // One-shot: clear both copies so a second editor tab doesn't repeat it.
    deleteAppState(appStateKeyForBrowserTab(PNG_EXPORT_REQUEST_KEY, TAB_ID));
    deleteAppState(PNG_EXPORT_REQUEST_KEY);
    setJob(request);
  }, [pending, deck.id]);

  useEffect(() => {
    if (!job) return;
    let cancelled = false;
    const run = async () => {
      const snapshot = deckRef.current;
      const slides = job.slideIds
        ? snapshot.slides.filter((s) => job.slideIds!.includes(s.id))
        : snapshot.slides;
      try {
        if (slides.length === 0) {
          throw new Error("None of the requested slides exist in this deck.");
        }
        // Two frames so the offscreen stage below is mounted and laid out.
        await new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        );
        const safeTitle = snapshot.title.replace(/[^a-zA-Z0-9]/g, "-");
        const images: PngExportedImage[] = [];
        for (const slide of slides) {
          const index = snapshot.slides.findIndex((s) => s.id === slide.id);
          const dims = getSlideDims(slide, snapshot.aspectRatio);
          const dataUrl = await rasterizeSlideToPng(
            { id: slide.id, ...dims },
            Math.max(index, 0),
            snapshot.slides.length,
            job.scale,
          );
          if (cancelled) return;
          const url = await uploadPng(
            dataUrl,
            `${safeTitle}-${index + 1}-${dims.width}x${dims.height}.png`,
          );
          if (cancelled) return;
          images.push({
            slideId: slide.id,
            slideNumber: index + 1,
            url,
            width: dims.width,
            height: dims.height,
          });
        }
        await writeExportResult({
          requestId: job.requestId,
          deckId: job.deckId,
          status: "done",
          images,
          completedAt: Date.now(),
        });
      } catch (err) {
        console.error("[png-export] agent-triggered export failed:", err);
        await writeExportResult({
          requestId: job.requestId,
          deckId: job.deckId,
          status: "error",
          images: [],
          error: err instanceof Error ? err.message : String(err),
          completedAt: Date.now(),
        });
      } finally {
        if (!cancelled) setJob(null);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [job]);

  if (!job) return null;

  const jobSlides = job.slideIds
    ? deck.slides.filter((s) => job.slideIds!.includes(s.id))
    : deck.slides;

  // Offscreen stage: full-resolution copies of the requested slides so the
  // rasterizer always finds an unscaled [data-slide-canvas] source.
  return (
    <OffscreenSlideStage
      slides={jobSlides}
      deck={deck}
      designSystem={designSystem}
    />
  );
}
