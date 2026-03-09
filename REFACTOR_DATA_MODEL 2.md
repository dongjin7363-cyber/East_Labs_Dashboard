# REFACTOR_DATA_MODEL

기준일: 2026-03-07  
범위: 데이터 모델 / mapper / repository 구조 통일 현황.

## 목표

이번 단계에서 정리한 원칙은 다음과 같다.

1. 앱 내부 모델은 camelCase만 사용한다.
2. DB row는 snake_case를 유지한다.
3. snake_case ↔ camelCase 변환은 repository mapper에서만 수행한다.
4. localStorage에는 canonical app model 기준 payload만 저장한다.
5. `app/`, `components/`, `lib/hooks/`에서는 DB field명을 직접 다루지 않는다.

## 이번 단계에서 실제 반영한 파일

### Canonical types
- `/Users/kevin/Documents/New project/lib/models/types.ts`

### Mapper
- `/Users/kevin/Documents/New project/lib/repository/mappers/common.ts`
- `/Users/kevin/Documents/New project/lib/repository/mappers/portfolioHoldingMapper.ts`
- `/Users/kevin/Documents/New project/lib/repository/mappers/portfolioAccountStateMapper.ts`
- `/Users/kevin/Documents/New project/lib/repository/mappers/expenseEntryMapper.ts`
- `/Users/kevin/Documents/New project/lib/repository/mappers/memoEntryMapper.ts`
- `/Users/kevin/Documents/New project/lib/repository/mappers/totalAssetSnapshotMapper.ts`
- `/Users/kevin/Documents/New project/lib/repository/mappers/marketSnapshotMapper.ts`

### Repository / storage / consumer
- `/Users/kevin/Documents/New project/lib/repository/portfolioRepository.ts`
- `/Users/kevin/Documents/New project/lib/repository/portfolioAccountStateRepository.ts`
- `/Users/kevin/Documents/New project/lib/repository/expenseRepository.ts`
- `/Users/kevin/Documents/New project/lib/repository/memoRepository.ts`
- `/Users/kevin/Documents/New project/lib/repository/totalAssetRepository.ts`
- `/Users/kevin/Documents/New project/lib/repository/marketSnapshotRepository.ts`
- `/Users/kevin/Documents/New project/lib/storage/localStorageRepository.ts`
- `/Users/kevin/Documents/New project/components/market/MarketSnapshotViewer.tsx`

---

## 1. Canonical App Types

## PortfolioHolding

현재 canonical app model:

```ts
interface PortfolioHolding {
  id: string
  market: "KR" | "US"
  currency: "KRW" | "USD"
  ticker: string
  displayName?: string
  comment?: string
  tickerCode?: string
  logoUrl?: string
  krCode?: string
  quoteDisabled?: boolean
  sector: PortfolioSector
  qty: number
  avgPrice: number
  currentPrice: number
  prevClose?: number
  dayChangePct?: number
  priceUpdatedAt?: string
  updatedAt: string
}
```

주의:
- field name은 기존 `avgPrice/currentPrice/prevClose`를 유지했다.
- 단위는 canonical하게 정수 가격 단위다.
  - KRW: 원
  - USD: 센트

이번 단계에서는 UI/도메인 전역 rename 리스크를 피하기 위해 `avgPriceInt`로의 전면 rename은 하지 않았다.  
대신 mapper와 주석으로 integer semantics를 명확히 고정했다.

## PortfolioAccountState

```ts
interface PortfolioAccountState {
  depositKrwInt: number
  depositUsdCents: number
  cashKrwInt: number
  updatedAt: string
}
```

## ExpenseEntry

```ts
interface ExpenseEntry {
  id: string
  date: string
  bucket: "INCOME" | "SUBSCRIPTION" | "PLUS" | "SPENDING"
  subcategory?: ExpenseSubcategory
  amountInt: number
  note: string
  createdAt: string
}
```

## MemoEntry

```ts
interface MemoEntry {
  id: string
  date: string
  buyTickers: string
  sellTickers: string
  comment: string
  imagePaths: string[]
  imageSignedUrls?: Record<string, string | null>
  createdAt: string
  updatedAt: string
}
```

## TotalAssetSnapshot

```ts
interface TotalAssetSnapshot {
  id: string
  date: string
  totalAssetKrwInt: number
  fxRate: number
  memo?: string
  createdAt: string
}
```

## MarketSnapshot

