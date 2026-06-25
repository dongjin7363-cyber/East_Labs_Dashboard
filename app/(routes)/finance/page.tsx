"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useExpenses } from "@/lib/hooks/useExpenses";
import { useRealizedTrades } from "@/lib/hooks/useRealizedTrades";
import { type ExpenseBucket, type ExpenseEntry, type ExpenseSubcategory } from "@/lib/models/types";
import {
  type ExpenseEntryInput,
  listExpenseEntriesByMonth,
  summarizeExpenseBuckets,
  summarizeExpenseSubcategories,
} from "@/lib/services/expenseService";
import {
  getYearSummary,
  type SalaryMonthRow,
  type SalaryYearTotals,
} from "@/lib/services/salaryService";
import { getDatesInRange, getMonthRangeFromYm, todayKstYmd, toYm } from "@/lib/utils/date";
import { moneyFormatParts } from "@/lib/utils/money";

const FX_STORAGE_KEY = "pf_fx_usdkrw_v1";
const DEFAULT_FX_RATE = 1350;

// ── Category definitions (matches east_finance_v4.html) ──────────────────────
interface CategoryDef {
  key: string;
  label: string;
  bucket: ExpenseBucket;
  subcategory?: ExpenseSubcategory;
  color: string;
  group: "income" | "fixed" | "variable";
}

