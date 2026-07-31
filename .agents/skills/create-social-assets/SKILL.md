---
name: create-social-assets
description: How to create social-media and marketing assets (Instagram posts, stories, banners, YouTube thumbnails, Pinterest pins, display ads) as a social project with per-asset canvas sizes. Read this before creating any social/marketing asset. Contains size presets and per-archetype HTML templates.
---

# Creating Social & Marketing Assets

**Do not explore the codebase.** Everything you need is here.

A social project is a deck with `kind: "social"`. Each slide is one standalone
asset with its **own pixel canvas** (`slide.size`), not a page in a
presentation. There is no presenter flow, no PPTX export — assets export as
PNGs from the editor (Export → Download PNG / Download all as ZIP).

## Size Presets

Every preset belongs to a **layout archetype** — the archetype decides which
template below to start from and what type scale fits the canvas.

| Preset | Pixels | Archetype | Headline baseline | Use for |
| --- | --- | --- | --- | --- |
| `ig-square` | 1080×1080 | stack | 110px | Instagram/Facebook feed post, general square |
| `ig-portrait` | 1080×1350 | stack | 104px | Instagram portrait feed post (4:5) |
| `pinterest-pin` | 1000×1500 | stack | 96px | Pinterest pin (2:3) |
| `ig-story` | 1080×1920 | story | 128px | Story, Reel cover, TikTok, FB story (9:16) |
| `fb-post` | 1200×630 | split | 72px | Facebook link/feed image (1.91:1) |
| `x-post` | 1600×900 | split | 84px | X/Twitter in-feed image (16:9) |
| `og-banner` | 1200×628 | split | 72px | Link previews (Open Graph), Twitter cards |
| `yt-thumbnail` | 1280×720 | split | 110px | YouTube thumbnail — 3-5 words max, extreme contrast |
| `linkedin-banner` | 1584×396 | strip | 56px | LinkedIn profile/company banner |
| `x-header` | 1500×500 | strip | 64px | X/Twitter profile header |
| `fb-cover` | 1640×624 | strip | 76px | Facebook page cover |
| `email-header` | 600×200 | strip | 40px | Email newsletter header |
| `ad-mrec` | 300×250 | micro | 32px | Display ad — medium rectangle |
| `ad-half-page` | 300×600 | micro | 36px | Display ad — half page |
| `ad-leaderboard` | 728×90 | micro | 28px | Display ad — leaderboard |

Custom sizes: pass `--width` and `--height` (integers, 50–4000 px each,
area ≤ 8.3 MP) instead of `--sizePreset`. Pick the template of the archetype
whose geometry is closest.

## Workflow

1. Read the `creative-context` skill; respect `contextMode: "off"`. Follow
   linked design systems exactly as for decks (`get-design-system` →
   `agentContext`). If the user named no design system, call
   `get-workspace-defaults`.
2. Create the project (skip if the UI already created it — then rename via
   `patch-deck` like a normal deck):

   ```bash
   pnpm action create-deck --title "Spring Launch Campaign" --slides '[]' --kind social --sizePreset ig-square
   ```

   `--sizePreset`/`--width`+`--height` here set the project's **default**
   canvas for new assets.
3. Navigate: `pnpm action navigate --deckId=<id>`.
4. Add assets ONE AT A TIME, each with its own size:

   ```bash
   pnpm action add-slide --deckId=<id> --layout blank --sizePreset ig-square --content "..."
   pnpm action add-slide --deckId=<id> --layout blank --sizePreset ig-story --content "..."
   pnpm action add-slide --deckId=<id> --layout blank --sizePreset og-banner --content "..."
   ```

   Always use `--layout blank`. Wait for each result; react to
   `layoutOverflow` by rewriting the HTML until it fits — the fit check
   measures against **that asset's own canvas**.
5. To resize an existing asset: `update-slide --sizePreset <preset>` (or
   `--width`/`--height`). After a change that crosses archetypes
   (square → story, post → banner), pass rewritten `--fullContent` in the
   same call — never letterbox the old layout into the new frame.

## Rules

- Every asset must stand alone. No title/agenda/closing slides, no slide
  numbers, no "continued" content across assets.
- One message per asset: a single headline idea, at most one supporting
  line and one CTA. Social assets are glanceable, not read.
- Campaign sets share copy, palette, and type treatment across formats but
  **re-compose the layout per canvas** — never scale one layout to fit all.
