import type { Metadata } from "next";
import { Inter, Noto_Sans_Display, Oswald, Montserrat } from "next/font/google";
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

const oswald = Oswald({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-oswald",
});

const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["700", "800", "900"],
  variable: "--font-montserrat",
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
      <body
        className={`${inter.variable} ${display.variable} ${oswald.variable} ${montserrat.variable}`}
      >
        {children}
      </body>
    </html>
  );
}
