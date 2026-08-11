# Zeno

個人淨資產追蹤 App。把現金、銀行帳戶、台／美／日／韓股、加密貨幣與各類貸款放進同一個淨資產數字裡，
每天自動留下一筆快照，累積成一條可以回頭看的走勢。

- Web：Next.js 16（App Router、Turbopack）+ React 19
- iOS：Capacitor 原生殼，載入正式站台（見「iOS App」段落）
- 資料庫：PostgreSQL + Prisma
- 訂閱：Apple IAP，透過 RevenueCat 代管

## 開發

```bash
npm install
npx prisma generate
npm run dev          # http://localhost:8080
```

正式環境：

```bash
npm run build && npm run start   # http://localhost:8080
```

## 環境變數

`.env` 需要以下設定：

| 變數 | 必要 | 用途 |
| --- | --- | --- |
| `DATABASE_URL` | ✅ | PostgreSQL 連線字串 |
| `JWT_SECRET` | ✅ | 簽發登入 cookie；未設定時 App 會拒絕啟動 |
| `ENCRYPTION_KEY` | ✅ | 交易所 API Key/Secret 的 AES-256-GCM 金鑰（64 個十六進位字元） |
| `CRON_SECRET` | ✅ | 內部排程 API 的共用密鑰，避免會動到全體使用者的端點被外部呼叫 |
| `APP_BASE_URL` | ✅ | 排程與驗證信連結使用的站台網址 |
| `ADMIN_USER_ID` | | 可進入 `/admin` 的使用者 id |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | | Google 登入 |
| `APPLE_CLIENT_ID` / `APPLE_TEAM_ID` / `APPLE_KEY_ID` / `APPLE_PRIVATE_KEY` | | Apple 登入 |
| `NEXT_PUBLIC_REVENUECAT_IOS_API_KEY` | | RevenueCat（App 內購） |
| `NEXT_PUBLIC_APP_VERSION` | | 設定頁顯示的版本號（原生端有 App 外掛時優先讀原生的） |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | | 註冊驗證信。**未設定時註冊會退回「直接視為已驗證」**，設定後驗證流程自動生效 |
| `SMTP_FROM` | | 寄件者，預設沿用 `SMTP_USER` |

## 程式結構

```
src/
  app/
    page.tsx              薄殼：組合 hooks、持有彈窗狀態、串接分頁元件
    api/                  所有後端端點
  components/
    tabs/                 四個分頁（總覽／行事曆／走勢／設定）
    modals/               各種彈窗
    ui/Modal.tsx          共用對話框（focus trap、Esc、鎖背景捲動）
  hooks/
    useAppData.ts         伺服器資料的載入與快取
    usePreferences.ts     localStorage 偏好
    useToasts.ts          提示訊息（含 Undo）
    usePullToRefresh.ts   下拉更新
  lib/
    derive.ts             所有由原始資料推導出來的計算（純函式）
    entitlements.ts       免費／Pro 的額度與功能開關（單一事實來源）
    theme.ts              設計 token、漲跌配色
    date.ts               台北時區日期（全站唯一的「今天」來源）
    format.ts             金額格式化（釘死 zh-TW）
    api.ts                前端呼叫 API 的統一入口與錯誤處理
```

### 幾個容易踩到的約定

- **日期一律用 `lib/date.ts`。** 不要用 `new Date().toISOString().slice(0,10)`——那是 UTC 日期，
  台北凌晨 0～8 點會差一天。
- **漲跌顏色一律用 `lib/theme.ts` 的 `deltaColor` / `deltaColorForTheme`。** 全站統一紅漲綠跌。
- **淨資產計入所有啟用中的帳戶**，包含降級後被鎖定的。鎖定只影響「明細檢視／編輯／自動同步」，
  不影響任何金額，詳見 `lib/entitlements.ts` 的說明。
- **方案功能開關集中在 `lib/entitlements.ts`。** 前端擋只是 UX，真正的門檻一定要在對應的 API route。

## 排程

`instrumentation.ts` 在 App 啟動時註冊四個 node-cron 排程（皆為台北時間）：

| 時間 | 工作 |
| --- | --- |
| 每 10 分鐘 | 同步 Pro 使用者的股價／幣價／匯率 |
| 每天 00:05 | 套用當天到期的定期扣款 |
| 每天 03:00 | 永久刪除封存滿 60 天的帳戶 |
| 每天 23:59 | 記錄每位使用者的淨資產快照 |

這些排程跑在 App 的 Node process 內，所以**只有在服務存活時才會執行**，
而且假設只有單一實例（多開會重複執行）。

## iOS App

`capacitor.config.ts` 的 `server.url` 指向正式站台，原生殼不打包前端資源，
而是直接載入線上的 Next.js 服務。也就是說：**前端更新不需要送審，但服務中斷時 App 會是白畫面。**

```bash
npx cap sync ios
npx cap open ios
```

## 資料庫

```bash
npx prisma migrate dev      # 開發環境套用 migration
npx prisma migrate deploy   # 正式環境
npx prisma studio           # 檢視資料
```
