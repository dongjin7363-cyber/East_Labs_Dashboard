# REFACTOR_AUDIT

기준일: 2026-03-07  
범위: 현재 Next.js App Router 코드베이스 구조 진단. 기능 변경 없이 현황과 정리 우선순위만 정리한다.

## Snapshot

- 코드 파일 수: 약 92개 (`app/`, `components/`, `lib/` 기준)
- 현재 비대해진 핵심 파일
  - `app/(routes)/portfolio/page.tsx` 약 2022 lines
  - `lib/services/realizedTradeService.ts` 약 1174 lines
  - `app/(routes)/leaderboard/page.tsx` 약 715 lines
  - `lib/hooks/usePortfolio.ts` 약 597 lines
  - `components/TotalAssetClient.tsx` 약 589 lines
  - `components/market/MarketSnapshotViewer.tsx` 약 573 lines
  - `app/(routes)/expenditure/page.tsx` 약 532 lines

현재 구조의 핵심 문제는 다음 4가지다.

1. route/page 수준에 비즈니스 로직이 과도하게 몰려 있다.
2. 동일 도메인에 localStorage legacy path와 Supabase path가 함께 살아 있어 shape drift 가능성이 크다.
3. camelCase app model과 snake_case DB row 매핑이 여러 파일에 분산되어 있다.
4. 이미 화면에서 제거된 구형 컴포넌트/서비스가 아직 남아 있어 정리 비용을 높인다.

---

## A. Route Map

### 실제 page.tsx 경로 목록

| URL | 파일 | 상태 | 비고 |
|---|---|---|---|
| `/` | `app/page.tsx` | redirect | `/portfolio`로 redirect |
| `/portfolio` | `app/(routes)/portfolio/page.tsx` | actual | 포트폴리오 핵심 페이지, quote/fx/UI 로직이 page에 과밀 |
| `/leaderboard` | `app/(routes)/leaderboard/page.tsx` | actual | 실현손익 테이블/차트/필터 |
| `/expenditure` | `app/(routes)/expenditure/page.tsx` | actual | 월 달력 + 주간 입력 + 월 차트 |
| `/salary` | `app/(routes)/salary/page.tsx` | actual | 연간 테이블 + 2개 차트 |
| `/asset-management` | `app/asset-management/page.tsx` | redirect | `/salary`로 redirect |
| `/asset-trend` | `app/asset-trend/page.tsx` | actual wrapper | `TotalAssetClient` 렌더 |
| `/total-asset` | `app/total-asset/page.tsx` | redirect | `/asset-trend`로 redirect |
| `/memo` | `app/memo/page.tsx` | actual | 달력 + 우측 폼/목록 |
| `/membership` | `app/membership/page.tsx` | placeholder | 현재 `"Membership page is available."`만 표시 |
| `/market` | `app/market/page.tsx` | redirect | `/market/news`로 redirect |
| `/market/news` | `app/market/news/page.tsx` | placeholder-ish | 실제 페이지는 있으나 카드형 mock data |
| `/market/crypto` | `app/market/crypto/page.tsx` | actual generic viewer | `MarketSnapshotViewer` 사용 |
| `/market/kr/daily-market` | `app/market/kr/daily-market/page.tsx` | actual generic viewer | `MarketSnapshotViewer` 사용 |
| `/market/kr/sector-etf-trend` | `app/market/kr/sector-etf-trend/page.tsx` | actual generic viewer | `MarketSnapshotViewer` 사용 |
| `/market/kr/sector-etf-momentum` | `app/market/kr/sector-etf-momentum/page.tsx` | actual generic viewer | `MarketSnapshotViewer` 사용 |
| `/market/us/daily-market` | `app/market/us/daily-market/page.tsx` | actual generic viewer | `MarketSnapshotViewer` 사용 |
| `/market/us/sector-etf-trend` | `app/market/us/sector-etf-trend/page.tsx` | actual generic viewer | Supabase `market_snapshots` 기반 |
| `/market/us/sector-etf-momentum` | `app/market/us/sector-etf-momentum/page.tsx` | actual generic viewer | `MarketSnapshotViewer` 사용 |

### 메뉴와 연결되는 route 목록

