# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

SenMarket is a marketplace connecting Senegalese sellers/shops to buyers in Morocco ("La marketplace sénégalaise au Maroc"). There are two very different things to keep straight:

1. **This Next.js repo** — a minimal, early-stage Next.js 14 (App Router) app that currently only implements Supabase-backed authentication (login/register/magic link/password reset) and a landing page. It has **no catalogue, cart, checkout, or vendor dashboard UI**, and — critically — **it makes zero calls to any business table or RPC** (verified by searching the full working tree and the entire git history: the only Supabase usage anywhere in this repo is `supabase.auth.*`).
2. **The live Supabase project** — a fully populated, actively used production backend (34 boutiques, 197 produits, 116+ commandes, ~5000 UX events at last count) with its own tables, RPCs, and RLS policies, built independently of this repo, by a different process this repo has no record of. **This is the source of truth for the marketplace's business logic and data model.** See "The real Supabase backend" below before touching anything database-related.

**`README.md` is not documentation.** Despite its name, it is a large (~1800-line) self-contained static HTML/CSS/JS prototype (vanilla JS, no framework, no build step) of the full consumer-facing marketplace UI — shop/product browsing, cart, favorites, WhatsApp-based ordering, boutique registration, demo `SHOPS`/`PRODS` data, etc. It's a design/spec deliverable from an external agency ("FlowDynamicsAgency") showing the target UX. It has **no backend of its own** (no Supabase calls at all) and its demo data model does **not** match the real Supabase schema (e.g. it never got a per-boutique `devise`, never modeled stock protection, etc.). Use it only as a visual/UX reference, never as a source of truth for the data model or business rules — that's the real Supabase schema now.

## Commands

```bash
npm run dev      # start Next.js dev server
npm run build    # production build
npm run start    # run production build
npm run lint     # next lint
```

There is no test suite/framework configured in this repo.

## Environment

Required env vars (see `lib/supabase/client.ts`, `lib/supabase/server.ts`, `middleware.ts`):
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

`.env.local` is present locally but **no longer committed to git** (a `.gitignore` was added; `.env.local.example` documents the required keys). **Open question, unresolved**: the `project-ref` embedded in the current `.env.local`'s URL (`imccuesdgyaiytsibtqn`) does not match the `project-ref` of the live "Senmarket" Supabase project inspected during the Phase 3A audit (`kvquqpuskrcyomyqwgty`, dashboard shows it tagged PRODUCTION). Before wiring any real page to Supabase, confirm which project is actually intended and update `.env.local`/`.env.local.example` accordingly — don't assume the committed values are correct.

## Architecture — Next.js app

- **App Router, no `src/` dir**: routes live under `app/` (`app/page.tsx` landing page, `app/login/page.tsx` auth page). `@/*` path alias maps to the repo root (`tsconfig.json`).
- **Supabase auth has three separate client entry points**, matching the `@supabase/ssr` pattern — keep using the right one for the context:
  - `lib/supabase/client.ts` — browser client (`createBrowserClient`), for use in Client Components.
  - `lib/supabase/server.ts` — server client (`createServerClient`, async, reads `next/headers` cookies), for Server Components/Actions.
  - `middleware.ts` — its own `createServerClient` instance operating on `NextRequest`/`NextResponse` cookies, since middleware runs on the edge outside the normal request lifecycle.
