export type SortMode = "DESC" | "ASC";

export interface SortState<K extends string> {
  key: K | null;
  mode: SortMode | null;
}

export function toggleSort<K extends string>(
  prev: SortState<K>,
  nextKey: K,
): SortState<K> {
  if (prev.key !== nextKey) {
    return {
      key: nextKey,
      mode: "DESC",
    };
  }

  if (prev.mode === null) {
    return {
      key: nextKey,
      mode: "DESC",
    };
  }

  if (prev.mode === "DESC") {
    return {
      key: nextKey,
      mode: "ASC",
    };
  }

  return {
    key: null,
    mode: null,
  };
}

function comparePrimitive(a: unknown, b: unknown): number {
  if (typeof a === "number" && typeof b === "number") {
    return a - b;
  }

  if (a instanceof Date && b instanceof Date) {
    return a.getTime() - b.getTime();
  }

  if (typeof a === "boolean" && typeof b === "boolean") {
    return Number(a) - Number(b);
  }

  return String(a ?? "").localeCompare(String(b ?? ""), "ko-KR", {
    numeric: true,
    sensitivity: "base",
  });
}

export function sortRows<T, K extends string>(
  rows: T[],
  sortState: SortState<K>,
  getValue: (row: T, key: K) => unknown,
  defaultComparator?: (a: T, b: T) => number,
): T[] {
  const sorted = [...rows];

  if (!sortState.key || !sortState.mode) {
    if (defaultComparator) {
      sorted.sort(defaultComparator);
    }

    return sorted;
  }

  const direction = sortState.mode === "DESC" ? -1 : 1;
  const key = sortState.key;

  sorted.sort((a, b) => {
    const result = comparePrimitive(getValue(a, key), getValue(b, key));

    if (result !== 0) {
      return result * direction;
    }

    if (defaultComparator) {
      return defaultComparator(a, b);
    }

    return 0;
  });

  return sorted;
}
