export const FINANCE_DATA_EVENT = "finance-data-updated";

export function notifyFinanceDataChanged(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new Event(FINANCE_DATA_EVENT));
}
