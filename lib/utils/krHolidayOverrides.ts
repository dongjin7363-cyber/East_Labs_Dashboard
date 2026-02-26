export interface KrHolidayOverride {
  isHoliday: boolean;
  holidayName: string | null;
}

const KR_HOLIDAY_OVERRIDES: Record<string, KrHolidayOverride> = {
  // 2026 lunar new year period and substitute holiday corrections
  "2026-02-16": { isHoliday: true, holidayName: "설날 연휴" },
  "2026-02-19": { isHoliday: false, holidayName: null },
  "2026-03-02": { isHoliday: true, holidayName: "삼일절 대체공휴일" },
};

export function getKrHolidayOverride(date: string): KrHolidayOverride | undefined {
  return KR_HOLIDAY_OVERRIDES[date];
}
