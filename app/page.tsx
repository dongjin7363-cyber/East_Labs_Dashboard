import { redirect } from "next/navigation";

export default function Home() {
  // Canonical landing route.
  redirect("/portfolio");
}
