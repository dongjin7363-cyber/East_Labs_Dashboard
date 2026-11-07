"use client";

import { FormEvent, ReactNode, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FormattedNumberInput } from "@/components/FormattedNumberInput";
import { moneyFormat, parsePriceInputToInt, usdToKrw } from "@/lib/utils/money";

interface PortfolioFundsCardProps {
  kind: "deposit" | "cash";
  krw: number;
  usdCents?: number;
  fxRate: number;
  amount: ReactNode;
  disabled: boolean;
  onSave: (krw: number, usdCents: number) => Promise<void>;
}

export function PortfolioFundsCard({
  kind, krw, usdCents = 0, fxRate, amount, disabled, onSave,
}: PortfolioFundsCardProps) {
  const id = useId();
  const editRef = useRef<HTMLButtonElement>(null);
  const savingRef = useRef(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [editing, setEditing] = useState(false);
  const [draftKrw, setDraftKrw] = useState("");
  const [draftUsd, setDraftUsd] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const label = kind === "deposit" ? "예수금" : "현금";
  const parsedKrw = parsePriceInputToInt("KRW", draftKrw || "0");
  const parsedUsd = parsePriceInputToInt("USD", draftUsd || "0");
  const valid = parsedKrw !== null && parsedUsd !== null &&
    Number.isSafeInteger(parsedKrw) && Number.isSafeInteger(parsedUsd);
  const preview = valid ? parsedKrw + usdToKrw(parsedUsd / 100, fxRate) : null;

  const close = () => {
    if (savingRef.current) return;
    setEditing(false);
    setError("");
    editRef.current?.focus({ preventScroll: true });
  };
  useEffect(() => {
    if (disabled && !savingRef.current) setEditing(false);
  }, [disabled]);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!editing || !dialog) return;
    const trigger = editRef.current;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.showModal();
    dialog.querySelector("input")?.focus({ preventScroll: true });
    return () => {
      dialog.close();
      document.body.style.overflow = overflow;
      trigger?.focus({ preventScroll: true });
    };
  }, [editing]);
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (savingRef.current || disabled) return;
    if (!valid || preview === null || !Number.isSafeInteger(preview)) {
      setError("금액을 확인해 주세요.");
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setError("");
    try {
      await onSave(parsedKrw, kind === "deposit" ? parsedUsd : 0);
      setEditing(false);
      editRef.current?.focus({ preventScroll: true });
    } catch {
      setError("저장하지 못했습니다. 다시 시도해 주세요.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <div className="pf-cash-card pf-funds-card" data-editing={editing}>
      <div className="pf-funds-heading">
        <div className="pf-funds-label-group">
          <p className="pf-cash-label">{label}</p>
          {kind === "deposit" ? <span className="pf-funds-heading-note">원화 합산</span> : null}
        </div>
        <button ref={editRef} type="button" className="pf-funds-edit"
          aria-label={label + " 편집"} title={label + " 편집"} aria-haspopup="dialog" aria-expanded={editing}
          aria-controls={editing ? id : undefined} disabled={disabled || saving}
          onClick={() => {
            if (editing) { close(); return; }
            setDraftKrw(String(krw));
            setDraftUsd((usdCents / 100).toFixed(2));
            setError("");
            setEditing(true);
          }}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m16 3 5 5-12 12-6 1 1-6L16 3Z" /><path d="m13 6 5 5" />
          </svg>
        </button>
      </div>
      <p className="pf-cash-val">{amount}</p>
      {editing ? createPortal(
        <dialog ref={dialogRef} className="pf-funds-dialog" aria-label={label + " 편집"}
          onCancel={event => { event.preventDefault(); close(); }}
          onClick={event => { if (event.target === event.currentTarget) close(); }}>
          <div className="pf-funds-dialog-header">
            <h2>{label} 편집</h2>
            <button type="button" onClick={close} disabled={saving} aria-label={label + " 편집 닫기"}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
            </button>
          </div>
        <form id={id} className="pf-funds-form" onSubmit={save} aria-label={label + " 편집"} aria-busy={saving}
          onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); close(); } }}>
          <label htmlFor={id + "-krw"}>원화 (KRW)</label>
          <FormattedNumberInput id={id + "-krw"} value={draftKrw} onValueChange={setDraftKrw}
            autoFocus disabled={disabled || saving} aria-label={label + " KRW"} />
          {kind === "deposit" ? <>
            <label htmlFor={id + "-usd"}>달러 (USD)</label>
            <FormattedNumberInput id={id + "-usd"} value={draftUsd} onValueChange={setDraftUsd}
              allowDecimal maxDecimals={2} disabled={disabled || saving} aria-label="예수금 USD" />
            <span className="pf-funds-rate">환율 ₩{fxRate.toLocaleString("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            <span className="pf-funds-total">합계 {preview === null ? "—" : moneyFormat("KRW", preview)}</span>
          </> : null}
          {error ? <p className="pf-funds-error" role="alert">{error}</p> : null}
          <div className="pf-funds-actions">
            <button type="button" onClick={close} disabled={saving} aria-label={label + " 편집 취소"} title="취소">
              취소
            </button>
            <button type="submit" className="pf-funds-save" disabled={disabled || saving || !valid} aria-label={label + " 저장"} title="저장">
              {saving ? "저장 중..." : "저장"}
            </button>
          </div>
        </form>
        </dialog>, document.body,
      ) : null}
    </div>
  );
}
