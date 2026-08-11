import type { CapacitorConfig } from '@capacitor/cli';

// 這裡刻意沒有 `server` 區塊。
//
// 先前是 server.url = 'https://zeno.zequo.net'，App 啟動後把整個前端從遠端載入。那代表送審的
// binary 裡沒有任何 app 邏輯，而且功能可以在通過審查之後任意變更、不需要重新送審。App Store
// 以 Guideline 5.6（Developer Code of Conduct）退件，理由是「app 含有在審查過程中被刻意隱藏
// 的功能」；同時也踩到 2.5.2（app 必須自給自足、不得下載或執行程式碼）與 4.2。
//
// 現在改成：UI 由 `BUILD_TARGET=native next build` 靜態匯出到 out/，整包進 binary；
// 只有資料透過 NEXT_PUBLIC_API_BASE_URL 指向的後端 API 取得。
// 加回任何 server.url 都會讓這個 App 再次被退件。
const config: CapacitorConfig = {
  appId: 'com.zenoworth.app',
  appName: 'Zeno',
  webDir: 'out',
};

export default config;
