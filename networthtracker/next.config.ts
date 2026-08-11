import type { NextConfig } from "next";

// 這個專案有兩種建置目標，同一份原始碼：
//
// 1. server（預設）── 給 Cloud Run 的 standalone server，含 33 支 API route 與資料庫。
// 2. native ────────── 給 iOS App 的靜態前端，`next build` 產出純 HTML/CSS/JS 到 out/，
//                      由 Capacitor 打包進 binary，資料一律打遠端 API。
//
// 為什麼要這樣拆：先前 iOS 的 capacitor.config 用 server.url 直接載入線上的 Next.js server，
// 等於送審的 binary 裡沒有任何 app 邏輯、且內容可在審查後任意變更。App Store 以
// Guideline 5.6（Developer Code of Conduct，「刻意隱藏功能」）退件。UI 必須包進 binary。
const isNativeBuild = process.env.BUILD_TARGET === "native";

const nextConfig: NextConfig = isNativeBuild
  ? {
      // 產物落在 out/，正是 capacitor.config.ts 的 webDir。
      // （不要設 distDir——在 export 模式下它改的就是 out/ 這個輸出目錄本身。）
      output: "export",

      // API route 全部是 route.ts，頁面全部是 .tsx。只認 .tsx 就能把 33 支 route.ts
      // 排除在這次建置之外——static export 不支援會讀取 request 的 Route Handler，
      // 不排除的話建置直接失敗。（instrumentation.ts 也會一併排除，它本來就只在 server 端用。）
      pageExtensions: ["tsx"],

      // 靜態產出沒有伺服器可以做即時最佳化，要停掉預設 loader
      images: { unoptimized: true },

      // Capacitor 用 file:// 語意載入，/about 這種無副檔名路徑找不到檔案，
      // 產成 /about/index.html 才吃得到
      trailingSlash: true,
    }
  : {
      output: "standalone",

      // 只影響 `next dev`，不會進到 production 產物：手機/模擬器透過區網 IP 連進 dev server 時，
      // Next.js 預設會擋掉跨來源請求，導致頁面卡住。ngrok 網域已經用不到了（App 現在打的是
      // 固定的 API base，不再靠 server.url 載入整個前端），但區網 IP 在裝置上除錯還是需要。
      allowedDevOrigins: ["192.168.0.0/16", "10.0.0.0/8"],
    };

export default nextConfig;
