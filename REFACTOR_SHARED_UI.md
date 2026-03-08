# Refactor Shared UI

## 1. 이번 단계 목적

기능 변경 없이, 여러 페이지에서 반복되는 UI 껍데기만 안전하게 공통화했다.

- 데이터 흐름 변경 없음
- 달력/차트/모달/테이블 로직 공통화는 제외
- 공통 wrapper 수준만 정리

## 2. 공통화한 UI 컴포넌트

### `/Users/kevin/Documents/New project/components/common/PageHeaderBar.tsx`

역할:
- 페이지 상단의 제목 영역 공통 wrapper
- `left(title/titleMeta/description)` + `rightSlot` 구조

적용:
- Portfolio
- Leaderboard
- Expenditure
- Memo
- Membership
- Market snapshot/placeholder pages
- 기존 `/Users/kevin/Documents/New project/components/PageHeader.tsx`도 내부적으로 이 컴포넌트를 사용

### `/Users/kevin/Documents/New project/components/common/SectionCard.tsx`

역할:
- 반복되는 흰 배경 카드 wrapper 공통화
- `title`, `rightSlot`, `children`, `className` 지원
- 기존 `.panel`, `.panel-header-inline` 톤 유지

적용:
- Portfolio cash / holdings / allocation
- Leaderboard toolbar / table / chart sections
- Expenditure calendar / week / chart sections
- Memo route shell
- Membership placeholder shell
- Market snapshot / placeholder shell

### `/Users/kevin/Documents/New project/components/common/InlineFilterRow.tsx`

역할:
- 상단 필터 줄의 좌/우 레이아웃 공통화
- `leftControls`, `rightSummary` slot 구조

적용:
- Leaderboard 상단 필터 + 요약
- Market snapshot 상단 필터 + view toggle
- Portfolio holdings 필터 row

### `/Users/kevin/Documents/New project/components/common/EmptyState.tsx`

역할:
- 빈 상태/로딩 상태 문구 UI 공통화
- `compact` variation 지원

적용:
- Leaderboard table empty state
- Market snapshot loading / empty
- Memo entries list empty state
- Membership placeholder
- Portfolio allocation empty state
- Leaderboard / Expenditure chart empty states

## 3. 이번 단계에서 실제로 적용한 파일

### Portfolio
- `/Users/kevin/Documents/New project/app/(routes)/portfolio/page.tsx`
- `/Users/kevin/Documents/New project/components/portfolio/PortfolioHeaderBar.tsx`
- `/Users/kevin/Documents/New project/components/portfolio/PortfolioCashInputs.tsx`
- `/Users/kevin/Documents/New project/components/portfolio/PortfolioHoldingsSection.tsx`
- `/Users/kevin/Documents/New project/components/portfolio/PortfolioAllocationDonut.tsx`

### Leaderboard
- `/Users/kevin/Documents/New project/app/(routes)/leaderboard/page.tsx`
- `/Users/kevin/Documents/New project/components/leaderboard/LeaderboardHeaderBar.tsx`
- `/Users/kevin/Documents/New project/components/leaderboard/LeaderboardTradesTable.tsx`
- `/Users/kevin/Documents/New project/components/leaderboard/LeaderboardChartsSection.tsx`
- `/Users/kevin/Documents/New project/components/DailyNetChart.tsx`
- `/Users/kevin/Documents/New project/components/MonthlyNetChart.tsx`

### Expenditure
- `/Users/kevin/Documents/New project/app/(routes)/expenditure/page.tsx`
- `/Users/kevin/Documents/New project/components/expenditure/ExpenditureHeaderBar.tsx`
- `/Users/kevin/Documents/New project/components/expenditure/ExpenditureMonthCalendar.tsx`
- `/Users/kevin/Documents/New project/components/expenditure/ExpenditureWeekSection.tsx`
- `/Users/kevin/Documents/New project/components/expenditure/ExpenditureChartsSection.tsx`
- `/Users/kevin/Documents/New project/components/MonthlyBucketBarChart.tsx`
- `/Users/kevin/Documents/New project/components/MonthlySubcategoryPieChart.tsx`

### Memo
- `/Users/kevin/Documents/New project/app/memo/page.tsx`
- `/Users/kevin/Documents/New project/components/memo/MemoHeaderBar.tsx`
- `/Users/kevin/Documents/New project/components/memo/MemoEntriesList.tsx`

### Membership
- `/Users/kevin/Documents/New project/app/membership/page.tsx`

### Market
- `/Users/kevin/Documents/New project/components/market/MarketSnapshotViewer.tsx`
- `/Users/kevin/Documents/New project/components/market/MarketSnapshotHeader.tsx`
- `/Users/kevin/Documents/New project/components/market/MarketPlaceholderPage.tsx`

## 4. 이번 단계에서 공통화하지 않은 영역

의도적으로 제외했다.

- 달력 UI
  - Total Asset / Memo / Expenditure 달력은 구조는 비슷하지만 상호작용이 다름
- 차트 데이터 가공
  - 차트 wrapper는 일부 공통화했지만, 집계/series 계산은 그대로 유지
- 모달
  - 폼 구조와 validation이 도메인별로 많이 다름
- 테이블
  - 정렬/셀 렌더링 책임이 달라서 아직 공통화 위험이 큼
- auth gate banner
  - 현재는 `SectionCard + text` 수준으로만 정리

## 5. 다음 단계 공통화 후보

우선순위 순서:

1. auth gate banner 공통 컴포넌트화
2. panel header title/right meta 패턴 보강
3. chart empty/loading wrapper 공통 컴포넌트화
4. memo / expenditure / total asset 달력 shell 공통화
5. sortable table header 공통화
6. modal footer/button bar 공통화
