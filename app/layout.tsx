import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "買い物リスト",
  description: "よく使うアイテムを検索して、かんたんに追加できます",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "買い物リスト",
    statusBarStyle: "default",
  },
  icons: {
    icon: "/favicon.png",
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}

        <footer className="text-center text-xs text-gray-400 py-4">
  <div className="flex justify-center gap-4">
    <Link href="/disclaimer" className="hover:text-gray-600">
      免責事項
    </Link>

    <Link href="/privacy" className="hover:text-purple-500">
      プライバシー
    </Link>

    <Link href="/guide" className="hover:text-orange-500">
      ガイド
    </Link>
  </div>

  <p className="mt-2 text-[10px] text-gray-400">
  © 2026 My Shopping List by <span className="text-gray-500">M.glitter</span>
</p>
</footer>
      </body>
    </html>
  );
}