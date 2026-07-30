---
name: create-social-assets
description: How to create social-media and marketing assets (Instagram posts, stories, banners) as a social project with per-asset canvas sizes. Read this before creating any social/marketing asset. Contains size presets and exact HTML templates per format.
---

# Creating Social & Marketing Assets

**Do not explore the codebase.** Everything you need is here.

A social project is a deck with `kind: "social"`. Each slide is one standalone
asset with its **own pixel canvas** (`slide.size`), not a page in a
presentation. There is no presenter flow, no PPTX export — assets export as
PNGs from the editor (Export → Download PNG / Download all as ZIP).

## Size Presets

| Preset | Pixels | Use for |
| --- | --- | --- |
| `ig-square` | 1080×1080 | Instagram/Facebook feed post, general square |
| `ig-portrait` | 1080×1350 | Instagram portrait feed post (4:5) |
| `ig-story` | 1080×1920 | Story, Reel cover, TikTok (9:16) |
| `og-banner` | 1200×628 | Link previews (Open Graph), Twitter cards, ads |
| `x-post` | 1600×900 | X/Twitter in-feed image (16:9) |
| `linkedin-banner` | 1584×396 | LinkedIn profile/company banner |

Custom sizes: pass `--width` and `--height` (integers, 50–4000 px each,
area ≤ 8.3 MP) instead of `--sizePreset`.

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
   `--width`/`--height`). After a big geometry change (square → story),
   pass rewritten `--fullContent` in the same call — never letterbox the
   old layout into the new frame.

## Rules

- Every asset must stand alone. No title/agenda/closing slides, no slide
  numbers, no "continued" content across assets.
- One message per asset: a single headline idea, at most one supporting
  line and one CTA. Social assets are glanceable, not read.
- Campaign sets share copy, palette, and type treatment across formats but
  **re-compose the layout per canvas** — never scale one layout to fit all.
- Preserve freeform objects and `data-slide-object-id` values, same as decks.

## Type Scale — social canvases are larger than deck canvases

Deck templates target a 960×540 canvas; social canvases are 1080+ px wide
**and viewed small on phones**, so fonts must be roughly 2× deck sizes.
Minimum body text on any social asset: 32px. If you reuse a deck slide's
HTML, scale every font-size, padding, and gap up ~2× first.

## Story Safe Areas (`ig-story`, 1080×1920)

Platform UI covers the top and bottom of stories. Keep all critical content
(headline, CTA, logo) inside the middle band:

- Top 220px: avatar + username overlay — background only.
- Bottom 280px: reply box / swipe-up — background only.

The templates below already respect this via padding.

## Ready-to-Use Templates

Copy and fill in the bracketed values. Default styling matches the deck
language (black background, Poppins, `#00E5FF` accent) — a linked design
system's tokens override these.

---

### Square Post (`ig-square`, 1080×1080)

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

---

### Portrait Post (`ig-portrait`, 1080×1350)

```html
<div class="fmd-slide" style="padding: 100px 90px; display: flex; flex-direction: column; justify-content: flex-start; gap: 48px; font-family: 'Poppins', sans-serif;">
  <div style="font-size: 26px; font-weight: 700; letter-spacing: 4px; text-transform: uppercase; color: #00E5FF;">[LABEL]</div>
  <h1 style="font-size: 104px; font-weight: 900; color: #fff; line-height: 1.05; letter-spacing: -3px; margin: 0;">[HEADLINE]</h1>
  <div class="fmd-img-placeholder" style="width: 100%; flex: 1; border-radius: 24px;">[IMAGE DESCRIPTION]</div>
  <div style="display: flex; align-items: center; justify-content: space-between;">
    <span style="font-size: 32px; color: rgba(255,255,255,0.65);">[SUPPORTING LINE]</span>
    <span style="font-size: 30px; font-weight: 700; color: #00E5FF;">[CTA]</span>
  </div>
</div>
```

---

### Story / Reel (`ig-story`, 1080×1920 — safe-area padding built in)

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

### Wide Banner (`og-banner` 1200×628 / `x-post` 1600×900)

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

For `linkedin-banner` (1584×396) drop the image column, use a single row:
label left, headline center (56px), logo/handle right, padding `60px 90px`.

## Campaigns — one brief, several formats

For "make a campaign for X":

1. Write the shared copy block once: headline, supporting line, CTA.
2. Create one social project; add one asset per requested format
   sequentially (`ig-square` → `ig-story` → `og-banner` unless the user
   specified formats).
3. Re-compose per canvas: square centers the headline block, story stacks
   with the CTA pill, banner goes side-by-side with the image.
4. Generate imagery once (see `slide-images` /
   `image-generation-via-a2a`) and reuse the same image or style reference
   across formats for cohesion.
5. Point the user to Export → "Download all as ZIP" for the finished set.

## Adapting an existing asset to another format

"Turn this post into a story": call `get-deck` to read the source HTML,
then `add-slide` with the target `--sizePreset` and **rewritten** HTML —
keep copy, colors, and image URLs; re-derive the layout for the new
geometry (see Campaigns rule 3). Iterate on the fit check like any slide.
