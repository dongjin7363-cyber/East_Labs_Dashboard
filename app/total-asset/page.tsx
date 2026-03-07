import { redirect } from "next/navigation";

export default function TotalAssetPage() {
  // Legacy alias retained for the renamed Asset Trend page.
  redirect("/asset-trend");
}