#### Investment
- `/portfolio`
- `/leaderboard`
- `/memo`

#### Asset Management
- `/expenditure`
- `/salary`
- `/asset-trend`

#### Market
- `/market/news`
- `/market/kr/daily-market`
- `/market/kr/sector-etf-trend`
- `/market/kr/sector-etf-momentum`
- `/market/us/daily-market`
- `/market/us/sector-etf-trend`
- `/market/us/sector-etf-momentum`
- `/market/crypto`

#### Membership
- `/membership`

### placeholder / empty page 판정

- 확실한 placeholder
  - `app/membership/page.tsx`
- placeholder 성격이 강한 mock UI
  - `app/market/news/page.tsx`
- redirect-only wrapper
  - `app/page.tsx`
  - `app/market/page.tsx`
  - `app/asset-management/page.tsx`
  - `app/total-asset/page.tsx`
- actual wrapper
  - `app/asset-trend/page.tsx`  
    별도 로직은 없지만 실제 구현인 `TotalAssetClient`에 연결됨

### redirect 정리 필요 경로

현재 redirect 자체는 동작하지만, 구조상 정리가 필요하다.

1. `/asset-management` vs `/salary`
   - 사용자 개념은 `Salary`, route alias는 `/asset-management`
   - 한쪽을 canonical route로 고정하고 나머지는 redirect-only로 남기는 방향이 필요

2. `/asset-trend` vs `/total-asset`
   - 동일한 방식으로 canonical route 정리 필요

3. `/market`
   - 현재 `/market/news`로 redirect. 문제는 없음

---

## B. Component Map

### 공통 레이아웃 / 네비게이션

- `components/TopNav.tsx`
  - 최상단 nav wrapper
- `components/NavMenu.tsx`
  - hover/click 기반 다단 드롭다운 메뉴
- `components/AuthMenu.tsx`
  - 로그인/회원가입/로그아웃 UI
- `components/PageHeader.tsx`
  - 각 페이지 상단 header 공통 구성
- `components/Modal.tsx`
  - 전역 modal shell

### 공통 입력 / 유틸 UI

- `components/FormattedNumberInput.tsx`
  - 숫자 콤마 포맷 입력

### Portfolio 관련

- `components/portfolio/PortfolioFormModal.tsx`
  - 보유자산 추가/수정
- `components/portfolio/HoldingAvatar.tsx`
  - 종목 로고/국기 avatar
- `components/portfolio/PortfolioAllocationDonut.tsx`
  - 투자 현황 도넛

### Leaderboard 관련

- `components/RealizedTradeModal.tsx`
  - 실현거래 추가/수정
- `components/DailyNetChart.tsx`
  - 일별 순수익 차트
- `components/MonthlyNetChart.tsx`
  - 월별 순수익 차트

### Expenditure 관련

- `components/ExpenseCellModal.tsx`
  - 주간 시트 셀 입력 모달
- `components/expenditure/ExpenditureCalendar.tsx`
  - 월 달력
- `components/expenditure/ExpenditureWeekTable.tsx`
  - 주간 입력 테이블
- `components/MonthlyBucketBarChart.tsx`
  - 월 bucket 합계 막대차트
- `components/MonthlySubcategoryPieChart.tsx`
  - 월 subcategory 도넛/원차트

### Salary / Asset Trend 관련

- `components/YearPicker.tsx`
  - 연도 선택
- `components/EarningsChart.tsx`
  - Earnings 차트
- `components/SalaryChart.tsx`
  - Salary 차트
- `components/TotalAssetClient.tsx`
  - Asset Trend 실제 화면 로직
- `components/TotalAssetCalendar.tsx`
  - Asset Trend 달력
- `components/TotalAssetTrendChart.tsx`
  - Asset Trend 추이 차트

### Market 관련

- `components/market/MarketSnapshotViewer.tsx`
  - Market 전용 generic viewer
  - 현재 US/KR/Crypto의 여러 페이지가 이 컴포넌트를 공유

### 역할이 겹치거나 통합 후보

1. `PageHeader` + 각 page.tsx 내부 custom filter rows
   - header/action/filter 패턴이 반복됨
   - 필터 bar를 공통 layout primitive로 분리 가능

