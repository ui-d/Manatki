/**
 * Shared E2E utilities: deck seeding through the `pnpm action` CLI (the same
 * write path the agent uses, as the auto dev account) and small binary
 * parsers for asserting on downloaded export artifacts.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const DEV_USER_EMAIL = "dev@local.test";

export function runAction(name: string, args: unknown): string {
  const output = execFileSync("pnpm", ["action", name, JSON.stringify(args)], {
    cwd: REPO_ROOT,
    env: { ...process.env, AGENT_USER_EMAIL: DEV_USER_EMAIL },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  // The CLI colorizes its console.log output even when piped — strip ANSI
  // escapes so callers can pattern-match on the object dump.
  // eslint-disable-next-line no-control-regex
  return output.replace(/\x1b\[[0-9;]*m/g, "");
}

export interface SeedSlide {
  id: string;
  content: string;
  notes?: string;
}

export interface SeedDeckOptions {
  title: string;
  slides: SeedSlide[];
  kind?: "deck" | "social";
  sizePreset?: string;
  aspectRatio?: string;
}

/** Unique per-run title so stale decks from crashed runs can't be matched. */
export function uniqueTitle(prefix: string): string {
  return `${prefix} ${Date.now().toString(36)}`;
}

/** Create a deck via the create-deck action and return its id. */
export function seedDeck(options: SeedDeckOptions): string {
  const output = runAction("create-deck", options);
  const match = output.match(/\bid: '([^']+)'/);
  if (!match) {
    throw new Error(`create-deck output had no deck id:\n${output}`);
  }
  return match[1];
}

export function deleteDeck(id: string): void {
  runAction("delete-deck", { id });
}

/** Minimal slide HTML in the app's expected .fmd-slide shape. */
export function slideHtml(heading: string, background = "#1e1b4b"): string {
  return (
    `<div class="fmd-slide" style="display:flex;align-items:center;` +
    `justify-content:center;background:${background};color:#fff;">` +
    `<h1 style="font-size:64px;font-weight:800;">${heading}</h1></div>`
  );
}

/** Parse width/height from a PNG buffer's IHDR chunk. */
export function pngDimensions(buffer: Buffer): {
  width: number;
  height: number;
} {
  const signature = buffer.subarray(0, 8).toString("hex");
  if (signature !== "89504e470d0a1a0a") {
    throw new Error("Not a PNG file");
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}
