import { ExportItem, ExportDataPoint } from "@/lib/models/types";
import {
  deserializeExportItem,
  deserializeExportDataPoint,
} from "@/lib/repository/mappers/exportMapper";
import { supabase } from "@/lib/supabaseClient";

export async function fetchExportItems(): Promise<ExportItem[]> {
  const { data, error } = await supabase
    .from("export_items")
    .select("*")
    .order("sector", { ascending: true })
    .order("importance", { ascending: false });

  if (error) throw error;

  const raw = data ?? [];
  const parsed = raw
    .map((row, i) => deserializeExportItem(row, i))
    .filter((item): item is ExportItem => Boolean(item));

  if (raw.length > 0 && parsed.length === 0) {
    console.warn("[export] export_items: rows returned but all failed to deserialize. Sample row:", raw[0]);
  }

  return parsed;
}

export async function fetchExportData(itemId: string): Promise<ExportDataPoint[]> {
  const { data, error } = await supabase
    .from("export_data")
    .select("*")
    .eq("item_id", itemId)
    .order("ym", { ascending: true });

  if (error) throw error;

  return (data ?? [])
    .map((row, i) => deserializeExportDataPoint(row, i))
    .filter((item): item is ExportDataPoint => Boolean(item));
}