2. 캘린더 계열
   - `TotalAssetCalendar`
   - `components/expenditure/ExpenditureCalendar`
   - `app/memo/page.tsx` 내부 달력 렌더
   - 세 곳 모두 월 grid, 선택일, holiday coloring, badge count를 반복 구현

3. chart legend / summary UI
   - `PortfolioAllocationDonut`
   - `MonthlySubcategoryPieChart`
   - `MarketSnapshotViewer` 상세 패널
   - 카드 오른쪽 설명형 레이아웃 패턴 통합 여지 있음

4. modal form 패턴
   - `PortfolioFormModal`
   - `RealizedTradeModal`
   - `ExpenseCellModal`
   - validation / number parsing helper 공유 여지 큼

### 삭제/통합 후보

현재 코드상 사실상 미사용 또는 구형으로 보이는 컴포넌트:

- `components/AllocationSummary.tsx`
- `components/PortfolioAnalytics.tsx`
- `components/SectorNavChart.tsx`
- `components/SummaryCardGrid.tsx`
- `components/DateRangeFilter.tsx`
- `components/SeedDemoButton.tsx`
- `components/expenditure/TransactionFormModal.tsx`

근거:
- `rg` 기준으로 대부분 자기 자신 외 import가 없거나, 서로만 묶여 있고 실제 route에서 사용되지 않음
- 특히 `PortfolioAnalytics` 묶음은 현재 Portfolio 하단 분석 섹션 제거 후 orphan 상태로 보임

---

## C. Hooks / Services / Repository Map

## Portfolio

### 현재 연결 구조

- UI
  - `app/(routes)/portfolio/page.tsx`
  - `components/portfolio/PortfolioFormModal.tsx`
  - `components/portfolio/HoldingAvatar.tsx`
  - `components/portfolio/PortfolioAllocationDonut.tsx`

- Hook
  - `lib/hooks/usePortfolio.ts`
  - `lib/hooks/usePortfolioAccountState.ts`

- Repository
  - `lib/repository/portfolioRepository.ts`
  - `lib/repository/portfolioAccountStateRepository.ts`

- Service
  - `lib/services/portfolioService.ts`
  - `lib/services/portfolioAnalytics.ts` (현재 화면에서는 사실상 legacy 성격)

- Storage / external
  - Supabase: `portfolio_holdings`, `portfolio_account_state`
  - Local fallback:
    - legacy schema: `personal-finance-dashboard`
    - 계좌 상태 개별 key:
      - `pf_deposit_krw_v1`
      - `pf_deposit_usd_v1`
      - `pf_cash_krw_v1`
  - API:
    - `/api/quote`
    - `/api/fx`

### 흐름

1. `usePortfolio()`가 인증 상태를 보고 repository 선택
2. cloud 우선 조회 후 local metadata merge 시도
3. cloud empty면 local fallback 노출 + 1회 sync 시도
4. `portfolio/page.tsx`가 quote refresh, fx fetch, 정렬, table row 계산 일부를 직접 수행
5. `usePortfolioAccountState()`는 예수금/현금을 별도 저장소로 관리

### 구조 이슈

- account state와 holdings가 별도 hook/repository로 나뉘어 있어 UI 페이지가 합산 책임을 많이 가짐
- quote refresh 비즈니스 로직이 `page.tsx`에 과도하게 존재
- local metadata merge가 hook 안에 깊게 들어가 있어 책임이 무거움

---

## Expenditure

### 현재 연결 구조

- UI
  - `app/(routes)/expenditure/page.tsx`
  - `components/expenditure/ExpenditureCalendar.tsx`
  - `components/expenditure/ExpenditureWeekTable.tsx`
  - `components/ExpenseCellModal.tsx`
  - `components/MonthlyBucketBarChart.tsx`
  - `components/MonthlySubcategoryPieChart.tsx`

- Hook
  - `lib/hooks/useExpenses.ts`

- Repository
  - `lib/repository/expenseRepository.ts`

- Service
  - `lib/services/expenseService.ts`

- Storage / external
  - Supabase: `expense_entries`
  - localStorage: `pf_expense_entries_v1`
  - API:
    - `/api/calendar-days`

### 흐름

