# Market Refactor Step 4E

## 분리 전 구조 문제

- `/Users/kevin/Documents/New project/components/market/MarketSnapshotViewer.tsx`가
  데이터 로딩, 필터 상태, grid/list 분기, 리스트 아코디언, 상세 패널, 확대 모달을
  한 파일에서 모두 처리하고 있었습니다.
- `/Users/kevin/Documents/New project/app/market/.../page.tsx`는 대부분 짧았지만
  title / marketRegion / pageSlug 설정이 각 route에 중복되어 있었습니다.
- News placeholder도 route 파일 안에서 직접 카드 배열을 렌더하고 있어
  Market route와 view layer의 역할이 섞여 있었습니다.

## 분리한 컴포넌트 목록

- `/Users/kevin/Documents/New project/components/market/MarketSnapshotHeader.tsx`
- `/Users/kevin/Documents/New project/components/market/MarketSnapshotFilters.tsx`
- `/Users/kevin/Documents/New project/components/market/MarketSnapshotGridView.tsx`
- `/Users/kevin/Documents/New project/components/market/MarketSnapshotListView.tsx`
- `/Users/kevin/Documents/New project/components/market/MarketSnapshotDetailPanel.tsx`
- `/Users/kevin/Documents/New project/components/market/MarketPlaceholderPage.tsx`
- `/Users/kevin/Documents/New project/components/market/marketSnapshotUi.ts`

## 각 컴포넌트 책임

### MarketSnapshotHeader

- 제목
- 날짜 선택 input

### MarketSnapshotFilters

- Section 드롭다운
- Search input
- Grid / List 토글

### MarketSnapshotGridView

- grid 카드 렌더
- 카드 이미지 확대 연결

### MarketSnapshotListView

- list mode 레이아웃
- 좌측 section select / section accordion / row list
- 우측 detail panel 조립

### MarketSnapshotDetailPanel

- 선택된 항목의 큰 이미지
- 메타 정보 표시

### MarketPlaceholderPage

- News 같은 placeholder route의 공통 shell

## route page와 viewer의 역할 분리

- route page:
  - 어떤 market region/page slug/title을 보여줄지 결정
  - config만 전달
- `MarketSnapshotViewer`:
  - 데이터 로딩
  - 상태 연결
  - 하위 UI 컴포넌트 조립

## 설정 파일

- `/Users/kevin/Documents/New project/lib/market/marketPages.ts`
  - snapshot page 설정
  - News placeholder card 데이터

## 추후 개선 후보

1. MarketSnapshotViewer의 state/derived data를 `useMarketSnapshotsViewModel` 같은 hook으로 이동
2. lightbox modal도 별도 컴포넌트로 분리
3. market instruments master table 기반 메타 정보 확장
4. placeholder pages를 실제 데이터 source 연결 시 같은 shell 위에 얹도록 공통화 심화
