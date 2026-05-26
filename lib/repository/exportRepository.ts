import { ExportItem, ExportDataPoint } from "@/lib/models/types";
import {
  deserializeExportItem,
  deserializeExportDataPoint,
} from "@/lib/repository/mappers/exportMapper";
import { supabase } from "@/lib/supabaseClient";

const EXPORT_DATA_SELECT =
  "sheet_name,period,sector,description,importance,yoy,mom,daily_avg,as_of_date,is_partial";
const EXPORT_DATA_COMPAT_SELECT =
  "sheet_name,period,sector,description,importance,yoy,mom,daily_avg";
const EXPORT_ITEMS_SELECT =
  "sheet_name,sector,item_name,description,importance,related_stocks,is_active";
const EXPORT_ITEMS_COMPAT_SELECT =
  "sheet_name,sector,name,description,importance,related_stocks,is_active";
const PAGE_SIZE = 1000;

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    return typeof message === "string" ? message : String(message);
  }

  return String(error);
}

async function fetchAllActiveExportItemRows(select = EXPORT_ITEMS_SELECT): Promise<unknown[]> {
  const rows: unknown[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from("export_items")
      .select(select)
      .eq("is_active", true)
      .order("sector", { ascending: true })
      .order("importance", { ascending: false })
      .order("sheet_name", { ascending: true })
      .range(from, to);

    if (error) throw error;

    const page = data ?? [];
    rows.push(...page);

    if (page.length < PAGE_SIZE) {
      break;
    }
  }

  return rows;
}

export async function fetchExportItems(): Promise<ExportItem[]> {
  let raw: unknown[];

  try {
    raw = await fetchAllActiveExportItemRows();
  } catch (error) {
    const message = getErrorMessage(error);
    if (!message.includes("item_name")) {
      throw error;
    }

    raw = await fetchAllActiveExportItemRows(EXPORT_ITEMS_COMPAT_SELECT);
  }

  const parsed = raw
    .map((row, i) => deserializeExportItem(row, i))
    .filter((item): item is ExportItem => Boolean(item));

  if (raw.length > 0 && parsed.length === 0) {
    console.warn("[export] export_items: rows returned but all failed to deserialize. Sample row:", raw[0]);
  }

  return parsed;
}

export async function fetchExportData(itemId: string): Promise<ExportDataPoint[]> {
  let rows: unknown[] | null = null;
  let queryError: unknown = null;

  const primary = await supabase
    .from("export_data")
    .select(EXPORT_DATA_SELECT)
    .eq("sheet_name", itemId)
    .order("period", { ascending: true });
  rows = primary.data;
  queryError = primary.error;

  if (queryError && /as_of_date|is_partial/.test(getErrorMessage(queryError))) {
    const fallback = await supabase
      .from("export_data")
      .select(EXPORT_DATA_COMPAT_SELECT)
      .eq("sheet_name", itemId)
      .order("period", { ascending: true });
    rows = fallback.data;
    queryError = fallback.error;
  }

  if (queryError) throw queryError;

  return (rows ?? [])
    .map((row, i) => deserializeExportDataPoint(row, i))
    .filter((item): item is ExportDataPoint => Boolean(item));
}
