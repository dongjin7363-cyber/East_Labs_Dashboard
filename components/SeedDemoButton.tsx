"use client";

import { seedDemoData } from "@/lib/services/seedService";
import { notifyFinanceDataChanged } from "@/lib/services/events";

export function SeedDemoButton() {
  const handleSeed = () => {
    const confirmed = window.confirm(
      "기존 데이터를 덮어쓰고 데모 데이터를 생성할까요?",
    );

    if (!confirmed) {
      return;
    }

    seedDemoData();
    notifyFinanceDataChanged();
  };

  return (
    <button type="button" className="secondary-button" onClick={handleSeed}>
      데모 데이터 생성
    </button>
  );
}
