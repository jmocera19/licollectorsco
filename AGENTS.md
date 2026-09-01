# AGENTS.md

Marketing site for Long Island Collectors Co. (licollectorsco.com) — React 19 + Vite +
TypeScript + Tailwind SPA deployed to Cloudflare Pages. Node 22 (see `.nvmrc`).

## Commands

- `npm run build` is the verification step: `tsc -b` (typecheck) → `vite build` → prerender
  blog SEO pages. There is no standalone typecheck or test script and no CI. Use
  `npm run build` to verify any changes.
- `prebuild` auto-runs `generate:sitemap`, which regenerates `public/sitemap.xml` from
  `src/posts.json` — never hand-edit the sitemap.
- `npm run lint` — ESLint over `**/*.{ts,tsx}` only; manager and script JavaScript files
  are not linted.
- `npm run preview` serves `dist/` without Cloudflare Pages functions, so middleware
  behavior (www redirect, trailing-slash stripping) won't apply locally.

## Architecture

- `src/posts.json` is the single source of blog content (markdown in `body`, rendered by
  `src/pages/BlogPost.tsx` via react-markdown). New posts need no code changes — build
  scripts pick them up automatically.
- `src/data.json` holds site content:
  - `vault` — eBay "vault" items (rendered by `src/components/Vault.tsx`)
  - `livestream` — the `isLive` flag, platform, and stream URL (used by
    `src/components/StreamBanner.tsx`)
  - `grading` — title and description for the grading services section
  Preserve all three sections when editing this file.
- Manage vault items via `node scripts/add-to-vault.js <eBayItemIds...>` (requires `.env`
  with `EBAY_CLIENT_ID`/`EBAY_CLIENT_SECRET`) or the manager app.
- `scripts/prerender-pages.js` string-replaces the `<!-- SEO:START -->…<!-- SEO:END -->`
  block in `index.html` to write static `index.html` files for `/blog` and every post
  slug. The build FAILS if the markers are missing — do not remove them.
- `src/components/Seo.tsx` updates the same `data-seo`-tagged head elements client-side;
  keep it in sync with the prerender script's block.
- Google Analytics (GA4) is initialized at app root via `src/utils/useAnalytics.ts`
  (`react-ga4`). The measurement ID comes from `VITE_GA_MEASUREMENT_ID` (set in local
  `.env` or the Cloudflare Pages environment). Page views track route changes; eBay
  outbound and `mailto:` link clicks are captured as events.
- `manager/` is a separate Electron app with its own `package.json` (`npm install` and
  `npm start` inside `manager/`). It edits `src/data.json`/`src/posts.json`; its
  "Sync Live" button is a single main-process workflow that verifies `main` is
  synchronized with `origin/main`, rejects pre-existing staged or unrelated
  modified/untracked files, regenerates the sitemap, and allows only
  `src/data.json`, `src/posts.json`, and `public/sitemap.xml`. It fingerprints and
  displays the complete managed diff, confirms before staging/committing/pushing,
  stages only approved paths, commits `Content update: YYYY-MM-DD`, and uses plain
  `git push origin main` without force options. Cancellation or blocking may leave
  `public/sitemap.xml` regenerated on disk but never commits or pushes.
- The canonical domain is `licollectorsco.com` (`https://licollectorsco.com` in URLs) and
  is hardcoded in several places (scripts, `Seo.tsx`, `App.tsx`, and
  `functions/_middleware.js`) — change all occurrences together.

## Deploy

- Pushing to `main` deploys to production (Cloudflare Pages git integration).
- **Never run `git push`, trigger a production deployment, or use the manager's "Sync
  Live" button without my explicit approval in the current conversation.**
- **Check `git status --short` before staging anything. Never stage or commit unrelated
  changes.**
- `functions/_middleware.js` is a Pages Function: 301s `www`→apex, strips trailing
  slashes, and serves prerendered `/blog/**/index.html` directly instead of SPA fallback.
