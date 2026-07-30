import { callAction } from "@agent-native/core/client/hooks";
import { IconPhotoPlus } from "@tabler/icons-react";
import { useRef, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

const IMAGE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".avif",
]);

interface UploadedImage {
  url: string;
  name: string;
  screenshots?: { url: string; name: string }[];
}

const extensionOf = (name: string) => {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot).toLowerCase();
};

const basenameOf = (name: string) => {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? name : name.slice(0, dot);
};

async function uploadOne(file: File): Promise<string> {
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
 * Folder import: every image directly inside the chosen folder becomes a
 * slide (ordered by natural filename sort), and a subfolder named after a
 * slide's basename ("2/" next to "2.png") holds that slide's screenshots —
 * the same convention as the original standalone slideshow.
 */
export default function ImportImagesDeckButton() {
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const [importing, setImporting] = useState(false);

  const importFolder = async (files: File[]) => {
    // webkitRelativePath is "<root>/<name>" for slides and
    // "<root>/<sub>/<name>" for screenshots.
    const slides = new Map<string, { file: File; shots: File[] }>();
    const shotFolders = new Map<string, File[]>();
    for (const file of files) {
      if (!IMAGE_EXTENSIONS.has(extensionOf(file.name))) continue;
      const parts = (file.webkitRelativePath || file.name).split("/");
      const rest = parts.length > 1 ? parts.slice(1) : parts;
      if (rest.length === 1) {
        slides.set(basenameOf(rest[0]), { file, shots: [] });
      } else if (rest.length === 2) {
        const list = shotFolders.get(rest[0]) ?? [];
        list.push(file);
        shotFolders.set(rest[0], list);
      }
    }
    for (const [folder, shots] of shotFolders) {
      const slide = slides.get(folder);
      if (slide) slide.shots = shots;
    }
    if (slides.size === 0) {
      toast.error("No images found in that folder");
      return;
    }

    const rootName =
      files[0]?.webkitRelativePath?.split("/")[0] || "Imported deck";
    const totalFiles = [...slides.values()].reduce(
      (total, s) => total + 1 + s.shots.length,
      0,
    );

    setImporting(true);
    try {
      const images: UploadedImage[] = [];
      let done = 0;
      const progress = toast.loading(`Uploading 0 / ${totalFiles} images…`);
      for (const [, { file, shots }] of slides) {
        const url = await uploadOne(file);
        toast.loading(`Uploading ${++done} / ${totalFiles} images…`, {
          id: progress,
        });
        const screenshots: { url: string; name: string }[] = [];
        for (const shot of shots) {
          screenshots.push({ url: await uploadOne(shot), name: shot.name });
          toast.loading(`Uploading ${++done} / ${totalFiles} images…`, {
            id: progress,
          });
        }
        images.push({
          url,
          name: file.name,
          ...(screenshots.length > 0 ? { screenshots } : {}),
        });
      }
      const result = await callAction<{ id: string }>("import-images-deck", {
        title: rootName,
        images,
      });
      toast.success(`Imported ${images.length} slides`, { id: progress });
      navigate(`/deck/${result.id}`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Image deck import failed",
      );
    } finally {
      setImporting(false);
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        multiple
        // Non-standard but universally supported folder picker.
        {...{ webkitdirectory: "" }}
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];
          event.target.value = "";
          if (files.length > 0) void importFolder(files);
        }}
      />
      <Button
        variant="outline"
        size="sm"
        className="cursor-pointer"
        disabled={importing}
        onClick={() => inputRef.current?.click()}
      >
        <IconPhotoPlus className="w-3.5 h-3.5" />
        {importing ? "Importing…" : "Import images"}
      </Button>
    </>
  );
}
