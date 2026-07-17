export const metadata = {
  title: "隱私權政策 - Zeno",
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[#EEF0EC] dark:bg-[#0B0D12] text-[#1C1F1A] dark:text-[#E7E5DE] px-6 py-12">
      <div className="max-w-2xl mx-auto space-y-8 text-sm leading-relaxed">
        <div>
          <h1 className="text-2xl font-bold mb-2">隱私權政策</h1>
          <p className="text-[#6B7066] dark:text-[#8A8F82]">最後更新日期：2026 年 7 月</p>
        </div>

        <p>
          Zeno（以下稱「本服務」）是一款個人資產、負債與淨值追蹤工具。我們重視你的隱私，這份政策說明我們會收集哪些資料、如何使用與保護這些資料，以及你擁有的權利。
        </p>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">我們收集哪些資料</h2>
          <p className="font-medium">帳號資料</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>電子郵件地址</li>
            <li>密碼（僅儲存加密後的雜湊值，我們無法還原你的原始密碼）</li>
            <li>若使用 Google 或 Apple 登入，我們會取得對應帳號的識別碼與電子郵件，用於建立與驗證你的帳號</li>
          </ul>

          <p className="font-medium mt-3">你主動輸入的財務資料</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>資產與負債項目（名稱、類別、幣別、金額、持有數量等）</li>
            <li>你新增的交易紀錄與資產歷史</li>
            <li>你設定的財務目標</li>
          </ul>
          <p>
            這些資料完全由你手動輸入或透過下方「第三方交易所連動」功能取得，我們不會主動存取你在其他機構的真實帳戶。
          </p>

          <p className="font-medium mt-3">第三方交易所 API 金鑰（選填功能）</p>
          <p>
            若你選擇連動交易所帳戶以自動同步資產，我們會儲存你提供的 API Key / Secret / Passphrase。這些憑證在存入資料庫前會先加密，前端介面也不會顯示或回傳明文內容。建議你在交易所後台將這組金鑰設定為「唯讀」權限，不要開放提領權限。
          </p>

          <p className="font-medium mt-3">裝置本機資料</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Face ID / Touch ID 驗證：僅用於解鎖 App，驗證程序在你的裝置上進行，我們不會取得你的生物特徵資料</li>
            <li>本機通知設定（例如記帳提醒時間）：儲存在裝置上，不會上傳至伺服器</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">我們如何使用這些資料</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>提供帳號登入、資產淨值計算、圖表與歷史趨勢等核心功能</li>
            <li>若你連動了交易所帳戶，用來定期同步餘額與持倉</li>
            <li>寄送帳號驗證信、密碼重設等交易性通知</li>
          </ul>
          <p>我們不會將你的個人資料出售給第三方，也不會用於廣告投放。</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">第三方服務</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li><span className="font-medium">Google / Apple 登入</span>：用於身分驗證，僅取得帳號識別碼與電子郵件</li>
            <li><span className="font-medium">交易所 API（如你選擇連動）</span>：用於讀取你的資產餘額，我們僅使用你提供、且權限受限的唯讀金鑰</li>
            <li><span className="font-medium">股價／匯率資料來源</span>：用於計算你手動輸入部位的即時市值，不涉及你的個人資料</li>
            <li><span className="font-medium">Cloudflare</span>：我們透過 Cloudflare 提供網站服務與基礎流量分析，可能記錄匿名的連線資訊（如 IP、瀏覽器類型）</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">資料保護</h2>
          <p>
            所有連線均透過 HTTPS 加密傳輸。登入憑證使用加密簽章的 Token 機制，交易所 API 金鑰於資料庫中加密儲存。我們僅在提供服務所必要的範圍內存取你的資料。
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">資料保留與刪除</h2>
          <p>
            只要你的帳號存在，我們會持續保留上述資料以提供服務。如果你想刪除帳號與所有相關資料，請透過下方聯絡方式與我們聯繫，我們會在合理時間內處理刪除請求。
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">兒童隱私</h2>
          <p>本服務不是設計給 13 歲以下兒童使用，我們不會刻意收集兒童的個人資料。</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">政策更新</h2>
          <p>我們可能不定期更新這份隱私權政策，重大變更會在本頁面公告。</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">聯絡我們</h2>
          <p>若你對本政策或個人資料處理有任何疑問，歡迎聯絡：<span className="font-medium">xicmo123@gmail.com</span></p>
        </section>
      </div>
    </main>
  );
}
