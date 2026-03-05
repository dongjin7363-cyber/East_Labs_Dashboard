import { redirect } from "next/navigation";

export default function LegacyUsEtfScreeningRedirectPage() {
  redirect("/market/us/sector-etf-trend");
}
