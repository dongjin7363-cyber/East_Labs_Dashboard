import type { Metadata } from "next";
import "./globals.css";
import "./theme.css";
import { Sidebar } from "@/components/Sidebar";

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
        <a className="east-skip-link" href="#main-content">본문으로 이동</a>
        <div className="east-shell">
          <Sidebar />
          <main id="main-content" className="east-main">{children}</main>
        </div>
      </body>
    </html>
  );
}
