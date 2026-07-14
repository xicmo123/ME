// Next.js 會在 app 啟動時自動執行這支檔案裡的 register()，且只執行一次。
// 這裡註冊兩個排程：
//   1. 每 10 分鐘同步一次股價/匯率/Bitfinex
//   2. 每天台灣時間 23:59 記錄一筆淨資產快照
//
// 排程邏輯寫在程式碼裡，之後不管部署到哪台機器、賣給誰，
// 只要 app 有啟動，排程就會自動生效，不需要額外設定系統 crontab。

// 帶上共用密鑰，讓下面幾支內部排程專用 API 能分辨「是自己的 cron 呼叫」還是「外部任意呼叫」，
// 避免這些會動到全部使用者資料的端點被任何人隨時從外部打來濫用。
function cronHeaders(): Record<string, string> {
  const secret = process.env.CRON_SECRET;
  return secret ? { "x-cron-secret": secret } : {};
}

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
        const res = await fetch(`${BASE_URL}/api/test-fetch-prices`, { headers: cronHeaders() });
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
        const res = await fetch(`${BASE_URL}/api/history/snapshot`, { headers: cronHeaders() });
        console.log(`[Cron] 每日淨資產快照完成，status: ${res.status}`);
      } catch (error) {
        console.error("[Cron] 每日快照失敗:", error);
      }
    },
    { timezone: "Asia/Taipei" }
  );

  // 負債自動扣款改由前端在每次進入 App 時呼叫 /api/recurring/apply（見該檔案），
  // 冪等且會正確記錄交易日期，不再需要這裡的背景 cron。
  // （曾經同時保留這支 cron 呼叫 /api/accounts/apply-deductions，兩套邏輯互相不知道對方扣過款，
  // 會在同一個扣款日各自扣一次，變成實質上的重複扣款，故移除。）

  console.log("[Cron] 排程已註冊：每 10 分鐘同步價格、每天 23:59 記錄淨資產快照");
}