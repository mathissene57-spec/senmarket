# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

SenMarket is a marketplace connecting Senegalese sellers/shops to buyers in Morocco ("La marketplace sénégalaise au Maroc"). The actual codebase is a minimal, early-stage Next.js 14 (App Router) app that currently only implements Supabase-backed authentication (login/register/magic link/password reset) and a landing page — there is no product listing, cart, or vendor dashboard implemented in the app yet.

**`README.md` is not documentation.** Despite its name, it is a large (~1800-line) self-contained static HTML/CSS/JS prototype (vanilla JS, no framework, no build step) of the full consumer-facing marketplace UI — shop/product browsing, cart, favorites, WhatsApp-based ordering, boutique registration, demo `SHOPS`/`PRODS` data, etc. It appears to be a design/spec deliverable from an external agency ("FlowDynamicsAgency") and represents the target product experience, not the current state of the Next.js app. Treat it as a UI/UX and interaction-design reference when building out real pages, not as a build artifact or setup guide.

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

**`.env.local` is committed to git** and there is no `.gitignore` in the repo. Do not treat `.env.local` as ignored, and do not add any secret beyond the Supabase anon key (which is meant to be public) to it without first adding a proper `.gitignore`.

## Architecture

- **App Router, no `src/` dir**: routes live under `app/` (`app/page.tsx` landing page, `app/login/page.tsx` auth page). `@/*` path alias maps to the repo root (`tsconfig.json`).
- **Supabase auth has three separate client entry points**, matching the `@supabase/ssr` pattern — keep using the right one for the context:
  - `lib/supabase/client.ts` — browser client (`createBrowserClient`), for use in Client Components.
  - `lib/supabase/server.ts` — server client (`createServerClient`, async, reads `next/headers` cookies), for Server Components/Actions.
  - `middleware.ts` — its own `createServerClient` instance operating on `NextRequest`/`NextResponse` cookies, since middleware runs on the edge outside the normal request lifecycle.
- **Route protection**: `middleware.ts` redirects unauthenticated requests to `/login` for any path under `/dashboard`. No `/dashboard` route currently exists in `app/` — the login flow (`app/login/page.tsx`) already calls `router.push('/dashboard')` on success, so that route needs to be created for auth to be usable end-to-end.
- **Auth page (`app/login/page.tsx`) has combined login/register/magic-link/reset-password flows** in one client component, toggled via local `mode` state rather than separate routes.
- **Styling**: no CSS framework (no Tailwind/CSS modules) — components use inline `style` objects (see `app/login/page.tsx`'s `styles` object) plus a single global `app/globals.css`. UI copy is in French. The dark green/gold palette used in `app/login/page.tsx` (`#0A1A0F`, `#00C96B`, `#F5B800`) matches the brand palette defined in the `README.md` prototype's `:root` CSS variables (`--g`, `--gold`, etc.) — reuse those values for consistency when building new UI rather than inventing new colors.

## Known issues to be aware of

- `app/login/page.tsx` currently contains typographic/smart quotes (`‘ ’ “ ”`) in place of straight quotes (`' "`) throughout the file (string literals, JSX text, object keys). This is invalid TypeScript/JSX syntax and will fail to compile as committed — fix quoting if you touch this file.
