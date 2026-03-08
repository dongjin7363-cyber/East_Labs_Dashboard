# Refactor Date Utils

## 1. 이번 단계 목적

기능 변경 없이 날짜 계산과 KST 처리, 그리고 월 선택이 들어가는 상단 헤더 구조를 안전하게 정리했다.

이번 단계에서 한 일:

- KST 전용 유틸 분리
- 월/주간 범위 계산 유틸 분리
- 월 선택 + 선택 날짜 + 추가 summary/action 을 담는 공통 header 추가

이번 단계에서 하지 않은 일:

- 달력 본체 공통화
- holiday API 통합/변경
- 차트 x축 날짜 처리 공통화
- 데이터 로직 변경

## 2. 추가한 공통 유틸

### `/Users/kevin/Documents/New project/lib/date/kst.ts`

KST 기준 처리 전용 유틸.

정리한 함수:

- `getTodayKST()`
- `toKSTDateString(date)`
- `getCurrentMonthKST()`
- `getCurrentKstHour()`
- `formatDateKST(value)`

주요 목적:

- `Intl` + `Asia/Seoul` 처리 중복 제거
- `todayKstYmd`, 현재 월, 현재 시간 계산을 한 곳에 모음
- ISO 시간 표시 포맷의 기준 통일

### `/Users/kevin/Documents/New project/lib/date/calendar.ts`

날짜 범위/월/주 계산 전용 유틸.

정리한 함수:

- `toYmd(date)`
- `toYm(date)`
- `getMonthStartEnd(monthKey)`
- `getMonthDays(monthKey)`
- `getDatesInRange(from, to)`
- `getWeekRangeSundayStart(date)`
- `formatWeekRangeCompact(from, to)`
- `getDayOfWeekKST(date)`
- `isWeekend(value)`
- `isSameDate(a, b)`
- `resolveDateRange(...)`
- `isDateInRange(...)`

주요 목적:

- 월 시작/끝, 월 날짜 목록, 주간(日~土) 범위, compact range formatting 중복 제거

## 3. 호환 레이어

### `/Users/kevin/Documents/New project/lib/utils/date.ts`

기존 import 경로를 깨지 않기 위해 compatibility wrapper로 유지했다.

현재 역할:

- 기존 함수명 유지
- 실제 구현은 `lib/date/kst.ts`, `lib/date/calendar.ts`로 위임

이렇게 해서 기존 코드가 한 번에 깨지지 않으면서, 새 코드부터는 `lib/date/*` 기준으로 옮길 수 있게 만들었다.

### `/Users/kevin/Documents/New project/lib/utils/time.ts`

- `formatKST()`는 이제 내부적으로 `formatDateKST()`를 사용한다.

## 4. 추가한 공통 헤더

### `/Users/kevin/Documents/New project/components/common/CalendarHeaderBar.tsx`

역할:

- 좌측: 제목 / titleMeta / description
- 우측: 월 선택 / 선택 날짜 / rightExtra / actions

지원 props:

- `title`
- `titleMeta`
- `monthValue`
- `onMonthChange`
- `selectedDate`
- `selectedDateLabel`
- `rightExtra`
- `actions`
- `className`

목적:

- Memo / Expenditure / Asset Trend 같은 "월 선택 + 선택 날짜" 패턴을 같은 구조로 맞춤

## 5. 적용한 페이지 / 컴포넌트

### Expenditure

적용 파일:

- `/Users/kevin/Documents/New project/app/(routes)/expenditure/page.tsx`
- `/Users/kevin/Documents/New project/components/expenditure/ExpenditureHeaderBar.tsx`
- `/Users/kevin/Documents/New project/components/expenditure/ExpenditureMonthCalendar.tsx`
- `/Users/kevin/Documents/New project/components/expenditure/ExpenditureCalendar.tsx`

정리 내용:

- 월 선택 / 선택 날짜 / 선택 주를 header로 이동
- 주간 범위 텍스트는 `formatWeekRangeCompact()` 사용
- day-of-week fallback은 `getDayOfWeekKST()` 사용

### Memo

적용 파일:

- `/Users/kevin/Documents/New project/app/memo/page.tsx`
- `/Users/kevin/Documents/New project/components/memo/MemoHeaderBar.tsx`
- `/Users/kevin/Documents/New project/lib/repository/memoRepository.ts`

정리 내용:

- Memo header를 `CalendarHeaderBar`로 교체
- 기본 월/오늘 날짜를 KST 유틸로 통일
- month range / month dates / leading blank 계산을 공통 date util 기준으로 변경

### Asset Trend

적용 파일:

- `/Users/kevin/Documents/New project/components/TotalAssetClient.tsx`
- `/Users/kevin/Documents/New project/components/TotalAssetCalendar.tsx`

정리 내용:

- `PageHeader + 별도 필터 panel` 구조를 `CalendarHeaderBar + 기존 layout` 구조로 정리
- 월 선택 / 선택 날짜 / 환율 / 자동 기록 버튼을 header 기준으로 통일
- month range / today / current hour 계산을 KST/date util 기준으로 변경

### Membership

적용 파일:

- `/Users/kevin/Documents/New project/app/membership/page.tsx`

정리 내용:

- 현재 placeholder route shell에도 `CalendarHeaderBar` 적용
- Membership 실제 CRUD가 복구되면 같은 header 구조를 이어서 사용할 수 있게 준비

### Market

적용 파일:

- `/Users/kevin/Documents/New project/components/market/MarketSnapshotHeader.tsx`
- `/Users/kevin/Documents/New project/components/market/MarketSnapshotViewer.tsx`

정리 내용:

- 오늘 날짜 초기값/날짜 input fallback을 `getTodayKST()` 기준으로 통일

## 6. 아직 공통화하지 않은 영역

이번 단계에서 의도적으로 남긴 것:

- 달력 grid 컴포넌트 자체
  - Memo / Expenditure / Total Asset 는 UI/상호작용이 아직 다름
- holiday API fetch / cache 구조
  - 페이지별 state/cache 구조 유지
- chart 날짜축 / tooltip date formatting
  - 차트별 요구사항이 달라 아직 분리하지 않음
- `Leaderboard` month picker
  - page header 구조는 다르지만 date util 쪽만 간접 공유

## 7. 다음 단계 후보

우선순위:

1. 달력 shell 공통화
   - caption / weekday / leading blank 계산
2. holiday map fetch helper 공통화
3. month picker / selected date meta small component 추출
4. chart date axis formatter 공통화