1. `useExpenses()`가 auth 기준으로 cloud/local repo 선택
2. cloud empty면 local 1회 sync
3. `expenseService`가 bucket/subcategory mapping, local schema normalize, 월/셀/합계 유틸 제공
4. `page.tsx`가 달력 범위, 주간 범위, 월 집계와 selected cell state를 관리

### 구조 이슈

- `expenseService.ts`에 storage normalize + domain aggregate + migration 규칙이 모두 섞여 있음
- page 자체가 주간 table rows, calendar summary, modal target state까지 모두 계산
- 구형 `CashTransaction` 기반 flow가 여전히 별도 서비스로 남아 있어 혼동 가능

---

## Salary / Asset Trend

### Salary

- UI
  - `app/(routes)/salary/page.tsx`
  - `components/YearPicker.tsx`
  - `components/EarningsChart.tsx`
  - `components/SalaryChart.tsx`

- Hook dependencies
  - `useExpenses()`
  - `useRealizedTrades()`

- Service
  - `lib/services/salaryService.ts`

- Storage / external
  - 간접적으로 `expense_entries`, `realized_trades`
  - FX: `/api/fx` + `pf_fx_usdkrw_v1`

### Asset Trend

- UI
  - `app/asset-trend/page.tsx`
  - `components/TotalAssetClient.tsx`
  - `components/TotalAssetCalendar.tsx`
  - `components/TotalAssetTrendChart.tsx`

- Hook
  - `lib/hooks/useTotalAssets.ts`
  - `lib/hooks/usePortfolio.ts` (총자산 계산용 현재 holdings 참조)

- Repository
  - `lib/repository/totalAssetRepository.ts`

- Service
  - `lib/services/totalAssetService.ts`
  - `lib/services/portfolioService.ts` (`calculatePortfolioTotalAsset`)

- Storage / external
  - Supabase: `total_asset_snapshots`
  - localStorage:
    - `pf_total_asset_snapshots_v1`
    - `pf_fx_usdkrw_v1`
    - 예수금/현금 key 참조
  - API:
    - `/api/fx`
    - `/api/calendar-days`
    - `/api/quote` (US quote refresh 일부)

### 구조 이슈

- `TotalAssetClient.tsx`가 route page 역할 + orchestration + refresh + calendar/fx state를 모두 가짐
- `salary/page.tsx`는 상대적으로 단순하지만, `fx` 로딩 책임이 page에 존재
- `asset-trend`는 portfolio current prices에 의존하므로 도메인 경계가 약함

---

## Memo

### 현재 연결 구조

- UI
  - `app/memo/page.tsx`

- Hook
  - `lib/hooks/useMemos.ts`

- Repository
  - `lib/repository/memoRepository.ts`

- Service
  - 별도 service 없음. 로직 상당수가 hook/repository/page에 나뉘어 있음

- Storage / external
  - Supabase: `memo_entries`
  - Supabase Storage: `memo-images`
  - localStorage: `pf_memo_entries_v1`
  - API:
    - `/api/calendar-days`

### 흐름

1. `useMemos()`가 Supabase/local fallback 선택
2. cloud empty면 local 1회 upload
3. repository가 signed URL 생성까지 담당
4. `app/memo/page.tsx`가 달력 UI, form state, selected entry, 이미지 zoom state까지 모두 관리

### 구조 이슈

- page component에 달력 렌더/폼 렌더/목록 렌더가 모두 몰려 있음
- repository가 data fetch뿐 아니라 signed URL enrichment까지 수행
- membership와 달력 패턴이 거의 같은데 공통화가 안 되어 있음

---

## Market

### 현재 연결 구조

- UI
  - `app/market/**/page.tsx`
  - `components/market/MarketSnapshotViewer.tsx`

- Hook
  - 별도 hook 없음

- Repository / Service
  - 별도 repository/service 없음

- Storage / external
  - Supabase anon client로 `market_snapshots` 직접 조회

### 흐름

1. 각 route page는 `MarketSnapshotViewer`에 `title`, `marketRegion`, `pageSlug`만 넘김
2. viewer가 Supabase query, filters, sections, grid/list, lightbox, detail panel을 모두 처리

### 구조 이슈

