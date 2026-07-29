import type { Metadata } from "next";
import { Inter, Noto_Sans_Display } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const display = Noto_Sans_Display({
  subsets: ["latin"],
  weight: ["700", "800", "900"],
  variable: "--font-display-google",
});

export const metadata: Metadata = {
  title: "RankShorts — Top 5 Ranking Video Editor",
  description:
    "Create YouTube Shorts / TikTok ranking videos with blurred backgrounds, custom titles, clip trimming, and MP4 export.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${display.variable}`}>{children}</body>
    </html>
  );
}
