import {
  IconArrowDown,
  IconArrowUp,
  IconPlus,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import type { Slide } from "@/context/DeckContext";

interface ScreenshotsPanelProps {
  slide: Slide;
  onUpdateSlide: (updates: Partial<Omit<Slide, "id">>) => void;
  onClose: () => void;
}

async function uploadScreenshot(file: File): Promise<string> {
  const body = new FormData();
  body.append("file", file, file.name);
  const response = await fetch("/api/assets/upload", { method: "POST", body });
  const payload = (await response.json()) as { url?: string; error?: string };
  if (!response.ok || !payload.url) {
    throw new Error(payload.error || `Upload failed (${response.status})`);
  }
  return payload.url;
}

/**
 * Manage the slide's presenter screenshots — the supporting images shown as a
 * grid in the two-pane presenter's preview pane, with click-to-magnify.
 */
export function ScreenshotsPanel({
  slide,
  onUpdateSlide,
  onClose,
}: ScreenshotsPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const screenshots = slide.screenshots ?? [];

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= screenshots.length) return;
    const next = [...screenshots];
    [next[index], next[target]] = [next[target], next[index]];
    onUpdateSlide({ screenshots: next });
  };

  const remove = (index: number) => {
    onUpdateSlide({ screenshots: screenshots.filter((_, i) => i !== index) });
  };

  const addFiles = async (files: File[]) => {
    setUploading(true);
    try {
      const urls: string[] = [];
      for (const file of files) {
        urls.push(await uploadScreenshot(file));
      }
      onUpdateSlide({ screenshots: [...screenshots, ...urls] });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Screenshot upload failed",
      );
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="w-60 flex flex-col h-full border-l border-border bg-background">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
        <span className="text-xs font-medium text-foreground/90">
          Screenshots
        </span>
        <button
          onClick={onClose}
          className="text-muted-foreground/70 hover:text-muted-foreground"
          aria-label="Close screenshots panel"
        >
          <IconX className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {screenshots.length === 0 ? (
          <div className="px-3 py-6 text-center text-[11px] text-muted-foreground/70 leading-relaxed">
            No screenshots yet.
            <br />
            They appear as a grid beside this slide in the presenter.
          </div>
        ) : (
          <div className="px-2 py-2 space-y-2">
            {screenshots.map((url, index) => (
              <div
                key={`${url}-${index}`}
                className="group relative rounded border border-border overflow-hidden"
              >
                <img
                  src={url}
                  alt={`Screenshot ${index + 1}`}
                  className="w-full h-auto block"
                />
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-end gap-1 p-1 bg-gradient-to-t from-black/70 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => move(index, -1)}
                    disabled={index === 0}
                    className="p-1 rounded bg-black/50 text-white/80 hover:text-white disabled:opacity-30"
                    aria-label="Move screenshot up"
                  >
                    <IconArrowUp className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => move(index, 1)}
                    disabled={index === screenshots.length - 1}
                    className="p-1 rounded bg-black/50 text-white/80 hover:text-white disabled:opacity-30"
                    aria-label="Move screenshot down"
                  >
                    <IconArrowDown className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => remove(index)}
                    className="p-1 rounded bg-black/50 text-white/80 hover:text-red-400"
                    aria-label="Remove screenshot"
                  >
                    <IconTrash className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="px-2 py-2 border-t border-border">
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp,image/avif"
          multiple
          className="hidden"
          onChange={(event) => {
            const files = [...(event.target.files ?? [])];
            event.target.value = "";
            if (files.length > 0) void addFiles(files);
          }}
        />
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="w-full flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground border border-dashed border-border rounded py-2 disabled:opacity-50"
        >
          <IconPlus className="w-3 h-3" />
          {uploading ? "Uploading…" : "Add screenshots"}
        </button>
      </div>
    </div>
  );
}
