"use client";

import {
  InputHTMLAttributes,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import { formatCommaNumberRaw, sanitizeNumberRaw } from "@/lib/utils/numberFormat";

interface FormattedNumberInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> {
  value: string;
  onValueChange: (rawValue: string) => void;
  allowDecimal?: boolean;
  maxDecimals?: number;
}

function isCaretToken(char: string, allowDecimal: boolean): boolean {
  return /\d/.test(char) || (allowDecimal && char === ".");
}

function countTokensBeforeCaret(
  input: string,
  caret: number,
  allowDecimal: boolean,
): number {
  const safeCaret = Math.max(0, Math.min(caret, input.length));
  let count = 0;

  for (let i = 0; i < safeCaret; i += 1) {
    if (isCaretToken(input[i], allowDecimal)) {
      count += 1;
    }
  }

  return count;
}

function findCaretByToken(display: string, tokenCount: number, allowDecimal: boolean): number {
  if (tokenCount <= 0) {
    return 0;
  }

  let seen = 0;

  for (let i = 0; i < display.length; i += 1) {
    if (isCaretToken(display[i], allowDecimal)) {
      seen += 1;

      if (seen >= tokenCount) {
        return i + 1;
      }
    }
  }

  return display.length;
}

export function FormattedNumberInput({
  value,
  onValueChange,
  allowDecimal = false,
  maxDecimals,
  ...rest
}: FormattedNumberInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingTokenRef = useRef<number | null>(null);

  const normalizedRaw = useMemo(
    () => sanitizeNumberRaw(value, { allowDecimal, maxDecimals }),
    [allowDecimal, maxDecimals, value],
  );

  const displayValue = useMemo(
    () => formatCommaNumberRaw(normalizedRaw, { allowDecimal, maxDecimals }),
    [allowDecimal, maxDecimals, normalizedRaw],
  );

  useLayoutEffect(() => {
    const tokenCount = pendingTokenRef.current;

    if (tokenCount === null) {
      return;
    }

    const input = inputRef.current;

    if (!input) {
      pendingTokenRef.current = null;
      return;
    }

    const caret = findCaretByToken(displayValue, tokenCount, allowDecimal);
    input.setSelectionRange(caret, caret);
    pendingTokenRef.current = null;
  }, [allowDecimal, displayValue]);

  return (
    <input
      {...rest}
      ref={inputRef}
      type="text"
      inputMode={allowDecimal ? "decimal" : "numeric"}
      value={displayValue}
      onChange={(event) => {
        const typed = event.target.value;
        const caret = event.target.selectionStart ?? typed.length;
        pendingTokenRef.current = countTokensBeforeCaret(typed, caret, allowDecimal);

        const raw = sanitizeNumberRaw(typed, {
          allowDecimal,
          maxDecimals,
        });

        onValueChange(raw);
      }}
    />
  );
}
