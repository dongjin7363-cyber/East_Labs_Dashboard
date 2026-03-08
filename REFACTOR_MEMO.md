# Memo Refactor Step 4D

## 분리 전 구조 문제

- `/Users/kevin/Documents/New project/app/memo/page.tsx` 한 파일에
  헤더, 달력, 작성 폼, 날짜별 목록, 이미지 확대 모달이 모두 섞여 있었습니다.
- 저장/삭제/선택 상태와 렌더 JSX가 한 파일에 길게 붙어 있어
  구조를 읽으려면 달력 API fetch와 목록 카드 렌더를 같이 따라가야 했습니다.
- 이미지 썸네일 렌더와 폼 입력 렌더가 같은 파일 안에 있어
  UI 수정 범위를 좁히기 어려운 상태였습니다.

## 분리한 컴포넌트 목록

- `/Users/kevin/Documents/New project/components/memo/MemoHeaderBar.tsx`
- `/Users/kevin/Documents/New project/components/memo/MemoCalendarSection.tsx`
- `/Users/kevin/Documents/New project/components/memo/MemoEntryForm.tsx`
- `/Users/kevin/Documents/New project/components/memo/MemoEntriesList.tsx`

## 각 컴포넌트 책임

### MemoHeaderBar

- 페이지 제목
- 월 선택
- 선택 날짜 표시

### MemoCalendarSection

- 월 달력 렌더
- 오늘/선택 날짜 강조
- 날짜별 메모 개수 badge 표시

### MemoEntryForm

- Buy tickers
- Sell tickers
- Comment
- New / Save / Delete 버튼

### MemoEntriesList

- 선택 날짜의 메모 카드 목록
- 카드 선택 상태
- 이미지 썸네일 strip
- 확대용 이미지 선택 이벤트 전달

## 추후 정리 후보

1. `calendar-days` fetch와 memo 달력을 공통 달력 hook으로 분리할지 검토
2. 이미지 업로드 UI가 다시 붙으면 form 내부에서 전용 section으로 분리 가능
3. 이미지 zoom modal도 별도 컴포넌트로 뺄 수 있음
4. `Total Asset`, `Expenditure`, `Memo` 달력 렌더 공통화 가능성 검토