- Preserve freeform objects and `data-slide-object-id` values, same as decks.

## Type Scale — set by archetype, not one global rule

Deck templates target a 960×540 canvas. Social canvases differ per archetype:

- **stack / story / split** (1000px+ wide, viewed small on phones): fonts
  ~2× deck sizes. Minimum body text 32px. Use the headline baseline from the
  preset table.
- **strip** (banners, 396–624px tall): height is the constraint — one row,
  headline from the table, no body paragraph. `email-header` is only 600px
  wide; keep its type compact (headline 40px, label 14px).
- **micro** (display ads): the 2× rule does NOT apply. Compact type
  (headline from the table, supporting line 16–18px), padding 20–24px, one
  idea + one CTA only. `ad-leaderboard` (728×90) fits a single row: label,
  short headline, CTA button.

## Story Safe Areas (`ig-story`, 1080×1920)

Platform UI covers the top and bottom of stories. Keep all critical content
(headline, CTA, logo) inside the middle band:

- Top 220px: avatar + username overlay — background only.
- Bottom 280px: reply box / swipe-up — background only.

The story template already respects this via padding.

## Templates by Archetype

Copy the template of the asset's archetype and fill in the bracketed values.
Default styling matches the deck language (black background, Poppins,
`#00E5FF` accent) — a linked design system's tokens override these.

---

### stack — `ig-square`, `ig-portrait`, `pinterest-pin`

Vertical composition: label, headline block, optional image, footer row.
Scale the headline to the preset's baseline; on taller canvases
(`ig-portrait`, `pinterest-pin`) give the image `flex: 1`.

```html
<div class="fmd-slide" style="padding: 90px; display: flex; flex-direction: column; justify-content: space-between; font-family: 'Poppins', sans-serif;">
  <div style="font-size: 26px; font-weight: 700; letter-spacing: 4px; text-transform: uppercase; color: #00E5FF;">[BRAND OR CAMPAIGN LABEL]</div>
  <div>
    <h1 style="font-size: 110px; font-weight: 900; color: #fff; line-height: 1.05; letter-spacing: -3px; margin: 0 0 32px 0;">[HEADLINE — 3 TO 6 WORDS]</h1>
    <p style="font-size: 38px; color: rgba(255,255,255,0.65); line-height: 1.4; margin: 0;">[ONE SUPPORTING LINE]</p>
  </div>
  <div style="display: flex; align-items: center; justify-content: space-between;">
    <span style="font-size: 30px; font-weight: 700; color: #fff;">[CTA OR HANDLE]</span>
    <div style="width: 90px; height: 6px; background: #00E5FF;"></div>
  </div>
</div>
```

Taller variant (portrait/pin) — insert between headline and footer:

```html
<div class="fmd-img-placeholder" style="width: 100%; flex: 1; border-radius: 24px;">[IMAGE DESCRIPTION]</div>
```

---

### story — `ig-story` (safe-area padding built in)

```html
<div class="fmd-slide" style="padding: 260px 90px 320px 90px; display: flex; flex-direction: column; justify-content: center; gap: 48px; font-family: 'Poppins', sans-serif;">
  <div style="font-size: 28px; font-weight: 700; letter-spacing: 4px; text-transform: uppercase; color: #00E5FF;">[LABEL]</div>
  <h1 style="font-size: 128px; font-weight: 900; color: #fff; line-height: 1.05; letter-spacing: -4px; margin: 0;">[HEADLINE]</h1>
  <p style="font-size: 44px; color: rgba(255,255,255,0.65); line-height: 1.4; margin: 0;">[SUPPORTING LINE]</p>
  <div style="margin-top: 40px; display: inline-flex; align-items: center; gap: 20px;">
    <span style="display: inline-block; padding: 24px 48px; border-radius: 999px; background: #00E5FF; color: #000; font-size: 36px; font-weight: 800;">[CTA]</span>
  </div>
</div>
```

---

### split — `fb-post`, `x-post`, `og-banner`, `yt-thumbnail`

Landscape side-by-side: text column + image column. Scale the headline to
the preset's baseline. For `yt-thumbnail`, push contrast to the extreme:
3-5 word headline at 110px, bold color blocking, face or product close-up
in the image column — it must read at 200px wide in a search result.

