# The public website (`website/`)

A prerendered React site for NTS Digital Solutions' school management system. It is **served by the same Render
service as the app** — no second service, no extra cost. Claims on it are limited to what `docs/product-audit.md` verifies.

## How it fits together

```
website/                 React + Vite, prerendered to static HTML at build time
  src/site.ts            company/product name, contact details, navigation — change them here only
  src/content/           module/feature/role content and FAQ (the single source for page copy)
  src/pages/             pages;  src/components/  header, footer, hero scene, FAQ, forms
  src/routes.ts          every prerendered route (also drives the sitemap)
  scripts/prerender.mjs  renders each route to dist/<route>/index.html + routes.json, sitemap.xml, robots.txt
  scripts/preview.mjs    tiny static server for looking at dist/ locally (fakes the enquiry endpoint)
```

Build: `cd website && npm ci && npm run build` → `website/dist/`. In the Docker image (`Dockerfile`, stage `website`):

- `dist/**/index.html` + `routes.json` → `backend/website_dist/` (served by `apps/common/spa.py`)
- `dist/site-assets/` (hashed JS/CSS/fonts), `sitemap.xml`, `robots.txt`, `og-image.png`, `nts-logo-small.png` → `frontend_dist/` (served by WhiteNoise)

`spa_index` serves a website page **only** if its path is in `routes.json`; every other path is the school app, exactly
as before. Website assets live under `/site-assets/` because the app owns `/assets/`. App entry points for visitors:
`/find-school` and `/login`. Words the website uses as paths are reserved so no school can take them as a slug.

## Content security policy

The site is served under the app's strict CSP: no inline scripts or styles, no third-party hosts. Fonts are self-hosted
(`@fontsource/poppins`), JSON-LD blocks are data, not scripts. Do not add analytics, tag managers, embeds or web fonts
from other hosts without changing the policy deliberately (and the privacy/cookie pages, which currently say there are none).

## Enquiries (demo requests and contact messages)

`POST /api/v1/public/enquiries/` (`apps/enquiries`): no login; honeypot field `website`; rate limit `public_enquiry`
(6/hour per client); validated server-side; **saved first**, then e-mailed to `ENQUIRY_NOTIFY_EMAIL` through Brevo.
The page shows success only after the row exists. `email_status` records `sent` / `failed` / `not_configured`.
NTS staff read and mark them in the platform console → **Website enquiries** (`/platform/enquiries`).

## Environment

| Variable | Where | Purpose |
|---|---|---|
| `VITE_SITE_URL` | Docker build arg / website build env | Public origin for canonical links, Open Graph, sitemap, robots. Default is the Render URL. Set to the custom domain when there is one. |
| `ENQUIRY_NOTIFY_EMAIL` | Render env | Where enquiries are e-mailed (default hello@ntsdigitalsolutions.com) |
| `BREVO_API_KEY`, `BREVO_SENDER_EMAIL` | Render env | Needed for the e-mail step; without them enquiries are still stored |

## Working on it

```bash
cd website && npm install
npm run dev        # Vite dev server on :5180, proxies /api to :8000
npm test           # page metadata, links, headings, honest-claims guard, forms
npm run build      # typecheck + client + SSR build + prerender
npm run preview    # serve dist/ on :4181
npm run check-links
```

Regenerate `public/og-image.png` from `scripts/og-source.html` (see the comment at its top).

## Deliberately not done / needs a human

- **Legal pages are drafts for legal review**; the data-retention period is a placeholder.
- No custom domain is configured; DNS and the production domain are the owner's to change.
- No customer logos, testimonials, case studies, prices or certifications — none are verified.
- No independent accessibility audit; the accessibility page states the aim and known limits.
- Sitemap submission to search engines is a manual step once the final domain is live.

## Verification record (10 October 2026)

| Check | Result |
|---|---|
| `npm test` (website) | 11 passed — page metadata unique/sized, one `h1` + `main` per page, canonical + JSON-LD, internal links resolve, no inline script/style, no unverifiable claims, forms (validation, success only after server confirms, failure keeps input) |
| `npm run check-links` | 26 pages, 0 broken links |
| `tsc --noEmit`, `oxlint` | clean |
| Backend: `apps/enquiries` + `apps/common/test_marketing.py` + `test_pwa.py` | 17 + 8 passed (valid/invalid enquiries, honeypot, rate limit, e-mail sent/failed/not configured, platform list/mark handled, marketing route serving, no arbitrary file reads) |
| Frontend app: vitest, `tsc -b`, `oxlint` | 33 tests passed, clean |
| Lighthouse 12 (Edge headless, mobile emulation, simulated slow 4G) against the built site with gzip + long-cache headers | Home: **performance 99, accessibility 100, best practices 100, SEO 100** (LCP 2.0 s, CLS 0, TBT ≈ 30 ms). `/features/finance`: 99 / 100 / 100 / 100. `/legal/privacy`: 99 / 100 / 100 / 100. `/request-demo`: 98 / 100 / 100 / 100. |

Caveats: Lighthouse ran against a local static server that imitates production headers, **not** against Render; real
results depend on the network and the host. Lighthouse's accessibility score is automated and covers only part of WCAG 2.2 AA.
Manual checks done: keyboard-operable header menu (open, Escape, navigate), focus moves to `main` after navigation, form
errors focus the first invalid field, no horizontal scroll at 375 px, no console errors. **Not** done: screen-reader
testing with NVDA/VoiceOver, testing on real phones, an independent accessibility audit, cross-browser testing beyond Edge.
