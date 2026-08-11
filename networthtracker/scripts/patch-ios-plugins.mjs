// `npx cap sync ios` 會依 node_modules 重新產生 ios/App/App/capacitor.config.json 的
// packageClassList。它只認 npm 安裝的插件，不知道本專案自己寫的原生插件存在，所以每次 sync
// 都會把它們洗掉——bridge 找不到插件，JS 呼叫直接得到 "plugin is not implemented"，
// 表現出來是「Google/Apple 登入按了沒反應」「登入狀態存不起來」這種不會噴錯的壞法。
//
// 先前是靠原始碼註解提醒維護者手動加回去。這支腳本把它變成 sync 流程的一部分。
import { readFileSync, writeFileSync } from "node:fs";

const CONFIG_PATH = "ios/App/App/capacitor.config.json";

// 本地插件的 @objc class 名稱，必須跟 ios/App/App/*.swift 裡的宣告一致
const LOCAL_PLUGINS = [
  "OAuthSessionPlugin", // OAuthSessionPlugin.swift — ASWebAuthenticationSession 版的 OAuth
  "SecureStorePlugin",  // SecureStorePlugin.swift  — Keychain 存登入憑證
];

const config = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
const existing = config.packageClassList ?? [];
const missing = LOCAL_PLUGINS.filter((name) => !existing.includes(name));

if (missing.length === 0) {
  console.log(`✔ packageClassList 已包含所有本地插件 (${LOCAL_PLUGINS.join(", ")})`);
} else {
  config.packageClassList = [...existing, ...missing];
  writeFileSync(CONFIG_PATH, `${JSON.stringify(config, null, "\t")}\n`);
  console.log(`✔ 已把本地插件加回 packageClassList: ${missing.join(", ")}`);
}

// server.url 是先前被 App Store 以 Guideline 5.6 退件的直接原因（送審的 binary 是空殼，
// 全部前端從遠端載入、可在審查後任意變更）。這裡直接擋下，不讓它悄悄回到送審的設定裡。
if (config.server?.url) {
  console.error(
    `\n✖ ios capacitor.config.json 出現 server.url = ${config.server.url}\n` +
      `  這會讓 App 從遠端載入前端，正是 Guideline 5.6 的退件原因。\n` +
      `  請從 capacitor.config.ts 移除 server 設定後重新 sync。\n`
  );
  process.exit(1);
}
