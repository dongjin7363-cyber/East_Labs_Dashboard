import { ReactNode } from "react";
import { PageHeaderBar } from "@/components/common/PageHeaderBar";

interface CalendarHeaderBarProps {
  title: ReactNode;
  titleMeta?: ReactNode;
  description?: ReactNode;
  monthValue?: string;
  onMonthChange?: (value: string) => void;
  monthLabel?: string;
  dateValue?: string;
  onDateChange?: (value: string) => void;
  dateLabel?: string;
  selectedDate?: ReactNode;
  selectedDateLabel?: string;
  rightExtra?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function CalendarHeaderBar({
  title,
  titleMeta,
  description,
  monthValue,
  onMonthChange,
  monthLabel = "월 선택",
  dateValue,
  onDateChange,
  dateLabel = "선택 날짜",
  selectedDate,
  selectedDateLabel = "선택 날짜",
  rightExtra,
  actions,
  className = "",
}: CalendarHeaderBarProps) {
  const hasControls =
    (typeof monthValue === "string" && Boolean(onMonthChange)) ||
    (typeof dateValue === "string" && Boolean(onDateChange)) ||
    selectedDate !== undefined ||
    Boolean(rightExtra) ||
    Boolean(actions);

  return (
    <PageHeaderBar
      title={title}
      titleMeta={titleMeta}
      description={description}
      className={className}
      rightSlot={
        hasControls ? (
          <div className="calendar-header-actions">
            {typeof monthValue === "string" && onMonthChange ? (
              <label className="calendar-header-control">
                <span>{monthLabel}</span>
                <input
                  type="month"
                  value={monthValue}
                  onChange={(event) => onMonthChange(event.target.value)}
                />
              </label>
            ) : null}

            {typeof dateValue === "string" && onDateChange ? (
              <label className="calendar-header-control">
                <span>{dateLabel}</span>
                <input
                  type="date"
                  value={dateValue}
                  onChange={(event) => onDateChange(event.target.value)}
                />
              </label>
            ) : null}

            {selectedDate !== undefined ? (
              <div className="calendar-header-meta">
                <span>{selectedDateLabel}</span>
                <div className="calendar-header-meta-content">{selectedDate}</div>
              </div>
            ) : null}

            {rightExtra ? <div className="calendar-header-extra">{rightExtra}</div> : null}
            {actions ? <div className="calendar-header-buttons">{actions}</div> : null}
          </div>
        ) : null
      }
    />
  );
}

export default CalendarHeaderBar;
