# PROJECT_STRUCTURE

## 1. App Routes

### Primary routes
- `/` -> redirect to `/portfolio`
- `/portfolio` -> portfolio holdings, account state, quote refresh, allocation view
- `/leaderboard` -> realized trades, monthly filter, daily/monthly PnL charts
- `/expenditure` -> calendar + weekly expense sheet + monthly charts
- `/salary` -> salary/asset-management yearly table and charts
- `/asset-trend` -> total asset snapshots, calendar, trend chart
- `/memo` -> daily memo calendar, editor, image attachments
- `/membership` -> route shell only, CRUD not restored yet

### Redirect aliases
- `/market` -> `/market/news`
- `/asset-management` -> `/salary`
- `/total-asset` -> `/asset-trend`

### Market routes
- `/market/news`
- `/market/crypto`
- `/market/kr/daily-market`
- `/market/kr/sector-etf-trend`
- `/market/kr/sector-etf-momentum`
- `/market/us/daily-market`
- `/market/us/sector-etf-trend`
- `/market/us/sector-etf-momentum`

### API routes
- `/api/calendar-days`
- `/api/fx`
- `/api/quote`
- `/api/trading-days`

## 2. Page Responsibilities

### Portfolio
- Holdings CRUD
- KR/US quote refresh
- account state inputs (deposit/cash)
- allocation donut and holdings table
- Supabase + local fallback via portfolio repositories/hooks

### Leaderboard
- realized trade journal
- month/market/search filtering
- inline summary, sortable table, modal editing
- daily and monthly realized PnL charts

### Expenditure
- month calendar
- selected-week entry sheet
- bucket/subcategory aggregation
- monthly bar/pie charts

### Salary
- yearly summary table
- expenditure + realized trade derived metrics
- earnings/salary charts

### Asset Trend
- total asset snapshot CRUD
- calendar + selected day detail panel
- monthly trend chart
- quote refresh + fx-based snapshot recording

### Memo
- date-based memo entries
- buy/sell/comment fields
- image attachment and preview flow
- Supabase storage signed URL flow

### Market
- route shells for KR/US/Crypto/News
- real snapshot viewer for market snapshots
- date/section/search/list/grid modes in viewer

### Membership
- currently route shell only
- placeholder until membership CRUD/calendar UI is restored

## 3. Component Structure

### `components/common`
Reusable layout shells only.
- `PageHeaderBar.tsx`
- `CalendarHeaderBar.tsx`
- `SectionCard.tsx`
- `InlineFilterRow.tsx`
- `EmptyState.tsx`
- `EmptyChartState.tsx`
- `ChartSectionCard.tsx`
- `DonutWithLegendLayout.tsx`
- `SummaryStatList.tsx`

### `components/portfolio`
Portfolio-specific UI.
- header bar
- cash input strip
- allocation section
- holdings section
- holding avatar
- form modal

### `components/expenditure`
Expenditure-specific UI.
- header bar
- month calendar
- week section/table
- chart section

### `components/leaderboard`
Leaderboard-specific UI.
- header/filter bar
- inline summary
- trades table
- charts section

### `components/memo`
Memo-specific UI.
- header bar
- calendar section
- entry form
- entries list

### `components/market`
Market snapshot viewing shells.
- header
- filters
- grid view
- list view
- detail panel
- placeholder page
- viewer orchestrator

### Root-level specialized components
- chart primitives (`DailyNetChart`, `MonthlyNetChart`, `MonthlyBucketBarChart`, `TotalAssetTrendChart`)
- modal primitives (`Modal`, `RealizedTradeModal`, `ExpenseCellModal`)
- auth/nav (`TopNav`, `NavMenu`, `AuthMenu`)

## 4. Hooks / Services / Repositories

### Hooks
- `useAuth.ts`
- `usePortfolio.ts`
- `usePortfolioAccountState.ts`
- `useRealizedTrades.ts`
- `useExpenses.ts`
- `useTotalAssets.ts`
- `useMemos.ts`

