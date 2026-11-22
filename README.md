# BetTracker

Personal bet tracker: fast manual logging (quick-add line, autocomplete everywhere, keyboard settle queue) and stats.
Next.js + Tailwind on Vercel, data in Turso (free tier). Dark theme, BRL, dates as dd/mm/yyyy.

## Run locally

```
npm install
npm run dev        # http://localhost:3000, data in data/local.db, no password
```

## Environment (Vercel → Project → Settings → Environment Variables)

| Name | What |
| --- | --- |
| `TURSO_DATABASE_URL` | `libsql://<db>-<org>.turso.io` |
| `TURSO_AUTH_TOKEN` | Turso database token |
| `APP_PASSWORD` | the one password to log in (the site is locked without it) |

## Tests

`npm test` (unit + database), `npm run e2e` (Playwright on a local build), live e2e in CI after each deploy.
Rules for working on this repo: `CLAUDE.md`.
