/**
 * Import a folder of slide images as a deck, using the same convention as the
 * original standalone slideshow: images directly in the folder are slides
 * (natural filename order), and a subfolder named after a slide's basename
 * ("2/" next to "2.png") holds that slide's presenter screenshots.
 *
 * Runs against a running app (dev or hosted) through the same endpoints the
 * UI uses, so the migration is reproducible:
 *
 *   pnpm exec tsx tools/import-legacy-images.ts --dir ../slideshow/images --title "My deck"
 *
 * Env: SLIDESHOW_URL (default http://localhost:8080).
 */
import fs from "node:fs/promises";
import path from "node:path";

const IMAGE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".avif",
]);

const MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
};

const arg = (name: string) => {
  const index = process.argv.indexOf(`--${name}`);
  return index !== -1 ? process.argv[index + 1] : undefined;
};

const baseUrl = process.env.SLIDESHOW_URL ?? "http://localhost:8080";

const isImage = (name: string) =>
  IMAGE_EXTENSIONS.has(path.extname(name).toLowerCase());

const basenameOf = (name: string) => name.slice(0, -path.extname(name).length);

async function uploadOne(filePath: string): Promise<string> {
  const data = await fs.readFile(filePath);
  const name = path.basename(filePath);
  const body = new FormData();
  body.append(
    "file",
    new Blob([data], {
      type:
        MIME_TYPES[path.extname(name).toLowerCase()] ??
        "application/octet-stream",
    }),
    name,
  );
  const response = await fetch(`${baseUrl}/api/assets/upload`, {
    method: "POST",
    body,
  });
  const payload = (await response.json()) as { url?: string; error?: string };
  if (!response.ok || !payload.url) {
    throw new Error(
      `Upload of ${name} failed: ${payload.error ?? response.status}`,
    );
  }
  return payload.url;
}

async function main() {
  const dir = arg("dir");
  if (!dir) {
    console.error(
      "Usage: tsx tools/import-legacy-images.ts --dir <images-folder> [--title <deck title>]",
    );
    process.exit(1);
  }
  const root = path.resolve(dir);
  const title = arg("title") ?? path.basename(root);

  const entries = await fs.readdir(root, { withFileTypes: true });
  const slideFiles = entries
    .filter((entry) => entry.isFile() && isImage(entry.name))
    .map((entry) => entry.name);
  if (slideFiles.length === 0) {
    throw new Error(`No images found in ${root}`);
  }

  const images = [] as {
    url: string;
    name: string;
    screenshots?: { url: string; name: string }[];
  }[];

  for (const name of slideFiles) {
    process.stdout.write(`slide ${name}… `);
    const url = await uploadOne(path.join(root, name));
    const shotsDir = path.join(root, basenameOf(name));
    const screenshots: { url: string; name: string }[] = [];
    const shotEntries = await fs
      .readdir(shotsDir, { withFileTypes: true })
      .catch(() => []);
    for (const shot of shotEntries) {
      if (!shot.isFile() || !isImage(shot.name)) continue;
      screenshots.push({
        url: await uploadOne(path.join(shotsDir, shot.name)),
        name: shot.name,
      });
    }
    console.log(
      screenshots.length > 0 ? `ok (+${screenshots.length} screenshots)` : "ok",
    );
    images.push({
      url,
      name,
      ...(screenshots.length > 0 ? { screenshots } : {}),
    });
  }

  const response = await fetch(
    `${baseUrl}/_agent-native/actions/import-images-deck`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title, images }),
    },
  );
  const result = await response.json();
  if (!response.ok) {
    throw new Error(`import-images-deck failed: ${JSON.stringify(result)}`);
  }
  console.log(`\nImported "${title}":`, result);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