```html
<div class="fmd-slide" style="padding: 70px 90px; display: flex; align-items: center; gap: 70px; font-family: 'Poppins', sans-serif;">
  <div style="flex: 1.2; display: flex; flex-direction: column; gap: 24px;">
    <div style="font-size: 20px; font-weight: 700; letter-spacing: 3px; text-transform: uppercase; color: #00E5FF;">[LABEL]</div>
    <h1 style="font-size: 72px; font-weight: 900; color: #fff; line-height: 1.05; letter-spacing: -2px; margin: 0;">[HEADLINE]</h1>
    <p style="font-size: 26px; color: rgba(255,255,255,0.65); line-height: 1.4; margin: 0;">[ONE LINE — OPTIONAL]</p>
  </div>
  <div class="fmd-img-placeholder" style="flex: 1; align-self: stretch; border-radius: 20px;">[IMAGE DESCRIPTION]</div>
</div>
```

---

### strip — `linkedin-banner`, `x-header`, `fb-cover`, `email-header`

Ultra-wide single row: label left, headline center, logo/handle or CTA
right. No body paragraph — height is the constraint. Scale the headline to
the preset's baseline (56px at 1584×396 up to 76px at 1640×624; 40px for
the 600px-wide `email-header`).

```html
<div class="fmd-slide" style="padding: 60px 90px; display: flex; align-items: center; justify-content: space-between; gap: 60px; font-family: 'Poppins', sans-serif;">
  <div style="font-size: 20px; font-weight: 700; letter-spacing: 3px; text-transform: uppercase; color: #00E5FF; white-space: nowrap;">[LABEL]</div>
  <h1 style="font-size: 56px; font-weight: 900; color: #fff; line-height: 1.05; letter-spacing: -2px; margin: 0; text-align: center;">[HEADLINE — SHORT]</h1>
  <div style="font-size: 24px; font-weight: 700; color: #fff; white-space: nowrap;">[LOGO / HANDLE]</div>
</div>
```

For profile headers (`x-header`, `fb-cover`): the profile avatar overlaps
the bottom-left corner on the live page — keep the left third of the bottom
half as background only.

---

### micro — `ad-mrec`, `ad-half-page`, `ad-leaderboard`

Tiny canvas, compact type, one idea + CTA. `ad-half-page` (300×600) stacks
vertically like this; `ad-mrec` (300×250) drops the supporting line;
`ad-leaderboard` (728×90) lays the same three elements in ONE row
(`flex-direction: row; align-items: center; padding: 16px 24px`).

```html
<div class="fmd-slide" style="padding: 24px; display: flex; flex-direction: column; justify-content: space-between; gap: 12px; font-family: 'Poppins', sans-serif;">
  <div style="font-size: 12px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: #00E5FF;">[BRAND]</div>
  <h1 style="font-size: 32px; font-weight: 900; color: #fff; line-height: 1.1; letter-spacing: -1px; margin: 0;">[HEADLINE — 2 TO 5 WORDS]</h1>
  <span style="display: inline-block; align-self: flex-start; padding: 10px 20px; border-radius: 999px; background: #00E5FF; color: #000; font-size: 14px; font-weight: 800;">[CTA]</span>
</div>
```

## Campaigns — one brief, several formats

For "make a campaign for X":

1. Write the shared copy block once: headline, supporting line, CTA.
2. Create one social project; add one asset per requested format
   sequentially (`ig-square` → `ig-story` → `og-banner` unless the user
   specified formats).
3. Re-compose per canvas **by archetype**: stack centers the headline
   block, story stacks with the CTA pill, split goes side-by-side with the
   image, strip collapses to one row, micro compresses to headline + CTA.
4. Generate imagery once (see `slide-images` /
   `image-generation-via-a2a`) and reuse the same image or style reference
   across formats for cohesion.
5. Finish by delivering the PNGs: call `export-asset-images` with the
   project's `deckId` (optionally `slideIds` for a subset) — it renders each
   asset in the user's open editor tab, uploads the PNGs, and returns hosted
   URLs to share in chat. It needs the project open in a browser tab; if it
   times out, ask the user to open the project and retry, or point them to
   Export → "Download all as ZIP" in the editor.

## Adapting an existing asset to another format

"Turn this post into a story": call `get-deck` to read the source HTML,
then `add-slide` with the target `--sizePreset` and **rewritten** HTML —
keep copy, colors, and image URLs; re-derive the layout from the target
archetype's template (see Campaigns rule 3). Iterate on the fit check like
any slide.
