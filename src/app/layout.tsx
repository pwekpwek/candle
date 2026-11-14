import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppShell } from "@/components/shell/app-shell";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  weight: ["400", "600"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  weight: ["400", "600"],
});

export const metadata: Metadata = {
  title: "CandleLab Studio",
  description:
    "Work out wax and fragrance weights for your candle formulas, and keep them on this device.",
};

// viewport-fit=cover lets env(safe-area-inset-bottom) work for the phone
// bottom bar.
export const viewport: Viewport = {
  viewportFit: "cover",
};

// Server component shell: it renders the client shell and never touches
// formula data (TRD-01).
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} antialiased`}
    >
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
