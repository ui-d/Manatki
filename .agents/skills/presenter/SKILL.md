---
name: presenter
description: The two-pane presenter stage — preview variants, per-slide screenshot grids, image decks, and the actions that control them from chat. Read before handling requests about presenting, preview styles, screenshots beside slides, or importing folders of images.
---

# Presenter stage

Besides the template's single-slide playback, this app has a **two-pane
presenter stage** ported from the original standalone slideshow: the current
slide renders sharp on the left, and a treated preview of the *next* slide
sits on the right.

- Route: `/deck/:id/present?mode=stage`. It is the **default** for image
  decks (every slide `kind: "image"`); HTML decks default to the template's
  playback and can opt in with `?mode=stage`. `?mode=slides` forces the
  template playback.
- The deck always closes on a generated "Thank you." slide (never stored).
- Keyboard: arrows/Space navigate, `F` fullscreen, `V` cycles preview
  variants, `T` presenter timer, `Esc` exits to the editor.

## Preview variants

How the upcoming slide's pane is treated. Persisted per user (setting key
`presenter`, field `variant`) with a localStorage mirror.

| Variant | Look |
| --- | --- |
| `combo` (default) | Smaller labelled "NEXT" thumbnail, lightly frosted, sinking into shadow |
| `soft` | Full-size, lightly frosted |
| `dim` | Full-size, sharp, desaturated behind a veil |
| `fade` | Full-size, sharp, sinking into shadow toward the screen edge |
| `card` | Smaller sharp labelled "NEXT" thumbnail |

Actions: `set-presenter-variant { variant }` writes it ("switch the preview
style to card"), `get-presenter-variant` reads it.

## Per-slide screenshots

A slide may carry `screenshots: string[]` (hosted URLs). While that slide is
presented, the right pane shows them as a sharp grid instead of the next-slide
preview; clicking one magnifies it and arrow keys walk the set.

- Action: `attach-slide-screenshots { deckId, slideId, screenshots, mode }`
  with `mode: "replace" | "append"`. Files must be uploaded first (they need
  hosted URLs). Pass `[]` with `replace` to clear.
- Editor UI: Slide tools → "Presenter screenshots".
- Users can also ask things like "attach these dashboards to slide 3" — upload
  the images, then call the action with the resulting URLs.

## Image decks

`import-images-deck { title, images: [{ url, name, screenshots? }] }` creates
a deck where each slide is one full-bleed image (`kind: "image"`,
`layout: "full-image"`, `imageUrl`), ordered by natural filename sort.
Folder convention in the UI importer: files directly in the chosen folder are
slides; a subfolder named after a slide's basename (`2/` next to `2.png`)
holds that slide's screenshots.

Slide fields involved (additive, validated in `patch-deck`):
`kind?: "html" | "image"`, `screenshots?: string[]`.
