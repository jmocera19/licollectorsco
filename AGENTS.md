# AGENTS.md

Marketing site for Long Island Collectors Co. (licollectorsco.com) — React 19 + Vite +
TypeScript + Tailwind SPA deployed to Cloudflare Pages. Node 22 (see `.nvmrc`).

## Commands

- `npm run build` is the primary verification step: `tsc -b` (typecheck) → `vite build` →
  prerender blog SEO pages. There is no CI. Use `npm run build` plus `npm test` to verify
  changes. `npm test` runs the Node behavior tests in `tests/`.
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
- `shared/seo.js` is the single source of titles, canonical URLs, social tags, and JSON-LD.
  The browser (`src/components/Seo.tsx`) and build scripts (`scripts/prerender-pages.js`,
  `scripts/generate-sitemap.js`) both import it. Change metadata there, not in page
  components or `index.html`; `tests/seo.test.js` checks the static home block against it.
- `shared/content.cjs` is the shared content contract: post/vault validation, atomic JSON
  writes, stale-write detection, and pure publish/delete/vault mutations. The Manager
  (`manager/main.js`) and scripts (`scripts/add-to-vault.js`, `scripts/prerender-pages.js`,
  `scripts/generate-sitemap.js`) all use it. Builds fail on invalid `src/posts.json`, and
  Manager saves reject a file that changed after it was read instead of overwriting it.
- `src/data.json` holds site content:
  - `vault` — eBay "vault" items (rendered by `src/components/Vault.tsx`)
  - `livestream` — the `isLive` flag, platform, and stream URL (used by
    `src/components/StreamBanner.tsx`)
  - `grading` — title and description for the grading services section
  Preserve all three sections when editing this file.
- Manage vault items via `node scripts/add-to-vault.js <eBayItemIds...>` (requires `.env`
  with `EBAY_CLIENT_ID`/`EBAY_CLIENT_SECRET`) or the manager app. The reusable importer
  is `shared/ebay-import.cjs`; the CLI only loads `.env`, prints progress, and emits the
  `__VAULT_RESULT__` summary line the Manager parses.
- `scripts/prerender-pages.js` string-replaces the `<!-- SEO:START -->…<!-- SEO:END -->`
  block in `index.html` to write static `index.html` files for `/blog` and every post
  slug. The build FAILS if the markers are missing — do not remove them.
- `src/components/Seo.tsx` applies the same shared metadata to the `data-seo`-tagged head
  elements client-side; `shared/seo.js` is the source both it and the prerender script use.
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
  `public/sitemap.xml` regenerated on disk but never commits or pushes. The workflow
  lives in `manager/sync.js` with injected Git/Node/confirmation adapters; tests run
  it against temporary repositories. `manager/mutation-lock.js` serializes sync,
  import, publish, delete, and removal in the main process.
- Manager styling is generated, not remote: CSS sources are `manager/index.html`,
  `manager/renderer.js`, `manager/tailwind.config.cjs`, and `manager/input.css`;
  regenerate with `npm run generate:manager-css` (root, local Tailwind binary) whenever
  Manager Tailwind classes change. `manager/styles.css` is generated, committed output —
  never hand-edit it. The Manager loads no remote scripts, stylesheets, or fonts, and
  its renderer enforces a CSP (`script-src 'self'`, no `unsafe-inline`/`unsafe-eval`).
  Manager runtime verification: `npm run generate:manager-css`, `node --check` on the
  Manager JavaScript, and `npm start` inside `manager/`.
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
  slashes, serves prerendered `/blog/**/index.html` directly, and returns `404.html` with
  status 404 for other page navigations. Non-HTML requests pass through to assets.
  `scripts/prerender-pages.js` writes that noindex `dist/404.html`; `src/App.tsx` has a
  catch-all route for client-side navigation to unknown pages.