- repository/service 계층 없이 component가 DB 직접 접근
- `MarketSnapshotViewer.tsx`가 500+ lines로 generic page/controller 역할까지 함
- `News`는 전혀 다른 placeholder 구현이므로 market 구조 일관성이 약함

---

## D. Data Model Inconsistencies

## 1. snake_case / camelCase drift

### PortfolioHolding

앱 내부 canonical은 camelCase지만, 아래 필드가 여러 normalize 함수에 분산되어 있다.

- `tickerCode` ↔ `ticker_code`
- `displayName` ↔ `display_name`
- `logoUrl` ↔ `logo_url`
- `prevClose` ↔ `prev_close_int`
- `dayChangePct` ↔ `day_change_pct`
- `updatedAt` ↔ `updated_at`
- `priceUpdatedAt` ↔ `price_updated_at` (중요: DB row mapper에는 저장되지 않음)
- `krCode` ↔ `kr_code`

리스크:
- hook / repository / localStorage normalize가 각각 구현되어 있어 hydrate 시 field 누락 가능
- 실제로 `priceUpdatedAt`은 app model에 있으나 DB row mapper에는 없음

### TotalAssetSnapshot

- 현재 공식 필드는 `memo`
- 하지만 `totalAssetService.ts`는 여전히 `notes` fallback을 읽고 `updateTotalAssetSnapshotNotes()` wrapper를 유지

리스크:
- rename이 끝나지 않은 흔적
- future refactor 때 `memo/notes` 이중 경로가 다시 버그를 유발할 수 있음

## 2. 저장 shape / 불러오기 shape 차이

### Portfolio local vs Supabase

- local legacy repository는 `personal-finance-dashboard` schema를 사용
- newer account state는 별도 keys 사용
- holdings는 cloud/local merge 로직을 거쳐서만 완전한 metadata를 복구

리스크:
- 동일 도메인인데 두 개 이상의 persistence 모델이 공존
- refresh 후 보이는 enriched field가 reload에서 사라지는 류의 hydration bug 재발 가능

### ExpenseEntry

- `bucket`과 `subcategory`가 독립 필드처럼 보이지만 실제로는 강하게 결합
- `bucketFromSubcategory()`로 자동 매핑됨
- `LUXURY -> PLUS` migration도 service normalize에 숨어 있음

리스크:
- UI / repository / service 중 어느 한 곳이 규칙을 다르게 해석하면 분류가 깨질 수 있음

### RealizedTrade

- `rating` filter는 service 타입(`RealizedTradeFilter`)에 남아 있으나 현재 page UI에서는 제거됨
- `pnlInt`는 통화별 raw 정수이고, KRW 환산 합계는 `getPnlKrw()`로 다시 계산

리스크:
- UI 요구와 service 타입이 어긋남
- filter API 표면이 실제 사용과 다름

## 3. legacy domain이 여전히 types.ts에 남아 있음

- `CashTransaction`
- `CashTransactionType`
- `TransactionSummary`
- `SalarySummary`
- `StorageSchema`

현재 실제 메인 플로우는 `ExpenseEntry`, `RealizedTrade`, `TotalAssetSnapshot`, `MemoEntry` 중심이다.  
위 타입들은 초기 MVP 구조 잔재 성격이 강하다.

## 4. hydration bug 가능 구간

1. `usePortfolio()`  
   - cloud rows + local metadata merge
   - local fallback + cloud sync
   - current quote enrichment merge

2. `usePortfolioAccountState()`
   - local values + cloud row sync

3. `useTotalAssets()`
   - cloud 실패 시 local fallback
   - `writeSnapshotsToLocalStorage()`를 항상 호출

4. `app/memo/page.tsx`
   - calendar API fetch + local selected entry state + modal/zoom state를 한 page에서 관리

5. `MarketSnapshotViewer`
   - client-side only Supabase query + section state + selected detail state

---

## E. Dead Code / Cleanup Candidates

## 1. 미사용 또는 사실상 orphan 후보

- `components/AllocationSummary.tsx`
- `components/PortfolioAnalytics.tsx`
- `components/SectorNavChart.tsx`
- `components/SummaryCardGrid.tsx`
- `components/DateRangeFilter.tsx`
- `components/SeedDemoButton.tsx`
- `components/expenditure/TransactionFormModal.tsx`
- `lib/hooks/useTransactions.ts`
- `lib/services/transactionService.ts`
- `lib/storage/repository.ts`
- `lib/services/repository.ts`

