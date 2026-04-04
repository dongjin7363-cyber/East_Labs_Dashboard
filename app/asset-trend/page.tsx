import dynamicImport from "next/dynamic";
import { unstable_noStore as noStore } from "next/cache";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const TotalAssetClient = dynamicImport(
  () => import("@/components/TotalAssetClient").then((mod) => mod.TotalAssetClient),
  { ssr: false },
);

export default function AssetTrendRedirectPage() {
  noStore();
  return <TotalAssetClient />;
}
