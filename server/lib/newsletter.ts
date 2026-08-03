import { randomBytes } from "node:crypto";

import { renderEmail, sendEmail } from "@agent-native/core/server";
import { eq } from "drizzle-orm";

import { getSlidesAppUrl } from "../../actions/_app-url.js";
import { getDb, schema } from "../db/index.js";

const CONFIRM_TOKEN_TTL_MS = 48 * 60 * 60 * 1000;
// A resent confirmation regenerates the token; throttle so the settings
// "Resend email" button (or a double-clicked prompt) can't spam the inbox.
const RESEND_THROTTLE_MS = 60 * 1000;
const BRAND_COLOR = "#ff5a2b";

export type NewsletterStatus = "pending" | "subscribed" | "unsubscribed";
export type ConsentSource = "decks-prompt" | "settings";

export type SubscriberRow = typeof schema.newsletterSubscribers.$inferSelect;

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function newToken(): string {
  return randomBytes(32).toString("hex");
}

export function confirmExpiry(from: Date = new Date()): string {
  return new Date(from.getTime() + CONFIRM_TOKEN_TTL_MS).toISOString();
}

export function isExpired(iso: string | null, at: Date = new Date()): boolean {
  if (!iso) return true;
  const expires = new Date(iso).getTime();
  return !Number.isFinite(expires) || expires <= at.getTime();
}

export async function getSubscriber(
  email: string,
): Promise<SubscriberRow | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(schema.newsletterSubscribers)
    .where(eq(schema.newsletterSubscribers.email, normalizeEmail(email)))
    .limit(1);
  return row ?? null;
}

export async function findByConfirmToken(
  token: string,
): Promise<SubscriberRow | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(schema.newsletterSubscribers)
    .where(eq(schema.newsletterSubscribers.confirmToken, token))
    .limit(1);
  return row ?? null;
}

export async function findByUnsubscribeToken(
  token: string,
): Promise<SubscriberRow | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(schema.newsletterSubscribers)
    .where(eq(schema.newsletterSubscribers.unsubscribeToken, token))
    .limit(1);
  return row ?? null;
}

export interface UpsertPendingResult {
  row: SubscriberRow;
  /** False when the row was already subscribed or the resend throttle hit. */
  shouldSendEmail: boolean;
}

/**
 * Record a consent event and move the row to `pending` with a fresh confirm
 * token. Idempotent: an already-subscribed address is returned unchanged, and
 * re-consent within the throttle window keeps the existing token so the email
 * isn't re-sent.
 */
export async function upsertPending(
  rawEmail: string,
  source: ConsentSource,
): Promise<UpsertPendingResult> {
  const email = normalizeEmail(rawEmail);
  const db = getDb();
  const existing = await getSubscriber(email);
  const nowIso = new Date().toISOString();

  if (existing?.status === "subscribed") {
    return { row: existing, shouldSendEmail: false };
  }

  if (
    existing?.status === "pending" &&
    existing.confirmToken &&
    !isExpired(existing.confirmTokenExpiresAt) &&
    Date.now() - new Date(existing.updatedAt).getTime() < RESEND_THROTTLE_MS
  ) {
    return { row: existing, shouldSendEmail: false };
  }

  if (!existing) {
    const values = {
      email,
      status: "pending",
      consentSource: source,
      consentedAt: nowIso,
      confirmToken: newToken(),
      confirmTokenExpiresAt: confirmExpiry(),
      unsubscribeToken: newToken(),
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    await db.insert(schema.newsletterSubscribers).values(values);
    const row = await getSubscriber(email);
    if (!row) throw new Error("Failed to persist newsletter subscriber");
    return { row, shouldSendEmail: true };
  }

  // pending (expired/re-request) or unsubscribed re-consent: new consent
  // event, fresh confirm token; the unsubscribe token is never rotated.
  await db
    .update(schema.newsletterSubscribers)
    .set({
      status: "pending",
      consentSource: source,
      consentedAt: nowIso,
      confirmedAt: null,
      unsubscribedAt: null,
      confirmToken: newToken(),
      confirmTokenExpiresAt: confirmExpiry(),
      updatedAt: nowIso,
    })
    .where(eq(schema.newsletterSubscribers.email, email));
  const row = await getSubscriber(email);
  if (!row) throw new Error("Failed to update newsletter subscriber");
  return { row, shouldSendEmail: true };
}

export async function markConfirmed(row: SubscriberRow): Promise<void> {
  const nowIso = new Date().toISOString();
  await getDb()
    .update(schema.newsletterSubscribers)
    .set({
      status: "subscribed",
      confirmedAt: nowIso,
      confirmToken: null,
      confirmTokenExpiresAt: null,
      updatedAt: nowIso,
    })
    .where(eq(schema.newsletterSubscribers.email, row.email));
}

export async function markUnsubscribed(row: SubscriberRow): Promise<void> {
  const nowIso = new Date().toISOString();
  await getDb()
    .update(schema.newsletterSubscribers)
    .set({
      status: "unsubscribed",
      unsubscribedAt: nowIso,
      confirmToken: null,
      confirmTokenExpiresAt: null,
      updatedAt: nowIso,
    })
    .where(eq(schema.newsletterSubscribers.email, row.email));
}

export async function setResendContactId(
  email: string,
  contactId: string,
): Promise<void> {
  await getDb()
    .update(schema.newsletterSubscribers)
    .set({ resendContactId: contactId, updatedAt: new Date().toISOString() })
    .where(eq(schema.newsletterSubscribers.email, normalizeEmail(email)));
}

export function confirmUrl(token: string): string {
  return `${getSlidesAppUrl()}/newsletter/confirm?token=${token}`;
}

export function unsubscribeUrl(token: string): string {
  return `${getSlidesAppUrl()}/newsletter/unsubscribe?token=${token}`;
}

export async function sendConfirmationEmail(row: SubscriberRow): Promise<void> {
  if (!row.confirmToken) {
    throw new Error("Cannot send confirmation email without a confirm token");
  }
  const { html, text } = renderEmail({
    preheader: "One click to confirm your Manatki newsletter subscription.",
    heading: "Confirm your subscription",
    paragraphs: [
      "You asked to receive the Manatki newsletter — occasional product news and slide-making tips, at most a couple of emails per month.",
      "Click the button below to confirm. The link is valid for 48 hours.",
    ],
    cta: { label: "Confirm subscription", url: confirmUrl(row.confirmToken) },
    footer:
      "You're receiving this because someone asked to subscribe this address at manatki.xyz. If this wasn't you, ignore this email — you will not be subscribed.",
    brandName: "Manatki",
    brandColor: BRAND_COLOR,
  });
  await sendEmail({
    to: row.email,
    subject: "Confirm your Manatki newsletter subscription",
    html,
    text,
  });
}
