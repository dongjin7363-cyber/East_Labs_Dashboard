import { redirect } from "next/navigation";

// Preserve bookmarked links and the existing publication verification entry point.
export default function EquityReportArchive() {
  redirect("/weekly-report");
}
