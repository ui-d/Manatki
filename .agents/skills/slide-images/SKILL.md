---
name: slide-images
description: Image generation workflow -- generate-image, search-images, and search-logos actions. Style reference patterns.
---

# Slide Images

Images for slides are generated or sourced via three scripts. The agent delegates image generation through the agent chat for conversational follow-up.

## Scripts

| Script | Purpose | Example |
|--------|---------|---------|
| `generate-image` | Generate images (Gemini/OpenAI/auto) | `pnpm action generate-image --prompt "hero image" --model auto --count 3` |
| `search-images` | Search Google Images via the configured provider | `pnpm action search-images --q "Acme logo transparent" --count 5` |
| `search-logos` | Resolve company domains and canonical logo URLs | `pnpm action search-logos --q "Acme"` |
| `image-gen-status` | Check configured image providers | `pnpm action image-gen-status` |

## Image Generation Flow

The standard workflow for generating slide images:

1. User clicks "Image" in the editor or asks the agent
2. Agent runs `pnpm action generate-image --prompt "..." --count 3`
3. Agent shows each variation as an inline rendered preview using markdown
   image syntax (`![Variation 1](url)`), not a plain link (`[Variation 1](url)`)
   — the chat renders `![]()` as an actual image but `[]()` as a bare link
4. User picks a favorite
5. Agent writes the chosen image into the slide content
6. User can follow up: "make it darker", "try a different angle"

### generate-image Options

```
--prompt              Image description (required)
--model               Provider: gemini | openai | auto (default: auto — tries both)
--slide-content       HTML content of the current slide
--deck-id             Deck ID to load full deck text as context
--slide-id            Slide ID within the deck
--size-preset         Target canvas preset (e.g. ig-story) — see shared/slide-size.ts
--width / --height    Explicit target canvas in px
--quality             OpenAI quality hint: low | medium | high
--mode                asset (default) | poster — poster generates FULL-CANVAS
                      artwork that IS the finished background (use for
                      full-visual social assets)
--overlay-zone        Poster-only: bottom | top | center | none — the zone
                      where HTML copy will overlay is kept visually calm
--allow-text-in-image Opt-in: render the prompt's exact text inside the image.
                      Only when the user explicitly asks for text in the
                      artwork; warn that it won't be editable or lintable
--design-system-id    Ground style in this design system (default: the deck's
                      linked system, then the workspace default)
--reference-image-urls  Comma-separated URLs of extra reference images
--count               Number of variations (default: 1)
--output              Output file path prefix
```

Default style reference images from `shared/api.ts` are always included.

### Canvas-aware generation

**Always pass the asset's canvas when generating for a social asset**: either
`--size-preset <id>` / `--width`+`--height`, or just `--deck-id` + `--slide-id`
(the slide's own `size` is used automatically). The image is generated at the
nearest provider-supported aspect ratio, so a story asset gets a 9:16 image
instead of the provider's default landscape. Residual ratio mismatch is
absorbed by `object-fit: cover` cropping — for extreme strips (`ad-leaderboard`,
728×90) don't generate full-bleed art at all; use a background texture and let
the crop land where it may.

### Brand grounding

Generation is grounded in the deck's linked design system automatically
(palette, typography feel, imagery style description, brand reference
images). Pass `--design-system-id` to override, and prefer the Images-app
A2A path when configured — it grounds in the full brand library.

## Backgrounds (full-bleed cover image)

To set an image as a slide's full-bleed background — the editor's
"Set as background" button and the poster workflow both use this shape —
insert it as the FIRST child of `.fmd-slide` (which needs
`position: relative`):

```html
<img class="fmd-img-uploaded fmd-bg-image" src="[HOSTED URL]" alt="[ALT]"
     style="position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; z-index: -1;">
```

If text overlays the imagery, add a scrim right after the image:

```html
<div class="fmd-bg-scrim" style="position: absolute; inset: 0; background: linear-gradient(180deg, rgba(0,0,0,0) 45%, rgba(0,0,0,0.55) 100%); z-index: -1; pointer-events: none;"></div>
```

Swap `src` on the existing `.fmd-bg-image` instead of stacking a second
background layer. For full-visual social assets see the "full-visual"
section of `create-social-assets`.

## Logo Lookup

Two options for company logos:

**Option 1: canonical logo search** (uses Logo.dev search when configured and a bounded domain fallback otherwise):
```bash
pnpm action search-logos --q "Acme"
```

Use a returned `logoUrl` directly. Do not call a second logo-provider action for
each result.

**Option 2: Google Image Search** (fallback):
```bash
pnpm action search-images --q "Acme logo transparent" --count 5
```

## Important Rules

- Always include style references for visual consistency
- Use `.fmd-img-placeholder` divs in slides before real images are generated
- Use one canonical provider action per conceptual search; do not loop legacy
  provider scripts or manually guess provider URLs
- After inserting an image, update the deck via the API
