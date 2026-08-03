import {
  table,
  text,
  integer,
  now,
  ownableColumns,
  createSharesTable,
} from "@agent-native/core/db/schema";

export const decks = table("decks", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  data: text("data").notNull(), // Full deck JSON
  designSystemId: text("design_system_id"),
  // Optimistic-concurrency revision. Every blob write goes through
  // casUpdateDeck (actions/_deck-write.ts) which bumps rev and guards the
  // UPDATE with `WHERE rev = <read value>` — the in-process deck lock cannot
  // serialise writers across serverless instances.
  rev: integer("rev").notNull().default(0),
  // Hosted URL of a rasterized first-slide preview (never image bytes).
  // Written by the editor's preview generator via set-deck-preview; the
  // library grid renders it instead of a live full-resolution slide DOM.
  previewUrl: text("preview_url"),
  createdAt: text("created_at").default(now()),
  updatedAt: text("updated_at").default(now()),
  ...ownableColumns(),
});

export const deckShares = createSharesTable("deck_shares");

export const deckVersions = table("deck_versions", {
  id: text("id").primaryKey(),
  ownerEmail: text("owner_email").notNull().default("local@localhost"),
  deckId: text("deck_id").notNull(),
  title: text("title").notNull(),
  data: text("data").notNull(),
  changeLabel: text("change_label"),
  createdAt: text("created_at").notNull().default(now()),
});

export const designSystems = table("design_systems", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  data: text("data").notNull(),
  assets: text("assets"),
  customInstructions: text("custom_instructions").notNull().default(""),
  isDefault: integer("is_default", { mode: "boolean" })
    .notNull()
    .default(false),
  createdAt: text("created_at").default(now()),
  updatedAt: text("updated_at").default(now()),
  ...ownableColumns(),
});

export const designSystemShares = createSharesTable("design_system_shares");

// Persisted public share-link snapshots (token → deck snapshot).
// Replaces the old in-memory Map so links survive server restarts and
// work across multiple serverless instances.
export const deckShareLinks = table("deck_share_links", {
  token: text("token").primaryKey(),
  title: text("title").notNull(),
  slides: text("slides").notNull(), // JSON array of slide snapshots
  aspectRatio: text("aspect_ratio"),
  createdAt: text("created_at").notNull().default(now()),
  // Revocation support (v23): who minted the link and from which deck, so
  // links can be listed per deck and revoked — including when the deck is
  // deleted. Rows from before v23 have deckId NULL (unlisted, but their
  // owner can still not manage them; they expire via the 30-day TTL).
  ownerEmail: text("owner_email").notNull().default("local@localhost"),
  deckId: text("deck_id"),
  revokedAt: text("revoked_at"),
});

// Append-only, anonymous view analytics for share links (v24). One row per
// event, keyed by share token. Deliberately stores no IP, user agent, or
// other PII — unique viewers are approximated by a client-minted session id.
// Rows share the parent link's 30-day TTL prune and are deleted on revoke.
// slide_index/dwell_ms are written by per-slide events (phase 2); `view`
// events leave them NULL.
export const shareLinkEvents = table("share_link_events", {
  id: text("id").primaryKey(),
  token: text("token").notNull(),
  sessionId: text("session_id").notNull(),
  eventType: text("event_type").notNull(), // 'view' | 'slide'
  slideIndex: integer("slide_index"),
  dwellMs: integer("dwell_ms"),
  createdAt: text("created_at").notNull().default(now()),
});

export const uploadedAssets = table("uploaded_assets", {
  id: text("id").primaryKey(),
  filename: text("filename").notNull(),
  url: text("url").notNull(),
  type: text("type").notNull(),
  size: integer("size").notNull(),
  provider: text("provider"),
  ownerEmail: text("owner_email").notNull(),
  createdAt: text("created_at").notNull().default(now()),
});

// Newsletter double-opt-in subscribers (v25). Keyed by normalized lowercase
// email, not ownableColumns — the row must be resolvable by token from a
// logged-out unsubscribe/confirm link, and there are no org/sharing
// semantics. consent_* / confirmed_at / unsubscribed_at form the GDPR audit
// trail. unsubscribe_token is minted once and never rotated so links in old
// newsletter footers keep working; confirm_token is cleared on confirm.
export const newsletterSubscribers = table("newsletter_subscribers", {
  email: text("email").primaryKey(),
  status: text("status").notNull().default("pending"), // 'pending' | 'subscribed' | 'unsubscribed'
  consentSource: text("consent_source").notNull(), // 'decks-prompt' | 'settings'
  consentedAt: text("consented_at").notNull(),
  confirmedAt: text("confirmed_at"),
  unsubscribedAt: text("unsubscribed_at"),
  confirmToken: text("confirm_token"),
  confirmTokenExpiresAt: text("confirm_token_expires_at"),
  unsubscribeToken: text("unsubscribe_token").notNull(),
  resendContactId: text("resend_contact_id"),
  createdAt: text("created_at").notNull().default(now()),
  updatedAt: text("updated_at").notNull().default(now()),
});

export const slideComments = table("slide_comments", {
  id: text("id").primaryKey(),
  deckId: text("deck_id").notNull(),
  slideId: text("slide_id").notNull(),
  threadId: text("thread_id").notNull(),
  parentId: text("parent_id"),
  content: text("content").notNull(),
  quotedText: text("quoted_text"),
  authorEmail: text("author_email").notNull(),
  authorName: text("author_name"),
  resolved: integer("resolved", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull().default(now()),
  updatedAt: text("updated_at").notNull().default(now()),
});
