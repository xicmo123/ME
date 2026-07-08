// Next.js 會在 app 啟動時自動執行這支檔案裡的 register()，且只執行一次。
// 這裡註冊兩個排程：
//   1. 每 10 分鐘同步一次股價/匯率/Bitfinex
//   2. 每天台灣時間 23:59 記錄一筆淨資產快照
//
// 排程邏輯寫在程式碼裡，之後不管部署到哪台機器、賣給誰，
// 只要 app 有啟動，排程就會自動生效，不需要額外設定系統 crontab。

export async function register() {
  // instrumentation.ts 在 nodejs 跟 edge 兩種 runtime 都會被呼叫到，
  // node-cron 只能在 nodejs runtime 下運作，這裡做個防呆避免重複註冊或在 edge 環境出錯。
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const cron = await import("node-cron");

  // 你的 app 實際監聽的網址，依照你 pm2 啟動時用的 port 調整
  const BASE_URL = process.env.APP_BASE_URL || "http://localhost:3000";

  // 每 10 分鐘：同步價格
  cron.default.schedule(
    "*/10 * * * *",
    async () => {
      try {
        const res = await fetch(`${BASE_URL}/api/test-fetch-prices`);
        console.log(`[Cron] 價格同步完成，status: ${res.status}`);
      } catch (error) {
        console.error("[Cron] 價格同步失敗:", error);
      }
    },
    { timezone: "Asia/Taipei" }
  );

  // 每天 23:59（台灣時間）：記錄淨資產快照
  cron.default.schedule(
    "59 23 * * *",
    async () => {
      try {
        const res = await fetch(`${BASE_URL}/api/history/snapshot`);
        console.log(`[Cron] 每日淨資產快照完成，status: ${res.status}`);
      } catch (error) {
        console.error("[Cron] 每日快照失敗:", error);
      }
    },
    { timezone: "Asia/Taipei" }
  );

  // 每天 00:10（台灣時間）：檢查負債帳戶今天是不是扣款日，是的話自動扣款
  cron.default.schedule(
    "10 0 * * *",
    async () => {
      try {
        const res = await fetch(`${BASE_URL}/api/accounts/apply-deductions`);
        console.log(`[Cron] 負債自動扣款檢查完成，status: ${res.status}`);
      } catch (error) {
        console.error("[Cron] 負債自動扣款失敗:", error);
      }
    },
    { timezone: "Asia/Taipei" }
  );

  console.log("[Cron] 排程已註冊：每 10 分鐘同步價格、每天 23:59 記錄淨資產快照、每天 00:10 檢查負債扣款");
}