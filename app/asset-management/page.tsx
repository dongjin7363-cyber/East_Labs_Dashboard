import { redirect } from "next/navigation";

export default function AssetManagementRedirectPage() {
  // Legacy alias retained for menu/history compatibility.
  redirect("/salary");
}
