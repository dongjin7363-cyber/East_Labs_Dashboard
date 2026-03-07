interface YearPickerProps {
  year: number;
  onYearChange: (year: number) => void;
}

export function YearPicker({ year, onYearChange }: YearPickerProps) {
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 9 }, (_, index) => currentYear + 1 - index);

  if (!years.includes(year)) {
    years.push(year);
    years.sort((a, b) => b - a);
  }

  return (
    <label className="year-picker">
      <span className="year-picker-label">Year</span>
      <select
        className="year-picker-select"
        value={year}
        onChange={(event) => {
          const nextValue = Number.parseInt(event.target.value, 10);

          if (!Number.isFinite(nextValue)) {
            return;
          }

          onYearChange(nextValue);
        }}
      >
        {years.map((optionYear) => (
          <option key={optionYear} value={optionYear}>
            {optionYear}
          </option>
        ))}
      </select>
    </label>
  );
}
