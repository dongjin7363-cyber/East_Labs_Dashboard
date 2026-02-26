# Personal Finance Dashboard MVP (Next.js)

로컬 우선(localStorage) 개인 재무 대시보드 MVP입니다.

## 기술 스택
- Next.js App Router
- TypeScript
- React Hooks 기반 상태관리
- localStorage (버전 스키마 포함)

## 실행 방법
1. Node.js 20+ 설치
2. 의존성 설치
```bash
npm install
```
3. 개발 서버 실행
```bash
npm run dev
```
4. 브라우저에서 `http://localhost:3000` 접속

## 환경 변수 (현재가 자동조회)
`.env.local`에 아래 값을 설정하면 US 종목 현재가를 Finnhub에서 우선 조회합니다.

```bash
FINNHUB_API_KEY=your_finnhub_key
```

- Finnhub 실패 시 Stooq CSV로 fallback 조회합니다.
- 클라이언트는 `/api/quote`만 호출하고 API 키는 서버에서만 사용됩니다.

## Leaderboard (실현손익)
- `Leaderboard` 페이지는 실현 매매일지(RealizedTrade) 기반으로 동작합니다.
- 저장 키: `pf_realized_trades_v1`
- 월 선택(YYYY-MM), 검색, rating 필터를 지원합니다.
- CSV import 로직은 `date+ticker+buyAmountInt+sellAmountInt` 기준으로 중복을 건너뜁니다.
- 하단에 일별 순수익 막대차트(거래일 축, 주말/KR 공휴일 제외)와 월별 순수익 막대차트가 표시됩니다.

## 페이지
- `/portfolio`: 보유자산 CRUD, KR/US 필터, 평가금액/손익 요약
- `/leaderboard`: 실현손익 일지, 월 필터/차트/행 클릭 상세 모달
- `/total-asset`: 일별 총자산 스냅샷 기록(달력), 자동 기록, 일별 추이 차트
- `/expenditure`: 입금/소비 거래 CRUD, 기간/타입/통화/검색 필터
- `/salary`: 기간별 총 입금/총 소비/총 수익(평가손익) 요약

## 데이터 저장
- storage key: `personal-finance-dashboard`
- schema version: `1`
- 저장 구조
  - `portfolioHoldings`
  - `cashTransactions`
  - `updatedAt`

## 구조
```text
app/
  (routes)/
    leaderboard/
    expenditure/
    portfolio/
    salary/
components/
  expenditure/
  portfolio/
lib/
  hooks/
  models/
  services/
  storage/
  utils/
```

## 구현 포인트
- 금액은 정수 기반 저장
  - KRW: 원 단위 정수
  - USD: 센트 단위 정수
- 화면 표시 시 통화 포맷팅
- 날짜 범위 필터 프리셋
  - 이번달 / 지난달 / 커스텀
- 상단 네비게이션 + 반응형 레이아웃
