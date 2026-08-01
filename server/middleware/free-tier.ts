import { getSession } from "@agent-native/core/server";
import { defineEventHandler, setResponseStatus } from "h3";

import {
  appProvidedLlmEnvKeys,
  checkFreeTierBudget,
  freeTierMonthlyBudgetCents,
} from "../lib/free-tier.js";

/**
 * User-facing free-tier budget gate for the agent chat endpoint.
 *
 * This must be HTTP middleware, not only the plugin's prepareRequest hook:
 * an error thrown from prepareRequest reaches the framework route wrapper
 * through the durable-run machinery, where it is misclassified as a client
 * abort and the client ends up with a bare 404 instead of the budget
 * message (verified against the production build). Rejecting here, before
 * the plugin handler runs, gives the chat client a clean 402 body it can
 * display. The prepareRequest hook stays on as a spend backstop for
 * non-HTTP spawn paths.
 *
 * Runs after middleware/auth.ts (Nitro orders middleware by filename), so
 * the session is already validated.
 */
const AGENT_CHAT_PATH = "/_agent-native/agent-chat";

export default defineEventHandler(async (event) => {
  if (event.method !== "POST") return;
  const pathname = event.url?.pathname ?? "";
  // Exact match only: subpaths (threads listing, save-key, model defaults)
  // must never be budget-gated — save-key is how users EXIT the free tier.
  if (pathname !== AGENT_CHAT_PATH) return;

  // Cheap env-only pre-checks before touching the body or database.
  if (appProvidedLlmEnvKeys().length === 0) return;
  if (freeTierMonthlyBudgetCents() === 0) return;

  // h3 v2 request bodies are single-read — clone so the plugin handler can
  // still consume the original. Internal continuations of in-flight runs
  // pass through: blocking them would strand a run mid-flight.
  let internalContinuation = false;
  try {
    const body = (await event.req.clone().json()) as {
      internalContinuation?: unknown;
    } | null;
    internalContinuation = Boolean(body?.internalContinuation);
  } catch {
    // Unparseable body — let the plugin handler produce its own 400.
    return;
  }

  const session = await getSession(event).catch(() => null);
  const message = await checkFreeTierBudget({
    ownerEmail: session?.email ?? null,
    internalContinuation,
  });
  if (!message) return;

  setResponseStatus(event, 402);
  return { error: message, errorCode: "free_tier_budget_exhausted" };
});
