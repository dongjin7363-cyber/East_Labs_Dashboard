import {
  CashTransaction,
  PortfolioHolding,
  StorageSchema,
} from "@/lib/models/types";
import {
  deserializePortfolioHolding,
  serializePortfolioHoldingForStorage,
} from "@/lib/repository/mappers/portfolioHoldingMapper";
import { FinanceRepository } from "@/lib/storage/repository";

const STORAGE_KEY = "personal-finance-dashboard";
const SCHEMA_VERSION = 1;

function createEmptySchema(): StorageSchema {
  return {
    schemaVersion: SCHEMA_VERSION,
    portfolioHoldings: [],
    cashTransactions: [],
    updatedAt: new Date().toISOString(),
  };
}

function isClient(): boolean {
  return typeof window !== "undefined";
}

function normalizePortfolioHolding(raw: unknown, index: number): PortfolioHolding | null {
  return deserializePortfolioHolding(raw, index);
}

function normalizeSchema(raw: unknown): StorageSchema {
  if (!raw || typeof raw !== "object") {
    return createEmptySchema();
  }

  const data = raw as Partial<StorageSchema>;

  if (data.schemaVersion !== SCHEMA_VERSION) {
    return createEmptySchema();
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    portfolioHoldings: Array.isArray(data.portfolioHoldings)
      ? data.portfolioHoldings
          .map((holding, index) => normalizePortfolioHolding(holding, index))
          .filter((holding): holding is PortfolioHolding => Boolean(holding))
      : [],
    cashTransactions: Array.isArray(data.cashTransactions)
      ? (data.cashTransactions as CashTransaction[])
      : [],
    updatedAt:
      typeof data.updatedAt === "string"
        ? data.updatedAt
        : new Date().toISOString(),
  };
}

function readSchema(): StorageSchema {
  if (!isClient()) {
    return createEmptySchema();
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return createEmptySchema();
    }

    return normalizeSchema(JSON.parse(raw));
  } catch {
    return createEmptySchema();
  }
}

function writeSchema(schema: StorageSchema): void {
  if (!isClient()) {
    return;
  }

  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ ...schema, updatedAt: new Date().toISOString() }),
  );
}

export class LocalStorageFinanceRepository implements FinanceRepository {
  getPortfolioHoldings(): PortfolioHolding[] {
    return readSchema().portfolioHoldings;
  }

  savePortfolioHoldings(holdings: PortfolioHolding[]): void {
    const current = readSchema();
    const normalized = holdings
      .map((holding, index) =>
        normalizePortfolioHolding(serializePortfolioHoldingForStorage(holding), index),
      )
      .filter((holding): holding is PortfolioHolding => Boolean(holding));
    writeSchema({ ...current, portfolioHoldings: normalized });
  }

  getCashTransactions(): CashTransaction[] {
    return readSchema().cashTransactions;
  }

  saveCashTransactions(transactions: CashTransaction[]): void {
    const current = readSchema();
    writeSchema({ ...current, cashTransactions: transactions });
  }

  resetAll(): void {
    writeSchema(createEmptySchema());
  }
}

export const storageMeta = {
  key: STORAGE_KEY,
  schemaVersion: SCHEMA_VERSION,
};
