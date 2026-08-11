# App Store 重新送審（Guideline 5.6 退件）

## 被退的原因

2026-08 送審版本被以 **Guideline 5.6 – Developer Code of Conduct** 退件：

> We've identified a pattern of unusual behavior with the app that is commonly associated with
> fraudulent activity. Specifically, the app contains features that appear to have been
> intentionally hidden during the review process.

技術上的直接原因是 `capacitor.config.ts` 設了 `server.url`：

```ts
const config: CapacitorConfig = {
  webDir: 'public',                          // 裡面只有 6 個 svg/png，連 index.html 都沒有
  server: { url: 'https://zeno.zequo.net' }, // 整個前端從遠端載入
};
```

送審的 binary 裡沒有任何 app 邏輯，100% 的功能在啟動後從開發者自有的伺服器取得，
且可在通過審查後任意變更、不需重新送審。這在 Apple 的判定裡等同「刻意隱藏功能」。

同時踩到的還有 **2.5.2**（app 必須自給自足，不得下載或執行程式碼）與 **4.2**（minimum functionality）。

加重因素：`zeno.zequo.net` 當時由一條**沒有設定開機自啟**的 Cloudflare Tunnel 提供，
主機重開後曾長時間中斷。審查員在中斷期間開啟 app 只會看到空白畫面，另一個時間又正常，
這在行為模式上完全符合「功能時有時無」。

## 已完成的修正

| 項目 | 狀態 |
|---|---|
| 移除 `server.url`，UI 靜態匯出打包進 binary | ✅ |
| 建置分離：`build`（server）/ `build:native`（static export） | ✅ |
| 憑證從 cookie 改為 Bearer + iOS Keychain | ✅ |
| API 加上 CORS 白名單（`capacitor://localhost`） | ✅ |
| `cap sync` 後自動修復 `packageClassList` 並擋下 `server.url` | ✅ |
| Cloudflare Tunnel 改為 systemd 服務、開機自啟 | ✅ |
| 後端遷移到 Cloud Run | ⬜ 待部署 |
| App Review demo 帳號 | ⬜ 待建立 |

### 架構前後對照

```
修正前： [iOS binary（空殼）] ──啟動即載入整個前端──> zeno.zequo.net（tunnel → 個人 VM）
修正後： [iOS binary（完整 UI）] ──僅資料 API──────> Cloud Run（正式託管）
```

## 送審前檢查清單

- [ ] `NEXT_PUBLIC_API_BASE_URL` 指向 Cloud Run 正式網址（**不是** `zeno.zequo.net`）
- [ ] `npm run sync:ios` 跑過，且腳本回報 `packageClassList` 已含
      `OAuthSessionPlugin`、`SecureStorePlugin`
- [ ] `ios/App/App/capacitor.config.json` **沒有** `server` 區塊
      （`scripts/patch-ios-plugins.mjs` 會擋，但送審前再確認一次）
- [ ] 實機測試：Google 登入、Apple 登入、Email 註冊/登入、登出後憑證確實清除
- [ ] 實機測試：**開飛航模式**開 app——應顯示連線錯誤，而不是白畫面
- [ ] App Review Information 填入 demo 帳號的帳密。
      **帳號和密碼都直接填在 App Store Connect，不要寫進這份文件**——這個 repo 是公開的，
      而 demo 帳號在正式資料庫裡是一個真的能登入的帳號。
- [x] demo 帳號已驗證可登入（2026-08-11 實測 HTTP 200，未被 email 驗證流程擋下）
- [x] 帳號內有示範資料：4 個帳戶、8 筆交易、1 個目標
- [ ] demo 帳號使用夠強的密碼（審查員只會複製貼上，密碼長度不影響他們的體驗）
- [ ] Cloud Run 服務 `--min-instances=1`，審查期間不會冷啟動逾時

## Resolution Center 回覆草稿

> Hello,
>
> Thank you for the detailed feedback. We have identified the cause and want to be direct about it.
>
> The previous build was misconfigured. Our app is built with Capacitor, and the
> `server.url` option — which is intended for local development, where the native shell loads
> the web assets from a development server — was left in place in the production configuration.
> As a result, the submitted binary loaded its entire interface from our server at runtime
> instead of from the app bundle. We understand why this appears as functionality being hidden
> from review, and we recognise it should never have been submitted in that state.
>
> This was a configuration oversight on our part, not an attempt to conceal functionality.
> The app has no feature flags, no remote configuration, and no code that alters its behaviour
> based on whether it is being reviewed.
>
> The new build changes the architecture:
>
> 1. `server.url` has been removed entirely. The complete user interface is now compiled into
>    the app bundle as a static export and loads from the binary.
> 2. The remote server is now used only as a data API (account balances, transactions, and
>    market prices). No code or UI is downloaded at runtime.
> 3. We have added an automated build check that fails the iOS build if `server.url` ever
>    reappears in the configuration, so this cannot recur.
> 4. The backend has been moved to managed hosting for reliable availability during review.
>
> A demo account is provided in App Review Information with sample data so that every feature
> can be exercised.
>
> We are happy to provide any further detail that would help with the review.
>
> Thank you for your time.

### 回覆時的原則

- **承認設定錯誤**。客觀上確實送了一個空殼 app，辯解只會延長流程。
- **不要說 Apple 誤判**。
- **具體說明技術上改了什麼**，並強調已加入防止再犯的機制。
- 在修正完成前**不要重新送審**——5.6 情況下反覆提交可能被視為規避審查而升級處理。
