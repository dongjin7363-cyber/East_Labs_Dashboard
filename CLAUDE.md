# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Start dev server
npm run build     # Production build
npm run lint      # Run ESLint
npm run check     # Lint + build together
```

No test framework is configured.

## Environment

Copy `.env.example` to `.env.local` and fill in:
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase project credentials
- `SUPABASE_SERVICE_ROLE_KEY` — server-side Supabase access
- `FINNHUB_API_KEY` — stock quote fetching

## Architecture

**EAST** is a Next.js 14 (App Router) personal finance dashboard for tracking KR/US stock holdings, trades, expenses, and total asset trends.

### Layer Stack

```
UI (app/(routes)/, components/)
  └── React Hooks (lib/hooks/)
        └── Services (lib/services/)           ← business logic, aggregation
              └── Repositories (lib/repository/) ← data access
                    └── Mappers (lib/repository/mappers/)  ← snake_case ↔ camelCase
                          └── Supabase (cloud) | localStorage (fallback)
```

**Canonical types** live in `lib/models/types.ts` (camelCase). DB fields are snake_case. Conversion happens exclusively in the mapper layer — services and components never see raw DB schema.

**Dual storage**: Repositories auto-select Supabase when authenticated, localStorage otherwise. The `FinanceRepository` interface in `lib/storage/repository.ts` is implemented by both adapters.

**Event system**: `lib/services/events.ts` dispatches `FINANCE_DATA_EVENT` to notify subscribers after mutations.

### Key Conventions

- **Dates**: Always `YYYY-MM-DD` strings in KST. All timezone logic goes through `lib/date/kst.ts`.
- **Currency**: Stored as integers — USD in cents, KRW in won — to avoid floating-point errors. Formatting in `lib/utils/money.ts`.
- **Stock quotes**: `app/api/quote/route.ts` handles both Finnhub (US) and KRX (KR) sources. This is the most complex API route (~40KB).
- **Asset trend benchmarks**: `app/api/index-history/route.ts` + `components/TotalAssetClient.tsx` (~29KB) — these are the most complex client/server pair in the app.

### Adding a New Feature

The standard pattern: add types to `lib/models/types.ts` → add a mapper in `lib/repository/mappers/` → add/extend a repository in `lib/repository/` → add/extend a service in `lib/services/` → add a hook in `lib/hooks/` → build the page in `app/(routes)/` and components in `components/`.

### Path Alias

`@/*` maps to the project root (e.g., `@/lib/models/types`).