- **Route protection**: `middleware.ts` redirects unauthenticated requests to `/login` for any path under `/dashboard`. No `/dashboard` route currently exists in `app/` — the login flow (`app/login/page.tsx`) already calls `router.push('/dashboard')` on success, so that route needs to be created for auth to be usable end-to-end.
- **Auth page (`app/login/page.tsx`) has combined login/register/magic-link/reset-password flows** in one client component, toggled via local `mode` state rather than separate routes.
- **Styling**: no CSS framework (no Tailwind/CSS modules) — components use inline `style` objects (see `app/login/page.tsx`'s `styles` object) plus a single global `app/globals.css`. UI copy is in French. The dark green/gold palette used in `app/login/page.tsx` (`#0A1A0F`, `#00C96B`, `#F5B800`) matches the brand palette defined in the `README.md` prototype's `:root` CSS variables (`--g`, `--gold`, etc.) — reuse those values for consistency when building new UI rather than inventing new colors.

## The real Supabase backend (source of truth for business logic)

> **Rule: never create a new business table, a new business RPC, or a parallel data model without first checking whether the capability already exists in the live schema described below.** A from-scratch "Phase 3A foundation" schema (`devises`, `categories`, `boutiques`, `produits`, `commandes`, `commande_lignes`, `creer_commande_complete`) was designed and even committed to this repo (`supabase/migrations/20260825120000_phase3a_foundation.sql`, `docs/rollback/phase3a_foundation_down.sql`) before the real backend was discovered mid-attempt (the migration failed on `CREATE TABLE boutiques` — the name already existed). **Those two files are dead/superseded design artifacts, not something to ever apply.** They are kept in the repo only as a historical record of that dead end; do not run them, and do not use them as the model for the real schema — the real one, described below, differs substantially (different column names, different RPC signatures, real data already in it).

**Real tables (`public` schema), with data as of the last audit**: `boutiques` (34 rows), `produits` (197), `produit_images` (388), `commandes` (116+), `commande_items` (185+), `promotions` (21), `avis` (1+), `publicites` (8), `demandes_inscription` (6), `admin_users` (1), `evenements_ux` (~5000, UX analytics).

**Dead/legacy tables, all 0 rows, leave alone**: `shops` (an older parallel iteration of `boutiques` with different column names — `owner_id`/`is_online` instead of `vendor_id`/`actif` — never used), `Boutique_soceshop`, `Email`, `Guigoz_shop`, `Guigozshop`, `Telephone`, `test_anon`.

**Key columns worth knowing** (not exhaustive — check `information_schema.columns` before assuming):
- `boutiques.vendor_id` (not `owner_id`) references `auth.users(id)`; `boutiques.devise` (default `'MAD'`) — **currency belongs to the boutique**, matching the intended design; `boutiques.actif` (operational on/off, vendor-controlled) is distinct from `boutiques.verifie` (trust badge, admin-only, does **not** gate public visibility — a boutique is publicly visible whenever `statut`-equivalent `actif = true`, independent of `verifie`).
- `produits.actif` gates both public catalogue visibility (RLS) and, as of the Phase 3A fix, purchasability via `creer_commande_complete`.
- `commandes.statut` has no CHECK constraint (free text) but is used consistently as one of `en_attente | confirmee | preparation | expediee | livree | annulee`; in practice only `en_attente` and `confirmee` have ever been used. The "counted as a sale" set (see below) is `confirmee, preparation, expediee, livree`.
- `commande_items` snapshots `nom_produit`/`prix_unitaire` at order time — this is deliberate and must never be "corrected" by joining back to `produits` after the fact (a later price/name change on a product must not retroactively alter historical orders).

**RPCs and their role**:
- `creer_commande_complete(p_boutique_id, p_client_telephone, p_items jsonb)` — the **public/guest checkout path**. `SECURITY DEFINER`, `search_path = ''`. As of the Phase 3A fix: validates `p_items` shape, caps quantity at 1–100 per line, aggregates duplicate `produit_id`s, locks rows with `FOR UPDATE`, requires `actif = true`, checks stock, **computes `prix_unitaire`/`nom_produit` from `produits` server-side (never trusts client-supplied values)**, creates the `commandes` row only after all lines validate, then inserts `commande_items` and decrements stock. Returns the new `commandes.id`.
- `creer_vente(p_boutique_id, p_articles, p_client_nom, p_client_telephone, p_origine, p_mode_paiement, p_notes)` — the **vendor-facing "record a sale" path**, requires the caller to own the boutique (`vendor_id = auth.uid()`), creates the order directly as `confirmee`. Already computed price server-side correctly before Phase 3A.
- `is_admin(uid)` — looks up `admin_users`.
- `definir_ordre_accueil(p_produit_id, p_ordre)` — admin-only (checks `is_admin()`), sets homepage curation order on a product.
- `rechercher_mes_commandes(p_telephone)` — guest order lookup by phone number, **no OTP/verification**. Known, accepted-as-a-product-decision gap, not yet resolved — treat as intentional until told otherwise.
- `stats_clients_boutique(p_boutique_id)`, `top_produits_boutique(p_boutique_id, p_limit)` — vendor analytics. Both are `SECURITY INVOKER` (no `SECURITY DEFINER`), so RLS on `commandes`/`commande_items` applies with the caller's real identity — an anonymous or non-owning caller gets empty/zero results, not real data. This protection is implicit (a side effect of not being `SECURITY DEFINER`), not enforced inside the function body — be careful not to "helpfully" add `SECURITY DEFINER` to these without also adding an explicit `is_admin()`/`vendor_id` check, or the implicit protection disappears.
- `recalculer_note_boutique()`, `recalculer_nb_produits_boutique()`, `recalculer_nb_ventes_boutique()`, `recalculer_ventes_produit_a_l_insertion()` — trigger functions (Phase 3A) that keep the derived counters below in sync going forward.
- `recalculer_compteurs_boutique(p_boutique_id)` — admin-only, one-shot recompute of a boutique's derived counters from source tables; used to backfill after Phase 3A (cannot be called from the SQL Editor directly since it requires `is_admin(auth.uid())`, which is `NULL`/false outside a real PostgREST request — the backfill was done with an equivalent raw `UPDATE ... FROM` instead).

**RLS / ownership model**: almost every policy follows `vendor_id = auth.uid()` (via `boutiques`) or `boutique_id IN (SELECT id FROM boutiques WHERE vendor_id = auth.uid())`. **Corrected note (an earlier version of this file wrongly stated the opposite):** the public read policy on `boutiques` (`lecture_publique_boutiques`) has `qual = true` — every boutique row is publicly readable via RLS regardless of `actif`. The public read policy on `produits` (`lecture_publique_produits_actifs`) only checks `produits.actif = true` — it does **not** also require the owning boutique to be `actif = true`. Likewise `creer_commande_complete` only checks that the boutique exists, not that it's `actif`. Net effect: **a product can currently be publicly listed and ordered even if its own boutique is switched off.** This was never a decided product rule — it's just the real current behavior — so don't "fix" it unilaterally when building the catalogue; if you want to hide products of an inactive boutique, that filter has to be added explicitly in the query (or a future RLS/RPC change), it isn't already enforced server-side. As of Phase 3A, vendor `UPDATE` on `boutiques`/`produits` is restricted **by column** (`REVOKE`/`GRANT UPDATE (...)`), not just by row — a vendor can no longer set `boutiques.verifie`, `boutiques.note`, `boutiques.nb_produits`, `boutiques.nb_ventes`, `boutiques.nb_abonnes`, or `produits.ventes`/`ordre_accueil` directly.

**Derived/cache columns vs. source of truth** — do not treat these as independently authoritative, and never hand-edit them:
| Cache column | Computed from | Maintained by |
|---|---|---|
| `boutiques.note` | `avg(avis.note)` for that boutique (5.0 default if none) | trigger on `avis` |
| `boutiques.nb_produits` | `count(produits)` where `actif = true` | trigger on `produits` |
| `boutiques.nb_ventes` | `count(commandes)` in the counted-status set | trigger on `commandes` |
| `produits.ventes` | `sum(commande_items.quantite)` for counted-status orders | triggers on `commandes` + `commande_items` |
| `boutiques.nb_abonnes` | *(no source — no "follow"/subscription table exists anywhere in the schema)* | nothing; frozen, vendor-write revoked, requires a real feature before it can mean anything |

## Known gaps, deliberately left open

- `rechercher_mes_commandes` has no OTP — a product/security decision, not yet made.
- No audit trail for `avis` moderation (there's no status column at all — every inserted review is immediately public).

## Known issues fixed so far

- `app/login/page.tsx` originally had invalid smart-quote syntax and stray Markdown code fences that broke compilation — fixed (straight quotes, no logic changes).
- `.env.local` was originally committed with no `.gitignore` — fixed (untracked, `.gitignore` added, `.env.local.example` added as the template).
