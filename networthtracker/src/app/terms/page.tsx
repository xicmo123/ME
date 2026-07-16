export const metadata = {
  title: "服務條款 - Zeno",
};

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[#EEF0EC] dark:bg-[#0B0D12] text-[#1C1F1A] dark:text-[#E7E5DE] px-6 py-12">
      <div className="max-w-2xl mx-auto space-y-8 text-sm leading-relaxed">
        <div>
          <h1 className="text-2xl font-bold mb-2">服務條款</h1>
          <p className="text-[#6B7066] dark:text-[#8A8F82]">最後更新日期：2026 年 7 月</p>
        </div>

        <p>
          歡迎使用 Zeno（以下稱「本服務」）。當你建立帳號或使用本服務時，即表示你同意以下條款。若你不同意，請不要使用本服務。
        </p>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">服務內容</h2>
          <p>
            Zeno 是一款個人資產、負債與淨值追蹤工具，協助你手動記錄或透過唯讀 API 連動的方式彙整資產部位、追蹤淨值變化。本服務僅提供資訊整理與試算，不構成任何投資建議、財務規劃建議或稅務建議。
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">帳號</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>你須提供正確的電子郵件資訊，並妥善保管登入憑證（密碼、已連結的 Google／Apple 帳號、裝置生物辨識設定）</li>
            <li>你需對透過你帳號進行的所有操作負責</li>
            <li>你可以隨時在「設定」中刪除帳號與所有相關資料，此操作為不可逆</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">你輸入的資料</h2>
          <p>
            本服務中的資產、負債、交易紀錄與目標等資料，皆由你手動輸入或透過你主動提供、權限受限的第三方唯讀 API 金鑰取得。你必須確保你有權提供這些資料，並對資料的正確性負責；本服務不對外部行情、匯率或第三方 API 回傳資料的即時性與準確性負責。
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">付費方案</h2>
          <p>
            本服務目前提供免費版；Pro 版付費升級功能尚未上線。未來若開放付費訂閱，訂閱、扣款、退款與取消規則將依 App Store 的訂閱條款與規範辦理，屆時我們會在此頁面更新對應說明。
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">服務的限制與免責</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>本服務按「現況」提供，我們不保證服務不中斷、無錯誤或永久可用</li>
            <li>股價、匯率等市場資料來自第三方來源，可能延遲或不準確</li>
            <li>本服務不是持牌財務顧問服務，任何投資或財務決策應由你自行判斷或諮詢專業人士</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">服務變更與終止</h2>
          <p>
            我們可能因營運需要調整、暫停或終止本服務的全部或部分功能。若涉及重大變更，會儘量提前於本頁面或應用程式內公告。
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">條款更新</h2>
          <p>我們可能不定期更新本服務條款，重大變更會在本頁面公告。繼續使用本服務即表示你接受更新後的條款。</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">聯絡我們</h2>
          <p>若你對本條款有任何疑問，歡迎聯絡：<span className="font-medium">xicmo123@gmail.com</span></p>
        </section>
      </div>
    </main>
  );
}
