# Slideshow

**Live app: [slideshow-app-uids-projects-f4e05740.vercel.app](https://slideshow-app-uids-projects-f4e05740.vercel.app)**

An open-source, agent-native presentation app. Generate decks from a prompt with
your own OpenAI API key, edit slides visually or from chat, drop in a folder of
images as a ready-to-present deck, and present with a distinctive two-pane
presenter stage.

Built on [agent-native](https://github.com/BuilderIO/agent-native) and its
slides template — everything you can do in the editor, the agent can do from
chat too: "add a slide about pricing", "reorder slides", "attach these
screenshots to slide 3", "switch the preview style to card".

## Features

- **Agentic editing** — a chat agent with full access to the deck: create,
  edit, reorder, theme, and illustrate slides from natural language.
- **Bring your own key** — add your OpenAI API key in Settings; it is stored
  encrypted per user and used for slide and image generation. The hosted
  version needs no server-side AI keys.
- **Two-pane presenter stage** — current slide sharp on the left, a treated
  preview of the next slide on the right, with five preview styles
  (`combo`, `soft`, `dim`, `fade`, `card`) cycled with `V`.
- **Screenshot grids** — attach supporting screenshots to any slide; they
  replace the preview pane as a sharp grid, with click-to-magnify and
  arrow-key walkthrough.
- **Image decks** — drag a folder of images in and it becomes a deck
  (a subfolder named after a slide holds that slide's screenshots).
- Presenter timer (`T`), fullscreen (`F`), auto-appended closing slide,
  keyboard-first navigation.
- Everything from the slides template: visual editor, imports (PDF/PPTX/DOCX/
  URL), exports (PPTX/HTML), design systems, versions, comments, share links.

## Presenter controls

| Key | Action |
| --- | --- |
| `→` `↓` `Space` `PgDn` | Next slide |
| `←` `↑` `PgUp` | Previous slide |
| `Home` / `End` | First / last slide |
| `F` | Fullscreen |
| `V` | Cycle preview style |
| `T` | Presenter timer |
| Click screenshot | Magnify; `←`/`→` walk the set; `Esc` close |

## Develop locally

```bash
pnpm install
pnpm dev
```

Runs at http://localhost:8080 with a local SQLite database and auth disabled
(`AUTH_DISABLED=true` in `.env`). Add keys in `.env` or through the in-app
Settings panel — see `.env.example`.

## Deploy (Vercel)

The app deploys to Vercel with the Nitro `vercel` preset:

- **Database:** Neon Postgres (`DATABASE_URL`)
- **File storage:** Vercel Blob (`BLOB_READ_WRITE_TOKEN`)
- **Auth:** Better Auth with GitHub OAuth (`GITHUB_CLIENT_ID`,
  `GITHUB_CLIENT_SECRET`, `BETTER_AUTH_SECRET`)
- **AI:** none required server-side — users bring their own OpenAI key.
  Optionally set `GEMINI_API_KEY` as a shared fallback for image generation.

Self-hosters can swap Vercel Blob for S3/R2 by registering a different upload
provider (`server/plugins/file-upload.ts`), and use any SQL database Drizzle
supports.

## License

[MIT](./LICENSE)