```ts
interface MarketSnapshot {
  id: string
  runDate: string
  snapshotKey: string
  title: string
  symbol: string
  category: string
  section: string
  sourceUrl: string
  imageUrl: string
  sortOrder: number
  updatedAt: string
}
```

---

## 2. DB Fields ↔ App Fields 매핑표

## Portfolio holdings (`portfolio_holdings`)

| DB row | App model |
|---|---|
| `id` | `id` |
| `market` | `market` |
| `ticker` | `ticker` |
| `ticker_code` | `tickerCode` |
| `display_name` | `displayName` |
| `logo_url` | `logoUrl` |
| `qty` | `qty` |
| `avg_price_int` | `avgPrice` |
| `current_price_int` | `currentPrice` |
| `prev_close_int` | `prevClose` |
| `day_change_pct` | `dayChangePct` |
| `comment` | `comment` |
| `sector` | `sector` |
| `updated_at` | `updatedAt` |

메모:
- `currency`는 DB row에 없고 `market`에서 유도한다.
- `krCode`, `quoteDisabled`, `priceUpdatedAt`는 현재 DB canonical row에 저장하지 않는다.
  - `krCode`는 `tickerCode`와 local metadata에서 복원 가능
  - `priceUpdatedAt`는 local/refresh state 보조 메타로 취급

## Portfolio account state (`portfolio_account_state`)

| DB row | App model |
|---|---|
| `deposit_krw_int` | `depositKrwInt` |
| `deposit_usd_cents` | `depositUsdCents` |
| `cash_krw_int` | `cashKrwInt` |
| `updated_at` | `updatedAt` |

## Expense entries (`expense_entries`)

| DB row | App model |
|---|---|
| `id` | `id` |
| `date` | `date` |
| `bucket` | `bucket` |
| `subcategory` | `subcategory` |
| `amount_int` | `amountInt` |
| `note` | `note` |
| `created_at` | `createdAt` |

## Memo entries (`memo_entries`)

| DB row | App model |
|---|---|
| `id` | `id` |
| `date` | `date` |
| `buy_tickers` | `buyTickers` |
| `sell_tickers` | `sellTickers` |
| `comment` | `comment` |
| `image_paths` | `imagePaths` |
| `created_at` | `createdAt` |
| `updated_at` | `updatedAt` |

## Total asset snapshots (`total_asset_snapshots`)

| DB row | App model |
|---|---|
| `date` | `date` |
| `total_asset_krw_int` | `totalAssetKrwInt` |
| `fx_rate` | `fxRate` |
| `memo` | `memo` |
| `updated_at` | `createdAt` fallback source |

메모:
- DB는 `updated_at`만 갖고 있고 app model은 `createdAt`을 사용한다.
- 이 필드는 현재 “snapshot recorded timestamp” 의미로 사용 중이며, 후속 단계에서 `recordedAt`/`updatedAt` 분리가 더 명확하다.

## Market snapshots (`market_snapshots`)

| DB row | App model |
|---|---|
| `run_date` | `runDate` |
| `snapshot_key` | `snapshotKey` |
| `source_url` | `sourceUrl` |
| `image_url` | `imageUrl` |
| `sort_order` | `sortOrder` |
| `updated_at` | `updatedAt` |
| `section` | `section` |
| `category` | `category` |

---

## 3. localStorage Keys / Payload Shape

## Portfolio holdings legacy schema

키:
- `personal-finance-dashboard`

shape:

```json
{
  "schemaVersion": 1,
  "portfolioHoldings": [PortfolioHolding],
  "cashTransactions": [],
  "updatedAt": "ISO"
}
```

이번 단계에서:
- `portfolioHoldings`는 canonical camelCase `PortfolioHolding`만 저장하도록 맞췄다.
- 읽을 때는 legacy snake/camel 혼합도 허용하지만, 쓸 때는 canonical만 쓴다.

## Portfolio account state

키:
- `pf_deposit_krw_v1`
- `pf_deposit_usd_v1`
- `pf_cash_krw_v1`

shape:
- 개별 string number 저장
- repository에서 읽어 canonical `PortfolioAccountState`로 조립

## Expense entries

키:
- `pf_expense_entries_v1`

shape:

```json
{
  "schemaVersion": 1,
  "entries": [ExpenseEntry],
  "updatedAt": "ISO"
}
```

## Memo entries

키:
- `pf_memo_entries_v1`

shape:

