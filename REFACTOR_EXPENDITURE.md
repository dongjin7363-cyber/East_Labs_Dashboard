# Expenditure Refactor Step 4B

## 분리 전 구조 문제

- `/Users/kevin/Documents/New project/app/(routes)/expenditure/page.tsx`가
  데이터 준비와 함께 헤더, 달력 컨트롤, 주간 입력 섹션, 차트 섹션 JSX를 모두 직접 렌더하고 있었습니다.
- 이미 `ExpenditureCalendar`, `ExpenditureWeekTable` 같은 하위 컴포넌트가 있었지만,
  섹션 wrapper와 상단 컨트롤은 route에 남아 있어 전체 구조를 한눈에 읽기 어려웠습니다.
- 월 선택/선택 날짜/선택 주, 주간 입력 헤더, 하단 차트 카드 구성이
  페이지 본문에 직접 박혀 있어 작은 UI 수정도 route 파일을 크게 건드리게 되는 형태였습니다.

## 분리한 컴포넌트 목록

- `/Users/kevin/Documents/New project/components/expenditure/ExpenditureHeaderBar.tsx`
- `/Users/kevin/Documents/New project/components/expenditure/ExpenditureMonthCalendar.tsx`
- `/Users/kevin/Documents/New project/components/expenditure/ExpenditureWeekSection.tsx`
- `/Users/kevin/Documents/New project/components/expenditure/ExpenditureChartsSection.tsx`

## 각 컴포넌트 책임

### ExpenditureHeaderBar

- 페이지 제목
- 월 총 소비 인라인 메타 표시

### ExpenditureMonthCalendar

- 월 선택 input
- 선택 날짜 / 선택 주 표시
- 기존 `ExpenditureCalendar` 조립

### ExpenditureWeekSection

- `주간 입력` 섹션 제목
- 선택 주 범위 라벨
- 기존 `ExpenditureWeekTable` 조립

### ExpenditureChartsSection

- 월 카테고리 합계 카드
- 월 세부항목 비중 카드
- 총 소비 표시
- 기존 차트 컴포넌트 조립

## 추후 정리 후보

1. 달력 상단 컨트롤과 `Total Asset`, `Memo` 달력 컨트롤 공통화 가능성 검토
2. Expenditure 전용 view model을 만들어 `page.tsx`의 월/주 집계를 더 얇게 만들기
3. `SelectedCell`, `CalendarDayInfo` 같은 타입을 도메인별 파일로 이동할지 검토
4. `TransactionFormModal.tsx`는 현재 사용 여부 재점검 필요
