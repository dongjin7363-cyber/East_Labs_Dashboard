# Refactor Step 6: Safe Cleanup Only

## Actually Removed
- `/Users/kevin/Documents/New project/components/DateRangeFilter.tsx`
  - no remaining imports or route usage
- `/Users/kevin/Documents/New project/components/PortfolioAnalytics.tsx`
  - legacy Portfolio analysis UI, no remaining imports
- `/Users/kevin/Documents/New project/components/SeedDemoButton.tsx`
  - seed UI no longer referenced
- `/Users/kevin/Documents/New project/components/SummaryCardGrid.tsx`
  - no remaining imports after shared UI/chart refactors
- `/Users/kevin/Documents/New project/components/expenditure/TransactionFormModal.tsx`
  - legacy transaction-based expenditure modal, no remaining imports
- `/Users/kevin/Documents/New project/lib/hooks/useTransactions.ts`
  - legacy transaction hook, no remaining imports
- `/Users/kevin/Documents/New project/lib/services/seedService.ts`
  - only referenced by removed seed button
- `/Users/kevin/Documents/New project/lib/services/transactionService.ts`
  - only referenced by removed legacy transaction files

## Debug / Temp Cleanup
- Removed temporary debug logs from:
  - `/Users/kevin/Documents/New project/app/(routes)/leaderboard/page.tsx`
  - `/Users/kevin/Documents/New project/app/(routes)/portfolio/page.tsx`
  - `/Users/kevin/Documents/New project/app/api/quote/route.ts`
  - `/Users/kevin/Documents/New project/lib/hooks/usePortfolio.ts`
- Removed now-unused debug helper from `/Users/kevin/Documents/New project/app/api/quote/route.ts`
- Removed unused CSS selector `.muted-placeholder` from `/Users/kevin/Documents/New project/app/globals.css`
- Removed an empty debug-only `useEffect` from `/Users/kevin/Documents/New project/app/(routes)/portfolio/page.tsx`

## Candidates Not Deleted
- `/Users/kevin/Documents/New project/app/membership/page.tsx`
  - still acts as an intentional route shell; placeholder content remains by design
- cash transaction fields in local storage schema and repository interfaces
  - still present in `/Users/kevin/Documents/New project/lib/storage/localStorageRepository.ts`
  - not removed because they affect persisted schema compatibility
- legacy service helpers in `/Users/kevin/Documents/New project/lib/storage/repository.ts`
  - kept to avoid partial storage contract breakage without a dedicated migration step
- potentially stale CSS selectors around older portfolio/allocation layouts
  - not removed because selector reach is harder to prove safely without UI regression pass

## Why These Were Deferred
- They still affect route stability, persisted data compatibility, or broader storage contracts.
- Removing them in this step would go beyond "safe cleanup only" and into behavioral migration.

## Remaining Risk Areas
- `/Users/kevin/Documents/New project/app/(routes)/portfolio/page.tsx`
  - still large and carries mixed UI/state responsibilities
- membership remains a route shell, not a restored feature page
- storage schema contains some legacy fields that are no longer actively used in UI
- image-heavy components still use raw `<img>` and keep Next warnings alive
