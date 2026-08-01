---
name: deck-management
description: How decks are stored in SQL, how to create/read/update/delete decks. Read before working with deck data.
---

# Deck Management

Decks are stored in the `decks` SQL table via Drizzle ORM. Each deck row contains the full deck JSON (slides, metadata) in a `data` TEXT column.

## Schema

```sql
CREATE TABLE decks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  data TEXT NOT NULL,       -- Full deck JSON (slides array, metadata)
  created_at TEXT DEFAULT (current_timestamp),
  updated_at TEXT DEFAULT (current_timestamp)
);
```

## Deck JSON Structure

The `data` column stores a JSON object:

```json
{
  "title": "My Presentation",
  "slides": [
    {
      "id": "slide-1",
      "content": "<div class=\"fmd-slide\" style=\"...\">...</div>",
      "layout": "title"
    },
    {
      "id": "slide-2",
      "content": "<div class=\"fmd-slide\" style=\"...\">...</div>",
      "layout": "content"
    }
  ]
}
```

Each slide has an `id`, HTML `content`, and optional `layout` type.

Deck-level optional fields: `aspectRatio` (16:9 default), `kind`
(`"deck"` default, or `"social"` for mixed-size marketing-asset projects),
and `defaultSize` (`{ width, height, preset? }` — the canvas new slides get
in a social project). Each slide may carry its own `size` with the same
shape, which overrides the deck aspect ratio for that slide only. See
`create-social-assets` for the social workflow.

## Reading Decks

**From scripts:**

```bash
# List all decks (metadata only)
pnpm action list-decks

# Get a specific deck with all slides
pnpm action get-deck --id=<deckId>

# See what the user is looking at
pnpm action view-screen
```

**From actions:**

- `list-decks` -- list all decks (returns id, title, slide count, timestamps)
- `get-deck` -- get a single deck with full data

## Writing Decks

**From scripts:**

```bash
# Use db-exec to insert/update
pnpm action db-exec --sql "INSERT INTO decks (id, title, data) VALUES (?, ?, ?)" --params '["new-id", "Title", "{...}"]'
```

**From actions:**

- `add-deck` -- create a new deck
- `save-deck` -- replace an authoritative full deck payload
- `delete-deck` -- delete a deck

## Important Rules

1. **Always use the API or Drizzle** -- never write raw JSON files for deck storage
2. **Deck IDs are stable** -- once created, a deck's ID doesn't change
3. **Slide IDs within a deck are stable** -- used for referencing specific slides
4. **The `data` column is the full source of truth** -- title is duplicated at the top level for listing queries
5. **SSE events** (`source: "resources"`) fire when decks change, keeping the UI in sync

## Share links & viewer analytics

Public read-only snapshot links (`/share/<token>`, 30-day TTL) are minted and
revoked from the editor's Share dialog ("Snapshot link" tab). Anonymous
viewers generate PII-free analytics events: page views plus per-slide dwell
(presenter navigation for decks, on-screen visibility for social galleries).

- `get-share-analytics --deckId=<id>` -- every active link of a deck with
  `viewCount`, `uniqueSessions`, `lastViewedAt`, and per-slide
  `slides[{ slideIndex, viewers, totalDwellMs, avgDwellMs }]`. Requires admin
  on the deck. Use this when the user asks how a shared deck is performing or
  which slides hold attention.
- Viewer identity is never available: sessions are random client-minted ids.
  Do not promise per-person stats. Revoking a link deletes its analytics.

Image decks and presenter screenshot grids are covered in the `presenter`
skill. Relevant actions: `import-images-deck`, `attach-slide-screenshots`,
`set-presenter-variant` / `get-presenter-variant`. Slides carry two additive
fields: `kind?: "html" | "image"` and `screenshots?: string[]`.
