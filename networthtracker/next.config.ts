import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 手機/模擬器透過區網 IP 或 ngrok 網址連進來時，Next.js dev server 預設會擋掉跨來源請求，
  // 導致頁面卡住、登入判斷跑不起來，所以要把這些來源加進白名單。
  allowedDevOrigins: ["*.ngrok-free.dev", "*.ngrok-free.app", "192.168.0.0/16", "10.0.0.0/8"],
};

export default nextConfig;