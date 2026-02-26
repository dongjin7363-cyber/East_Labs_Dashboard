"use client";

import { DatePreset } from "@/lib/models/types";

interface DateRangeFilterProps {
  preset: DatePreset;
  customFrom: string;
  customTo: string;
  onPresetChange: (preset: DatePreset) => void;
  onCustomFromChange: (value: string) => void;
  onCustomToChange: (value: string) => void;
}

export function DateRangeFilter({
  preset,
  customFrom,
  customTo,
  onPresetChange,
  onCustomFromChange,
  onCustomToChange,
}: DateRangeFilterProps) {
  return (
    <div className="filter-row">
      <label>
        기간
        <select
          value={preset}
          onChange={(event) => onPresetChange(event.target.value as DatePreset)}
        >
          <option value="THIS_MONTH">이번달</option>
          <option value="LAST_MONTH">지난달</option>
          <option value="CUSTOM">커스텀</option>
        </select>
      </label>

      {preset === "CUSTOM" ? (
        <>
          <label>
            시작일
            <input
              type="date"
              value={customFrom}
              onChange={(event) => onCustomFromChange(event.target.value)}
            />
          </label>
          <label>
            종료일
            <input
              type="date"
              value={customTo}
              onChange={(event) => onCustomToChange(event.target.value)}
            />
          </label>
        </>
      ) : null}
    </div>
  );
}