### Repositories
Repository layer owns cloud/local loading and mapping.
- `portfolioRepository.ts`
- `portfolioAccountStateRepository.ts`
- `realizedTradeRepository.ts`
- `expenseRepository.ts`
- `totalAssetRepository.ts`
- `memoRepository.ts`
- `marketSnapshotRepository.ts`

### Mapper layer
`lib/repository/mappers/*`
- snake_case DB row <-> camelCase app model conversion
- canonical type enforcement

### Services
Pure/domain helpers and aggregation.
- `portfolioService.ts`
- `portfolioAnalytics.ts`
- `expenseService.ts`
- `realizedTradeService.ts`
- `salaryService.ts`
- `totalAssetService.ts`
- `events.ts`

### Storage
- `lib/storage/localStorageRepository.ts`
- `lib/storage/repository.ts`

## 5. Supabase Overview

### Active app-facing tables
- `portfolio_holdings`
- `portfolio_account_state`
- `realized_trades`
- `expense_entries`
- `total_asset_snapshots`
- `memo_entries`
- `market_snapshots`

### Mentioned but not fully restored in UI
- `membership_posts`
- `market_runs`

### Auth / storage
- Supabase auth via email/password
- memo image storage bucket used by `memoRepository.ts`

## 6. localStorage Fallback Overview

### Legacy base schema
- storage key: `personal-finance-dashboard`
- used by `LocalStorageFinanceRepository`
- still contains legacy compatibility fields such as `portfolioHoldings` and `cashTransactions`

### Dedicated module keys
- `pf_realized_trades_v1`
- `pf_expense_entries_v1`
- `pf_total_asset_snapshots_v1`
- `pf_memo_entries_v1`
- `pf_fx_usdkrw_v1`
- `pf_deposit_krw_v1`
- `pf_deposit_usd_v1`
- `pf_cash_krw_v1`
- sync flags such as `pf_synced_*_v1`
- quote/cache keys such as `pf_last_quote_refresh_at_v1`, `pf_last_quote_fail_at_v1`, `pf_quote_blacklist_v1`

## 7. Date / KST Utilities
- `lib/date/kst.ts`
- `lib/date/calendar.ts`
- `lib/utils/time.ts`
- `lib/utils/date.ts` (compatibility helpers)

These utilities centralize KST month/day/week formatting and reduce per-page drift.

## 8. Market Scripts / GitHub Actions Status
- `scripts/market` is not currently present in this repository snapshot.
- `.github/workflows` is also not currently present in this repository snapshot.
- Market viewer UI exists, but collection/publish automation is not checked into the current workspace.

## 9. Navigation Source of Truth
- `lib/config/navigation.ts`
- Used by `components/NavMenu.tsx`
- Top-level groups:
  - Investment
  - Asset Management
  - Market
  - Membership

## 10. Documentation Index
- `/Users/kevin/Documents/New project/REFACTOR_AUDIT.md`
- `/Users/kevin/Documents/New project/REFACTOR_DATA_MODEL.md`
- `/Users/kevin/Documents/New project/REFACTOR_PORTFOLIO.md`
- `/Users/kevin/Documents/New project/REFACTOR_EXPENDITURE.md`
- `/Users/kevin/Documents/New project/REFACTOR_LEADERBOARD.md`
- `/Users/kevin/Documents/New project/REFACTOR_MEMO.md`
- `/Users/kevin/Documents/New project/REFACTOR_MARKET.md`
- `/Users/kevin/Documents/New project/REFACTOR_MEMBERSHIP.md`
- `/Users/kevin/Documents/New project/REFACTOR_SHARED_UI.md`
- `/Users/kevin/Documents/New project/REFACTOR_DATE_UTILS.md`
- `/Users/kevin/Documents/New project/REFACTOR_CHARTS.md`
- `/Users/kevin/Documents/New project/REFACTOR_CLEANUP.md`
- `/Users/kevin/Documents/New project/DEPLOY_CHECKLIST.md`