```json
[MemoEntry]
```

이번 단계에서:
- local write 시 canonical camelCase entry 배열만 저장
- 읽을 때만 과거 `buy_tickers`, `sell_tickers`, `image_paths`도 호환

## Total asset snapshots

키:
- `pf_total_asset_snapshots_v1`

shape:

```json
{
  "schemaVersion": 1,
  "snapshots": [TotalAssetSnapshot],
  "updatedAt": "ISO"
}
```

## FX / 기타 설정

- `pf_fx_usdkrw_v1`
- `pf_last_quote_refresh_at_v1`
- `pf_last_quote_fail_at_v1`
- `pf_quote_blacklist_v1`

이 값들은 설정/캐시 계층이고, primary entity repository와는 분리된다.

---

## 4. Repository별 책임 범위

## `portfolioRepository`

책임:
- `portfolio_holdings` row ↔ `PortfolioHolding` mapper 적용
- Supabase primary load / fallback load
- canonical holding upsert/delete

비책임:
- quote refresh orchestration
- cloud/local sync policy
- UI sort/filter

## `portfolioAccountStateRepository`

책임:
- account state row ↔ app state 변환
- local key 3개 ↔ canonical state 조립

## `expenseRepository`

책임:
- `expense_entries` row ↔ `ExpenseEntry`
- CRUD only

메모:
- bucket/subcategory migration rule은 여전히 `expenseService.ts` 도메인 책임

## `memoRepository`

책임:
- `memo_entries` row ↔ `MemoEntry`
- local array ↔ `MemoEntry`
- Supabase signed URL enrichment
- delete 시 storage object best-effort 제거

## `totalAssetRepository`

책임:
- `total_asset_snapshots` row ↔ `TotalAssetSnapshot`
- local snapshot storage ↔ canonical snapshot

## `marketSnapshotRepository`

책임:
- `market_snapshots` row ↔ `MarketSnapshot`
- query + normalize + removed symbol filtering

이번 단계 변경:
- `MarketSnapshotViewer`에서 DB row field handling을 제거했다.
- component는 이제 canonical `MarketSnapshot`만 다룬다.

---

## 5. 이번 단계에서 제거한 shape drift

1. `components/market/MarketSnapshotViewer.tsx`
   - 이전: component가 `snapshot_key`, `run_date`, `image_url`, `source_url`, `sort_order`, `updated_at`를 직접 파싱
   - 현재: repository + mapper가 canonical `MarketSnapshot` 제공

2. `lib/repository/portfolioRepository.ts`
   - 이전: repository 내부에 row normalize/serialize helper가 직접 흩어져 있었음
   - 현재: dedicated mapper 사용

3. `lib/storage/localStorageRepository.ts`
   - 이전: portfolio holding normalize logic이 local repo 내부에 중복
   - 현재: canonical storage serialize + shared deserialize 사용

4. `lib/repository/memoRepository.ts`
   - 이전: local write가 raw object를 바로 저장
   - 현재: canonical `MemoEntry` 기준으로 local write

5. `app/`, `components/`, `lib/hooks/`
   - direct DB snake_case field reference 제거
   - 현재 snake_case는 repository/mapper layer에만 남음

---

## 6. 아직 남아 있는 후속 정리 포인트

1. PortfolioHolding field rename
   - 현재 `avgPrice/currentPrice/prevClose`는 canonical이지만 이름만 보면 int unit이 드러나지 않는다.
   - 전면 rename(`avgPriceInt/currentPriceInt/prevCloseInt`)은 다음 단계 후보.

2. RealizedTrade mapper 분리
   - 이번 단계에서는 `realizedTradeRepository.ts`는 기존 inline mapper를 유지했다.
   - Salary/Leaderboard 안정화를 위해 다음 단계에서 같은 패턴으로 분리하는 것이 좋다.

3. TotalAssetSnapshot timestamp semantics
   - app model이 `createdAt`, DB row가 `updated_at` 중심이라 의미가 약간 어긋난다.
   - `recordedAt` 같은 명확한 field로 후속 정리 권장.

4. Hook-level auto sync policy
   - local → cloud 1회 sync 로직은 아직 hook에 남아 있다.
   - 다음 단계에서 `SyncCoordinator` 또는 repository decorator로 이동 가능.

---

## 7. 검증

실행한 검증:

```bash
node_modules/.bin/tsc --noEmit
```

결과:
- 통과

