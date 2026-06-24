import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NXTTRACK Platform",
  description: "Swim-first SaaS platform scaffold for NXTTRACK.",
  robots: {
    index: false,
    follow: false
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="nl">
      <body>{children}</body>
    </html>
  );
}
