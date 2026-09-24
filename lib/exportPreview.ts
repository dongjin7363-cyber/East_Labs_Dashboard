import { ExportItem, ExportDataPoint } from "@/lib/models/types";
export const isExportPreview = process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_EAST_EXPORT_PREVIEW === "1";
export interface ExportPreview {
  items: ExportItem[];
  data: Record<string, ExportDataPoint[]>;
  previous: Record<string, ExportDataPoint | null>;
  release: string;
  through: string;
}
let request: Promise<ExportPreview> | undefined;
export function getExportPreview(): Promise<ExportPreview> {
  if (!isExportPreview) return Promise.reject(new Error("Local preview is disabled"));
  if (!request) request = fetch("/api/export-preview").then(async response => {
    if (!response.ok) throw new Error("로컬 수출입 데이터 파일을 불러오지 못했습니다.");
    return response.json() as Promise<ExportPreview>;
  }).catch(error => { request = undefined; throw error; });
  return request;
}
