import type { Metadata } from "next";
import "./globals.css";
import { TopNav } from "@/components/TopNav";

export const metadata: Metadata = {
  title: "EAST",
  description: "Local-first personal finance dashboard MVP",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>
        <TopNav />
        <main className="page-shell">{children}</main>
      </body>
    </html>
  );
}
