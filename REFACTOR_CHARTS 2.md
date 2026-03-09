# Refactor Step 5C: Shared Chart Shells

## What Was Commonized

### `ChartSectionCard`
- File: `/Users/kevin/Documents/New project/components/common/ChartSectionCard.tsx`
- Responsibility:
  - shared chart card wrapper
  - shared title / right slot header row
  - compact vs panel variant shell only

### `DonutWithLegendLayout`
- File: `/Users/kevin/Documents/New project/components/common/DonutWithLegendLayout.tsx`
- Responsibility:
  - left chart / right legend layout shell
  - center alignment / spacing / responsive stacking only
  - no chart data logic

### `SummaryStatList`
- File: `/Users/kevin/Documents/New project/components/common/SummaryStatList.tsx`
- Responsibility:
  - compact label/value summary rows
  - optional sub-value row
  - tone-based value color only

### `EmptyChartState`
- File: `/Users/kevin/Documents/New project/components/common/EmptyChartState.tsx`
- Responsibility:
  - shared empty UI for chart areas
  - wraps the existing `EmptyState` with chart-friendly sizing

## Where It Was Applied

### Portfolio
- `/Users/kevin/Documents/New project/components/portfolio/PortfolioAllocationDonut.tsx`
  - `ChartSectionCard`
  - `DonutWithLegendLayout`
  - `SummaryStatList`
  - `EmptyChartState`

### Expenditure
- `/Users/kevin/Documents/New project/components/expenditure/ExpenditureChartsSection.tsx`
  - `ChartSectionCard`
- `/Users/kevin/Documents/New project/components/MonthlyBucketBarChart.tsx`
  - `EmptyChartState`
- `/Users/kevin/Documents/New project/components/MonthlySubcategoryPieChart.tsx`
  - `DonutWithLegendLayout`
  - `EmptyChartState`

### Leaderboard
- `/Users/kevin/Documents/New project/components/leaderboard/LeaderboardChartsSection.tsx`
  - `ChartSectionCard`
- `/Users/kevin/Documents/New project/components/DailyNetChart.tsx`
  - `EmptyChartState`
- `/Users/kevin/Documents/New project/components/MonthlyNetChart.tsx`
  - `EmptyChartState`

### Asset Trend
- `/Users/kevin/Documents/New project/components/TotalAssetClient.tsx`
  - bottom trend section now uses `ChartSectionCard`
- `/Users/kevin/Documents/New project/components/TotalAssetTrendChart.tsx`
  - `EmptyChartState`

## What Was Intentionally Left Page-Specific
- recharts configuration per page
- tooltip formatting
- legend row content
- donut color maps
- summary number calculation
- chart data aggregation
- page-specific copy and labels

## Remaining Refactor Candidates
1. Extract a shared chart header meta pattern for `panel-submetric` / right-side stats.
2. Standardize legend row markup between Portfolio and Expenditure.
3. Move chart view-model shaping out of page components into dedicated hooks where it is currently duplicated.
4. Replace remaining raw `<section className="panel">` chart shells that still carry page-specific markup only.
