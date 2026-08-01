# Production Operations

Checklist and runbook for running Manatki in production (Vercel + Neon).

## Required environment (production)

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Neon Postgres connection string |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob for slide images/uploads |
| `BETTER_AUTH_SECRET` | Better Auth session signing |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | GitHub OAuth sign-in |

Optional but recommended:

| Variable | Purpose |
| --- | --- |
| `SENTRY_DSN` | Server error tracking (`server/plugins/sentry.ts`; no-op without it) |
| `AGENT_PROMPT_CACHE_TTL=1h` | Anthropic prompt caching — ~10x cheaper repeated-prefix input on active agent threads |
| `GEMINI_API_KEY` | Server-wide image-generation fallback |

Never set in production:

- `AUTH_DISABLED` — the server **refuses to boot** if this is set in a
  production runtime (`server/plugins/production-guards.ts`). It would log
  every visitor in as the auto dev account.

## Error tracking & uptime

- **Errors**: set `SENTRY_DSN`. Events are tagged with `request_id`
  (`x-agent-native-request-id`), which also appears in Vercel function logs —
  use it to correlate.
- **Uptime**: point an external monitor (UptimeRobot, Better Stack, or a
  Vercel cron hitting itself) at the DB health probe. The `db-health` action
  (`actions/db-health.ts`) verifies a live database round-trip; a plain
  `GET /` only proves the CDN is up.
- **Web analytics**: `@vercel/analytics` is wired on the landing pages
  (`app/pages/landing/chrome.tsx`); enable Web Analytics on the Vercel
  project for it to record.

## Rate limiting (Vercel WAF)

The app has no in-process rate limiting; use Vercel WAF custom rules
(Project → Firewall). Suggested starting rules:

| Path | Suggested limit | Why |
| --- | --- | --- |
| `POST /api/share` | 30/hour per IP | Unlimited share-link minting |
| `POST /api/uploads` | 60/hour per IP | 20 files × 50 MB per request |
| `POST /api/share/*/events` | 300/hour per IP | Anonymous analytics beacon |
| `POST /_agent-native/*` (chat) | 120/hour per IP | LLM spend amplification |

Static asset and share-page GETs are cheap; leave them to Vercel's DDoS
mitigation.

## Database backup & restore (Neon)

- Neon keeps point-in-time restore history; the window depends on plan
  (Free ≈ 6 hours, Launch ≈ 7 days, Scale ≈ 30 days). Verify the project's
  history retention in the Neon console — the app stores every deck in
  `decks.data`, so the PITR window IS the backup story.
- **Restore drill** (do this once before launch): Neon console → Branches →
  "Restore" from a timestamp → creates a branch; point a preview deployment's
  `DATABASE_URL` at the branch and verify decks load. Restoring production is
  the same operation plus swapping `DATABASE_URL`.
- For an off-Neon copy, schedule `pg_dump` (GitHub Actions cron with
  `DATABASE_URL` secret) to object storage. Not required at small scale, but
  cheap insurance against account-level incidents.
- Migrations are forward-only (`server/plugins/db.ts`); a bad migration is
  rolled forward with a new version, not reverted.

## Search indexing

The production domain (manatki.xyz) must serve the landing page without
`X-Robots-Tag: noindex`. Vercel serves `noindex` automatically on
`*.vercel.app` URLs — verify with `curl -sI https://manatki.xyz | grep -i
robots` after domain changes; nothing should match.

## Free Claude tier (app-provided key)

Setting `ANTHROPIC_API_KEY` on the deployment makes every signed-in user's
agent chat run on that key (Claude Sonnet 5 by default). The spend controls
below make that safe to offer.

### Per-user monthly budget (the hard ceiling)

`server/lib/free-tier.ts`, enforced in HTTP middleware
(`server/middleware/free-tier.ts`) which returns a clean 402 with the
user-facing message before the chat handler runs, plus a spend backstop in
the agent-chat `prepareRequest` hook for non-HTTP run-spawn paths:

- Activates automatically whenever an app-level provider key
  (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, …) is present. BYO-only
  deployments are unaffected.
- Default budget: **$3/user/month** (`FREE_TIER_MONTHLY_BUDGET_CENTS=300`).
  Set `0` to disable enforcement (uncapped spend — not recommended).
- Users who saved their own key in Settings are exempt; over-budget users
  get a 402 telling them the allowance resets on the 1st and pointing them
  to Settings → AI to add their own key.
- The check runs per message, not mid-run, so a run in flight can overshoot
  by one run's cost — bound that with the loop caps below.

### Loop caps (bound the worst-case single run)

Read directly by `@agent-native/core` (defaults: 400 iterations, 20M input
tokens per run — far too generous for owner-paid keys):

```
AGENT_MAX_ITERATIONS=120          # model calls per user turn
AGENT_MAX_RUN_INPUT_TOKENS=3000000
SLIDES_RUN_SOFT_TIMEOUT_MS=480000 # background-run ceiling, default 13 min
```

Users/orgs can still tune their own loop settings via the
`manage-agent-loop-settings` tool; the dollar budget stays the backstop.

### Cost levers

- `AGENT_PROMPT_CACHE_TTL=1h` — Anthropic prompt caching, ~10x cheaper
  repeated-prefix input. Set it.
- `AGENT_ENGINE_PREFER_BYO_KEY=1` — user-saved keys win over the Builder
  gateway, so BYO users never accidentally bill the shared path.
- Default model: the deployment default is `claude-sonnet-5`
  (~$0.30–$2/deck conversation). To stretch the free budget ~5x, set the
  app-wide default to Haiku once via the settings engine picker or the
  `manage-agent-engine` action (stores `{engine: "anthropic", model:
  "claude-haiku-4-5-20251001"}`). Note this default is deployment-wide, not
  per-user — users can still pick a bigger model, but the dollar budget
  caps the owner's exposure either way.

### Rough economics

Fixed base ≈ $25–45/mo (Vercel Pro + Neon + Blob). With a $3 budget and
caching, worst-case AI spend is `$3 × monthly active free users`; typical
spend is far lower. Watch actuals in the `token_usage` table or
`GET /_agent-native/usage`.
