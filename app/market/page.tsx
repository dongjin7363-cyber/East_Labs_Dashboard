import { redirect } from "next/navigation";

export default function MarketRedirectPage() {
  // Keep /market as a stable entry alias for the Market group.
  redirect("/market/news");
}
