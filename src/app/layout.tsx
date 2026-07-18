import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Legally — Deposition contradiction review",
  description:
    "AI-assisted deposition comparison with deterministic contradiction classification and confidence scoring.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
