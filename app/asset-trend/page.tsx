import { unstable_noStore as noStore } from "next/cache";
import { TotalAssetClient } from "@/components/TotalAssetClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export default function AssetTrendRedirectPage() {
  noStore();
  return <TotalAssetClient />;
}
