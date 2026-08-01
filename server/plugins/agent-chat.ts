import { getOrgContext } from "@agent-native/core/org";
import {
  createAgentChatPlugin,
  loadActionsFromStaticRegistry,
} from "@agent-native/core/server";

import actionsRegistry from "../../.generated/actions-registry.js";
import { prepareSlidesChatAttachments } from "../lib/chat-attachments.js";
import { assertWithinFreeTierBudget } from "../lib/free-tier.js";
import "../register-secrets.js";

// Overridable so deployments running on an app-provided LLM key can shorten
// the per-run ceiling (13 min of agent looping is a lot of owner-paid
// tokens). Pairs with AGENT_MAX_ITERATIONS / AGENT_MAX_RUN_INPUT_TOKENS,
// which core reads directly — see docs/PRODUCTION.md.
const SLIDES_BACKGROUND_RUN_SOFT_TIMEOUT_MS = (() => {
  const raw = Number(process.env.SLIDES_RUN_SOFT_TIMEOUT_MS);
  return Number.isFinite(raw) && raw >= 60_000 ? raw : 13 * 60_000;
})();

const INITIAL_TOOL_NAMES = [
  "view-screen",
  "list-decks",
  "get-deck",
  "get-deck-reference-context",
  "create-deck",
  "add-slide",
  "update-slide",
  "patch-deck",
  "generate-slides-ai",
  "import-file",
  "import-google-doc",
  "import-pptx",
  "export-pptx",
  "navigate",
  "provider-api-catalog",
  "provider-api-docs",
  "provider-api-request",
];

export default createAgentChatPlugin({
  appId: "slideshow-app",
  actions: loadActionsFromStaticRegistry(actionsRegistry),
  initialToolNames: INITIAL_TOOL_NAMES,
  durableBackgroundRuns: true,
  runSoftTimeoutMs: SLIDES_BACKGROUND_RUN_SOFT_TIMEOUT_MS,
  // Enable sandboxed JavaScript execution so Slides agents can fetch,
  // paginate, and reduce provider data through providerFetch() without us
  // hardcoding one action per Google Drive endpoint.
  codeExecution: { production: "sandboxed" },
  resolveOrgId: async (event) => (await getOrgContext(event)).orgId,
  // Runs before any model call. The budget assertion is the spend BACKSTOP
  // for run-spawn paths that bypass HTTP middleware; the user-facing 402
  // lives in server/middleware/free-tier.ts (see the rationale there).
  // No-op for BYO-key users and BYO-only deployments — see
  // server/lib/free-tier.ts. Attachment prep runs after, so rejected
  // requests never upload anything.
  prepareRequest: async (details) => {
    await assertWithinFreeTierBudget(details);
    return prepareSlidesChatAttachments(details);
  },
  systemPrompt: `You are an AI deck assistant. You create, edit, import, export, style, share, and navigate decks through actions and shared application state.

Provider-specific Slides actions are shortcuts, not limits. If a first-class action cannot express the exact Google Drive endpoint, file metadata field, export format, query, request body, pagination mode, payload shape, or API version needed, call provider-api-catalog and provider-api-docs as needed, then call provider-api-request against the real provider API. Use the raw provider API escape hatch instead of weakening the answer or claiming Slides cannot do something the underlying Google Drive API can do.

Slides' Google Drive provider API uses the user's connected Google Docs OAuth account. The drive.file scope is intentionally limited to files the user selected or the app created. For large Drive file lists or metadata sweeps, pass stageAs and pagination options to provider-api-request, then use query-staged-dataset to count, filter, group, or project the staged rows.`,
  mentionProviders: async () => {
    const { getDb } = await import("../db/index.js");
    const { decks, deckShares } = await import("../db/schema.js");
    const { like, desc, and } = await import("drizzle-orm");
    const { accessFilter } = await import("@agent-native/core/sharing");
    return {
      decks: {
        label: "Decks",
        icon: "deck",
        search: async (query: string) => {
          const db = getDb();
          const access = accessFilter(decks, deckShares);
          const rows = query
            ? await db
                .select()
                .from(decks)
                .where(and(access, like(decks.title, `%${query}%`)))
                .limit(15)
            : await db
                .select()
                .from(decks)
                .where(access)
                .orderBy(desc(decks.updatedAt))
                .limit(15);
          return rows.map((deck) => ({
            id: deck.id,
            label: deck.title,
            icon: "deck" as const,
            refType: "deck",
            refId: deck.id,
          }));
        },
      },
    };
  },
});
