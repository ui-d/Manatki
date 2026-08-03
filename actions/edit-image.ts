/**
 * Edit an existing image using Gemini.
 * Pass in an image file and editing instructions.
 *
 * Usage:
 *   pnpm action edit-image --input public/generated/slide5-v3.png --prompt "Remove the background and make it transparent. Remove any logos." --output public/assets/generated/slide5-edited
 *
 * Options:
 *   --input          Path to the image to edit (required)
 *   --prompt         Edit instructions (required)
 *   --output         Output file path prefix (files: {prefix}-v1.png, ...)
 *   --count          Number of variations (default: 1)
 *   --aspect-ratio   Optional output aspect ratio (e.g. 9:16)
 */

const config = async () => {
  try {
    const m = await import("dotenv");
    m.config();
  } catch {}
};
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname } from "path";

function parseArgs(args: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith("--")) {
        result[key] = next;
        i++;
      } else {
        result[key] = "true";
      }
    }
  }
  return result;
}

export default async function main(args: string[]) {
  await config();

  const opts = parseArgs(args);
  const inputPath = opts["input"];
  const prompt = opts["prompt"];
  const outputPrefix = opts["output"];
  const count = parseInt(opts["count"] || "1", 10);

  if (!inputPath || !prompt) {
    console.error(
      "Usage: pnpm action edit-image --input <path> --prompt <instructions> [--output <prefix>] [--count N] [--aspect-ratio W:H]",
    );
    throw new Error("Script failed");
  }

  const { GeminiProvider } =
    await import("../server/handlers/image-providers/gemini.js");
  const provider = new GeminiProvider();
  if (!(await provider.isConfiguredForRequest())) {
    console.error("Error: GEMINI_API_KEY not configured");
    throw new Error("Script failed");
  }

  const imgBuffer = readFileSync(inputPath);
  console.log(
    `Input image: ${inputPath} (${Math.round(imgBuffer.length / 1024)}KB)`,
  );
  console.log(`Edit prompt: "${prompt}"`);
  console.log(`Generating ${count} variation(s)...\n`);

  if (outputPrefix) {
    mkdirSync(dirname(outputPrefix), { recursive: true });
  }

  const editConfig = opts["aspect-ratio"]
    ? { aspectRatio: opts["aspect-ratio"] }
    : undefined;
  const generatedFiles: string[] = [];

  for (let i = 0; i < count; i++) {
    console.log(`Generating variation ${i + 1}/${count}...`);
    try {
      const result = await provider.edit(imgBuffer, prompt, editConfig);
      if (outputPrefix) {
        const filePath = `${outputPrefix}-v${i + 1}.png`;
        writeFileSync(filePath, result.imageData);
        generatedFiles.push(filePath);
        console.log(
          `  Saved: ${filePath} (${Math.round(result.imageData.length / 1024)}KB)`,
        );
      } else {
        console.log(
          `  Generated (${Math.round(result.imageData.length / 1024)}KB, ${result.model})`,
        );
      }
    } catch (err: any) {
      console.error(
        `  Failed to generate variation ${i + 1}: ${err?.message ?? err}`,
      );
    }
  }

  if (generatedFiles.length > 0) {
    console.log(`\n✓ Generated ${generatedFiles.length} edited image(s):`);
    for (const f of generatedFiles) {
      console.log(`  ${f}`);
    }
  }

  console.log("\nDone!");
}
