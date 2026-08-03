import { resolveSecret } from "@agent-native/core/server";

/**
 * Optional mirror of confirmed subscribers into a Resend Audience so
 * newsletters can be composed and sent as Resend Broadcasts.
 *
 * Strictly best-effort: the subscribers table is the source of truth for
 * consent, so every failure here is logged and swallowed — audience sync must
 * never break subscribe/confirm/unsubscribe.
 */

const RESEND_API_BASE = "https://api.resend.com";
const SYNC_TIMEOUT_MS = 5000;

async function resendApiKey(): Promise<string | null> {
  // Same resolution path core's email provider uses (env or secrets vault).
  return resolveSecret("RESEND_API_KEY");
}

function audienceId(): string | null {
  return process.env.RESEND_AUDIENCE_ID?.trim() || null;
}

export async function isAudienceSyncEnabled(): Promise<boolean> {
  if (!audienceId()) return false;
  return Boolean(await resendApiKey());
}

async function resendFetch(
  path: string,
  init: { method: string; body?: unknown },
): Promise<Record<string, unknown> | null> {
  const key = await resendApiKey();
  const id = audienceId();
  if (!key || !id) return null;
  const res = await fetch(`${RESEND_API_BASE}${path}`, {
    method: init.method,
    headers: {
      Authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(SYNC_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`Resend API ${init.method} ${path} → ${res.status}`);
  }
  return (await res.json()) as Record<string, unknown>;
}

/** Add (or reactivate) a contact in the audience. Returns the contact id. */
export async function syncContactSubscribed(
  email: string,
): Promise<string | null> {
  const id = audienceId();
  if (!id) return null;
  try {
    const result = await resendFetch(`/audiences/${id}/contacts`, {
      method: "POST",
      body: { email, unsubscribed: false },
    });
    const contactId = result?.id;
    return typeof contactId === "string" ? contactId : null;
  } catch (err) {
    console.warn(
      "[newsletter] resend audience sync (subscribe) failed:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

/** Flag a contact as unsubscribed in the audience. */
export async function syncContactUnsubscribed(
  email: string,
  contactId?: string | null,
): Promise<void> {
  const id = audienceId();
  if (!id) return;
  try {
    // Resend accepts either the contact id or the email as the identifier.
    const identifier = contactId || encodeURIComponent(email);
    await resendFetch(`/audiences/${id}/contacts/${identifier}`, {
      method: "PATCH",
      body: { unsubscribed: true },
    });
  } catch (err) {
    console.warn(
      "[newsletter] resend audience sync (unsubscribe) failed:",
      err instanceof Error ? err.message : err,
    );
  }
}
