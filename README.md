# EAST

EAST는 Next.js App Router 기반의 개인 자산/거래/메모/시장 모니터링 웹앱입니다.  
현재 구조는 localStorage fallback + Supabase 연동을 함께 지원합니다.

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

## 주요 스크립트
```bash
npm run dev
npm run lint
npm run build
npm run check
```

`npm run check`는 `lint + build`를 순서대로 실행합니다.

## 기술 스택
- Next.js 14 App Router
- TypeScript
- React 18
- Recharts
- Supabase (`@supabase/supabase-js`)
- localStorage fallback
- `date-holidays`

## 환경 변수
실제 값은 `.env.local`에 넣고, 키 목록은 `/Users/kevin/Documents/New project/.env.example`를 기준으로 사용합니다.

주요 키:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `FINNHUB_API_KEY`

## 주요 페이지
- `/portfolio`
- `/leaderboard`
- `/expenditure`
- `/salary`
- `/asset-trend`
- `/memo`
- `/market/news`
- `/market/us/sector-etf-trend`
- `/membership`

## 문서
- 구조 문서: `/Users/kevin/Documents/New project/PROJECT_STRUCTURE.md`
- 배포 체크리스트: `/Users/kevin/Documents/New project/DEPLOY_CHECKLIST.md`
- 데이터 모델 정리: `/Users/kevin/Documents/New project/REFACTOR_DATA_MODEL.md`
- 리팩터링 문서 모음:
  - `/Users/kevin/Documents/New project/REFACTOR_AUDIT.md`
  - `/Users/kevin/Documents/New project/REFACTOR_PORTFOLIO.md`
  - `/Users/kevin/Documents/New project/REFACTOR_EXPENDITURE.md`
  - `/Users/kevin/Documents/New project/REFACTOR_LEADERBOARD.md`
  - `/Users/kevin/Documents/New project/REFACTOR_MEMO.md`
  - `/Users/kevin/Documents/New project/REFACTOR_MARKET.md`
  - `/Users/kevin/Documents/New project/REFACTOR_MEMBERSHIP.md`
  - `/Users/kevin/Documents/New project/REFACTOR_SHARED_UI.md`
  - `/Users/kevin/Documents/New project/REFACTOR_DATE_UTILS.md`
  - `/Users/kevin/Documents/New project/REFACTOR_CHARTS.md`
  - `/Users/kevin/Documents/New project/REFACTOR_CLEANUP.md`

## 참고
- 일부 영역은 Supabase 연동이 활성화되어 있고, 비로그인 상태에서는 local fallback 또는 빈 상태 UI를 사용합니다.
- Membership은 현재 route shell 상태이며, 실제 CRUD 복구는 후속 작업 대상입니다.
