# Leaderboard Refactor Step 4C

## 분리 전 구조 문제

- `/Users/kevin/Documents/New project/app/(routes)/leaderboard/page.tsx` 한 파일에
  상단 헤더, 필터/요약 bar, 거래 테이블, 차트 섹션, 모달 연결이 모두 함께 있었습니다.
- 필터/정렬/집계 계산 자체는 명확했지만, JSX가 길어 페이지 구조를 읽기 어렵고
  작은 UI 수정에도 route 파일을 직접 크게 건드려야 했습니다.
- 상단 inline summary와 테이블 헤더 정렬 UI가 page 내부에 직접 박혀 있어
  다른 화면과 패턴을 맞추기 어렵습니다.

## 분리한 컴포넌트 목록

- `/Users/kevin/Documents/New project/components/leaderboard/LeaderboardHeaderBar.tsx`
- `/Users/kevin/Documents/New project/components/leaderboard/LeaderboardSummaryInline.tsx`
- `/Users/kevin/Documents/New project/components/leaderboard/LeaderboardTradesTable.tsx`
- `/Users/kevin/Documents/New project/components/leaderboard/LeaderboardChartsSection.tsx`

## 각 컴포넌트 책임

### LeaderboardHeaderBar

- 페이지 제목
- 거래 추가 버튼
- 월 선택 / Market / Search 필터
- 우측 요약 summary 조립

### LeaderboardSummaryInline

- 총 거래 수
- 수익 거래 수 및 승률
- 순수익

### LeaderboardTradesTable

- 거래 테이블 렌더
- 정렬 헤더 버튼
- 빈 상태 / 로딩 상태
- row click 선택

### LeaderboardChartsSection

- 일별 순수익 차트 섹션
- 월별 순수익 차트 섹션
- 각 섹션 상단 submetric 표시

## 추후 정리 후보

1. 상세 모달도 `LeaderboardTradeDetailModal` 같은 별도 컴포넌트로 분리 가능
2. 공통 `FilterToolbar` / `SortableTableHeader` 패턴 공통화 가능성 검토
3. `selectedMonth`, `market`, `search`, `sortState`를 view model hook으로 묶을지 검토
