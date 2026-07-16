import type { CapacitorConfig } from '@capacitor/cli';

// 這個 App 有後端 API + 資料庫，不能用純靜態匯出，
// 所以 Capacitor 不包資源，而是讓原生殼直接載入正在跑的 Next.js server。
// 已透過 Cloudflare Tunnel 把正式網域接到本機服務，不再依賴會變動的 ngrok 網址。
const DEV_SERVER_URL = 'https://zeno.zequo.net';

const config: CapacitorConfig = {
  appId: 'com.zenoworth.app',
  appName: 'Zeno',
  webDir: 'public',
  server: {
    url: DEV_SERVER_URL,
  },
};

export default config;
