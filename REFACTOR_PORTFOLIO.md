# Portfolio Refactor Step 4A

## 분리 전 구조 문제

- `/Users/kevin/Documents/New project/app/(routes)/portfolio/page.tsx` 한 파일에
  헤더, 현금/예수금 입력, 투자 현황, 홀딩 테이블, 모달 렌더가 모두 섞여 있었습니다.
- 상태/저장 로직과 JSX 렌더가 같은 파일에 길게 붙어 있어,
  화면 구조를 파악하려면 quote refresh, local/cloud fallback, comment save 로직까지
  함께 읽어야 했습니다.
- render helper와 UI 섹션이 뒤섞여 있어 작은 UI 수정에도 route 파일을 크게 건드리게 되는 구조였습니다.

## 분리한 컴포넌트

- `/Users/kevin/Documents/New project/components/portfolio/PortfolioHeaderBar.tsx`
- `/Users/kevin/Documents/New project/components/portfolio/PortfolioCashInputs.tsx`
- `/Users/kevin/Documents/New project/components/portfolio/PortfolioAllocationSection.tsx`
- `/Users/kevin/Documents/New project/components/portfolio/PortfolioHoldingsSection.tsx`

## 각 컴포넌트 책임

### PortfolioHeaderBar

- `Portfolio` 제목
- 총 자산(KRW)
- 총 PNL %
- 총 계좌 손익(KRW)
- 현재가 갱신 / 추가 버튼

### PortfolioCashInputs

- 예수금(KRW)
- 예수금(USD)
- 현금(KRW)
- 환율 / 마지막 갱신 정보
- quote warning 표시
- 수동 KR 코드 입력 링크 버튼

### PortfolioAllocationSection

- 투자 현황 섹션의 route-level wrapper
- 현재는 기존 `/Users/kevin/Documents/New project/components/portfolio/PortfolioAllocationDonut.tsx`
  를 그대로 감싸는 얇은 컴포넌트입니다.
- 이후 Step 4B에서 allocation summary / donut / legend를 더 세분화할 수 있습니다.

### PortfolioHoldingsSection

- Market 필터
- Search 입력
- 종목 리스트 테이블
- 정렬 헤더
- 로고/국기 + 회사명/티커 표시
- Comment input

## 아직 큰 덩어리로 남아 있는 부분

- `/Users/kevin/Documents/New project/app/(routes)/portfolio/page.tsx`
  - quote fetch / blacklist / stale refresh 정책
  - account state input handling
  - comment commit
  - manual KR code modal
  - add/edit modal submit/delete
- `/Users/kevin/Documents/New project/components/portfolio/PortfolioAllocationDonut.tsx`
  - summary box, donut, legend, mode toggle가 아직 한 파일에 같이 있습니다.

## 다음 정리 후보

1. `PortfolioAllocationDonut.tsx` 내부를 summary / chart / legend로 재분리
2. quote refresh 관련 로직을 `usePortfolioQuotes` 같은 hook으로 이동할지 검토
3. `PortfolioHoldingsSection`의 row renderer를 별도 row 컴포넌트로 나눌지 검토
