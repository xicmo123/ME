/* eslint-disable @typescript-eslint/no-require-imports */

const cron = require('node-cron');
const { execSync } = require('child_process');

console.log("🚀 [雙效金牌排程器] 啟動成功！已進入背景常駐監聽狀態...");
console.log("📅 每日快照任務：每天晚上台灣時間 23:59 準時強制執行。");
console.log("⏰ 即時同步任務：每小時整點 (0分0秒) 自動觸發最新報價更新。");

// 自動偵測目前 Next.js 跑在線上的 Port
function getRunningPort() {
  let port = 8080;
  try {
    const pm2Info = execSync('pm2 jlist').toString();
    const apps = JSON.parse(pm2Info);
    const tracker = apps.find(a => a.name === 'networth-tracker');
    if (tracker && tracker.pm2_env && tracker.pm2_env.PORT) {
      port = tracker.pm2_env.PORT;
    }
  } catch {
    // 偵測失敗則沿用正式環境預設 8080
  }
  return port;
}

// 🌟 任務一：每小時整點自動同步報價 (0分 1小時/次)
cron.schedule('0 * * * *', async () => {
  const nowTW = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
  console.log(`[${nowTW}] 🔄 每小時整點已到！排程機器人正在自動同步全球資產最新報價...`);
  
  try {
    const port = getRunningPort();
    const res = await fetch(`http://localhost:${port}/api/test-fetch-prices`, {
      headers: { 'Cache-Control': 'no-cache' }
    });
    
    if (res.ok) {
      console.log(`[${nowTW}] ✅ 最新報價背景同步成功！(包含台股/美股/Bitfinex融資)`);
    } else {
      console.error(`[${nowTW}] ❌ 報價同步 API 異常，狀態碼: ${res.status}`);
    }
  } catch (err) {
    console.error(`[${nowTW}] ❌ 報價同步失敗，請確認網頁伺服器是否開著:`, err);
  }
}, {
  scheduled: true,
  timezone: "Asia/Taipei"
});

// 🌟 任務二：維持原本的每日 23:59 資產總快照
cron.schedule('59 23 * * *', async () => {
  const nowTW = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
  console.log(`[${nowTW}] ⏳ 深夜 23:59 已到！排程機器人正在記錄每日歷史快照...`);
  
  try {
    const port = getRunningPort();
    const res = await fetch(`http://localhost:${port}/api/cron/snapshot`, {
      headers: { 'Cache-Control': 'no-cache' }
    });
    
    if (res.ok) {
      console.log(`[${nowTW}] ✅ 每日歷史總快照成功安全寫入資料庫！`);
    } else {
      console.error(`[${nowTW}] ❌ 快照 API 異常，狀態碼: ${res.status}`);
    }
  } catch (err) {
    console.error(`[${nowTW}] ❌ 歷史快照連線失敗:`, err);
  }
}, {
  scheduled: true,
  timezone: "Asia/Taipei"
});
