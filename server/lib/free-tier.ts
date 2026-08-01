import { readAppSecretMeta } from "@agent-native/core/secrets";
import { getUsageSummary } from "@agent-native/core/usage";
import { createError } from "h3";

/**
 * Free-tier spend guard for app-provided LLM keys.
 *
 * When the deployment sets a server-wide provider key (e.g.
 * ANTHROPIC_API_KEY), every signed-in user's agent chat runs on the app
 * owner's bill, and nothing in @agent-native/core enforces a ceiling — the
 * loop allows up to 400 model iterations per turn and the usage table is
 * metering-only. This module is the ceiling: a per-user monthly budget
 * checked in the agent-chat plugin's prepareRequest seam, which runs before
 * any tokens are spent (core throws H3 errors from that same seam itself,
 * so a thrown 402 is the framework-idiomatic rejection).
 *
 * Scope and known limits:
 * - Enforcement activates only when at least one app-level provider env key
 *   is present. BYO-only deployments (the README default) are untouched.
 * - Users who saved their own key in Settings for every app-provided
 *   provider are exempt — core prefers user-scoped keys, so their runs bill
 *   their own account.
 * - The budget counts ALL of the user's metered usage this month (the usage
 *   table does not record whose key served a call), and it is checked per
 *   message, not mid-run — a run in flight may overshoot by one run's cost.
 *   Pair it with AGENT_MAX_ITERATIONS / AGENT_MAX_RUN_INPUT_TOKENS (see
 *   docs/PRODUCTION.md) to bound that overshoot.
 */

/** Mirrors core's provider→env map in agent-chat-plugin (save-key route). */
const APP_LLM_ENV_KEYS = [
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "GROQ_API_KEY",
  "MISTRAL_API_KEY",
  "COHERE_API_KEY",
] as const;

const DEFAULT_MONTHLY_BUDGET_CENTS = 300;

export interface FreeTierCheckInput {
  ownerEmail: string | null;
  internalContinuation?: boolean;
}

export function appProvidedLlmEnvKeys(
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  return APP_LLM_ENV_KEYS.filter((key) => !!env[key]?.trim());
}

/**
 * Monthly budget in US cents. 0 disables enforcement entirely (the owner
 * explicitly accepts uncapped spend).
 */
export function freeTierMonthlyBudgetCents(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const raw = env.FREE_TIER_MONTHLY_BUDGET_CENTS?.trim();
  if (raw === undefined || raw === "") return DEFAULT_MONTHLY_BUDGET_CENTS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return DEFAULT_MONTHLY_BUDGET_CENTS;
  }
  return Math.floor(parsed);
}

export function startOfCurrentUtcMonthMs(now: Date = new Date()): number {
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
}

async function hasOwnKeyForEveryAppProvider(
  ownerEmail: string,
  envKeys: string[],
): Promise<boolean> {
  const metas = await Promise.all(
    envKeys.map((key) =>
      readAppSecretMeta({ key, scope: "user", scopeId: ownerEmail }),
    ),
  );
  return metas.every((meta) => meta !== null);
}

/**
 * Returns the user-facing rejection message when the user has exhausted this
 * month's free budget, or null when the request may proceed. Null when:
 * - no app-level LLM env key is configured (nothing to protect),
 * - the budget is explicitly set to 0,
 * - the request is an internal continuation of an in-flight run (blocking
 *   those would strand a run mid-flight; the next user message is gated),
 * - the request is anonymous (core already blocks anonymous chat), or
 * - the user brought their own key for every app-provided provider.
 */
export async function checkFreeTierBudget(
  input: FreeTierCheckInput,
): Promise<string | null> {
  const { ownerEmail } = input;
  if (!ownerEmail || input.internalContinuation) return null;

  const envKeys = appProvidedLlmEnvKeys();
  if (envKeys.length === 0) return null;

  const budgetCents = freeTierMonthlyBudgetCents();
  if (budgetCents === 0) return null;

  if (await hasOwnKeyForEveryAppProvider(ownerEmail, envKeys)) return null;

  const summary = await getUsageSummary({
    ownerEmail,
    sinceMs: startOfCurrentUtcMonthMs(),
  });

  if (summary.totalCents < budgetCents) return null;

  const budgetDollars = (budgetCents / 100).toFixed(2);
  return (
    `You've used this month's free AI allowance ($${budgetDollars}). ` +
    `It resets on the 1st. To keep going now, add your own API key in ` +
    `Settings → AI — your chats then run on your key with no limits.`
  );
}

/**
 * Throwing wrapper for the agent-chat prepareRequest hook. This is a
 * BACKSTOP, not the user-facing gate: in the production runtime the
 * framework's route wrapper can misclassify an error thrown from
 * prepareRequest as a client abort (the run dies without spending tokens,
 * but the client sees a generic failure). The middleware in
 * server/middleware/free-tier.ts rejects over-budget requests with a proper
 * 402 before they reach the plugin; this hook only catches spawn paths that
 * bypass HTTP middleware (in-process background workers, A2A).
 */
export async function assertWithinFreeTierBudget(
  input: FreeTierCheckInput,
): Promise<void> {
  const message = await checkFreeTierBudget(input);
  if (message) {
    throw createError({ statusCode: 402, statusMessage: message });
  }
}
