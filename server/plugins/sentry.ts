import * as Sentry from "@sentry/node";
import { getRequestURL, getResponseHeader, type H3Event } from "h3";

/**
 * Server-side error tracking. Opt-in via SENTRY_DSN — without it this plugin
 * is a no-op so local dev and self-hosters without Sentry are unaffected.
 *
 * Uses the Nitro `error` hook rather than build-time instrumentation so the
 * agent-native build pipeline (see nitro.config.ts chunk-ordering fix) stays
 * untouched. Each event carries the `x-agent-native-request-id` correlation
 * id the framework already stamps on responses, so a Sentry issue can be
 * matched to Vercel function logs.
 */
export default (nitroApp: {
  hooks: { hook: (name: string, fn: (...args: unknown[]) => unknown) => void };
}): void => {
  const dsn = process.env.SENTRY_DSN?.trim();
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment:
      process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
    // Errors only. Tracing multiplies event volume (and cost) and the agent
    // loop makes very long requests; enable later deliberately if needed.
    tracesSampleRate: 0,
  });

  nitroApp.hooks.hook("error", async (...args: unknown[]) => {
    const [error, context] = args as [
      unknown,
      { event?: H3Event } | undefined,
    ];
    const event = context?.event;
    Sentry.withScope((scope) => {
      if (event) {
        try {
          const url = getRequestURL(event);
          scope.setTag("path", url.pathname);
          const requestId = getResponseHeader(event, "x-agent-native-request-id");
          if (typeof requestId === "string") {
            scope.setTag("request_id", requestId);
          }
        } catch {
          // Context extraction must never mask the original error.
        }
      }
      Sentry.captureException(error);
    });
    // Serverless: the function may freeze right after the response, so push
    // the event out before yielding. Short timeout keeps error paths fast.
    await Sentry.flush(2000).catch(() => {});
  });
};
