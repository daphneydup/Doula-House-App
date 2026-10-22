# Doula's House — website prototype

A marketing site, merch store, scholarships, real **sign-in with CRUD**, testimonials, and a care app where **mom, doula and clinician accounts share real data** under the mother’s control.

```bash
cd doulas-house
npm start            # http://localhost:4173  (Node 18+, zero dependencies)
npm test             # 21 authorization tests + a 12-step three-account test over real HTTP
```

`npm start` runs `server/server.js`: it serves the site **and** a small JSON API with real accounts. No `npm install` needed.

Prefer no server? Open `index.html` or serve the folder with any static server (`python3 -m http.server`). The site detects there is no API and switches to a **browser-only demo mode** (accounts and data live in that browser's localStorage). Same screens, same validation — just not shared or secure.

## Pages

| File | What it is |
| --- | --- |
| `index.html` | Home: hero, the gap, audiences, **testimonials**, consent demo, billing, shop, guardrails, Q&A |
| `about.html` | **About us** — mission, the data on maternal mortality/morbidity, where care breaks down, our five coordinated-care commitments, evidence, measures, sources |
| `stories.html` | Testimonials with filters; signed-in users can submit their own |
| `login.html` / `account.html` | Sign in & create account · profile, security, my stories, staff tools |
| `coverage.html` | **Insurance & doula coverage** — which major insurers support doula services (Medicaid, UnitedHealthcare, Anthem, EmblemHealth…), a plan/state checker, private-insurance state mandates, sources and verify-with-your-plan guidance. Data lives in `js/coverage-data.js` |
| `explore.html` | **Brand options (round 3)** — six logo directions that avoid the “dh reads as oh” problem, eight names with search-conflict flags, three palettes, and a live mock-up with a pick list |
| `brand.html` | **Brand identity book** — strategy, the “dh” mark and its construction, colour (with computed WCAG contrast), type, graphic language, imagery, voice, applications, architecture, downloadable assets |
| `app.html` | **The care app** (requires sign-in): mom, doula and clinician each see their own side of the same shared records |
| `shop.html` | Merch (photoreal mockups), cart, donate, scholarships |
| `families.html`, `doulas.html`, `care-teams.html`, `trust.html`, `design-system.html` | Audience, privacy and design-system pages |

## Login & CRUD

**Accounts** (`/api/auth/*`, `account.html`): *Create* (sign up) · *Read* (me, activity log) · *Update* (profile, email — needs password, password change) · *Delete* (account, needs password; cascades to the user's workspace and stories).

**Stories / testimonials** (`/api/testimonials`): users create, edit and delete their own; new or edited stories are held **In review** until staff approve them (Account → Staff · Stories). Only approved stories are public.

**Staff** (`/api/admin/users`): list users, change roles, delete users.

## Shared care: how mom, doula and clinician share data

Every care record is a real, server-side object owned by the mother. Other accounts reach it only through the rules in **`js/care-core.js`** — one implementation used by the Node server *and* the browser-only fallback, so the two can’t drift apart.

| Who | What they can do |
| --- | --- |
| **Mom** | Writes her plan (10 sections + her own). Adds people to her care team **by email** (existing accounts are added instantly with *nothing* shared; new emails get a pending invitation that converts when they register) or accepts introductions from the directory. Grants access **section by section** with an end date, removes anyone instantly, sees an **access log** of every view/edit/grant, exports or deletes her data. |
| **Doula** | Sees the mothers who added her — only the sections granted, never clinical ones. Keeps **private notes**, messages the team, adds visits to the shared calendar, requests a provider recommendation, and bills (**claims can’t be submitted until coverage, a recommendation and her credentials are in place**). |
| **Clinician** | Sees patients who shared with her (including clinical sections if granted), **acknowledges** the plan (goes stale if the mother edits), issues recommendation requests, and can use **break-glass** (clinical sections only, 24h, reasoned, rate-limited, shown to the patient). |

**Enforced on the server, never in the UI:** nobody reads a plan she hasn’t been granted · clinical sections can only be granted to clinicians · grants expire and removal ends access (and conversation access) immediately · a re-added person starts with nothing shared · conversations are visible only to their members · private notes are private to their author · every non-owner view is logged to the mother · introductions reveal only first name, city and due month.

**See it yourself:** sign in as a demo mom, change what you share, then use **Switch demo account** (top of the app) to become the doula or clinician and watch their view change. Or register your own mom, doula and clinician accounts and connect them by email.

**Tests:** `npm test` — the core suite (and I mutation-checked that it fails when each critical rule is broken) plus an HTTP test with three real registered sessions, including forged-origin, stranger and wrong-role attempts.

**Honest limits:** data refreshes by polling every 12s (no websockets); invitations don’t send email (they convert when that address registers); there is no partner/family-member role yet; break-glass answers the same whether or not an email exists, but invites can reveal whether an address has an account — fine for a prototype, tighten before launch; in browser-only mode every account lives in one browser, so it demonstrates the rules but isn’t shared across devices.

### Demo accounts (development only)

Four throwaway accounts (mom, doula, clinician, staff) are seeded on first run. Their emails and passwords live in `server/seed.json` and `DEMO_ACCOUNTS` in `js/auth.js` — the login page shows "Try a demo account" buttons. **Delete both before any real deployment.** Data is stored in `server/data/db.json` (git-ignored); delete that file to reset everything.

## Identity (v3 — the Doorway Bloom)

Brand idea: **one circle of care around every mother.** The mark is the **Doorway Bloom**: an open doorway (the care team’s welcome) holding a heart (the mother) above a lotus (resilience and rebirth), standing on a ground line (the doula’s steadiness). It replaced the v2 “dh” monogram, which read as “oh”. Its spectrum version colours the three strands — **Clay** heart and lotus (family), **Honey** ground (doula), **Dawn** doorway (clinician).

- 100 × 100 grid, 11-unit stroke; the lotus has five petals separated by true **mask cut-outs**, so it works on any colour or photograph. The lotus also stands alone as the **lotus emblem** (`DH.lotus()`) for pockets, patches and small marks.
- Name and palette are unchanged for now (Doula’s House, Rooted palette); `explore.html` still holds the other name and palette options.
- Type: **Fraunces** (voice) · **Instrument Sans** (clarity) · **Antonio** (slogans only). Accessible by default: Clay is `#aa4f36` (4.7:1 on Cream).
- The full book is `brand.html`; vector assets (marks, lotus emblems, lockups, app icons, favicon) are in `assets/brand/` and `assets/favicon.svg`; components in `design-system.html`.
- `DH.mark(cls, { variant, main, heart, lotus, arch, ground })` and `DH.lotus(cls, { color })` in `js/site.js` are the single sources for the mark in code.

## Merch

`js/merch.js` renders each product in pure SVG, modelled on the **construction** of the reference pieces (not the retail photos): a **wrap-front maternity tee** (slub knit, layered panel), a **raglan tunic hoodie** (kangaroo pocket, side vents), a **drop-shoulder half-zip fleece** (fold-over collar, ribbed hem), a **lap-shoulder bodysuit whose patch pocket carries a lotus** (where the reference had a frog), a **First Five** five-pack, and a **striped-webbing zip tote** (leatherette X-stitch tabs, side pockets). Six brand colourways (cream, honey, clay, dawn, hearth, mocha); prints are the mark, lotus emblem, wordmark and slogans. Swap in real product photography when you have it — `DH_MERCH(product, colour)` is the only hook.

## What to replace before launch

- **Testimonials are samples** (marked "Sample" on the site). Replace them with real stories from people who consented, then delete the samples in Account → Staff · Stories.
- Merch prices, fund totals and impact numbers; coverage statuses in `js/coverage-data.js` (compiled from public reporting; re-review quarterly, add exact source URLs, and confirm Medicaid status per state against the NHeLP tracker); billing rates in `js/care-core.js` (illustrative).
- About-page statistics are cited (NCHS Health E-Stat, CDC MMRC 2017–2019, Cochrane, Commonwealth Fund); re-check against the latest releases.
- Forms for doula/clinician interest, scholarships, donations and checkout are still stubs.

## Before this handles real health data

This is a prototype backend (JSON file, single process). It demonstrates the *behaviour* of consent-first sharing; it is **not HIPAA-compliant**. Production needs: a HIPAA-eligible host and database with signed BAAs (and for every vendor touching PHI); MFA/passkeys and credential verification for clinicians and doulas; server-side enforcement of sharing between *separate* user accounts (the demo keeps each user's scenario in their own workspace); email verification and password reset; tamper-evident audit logging; encryption at rest; retention/deletion policy; no PHI in notifications, URLs, analytics or logs; a security assessment; and counsel review of the privacy policy, terms and site copy.

## Brand assets

Portraits in `assets/` were cropped from the supplied `DoulasHouse.pdf`. The v1 deck's seated lotus figure has been retired in favour of the v2 mark; its heart, arch frames and triple-line motif live on in the new system. Lockups in `assets/brand/` use live text (Fraunces / Instrument Sans) — install the fonts or convert to outlines before print.
