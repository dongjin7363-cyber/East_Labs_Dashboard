# DEPLOY_CHECKLIST

## 1. Local Pre-Deploy Checks

### Install / run
```bash
npm install
npm run dev
```

### Mandatory validation
```bash
npm run lint
npm run build
npm run check
```

### Core route checks
- `/portfolio`
- `/leaderboard`
- `/expenditure`
- `/salary`
- `/asset-trend`
- `/memo`
- `/market/us/sector-etf-trend`
- `/membership`

### Functional smoke checks
- auth login/logout
- portfolio holdings load
- expenditure weekly sheet renders
- leaderboard table and charts render
- asset trend calendar and chart render
- memo form/list render
- market snapshot viewer loads or shows empty state cleanly

## 2. Deployment Steps
```bash
git add .
git commit -m "your message"
git push
```

Then verify Vercel build status and deployment logs.

## 3. Post-Deploy Checks
- open the production URL
- verify top navigation routes
- verify favicon/app icon
- verify Supabase auth session restore
- verify `/api/fx`
- verify `/api/quote`
- verify `/api/calendar-days`

## 4. High-Risk Pages To Recheck
- `/portfolio`
  - holdings load
  - quote refresh
  - donut / table render
- `/leaderboard`
  - filters
  - charts
  - modal open/save
- `/expenditure`
  - calendar
  - weekly sheet
  - donut visibility
- `/asset-trend`
  - calendar selection
  - snapshot save/delete
  - chart render
- `/memo`
  - entry save
  - image preview

## 5. Failure Checklist

### Build errors
- run `npm run build` locally first
- inspect type errors before deployment
- confirm deleted files are no longer imported

### Supabase env issues
Check:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `FINNHUB_API_KEY`

### Market data issues
- current repo snapshot does not include tracked market automation scripts/workflows
- viewer may be healthy even if external snapshot automation is absent

### Static assets
- favicon/app icon files under `app/`
- logo files under `public/logos/`
- uploaded memo images signed URL flow

### localStorage fallback
- if Supabase data looks empty, confirm local fallback behavior
- check `pf_*` keys and `personal-finance-dashboard` payload in browser storage

## 6. Rollback Mindset
- if build fails on Vercel, do not patch blindly in production
- reproduce locally with `npm run build`
- compare against recent cleanup/refactor branches before deleting more code