근거:
- `rg` 기준으로 자기 자신 외 참조가 없거나, legacy 묶음끼리만 서로 참조
- 현재 active routes에서는 사용되지 않음

## 2. legacy / temp code 흔적

- `lib/services/seedService.ts`
  - 아직 `CashTransaction` 기반 `transactionService`를 사용
  - 현재 Expenditure 구조와 분리되어 있음
- `lib/services/totalAssetService.ts`
  - `updateTotalAssetSnapshotNotes()` 유지
  - legacy deposit/cash migration 코드 잔존
- `lib/storage/localStorageRepository.ts`
  - `StorageSchema` 기반 초기 MVP 저장소 유지
  - feature-specific repositories와 중복 책임

## 3. placeholder route

- `app/membership/page.tsx`
- `app/market/news/page.tsx` (strict placeholder는 아니지만 mock UI)

## 4. 사용되지 않는 import / 정리 후보

이번 audit 단계에서는 기능 변경을 피하기 위해 삭제하지 않았지만, 아래는 정리 1차 후보다.

- legacy seed / transaction 계열에서의 구형 import
- page-level helper가 지나치게 커진 파일 내부 unused util
- 시장/달력 페이지 내부에 중복된 `CalendarDayMeta`, `CalendarDaysApiResponse`, `CalendarDayInfo`

---

## F. Refactor Priority

## 1. Persistence canonicalization

가장 먼저 해야 할 일은 도메인별 canonical model과 DB/local mapper를 일원화하는 것이다.

우선순위 대상:
- PortfolioHolding
- PortfolioAccountState
- TotalAssetSnapshot
- ExpenseEntry

이 단계가 먼저 필요한 이유:
- hydration bug 대부분이 여기서 발생
- 새 기능 추가보다 현재 버그 재발 방지가 중요

## 2. Legacy transaction stack 제거

정리 대상:
- `CashTransaction` 타입
- `transactionService.ts`
- `useTransactions.ts`
- `TransactionFormModal.tsx`
- `seedService.ts`의 구형 transaction path

현재 Expenditure는 이미 `ExpenseEntry`로 전환되었기 때문에, 이 legacy stack은 유지 비용만 높인다.

## 3. Portfolio 분해

`portfolio/page.tsx`와 `usePortfolio.ts`가 현재 가장 복잡하다.

분해 권장:
- quote refresh orchestration
- header KPI 계산
- holdings table state/sort
- allocation donut data build
- KR code recovery modal

이 단계에서 `page.tsx`의 2000+ line 구조를 줄여야 이후 수정이 안정적이다.

## 4. Calendar UI 공통화

중복된 달력 구현:
- Memo
- Expenditure
- Asset Trend

공통 `MonthCalendar` primitive + day meta renderer pattern으로 분리하면 유지 비용이 크게 줄어든다.

## 5. Market layer 도입

현재 `MarketSnapshotViewer`는 component가 DB query를 직접 수행한다.  
`marketRepository` / `marketService`를 넣어서 data fetch / normalize / filtering을 분리하는 것이 좋다.

이 단계가 필요한 이유:
- Market 기능 확대 시 viewer가 너무 빠르게 비대해진다
- section/category/filter logic testability가 낮다

## 6. Placeholder/unused cleanup

마지막으로 아래를 정리한다.

- `Membership` 실제 구현 또는 route 축소
- `News` placeholder 여부 결정
- orphan components 제거
- legacy migration helper 제거

이 단계는 기능 리스크가 가장 낮으므로 마지막이 적합하다.

---

## 권장 Refactor 순서 요약

1. 도메인별 canonical schema / mapper 정리
2. legacy transaction stack 제거
3. Portfolio page + hook 분해
4. Calendar 공통 컴포넌트 추출
5. Market viewer에 repository/service 계층 도입
6. placeholder / orphan / seed / temp code 삭제

---

## 이번 단계에서 실제 수정한 내용

- `REFACTOR_AUDIT.md` 추가만 수행
- 기능 동작을 바꾸는 코드 수정은 하지 않음

