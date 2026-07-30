import { defineAction } from "@agent-native/core";
import { resolveAccess } from "@agent-native/core/sharing";
import { z } from "zod";

import "../server/db/index.js"; // ensure registerShareableResource runs

const MAX_AGENT_CONTEXT_CHARS = 14_000;
const MAX_JSON_CONTEXT_CHARS = 2_500;

function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars).trimEnd()}\n[truncated]`;
}

function parseJson(value: string | null | undefined): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function formatJson(value: unknown, maxChars = MAX_JSON_CONTEXT_CHARS): string {
  return truncate(JSON.stringify(value, null, 2), maxChars);
}

function buildDesignSystemAgentContext({
  id,
  title,
  description,
  data,
  assets,
  customInstructions,
}: {
  id: string;
  title: string;
  description?: string | null;
  data?: string | null;
  assets?: string | null;
  customInstructions?: string | null;
}): string {
  const lines: string[] = [
    "## Selected Design System Context",
    `Use "${title}" (id: ${id}) as the visual source of truth for this deck.`,
    "Apply these tokens, assets, and usage notes before choosing colors, type, spacing, radius, imagery, slide defaults, or component language.",
  ];

  if (description?.trim()) {
    lines.push("", "Description:", description.trim());
  }

  if (customInstructions?.trim()) {
    lines.push("", "Custom instructions:", customInstructions.trim());
  }

  const parsedAssets = parseJson(assets);
  if (Array.isArray(parsedAssets) && parsedAssets.length > 0) {
    lines.push("", "Design system assets:", formatJson(parsedAssets));
  }

  const parsedData = parseJson(data);
  if (parsedData) {
    lines.push("", "Design-system tokens:", formatJson(parsedData));
  }

  return truncate(lines.filter(Boolean).join("\n"), MAX_AGENT_CONTEXT_CHARS);
}

export default defineAction({
  description:
    "Get a design system by ID. Returns full design system data including colors, typography, spacing, assets, and a compact agentContext for generation.",
  schema: z.object({
    id: z.string().describe("Design system ID"),
  }),
  readOnly: true,
  http: { method: "GET" },
  run: async ({ id }) => {
    const access = await resolveAccess("design-system", id);
    if (!access) {
      throw new Error("Design system not found");
    }

    const row = access.resource;

    return {
      id: row.id,
      title: row.title,
      description: row.description,
      data: row.data ?? null,
      assets: row.assets ?? null,
      customInstructions: row.customInstructions ?? "",
      isDefault: row.isDefault,
      visibility: row.visibility,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      agentContext: buildDesignSystemAgentContext({
        id: row.id,
        title: row.title,
        description: row.description,
        data: row.data,
        assets: row.assets,
        customInstructions: row.customInstructions,
      }),
    };
  },
});
