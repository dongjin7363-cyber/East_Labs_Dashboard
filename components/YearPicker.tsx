interface YearPickerProps {
  year: number;
  onYearChange: (year: number) => void;
}

export function YearPicker({ year, onYearChange }: YearPickerProps) {
  return (
    <label>
      Year
      <input
        type="number"
        min={2000}
        max={2100}
        step={1}
        value={year}
        onChange={(event) => {
          const nextValue = Number.parseInt(event.target.value, 10);

          if (!Number.isFinite(nextValue)) {
            return;
          }

          onYearChange(nextValue);
        }}
      />
    </label>
  );
}
