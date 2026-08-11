import type { Metadata, Viewport } from "next";
import { Fraunces, IBM_Plex_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

// 字型全部改走 next/font，它會自動 self-host、preload、加上 font-display: swap。
//
// 先前是三種載入方式並存：layout 用 <link> 拉 Noto Sans TC、page.tsx 在 client component
// 裡用 `<style jsx global>` 包一段 @import 拉 Fraunces + IBM Plex Mono + Noto Serif TC，
// 另外還為了一個沒有任何地方使用的 .theme-pixel 主題載入 Press Start 2P 與 DotGothic16。
// CSS @import 是串聯載入（要先下載 CSS 才知道要下載字型），而且發生在 hydration 之後，
// 所以首屏一定會看到系統字型再跳成 Fraunces，金額的數字寬度也會跟著跳。

// Fraunces 是可變字型，不指定 weight 就會載入整個 wght 軸（400～700 都能用），
// 一個檔案搞定所有字重。
const display = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
  display: "swap",
});

// 金額一律用等寬 + tabular-nums，數字才不會在更新時左右晃動
const ledger = IBM_Plex_Mono({
  variable: "--font-ledger",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

// 中文不再載入任何網路字型。
//
// 先前是用 Google 的動態 stylesheet 拉 Noto Sans TC 當備援，但每個主流平台本來就都有
// 一套繁中 UI 字型（iOS/macOS: PingFang TC、Windows: 微軟正黑體、Android/Linux: Noto Sans CJK），
// 而 next/font 自架 CJK 會把整包字型檔（數 MB）納入建置產物，代價遠大於收益。
// 直接依賴系統字型：少一個第三方請求、少一次 render-blocking、也不用把使用者資訊送到 Google。

export const metadata: Metadata = {
  title: "Zeno",
  description: "Zeno · 個人淨資產追蹤",
  icons: { icon: "/logo.png", apple: "/logo.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // 先前是 maximumScale: 1 + userScalable: false，等於禁止縮放——違反 WCAG 1.4.4，
  // 對需要放大字級的使用者（正是會用資產管理工具的年齡層）很不友善。
  // 允許放大到 5 倍；iOS 的「輸入框聚焦時自動放大」是靠 16px 以上的字級避免，不是靠禁用縮放。
  maximumScale: 5,
  userScalable: true,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#EEF0EC" },
    { media: "(prefers-color-scheme: dark)", color: "#0B0D12" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      // 內容全是繁體中文，先前寫 lang="en" 會讓 VoiceOver 用英文發音去念中文
      lang="zh-Hant-TW"
      className={`${display.variable} ${ledger.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