const CATEGORIES: CategoryDef[] = [
  { key: "income",       label: "수입",     bucket: "INCOME",       color: "#1D9E75", group: "income"   },
  { key: "rent",         label: "임대료",   bucket: "SUBSCRIPTION", subcategory: "Rent",         color: "#3B82F6", group: "fixed"    },
  { key: "debt",         label: "부채",     bucket: "SUBSCRIPTION", subcategory: "Debt",         color: "#D94848", group: "fixed"    },
  { key: "subscription", label: "구독",     bucket: "SUBSCRIPTION", subcategory: "Subscription", color: "#2563EB", group: "fixed"    },
  { key: "travel",   label: "여행/여가", bucket: "PLUS",    subcategory: "Travel", color: "#22C55E", group: "variable" },
  { key: "spending", label: "생활지출", bucket: "SPENDING",                         color: "#374151", group: "variable" },
  { key: "luxury",   label: "특별지출", bucket: "PLUS",    subcategory: "Luxury", color: "#F59E0B", group: "variable" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
interface CalendarDayInfo {
  dow: number;
  isHoliday: boolean;
  holidayName?: string;
}

interface CalendarDaysApiResponse {
  days?: Array<{ date: string; dow: number; isHoliday: boolean; holidayName?: string }>;
}

interface FxApiResponse {
  rate?: number;
}

function dayOfWeekFromDate(date: string): number {
  const m = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return 0;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay();
}

function fmtCompact(n: number): string {
  if (n <= 0) return "";
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억`;
  if (n >= 10_000) {
    const man = n / 10_000;
    return `${man % 1 === 0 ? man.toFixed(0) : man.toFixed(1)}만`;
  }
  return n.toLocaleString("ko-KR");
}

function parseAmtInput(s: string): number {
  return Math.max(0, parseInt(s.replace(/[,\s]/g, ""), 10) || 0);
}

function pctChangeFmt(curr: number, prev: number): { text: string; pos: boolean } | null {
  if (!prev) return null;
  const pct = ((curr - prev) / prev) * 100;
  return {
    text: `전월대비 ${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`,
    pos: pct >= 0,
  };
}

function matchesCat(e: ExpenseEntry, cat: CategoryDef): boolean {
  if (e.bucket !== cat.bucket) return false;
  if (cat.subcategory !== undefined) return e.subcategory === cat.subcategory;
  return true;
}

function MoneyDisplay({ amountInt }: { amountInt: number }) {
  const { symbol, valueText } = moneyFormatParts("KRW", amountInt);
  return (
    <>
      <span style={{ fontSize: "0.5em", opacity: 0.45 }}>{symbol}</span>
      {valueText}
    </>
  );
}

// ── FinanceCalendar ───────────────────────────────────────────────────────────
interface FinanceCalendarProps {
  month: string;
  today: string;
  dates: string[];
  firstDow: number;
  dailyBreakdowns: Record<string, { income: number; spending: number }>;
  onMonthChange: (m: string) => void;
  onDayClick: (date: string) => void;
}

const DOWS_KO = ["일", "월", "화", "수", "목", "금", "토"];

function FinanceCalendar({
  month,
  today,
  dates,
  firstDow,
  dailyBreakdowns,
  onMonthChange,
  onDayClick,
}: FinanceCalendarProps) {
  const [y, mStr] = month.split("-");
  const yr = parseInt(y, 10);
  const mn = parseInt(mStr, 10);

  const goPrev = () => {
    const d = new Date(Date.UTC(yr, mn - 2, 1));
    onMonthChange(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  };
  const goNext = () => {
    const d = new Date(Date.UTC(yr, mn, 1));
    onMonthChange(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  };

  return (
    <div className="fin-panel">
      <div className="fin-cal-head">
        <button type="button" className="fin-cal-nav-btn" onClick={goPrev}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <span className="fin-cal-month-label">{yr}년 {mn}월</span>
        <button type="button" className="fin-cal-nav-btn" onClick={goNext}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>

      <div className="fin-cal-grid">
        {DOWS_KO.map((d) => (
          <div key={d} className="fin-cal-dow">{d}</div>
        ))}
        {Array.from({ length: firstDow }).map((_, i) => (
          <div key={`e${i}`} className="fin-cal-cell is-empty" />
        ))}
        {dates.map((date) => {
          const dow = dayOfWeekFromDate(date);
          const isToday = date === today;
          const { income = 0, spending = 0 } = dailyBreakdowns[date] ?? {};
          let cls = "fin-cal-cell";
          if (isToday) cls += " is-today";
          if (dow === 0) cls += " is-sun";
          if (dow === 6) cls += " is-sat";
          return (
            <button
              key={date}
              type="button"
              className={cls}
              onClick={() => onDayClick(date)}
            >
              <span className="fin-cal-num">{parseInt(date.slice(8, 10), 10)}</span>
              {income > 0 && <span className="fin-cal-amt is-inc">+{fmtCompact(income)}</span>}
              {spending > 0 && <span className="fin-cal-amt is-exp">-{fmtCompact(spending)}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── CategoryAnalysisPanel ─────────────────────────────────────────────────────
interface CategoryAnalysisPanelProps {
  month: string;
  bucketTotals: { INCOME: number; SUBSCRIPTION: number; PLUS: number; SPENDING: number };
  subcategoryTotals: Record<string, number>;
  loading: boolean;
  entries: ExpenseEntry[];
}

function CategoryAnalysisPanel({
  month,
  bucketTotals,
  subcategoryTotals,
  loading,
  entries,
}: CategoryAnalysisPanelProps) {
  const [selectedCatKey, setSelectedCatKey] = useState<string | null>(null);
  const [hoveredCat, setHoveredCat] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedCatKey) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setSelectedCatKey(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedCatKey]);

  const rentAmt         = subcategoryTotals.Rent         ?? 0;
  const debtAmt         = subcategoryTotals.Debt         ?? 0;
  const subscriptionAmt = subcategoryTotals.Subscription ?? 0;
  const travelAmt       = subcategoryTotals.Travel       ?? 0;
  const luxuryAmt       = subcategoryTotals.Luxury       ?? 0;
  const spendingAmt     = bucketTotals.SPENDING;

  const fixedTotal    = rentAmt + debtAmt + subscriptionAmt;
  const variableTotal = travelAmt + luxuryAmt + spendingAmt;
  const grandTotal    = fixedTotal + variableTotal;
  const mn = parseInt(month.split("-")[1], 10);

  const renderCatGroup = (
    groupLabel: string,
    total: number,
    cats: Array<{ label: string; color: string; amt: number; catKey: string }>,
  ) => (
    <div className="fin-cat-group">
      <div className="fin-cat-group-head">
        <span className="fin-cat-group-name">{groupLabel}</span>
        <span className="fin-cat-group-amt">{loading ? "—" : <MoneyDisplay amountInt={total} />}</span>
      </div>
      <div className="fin-cat-list">
        {cats.map(({ label, color, amt, catKey }) => {
          const pct = grandTotal > 0 ? (amt / grandTotal) * 100 : 0;
          return (
            <div
              key={label}
              className="fin-cat-item"
              style={{
                cursor: "pointer",
                background: hoveredCat === catKey ? "rgba(29,78,216,0.04)" : "transparent",
                borderRadius: 6,
                transition: "background 0.12s",
              }}
              onClick={() => setSelectedCatKey(catKey)}
              onMouseEnter={() => setHoveredCat(catKey)}
              onMouseLeave={() => setHoveredCat(null)}
            >
              <div className="fin-cat-header">
                <div className="fin-cat-name-wrap">
                  <div className="fin-cat-dot" style={{ background: color }} />
                  <span className="fin-cat-name">{label}</span>
                </div>
                <span className="fin-cat-pct">{pct.toFixed(1)}%</span>
              </div>
              <div className="fin-cat-bar-track">
                <div className="fin-cat-bar-fill" style={{ width: `${pct}%`, background: color }} />
              </div>
              <span className="fin-cat-amt-val">{loading ? "—" : <MoneyDisplay amountInt={amt} />}</span>
            </div>
          );
        })}
      </div>
    </div>
  );

  const selectedCat = selectedCatKey ? (CATEGORIES.find((c) => c.key === selectedCatKey) ?? null) : null;
  const popupEntries = selectedCat
    ? [...entries].filter((e) => matchesCat(e, selectedCat)).sort((a, b) => a.date.localeCompare(b.date))
    : [];
  const popupTotal = popupEntries.reduce((s, e) => s + e.amountInt, 0);

  return (
    <div className="fin-panel">
      <p className="fin-panel-title">
        카테고리 분석 <span>· {mn}월 누계</span>
      </p>

      {renderCatGroup("고정비", fixedTotal, [
        { label: "임대료", color: "#3B82F6", amt: rentAmt,         catKey: "rent"         },
        { label: "부채",   color: "#D94848", amt: debtAmt,         catKey: "debt"         },
        { label: "구독",   color: "#2563EB", amt: subscriptionAmt, catKey: "subscription" },
      ])}

      <div style={{ marginTop: 16 }}>
        {renderCatGroup("변동비", variableTotal, [
          { label: "여행/여가", color: "#22C55E", amt: travelAmt,   catKey: "travel"   },
          { label: "특별지출", color: "#F59E0B",  amt: luxuryAmt,   catKey: "luxury"   },
          { label: "생활지출", color: "#374151",  amt: spendingAmt, catKey: "spending" },
        ])}
      </div>

      <div className="fin-cat-total-row">
        <span className="fin-cat-total-label">총 지출</span>
        <span className="fin-cat-total-val">{loading ? "—" : <MoneyDisplay amountInt={grandTotal} />}</span>
      </div>

      {selectedCat && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
          onClick={(e) => { if (e.target === e.currentTarget) setSelectedCatKey(null); }}
        >
          <div style={{ background: "#fff", borderRadius: 12, width: 380, maxHeight: "80vh", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,0.15)", overflow: "hidden" }}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid #F3F4F6", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: selectedCat.color, flexShrink: 0 }} />
                <span style={{ fontWeight: 600, fontSize: "0.95rem", color: "#111827" }}>
                  {selectedCat.label} · {mn}월 내역
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCatKey(null)}
                style={{ border: "none", background: "none", cursor: "pointer", fontSize: "0.9rem", color: "#9CA3AF", padding: 4, lineHeight: 1 }}
              >
                ✕
              </button>
            </div>
            <div style={{ overflowY: "auto", flex: 1 }}>
              {popupEntries.length === 0 ? (
                <p style={{ textAlign: "center", color: "#9CA3AF", padding: "32px 0", fontSize: "0.875rem" }}>
                  거래 내역이 없습니다.
                </p>
              ) : popupEntries.map((entry) => {
                const dow = dayOfWeekFromDate(entry.date);
                const dateLabel = `${parseInt(entry.date.slice(5, 7), 10)}월 ${parseInt(entry.date.slice(8, 10), 10)}일 (${DOWS_KO[dow]})`;
                const isIncome = entry.bucket === "INCOME";
                return (
                  <div
                    key={entry.id}
                    style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8, padding: "10px 20px", borderBottom: "1px solid #F9FAFB", alignItems: "center" }}
                  >
                    <span style={{ fontSize: "0.8rem", color: "#374151" }}>{dateLabel}</span>
                    <span style={{ fontSize: "0.8rem", color: "#6B7280" }}>{entry.note}</span>
                    <span style={{ fontSize: "0.8rem", color: isIncome ? "#16a34a" : "#dc2626", fontFamily: "'JetBrains Mono', monospace", whiteSpace: "nowrap" }}>
                      {isIncome ? "+" : "-"}{entry.amountInt.toLocaleString("ko-KR")}
                    </span>
                  </div>
                );
              })}
            </div>
            <div style={{ padding: "12px 20px", borderTop: "1px solid #F3F4F6", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "0.85rem", color: "#374151" }}>이번 달 합계</span>
              <span style={{ fontSize: "0.9rem", fontWeight: 600, color: "#111827", fontFamily: "'JetBrains Mono', monospace" }}>
                {popupTotal.toLocaleString("ko-KR")}원
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── FinanceDayModal ───────────────────────────────────────────────────────────
interface FinanceDayModalProps {
  open: boolean;
  date: string;
  entries: ExpenseEntry[];
  isAuthenticated: boolean;
  onCreate: (input: ExpenseEntryInput) => void;
  onUpdate: (id: string, input: ExpenseEntryInput) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

function FinanceDayModal({
  open,
  date,
  entries,
  isAuthenticated,
  onCreate,
  onUpdate,
  onDelete,
  onClose,
}: FinanceDayModalProps) {
  const [draft, setDraft] = useState<Record<string, string>>({});

  const dateLabel = useMemo(() => {
    if (!date) return "";
    const dow = dayOfWeekFromDate(date);
    const mn = parseInt(date.slice(5, 7), 10);
    const dn = parseInt(date.slice(8, 10), 10);
    return `${mn}월 ${dn}일 (${DOWS_KO[dow]})`;
  }, [date]);

  useEffect(() => {
    if (!open || !date) return;
    const next: Record<string, string> = {};
    for (const cat of CATEGORIES) {
      const matching = entries.filter((e) => e.date === date && matchesCat(e, cat));
      const total = matching.reduce((s, e) => s + e.amountInt, 0);
      next[cat.key] = total > 0 ? String(total) : "";
      next[`memo_${cat.key}`] = matching[0]?.note ?? "";
    }
    setDraft(next);
  }, [open, date, entries]);

  const handleSave = () => {
    if (!isAuthenticated) {
      window.alert("로그인 후 사용 가능합니다.");
      return;
    }
    for (const cat of CATEGORIES) {
      const newAmt = parseAmtInput(draft[cat.key] ?? "");
      const newMemo = (draft[`memo_${cat.key}`] ?? "").trim();
      const matching = entries.filter((e) => e.date === date && matchesCat(e, cat));
      const existingTotal = matching.reduce((s, e) => s + e.amountInt, 0);
      const existingMemo = matching[0]?.note ?? "";
      if (newAmt === existingTotal && newMemo === existingMemo) continue;

      // Delete all extras beyond the first
      for (const extra of matching.slice(1)) onDelete(extra.id);

      const first = matching[0];
      if (newAmt === 0) {
        if (first) onDelete(first.id);
      } else if (first) {
        onUpdate(first.id, {
          date,
          bucket: cat.bucket,
          subcategory: cat.subcategory,
          amountInt: newAmt,
          note: newMemo,
        });
      } else {
        onCreate({ date, bucket: cat.bucket, subcategory: cat.subcategory, amountInt: newAmt, note: newMemo });
      }
    }
    onClose();
  };

  if (!open) return null;

  const setField = (key: string, val: string) =>
    setDraft((prev) => ({ ...prev, [key]: val }));

  const renderField = (cat: CategoryDef, spanFull = false) => {
    const rawVal = draft[cat.key] ?? "";
    const displayVal = rawVal !== "" ? Number(rawVal).toLocaleString("ko-KR") : "";
    return (
      <div key={cat.key} className="fin-modal-field" style={spanFull ? { gridColumn: "span 2" } : undefined}>
        <label className="fin-modal-label">
          <span className="fin-modal-dot" style={{ background: cat.color }} />
          {cat.label}
        </label>
        <input
          type="text"
          inputMode="numeric"
          className="fin-modal-input"
          placeholder="0"
          value={displayVal}
          onChange={(e) => {
            const raw = e.target.value.replace(/,/g, "");
            if (raw === "" || /^\d+$/.test(raw)) {
              setField(cat.key, raw);
            }
          }}
        />
        <label style={{ fontSize: "0.7rem", color: "#9CA3AF", marginTop: 5, display: "block" }}>메모 (선택)</label>
        <input
          type="text"
          className="fin-modal-input"
          placeholder="예) 넷플릭스, 마트, 카드론..."
          value={draft[`memo_${cat.key}`] ?? ""}
          onChange={(e) => setField(`memo_${cat.key}`, e.target.value)}
        />
      </div>
    );
  };

  return (
    <div
      className="fin-modal-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="fin-modal">
        <div className="fin-modal-head">
          <div>
            <span className="fin-modal-title">항목 입력</span>
            <span className="fin-modal-date">{dateLabel}</span>
          </div>
          <button type="button" className="fin-modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="fin-modal-grid">
          {CATEGORIES.filter((c) => c.group === "income").map((c) => renderField(c, true))}

          <div className="fin-modal-section-label">고정비</div>
          {CATEGORIES.filter((c) => c.group === "fixed").map((c) => renderField(c))}

          <div className="fin-modal-section-label">변동비</div>
          {CATEGORIES.filter((c) => c.group === "variable").map((c) => renderField(c))}
        </div>

        <div className="fin-modal-actions">
          <button type="button" className="fin-btn-cancel" onClick={onClose}>취소</button>
          <button type="button" className="fin-btn-save" onClick={handleSave}>저장</button>
        </div>
      </div>
    </div>
  );
}

// ── EarningsBarChart (Wage + Stock stacked) ───────────────────────────────────
function EarningsBarChart({ months }: { months: SalaryMonthRow[] }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const W = 280;
  const chartH = 80;
  const barW = 16;
  const slotW = 20;

  const maxVal = Math.max(...months.map((m) => m.earnings), 1);

  const hoveredRow = hovered !== null ? months[hovered] : null;
  const tooltipLeft = hovered !== null
    ? `${((22 + hovered * slotW + barW / 2) / W) * 100}%`
    : "0%";

  return (
    <div className="fin-chart-panel">
      <p className="fin-chart-title">수입 (급여 + 주식수익)</p>
      <div className="fin-chart-legend">
        <span className="fin-chart-legend-item">
          <span className="fin-chart-legend-dot" style={{ background: "#1E3A8A" }} />급여
        </span>
        <span className="fin-chart-legend-item">
          <span className="fin-chart-legend-dot" style={{ background: "#F59E0B" }} />주식수익
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${chartH + 12}`} width="100%" style={{ overflow: "visible" }}>
        <line x1="0" y1="0"             x2={W} y2="0"             stroke="rgba(0,0,0,0.06)" strokeWidth="0.5" />
        <line x1="0" y1={chartH * 0.5}  x2={W} y2={chartH * 0.5} stroke="rgba(0,0,0,0.06)" strokeWidth="0.5" />
        <line x1="0" y1={chartH}        x2={W} y2={chartH}        stroke="rgba(0,0,0,0.1)"  strokeWidth="0.6" />
        {months.map((row, i) => {
          const x = 22 + i * slotW;
          const wageH   = (row.income / maxVal) * chartH;
          const stockH  = (row.stock  / maxVal) * chartH;
          const wageY   = chartH - wageH;
          const stockY  = wageY - stockH;
          return (
            <g key={row.month}
               onMouseEnter={() => setHovered(i)}
               onMouseLeave={() => setHovered(null)}>
              {row.presence.income && <rect x={x} y={wageY}  width={barW} height={wageH}  fill="#1E3A8A" rx={2} />}
              {row.presence.stock  && <rect x={x} y={stockY} width={barW} height={stockH} fill="#F59E0B" rx={2} />}
              <rect x={x} y={0} width={barW} height={chartH} fill="transparent" />
              <text x={x + barW / 2} y={chartH + 10} fontSize={8} fill="#9CA3AF" fontFamily="monospace" textAnchor="middle">
                {row.month}월
              </text>
            </g>
          );
        })}
      </svg>
      {hoveredRow !== null && (
        <div className="fin-chart-tooltip" style={{ left: tooltipLeft }}>
          <div className="fin-chart-tooltip-month">{hoveredRow.month}월</div>
          <div className="fin-chart-tooltip-row">
            <span className="fin-chart-tooltip-dot" style={{ background: "#1E3A8A" }} />
            <span>급여</span>
            <span>{fmtCompact(hoveredRow.income)}</span>
          </div>
          <div className="fin-chart-tooltip-row">
            <span className="fin-chart-tooltip-dot" style={{ background: "#F59E0B" }} />
            <span>주식</span>
            <span>{fmtCompact(hoveredRow.stock)}</span>
          </div>
          <div className="fin-chart-tooltip-divider" />
          <div className="fin-chart-tooltip-row fin-chart-tooltip-total">
            <span>합계</span>
            <span>{fmtCompact(hoveredRow.earnings)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── IncomeVsSpendChart ────────────────────────────────────────────────────────
function IncomeVsSpendChart({ months }: { months: SalaryMonthRow[] }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const W = 280;
  const chartH = 80;
  const barW = 7;
  const innerGap = 1;
  const slotW = barW * 2 + innerGap + 5; // 20

  const maxVal = Math.max(...months.flatMap((m) => [m.earnings, m.spending]), 1);

  const hoveredRow = hovered !== null ? months[hovered] : null;
  const tooltipLeft = hovered !== null
    ? `${((22.5 + hovered * slotW + barW + innerGap / 2) / W) * 100}%`
    : "0%";

  return (
    <div className="fin-chart-panel">
      <p className="fin-chart-title">총수입 vs 총지출</p>
      <div className="fin-chart-legend">
        <span className="fin-chart-legend-item">
          <span className="fin-chart-legend-dot" style={{ background: "#1D9E75" }} />수입
        </span>
        <span className="fin-chart-legend-item">
          <span className="fin-chart-legend-dot" style={{ background: "#D94848" }} />지출
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${chartH + 12}`} width="100%" style={{ overflow: "visible" }}>
        <line x1="0" y1="0"            x2={W} y2="0"            stroke="rgba(0,0,0,0.06)" strokeWidth="0.5" />
        <line x1="0" y1={chartH * 0.5} x2={W} y2={chartH * 0.5} stroke="rgba(0,0,0,0.06)" strokeWidth="0.5" />
        <line x1="0" y1={chartH}       x2={W} y2={chartH}       stroke="rgba(0,0,0,0.06)" strokeWidth="0.5" />
        {months.map((row, i) => {
          const x     = 22.5 + i * slotW;
          const incH  = (row.earnings / maxVal) * chartH;
          const expH  = (row.spending  / maxVal) * chartH;
          const incX  = x;
          const expX  = x + barW + innerGap;
          return (
            <g key={row.month}
               onMouseEnter={() => setHovered(i)}
               onMouseLeave={() => setHovered(null)}>
              {row.presence.earnings  && <rect x={incX} y={chartH - incH} width={barW} height={incH} fill="#1D9E75" rx={2} />}
              {row.presence.spending  && <rect x={expX} y={chartH - expH} width={barW} height={expH} fill="#D94848" rx={2} />}
              <rect x={x} y={0} width={barW * 2 + innerGap} height={chartH} fill="transparent" />
              <text x={x + barW} y={chartH + 10} fontSize={8} fill="#9CA3AF" fontFamily="monospace" textAnchor="middle">
                {row.month}월
              </text>
            </g>
          );
        })}
      </svg>
      {hoveredRow !== null && (
        <div className="fin-chart-tooltip" style={{ left: tooltipLeft }}>
          <div className="fin-chart-tooltip-month">{hoveredRow.month}월</div>
          <div className="fin-chart-tooltip-row">
            <span className="fin-chart-tooltip-dot" style={{ background: "#1D9E75" }} />
            <span>수입</span>
            <span>{fmtCompact(hoveredRow.earnings)}</span>
          </div>
          <div className="fin-chart-tooltip-row">
            <span className="fin-chart-tooltip-dot" style={{ background: "#D94848" }} />
            <span>지출</span>
            <span>{fmtCompact(hoveredRow.spending)}</span>
          </div>
          <div className="fin-chart-tooltip-divider" />
          <div className="fin-chart-tooltip-row fin-chart-tooltip-total">
            <span>순수익</span>
            <span style={{ color: hoveredRow.earnings - hoveredRow.spending >= 0 ? "#059669" : "#dc2626" }}>
              {fmtCompact(hoveredRow.earnings - hoveredRow.spending)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── AnnualTable ───────────────────────────────────────────────────────────────
function AnnualTable({
  months,
  totals,
  loading,
  year,
}: {
  months: SalaryMonthRow[];
  totals: SalaryYearTotals;
  loading: boolean;
  year: number;
}) {
  const fmt = (n: number, has: boolean) =>
    has ? <MoneyDisplay amountInt={n} /> : <span style={{ color: "#9CA3AF" }}>-</span>;

  return (
    <div className="fin-panel fin-annual-panel">
      <p className="fin-panel-title">
        월별 상세 <span>· {year}년 · 수입 / 고정비 / 변동비</span>
      </p>
      <div style={{ overflowX: "auto" }}>
        <table className="fin-annual-table">
          <thead>
            <tr>
              <th />
              <th colSpan={3} className="fin-th-group fin-th-income">수입</th>
              <th colSpan={4} className="fin-th-group fin-th-fixed">고정비</th>
              <th colSpan={3} className="fin-th-group fin-th-variable">변동비</th>
              <th />
            </tr>
            <tr className="fin-th-sub-row">
              <th className="fin-th-month">월</th>
              <th>급여</th>
              <th>주식수익</th>
              <th className="fin-th-subtotal fin-bg-income">총수입</th>
              <th>임대료</th>
              <th>부채</th>
              <th>구독</th>
              <th className="fin-th-subtotal fin-bg-fixed">고정비 소계</th>
              <th>여행/여가</th>
              <th>생활지출</th>
              <th className="fin-th-subtotal fin-bg-variable">변동비 소계</th>
              <th className="fin-th-subtotal">총지출</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={12} className="fin-td-loading">로딩 중…</td></tr>
            ) : months.map((row) => {
              const fixedSub = row.rent + row.debt + row.subscription;
              const varSub   = row.plus + row.spendingOnly;
              const hasFixed = row.presence.rent || row.presence.debt || row.presence.subscription;
              const hasVar   = row.presence.plus || row.presence.spendingOnly;
              const hasSpend = row.presence.spending;
              const isActive = row.presence.earnings || hasSpend;

              return (
                <tr key={row.month} className={`fin-annual-row${isActive ? "" : " is-dim"}`}>
                  <td className="fin-td-month">{row.month}월</td>
                  <td className="fin-td-num">{fmt(row.income, row.presence.income)}</td>
                  <td className="fin-td-num">{fmt(row.stock, row.presence.stock)}</td>
                  <td className="fin-td-num fin-td-subtotal fin-bg-income">{fmt(row.earnings, row.presence.earnings)}</td>
                  <td className="fin-td-num">{fmt(row.rent, row.presence.rent)}</td>
                  <td className="fin-td-num">{fmt(row.debt, row.presence.debt)}</td>
                  <td className="fin-td-num">{fmt(row.subscription, row.presence.subscription)}</td>
                  <td className="fin-td-num fin-td-subtotal fin-bg-fixed">{fmt(fixedSub, hasFixed)}</td>
                  <td className="fin-td-num">{fmt(row.plus, row.presence.plus)}</td>
                  <td className="fin-td-num">{fmt(row.spendingOnly, row.presence.spendingOnly)}</td>
                  <td className="fin-td-num fin-td-subtotal fin-bg-variable">{fmt(varSub, hasVar)}</td>
                  <td className="fin-td-num fin-td-total">{fmt(row.spending, hasSpend)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="fin-annual-foot">
              <td className="fin-td-month">합계</td>
              <td className="fin-td-num"><MoneyDisplay amountInt={totals.income} /></td>
              <td className="fin-td-num"><MoneyDisplay amountInt={totals.stock} /></td>
              <td className="fin-td-num fin-td-subtotal fin-bg-income"><MoneyDisplay amountInt={totals.earnings} /></td>
              <td className="fin-td-num"><MoneyDisplay amountInt={totals.rent} /></td>
              <td className="fin-td-num"><MoneyDisplay amountInt={totals.debt} /></td>
              <td className="fin-td-num"><MoneyDisplay amountInt={totals.subscription} /></td>
              <td className="fin-td-num fin-td-subtotal fin-bg-fixed">
                <MoneyDisplay amountInt={totals.rent + totals.debt + totals.subscription} />
              </td>
              <td className="fin-td-num"><MoneyDisplay amountInt={totals.plus} /></td>
              <td className="fin-td-num"><MoneyDisplay amountInt={totals.spendingOnly} /></td>
              <td className="fin-td-num fin-td-subtotal fin-bg-variable">
                <MoneyDisplay amountInt={totals.plus + totals.spendingOnly} />
              </td>
              <td className="fin-td-num fin-td-total"><MoneyDisplay amountInt={totals.spending} /></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ── SumCards ──────────────────────────────────────────────────────────────────
function SumCards({
  currentRow,
  prevRow,
  ytdNet,
  ytdMonths,
  loading,
}: {
  currentRow: SalaryMonthRow | undefined;
  prevRow: SalaryMonthRow | undefined;
  ytdNet: number;
  ytdMonths: number;
  loading: boolean;
}) {
  const dash = "—";
  const earning = currentRow?.earnings ?? 0;
  const spending = currentRow?.spending ?? 0;
  const net = earning - spending;
  const prevEarning = prevRow?.earnings ?? 0;
  const prevSpending = prevRow?.spending ?? 0;
  const prevNet = prevEarning - prevSpending;

  const cards = [
    {
      label: "이번달 수입",
      val: currentRow ? <MoneyDisplay amountInt={earning} /> : dash,
      sub: currentRow && prevRow ? pctChangeFmt(earning, prevEarning) : null,
      color: "#1D9E75",
    },
    {
      label: "이번달 지출",
      val: currentRow ? <MoneyDisplay amountInt={spending} /> : dash,
      sub: currentRow && prevRow ? pctChangeFmt(spending, prevSpending) : null,
      color: "#D94848",
    },
    {
      label: "이번달 순수익",
      val: currentRow ? <MoneyDisplay amountInt={net} /> : dash,
      sub: currentRow && prevRow ? pctChangeFmt(net, prevNet) : null,
      color: net >= 0 ? "#1D9E75" : "#D94848",
    },
    {
      label: "연 누적 순수익",
      val: <MoneyDisplay amountInt={ytdNet} />,
      sub: ytdMonths > 0 ? { text: `YTD · ${ytdMonths}개월`, pos: true } : null,
      color: "#111827",
    },
  ];

  return (
    <div className="fin-sum-cards">
      {cards.map(({ label, val, sub, color }) => (
        <div key={label} className="fin-sum-card">
          <p className="fin-sum-card-label">{label}</p>
          <p className="fin-sum-card-val" style={{ color: loading ? "#9CA3AF" : color }}>
            {loading ? dash : val}
          </p>
          {sub && (
            <p className="fin-sum-card-sub" style={{ color: sub.pos ? "#1D9E75" : "#D94848" }}>
              {sub.text}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

// ── FinancePage ───────────────────────────────────────────────────────────────
export default function FinancePage() {
  const { entries, loading, authLoading, isAuthenticated, create, update, remove } = useExpenses();
  const { trades, loading: tradesLoading } = useRealizedTrades();

  const [selectedMonth, setSelectedMonth] = useState(() => toYm(new Date()));
  const [modalDay, setModalDay] = useState<string | null>(null);
  const [year, setYear] = useState(new Date().getFullYear());
  const [fxRate, setFxRate] = useState(DEFAULT_FX_RATE);
  const [calendarMap, setCalendarMap] = useState<Record<string, CalendarDayInfo>>({});
  const cacheRef = useRef<Record<string, Record<string, CalendarDayInfo>>>({});

  const todayKst  = useMemo(() => todayKstYmd(), []);
  const monthRange = useMemo(() => getMonthRangeFromYm(selectedMonth), [selectedMonth]);
  const monthDates = useMemo(
    () => getDatesInRange(monthRange.from, monthRange.to),
    [monthRange],
  );

  const monthEntries = useMemo(
    () => listExpenseEntriesByMonth(entries, selectedMonth),
    [entries, selectedMonth],
  );

  const dailyBreakdowns = useMemo(() => {
    const map: Record<string, { income: number; spending: number }> = {};
    for (const e of monthEntries) {
      const curr = map[e.date] ?? { income: 0, spending: 0 };
      if (e.bucket === "INCOME") curr.income += e.amountInt;
      else curr.spending += e.amountInt;
      map[e.date] = curr;
    }
    return map;
  }, [monthEntries]);

  const bucketTotals       = useMemo(() => summarizeExpenseBuckets(monthEntries), [monthEntries]);
  const subcategoryTotals  = useMemo(() => summarizeExpenseSubcategories(monthEntries), [monthEntries]);

  const combinedLoading = loading || tradesLoading;
  const yearSummary = useMemo(
    () =>
      getYearSummary({
        year,
        entries: isAuthenticated ? entries : [],
        trades: isAuthenticated ? trades : [],
        fxRate,
      }),
    [year, entries, trades, fxRate, isAuthenticated],
  );

  const selectedMonthNum = parseInt(selectedMonth.slice(5, 7), 10);
  const selectedYearNum  = parseInt(selectedMonth.slice(0, 4), 10);

  const currentRow = useMemo(
    () => selectedYearNum === year
      ? yearSummary.months.find((m) => m.month === selectedMonthNum)
      : undefined,
    [yearSummary, selectedMonthNum, selectedYearNum, year],
  );

  const prevRow = useMemo(() => {
    if (selectedYearNum !== year) return undefined;
    const prevMonthNum = selectedMonthNum === 1 ? 12 : selectedMonthNum - 1;
    return yearSummary.months.find((m) => m.month === prevMonthNum);
  }, [yearSummary, selectedMonthNum, selectedYearNum, year]);

  const { ytdNet, ytdMonths } = useMemo(() => {
    if (selectedYearNum !== year) return { ytdNet: 0, ytdMonths: 0 };
    let net = 0;
    let count = 0;
    for (const m of yearSummary.months) {
      if (m.month > selectedMonthNum) break;
      if (m.presence.earnings || m.presence.spending) {
        net += m.earnings - m.spending;
        count++;
      }
    }
    return { ytdNet: net, ytdMonths: count };
  }, [yearSummary, selectedMonthNum, selectedYearNum, year]);

  const firstDow = useMemo(
    () => calendarMap[monthRange.from]?.dow ?? dayOfWeekFromDate(monthRange.from),
    [calendarMap, monthRange.from],
  );

  const modalEntries = useMemo(
    () => (modalDay ? entries.filter((e) => e.date === modalDay) : []),
    [entries, modalDay],
  );

  // FX rate
  useEffect(() => {
    const saved = window.localStorage.getItem(FX_STORAGE_KEY);
    if (saved) {
      const n = Number(saved);
      if (Number.isFinite(n) && n > 0) setFxRate(n);
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/fx");
        if (!res.ok) return;
        const data = (await res.json()) as FxApiResponse;
        const rate = Number(data.rate);
        if (cancelled || !Number.isFinite(rate) || rate <= 0) return;
        setFxRate(rate);
        window.localStorage.setItem(FX_STORAGE_KEY, String(rate));
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);

  // Calendar holiday map
  useEffect(() => {
    const cached = cacheRef.current[selectedMonth];
    if (cached) { setCalendarMap(cached); return; }
    setCalendarMap({});
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/calendar-days?from=${monthRange.from}&to=${monthRange.to}&country=KR`,
          { cache: "no-store" },
        );
        if (!res.ok) return;
        const data = (await res.json()) as CalendarDaysApiResponse;
        const days = Array.isArray(data.days) ? data.days : [];
        const next: Record<string, CalendarDayInfo> = {};
        for (const d of days) next[d.date] = { dow: d.dow, isHoliday: d.isHoliday, holidayName: d.holidayName };
        if (!cancelled) {
          cacheRef.current[selectedMonth] = next;
          setCalendarMap(next);
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [selectedMonth, monthRange.from, monthRange.to]);

  const yearOptions = useMemo(
    () => Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i),
    [],
  );

  return (
    <div className="fin-page">
      <div className="fin-page-header">
        <div>
          <h1 className="fin-page-title">Finance</h1>
          <p className="fin-page-sub">월간 지출 관리 · 날짜 클릭으로 입력</p>
        </div>
      </div>

      {!authLoading && !isAuthenticated && (
        <div className="fin-auth-gate">로그인 후 데이터를 확인할 수 있습니다.</div>
      )}

      <div className="fin-top-grid">
        <FinanceCalendar
          month={selectedMonth}
          today={todayKst}
          dates={monthDates}
          firstDow={firstDow}
          dailyBreakdowns={dailyBreakdowns}
          onMonthChange={(m) => { setSelectedMonth(m); setYear(parseInt(m.slice(0, 4), 10)); }}
          onDayClick={(date) => setModalDay(date)}
        />
        <CategoryAnalysisPanel
          month={selectedMonth}
          bucketTotals={bucketTotals}
          subcategoryTotals={subcategoryTotals}
          loading={loading}
          entries={monthEntries}
        />
      </div>

      {/* ── Annual section ── */}
      <div className="fin-salary-section">
        <div className="fin-salary-header">
          <div>
            <p className="fin-salary-title">연간 수입 / 지출</p>
            <p className="fin-salary-sub">월별 수입·지출 요약</p>
          </div>
          <select
            className="fin-year-select"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>{y}년</option>
            ))}
          </select>
        </div>

        <SumCards
          currentRow={currentRow}
          prevRow={prevRow}
          ytdNet={ytdNet}
          ytdMonths={ytdMonths}
          loading={combinedLoading}
        />

        <div className="fin-charts-row">
          <EarningsBarChart months={yearSummary.months} />
          <IncomeVsSpendChart months={yearSummary.months} />
        </div>

        <AnnualTable
          months={yearSummary.months}
          totals={yearSummary.totals}
          loading={combinedLoading}
          year={year}
        />
      </div>

      <FinanceDayModal
        open={Boolean(modalDay)}
        date={modalDay ?? ""}
        entries={modalEntries}
        isAuthenticated={isAuthenticated}
        onCreate={create}
        onUpdate={update}
        onDelete={remove}
        onClose={() => setModalDay(null)}
      />
    </div>
  );
}
