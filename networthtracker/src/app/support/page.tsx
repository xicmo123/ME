export const metadata = {
  title: "支援 - Zeno",
};

const faqs = [
  {
    q: "如何刪除帳號與所有資料？",
    a: "請寄信到下方聯絡信箱，告知你要刪除帳號的信箱地址，我們會在合理時間內處理並刪除你的所有資料。",
  },
  {
    q: "交易所 API 金鑰安全嗎？",
    a: "你的交易所 API Key / Secret / Passphrase 在存入資料庫前會先加密，我們建議在交易所後台將金鑰設定為「唯讀」權限、不要開放提領權限，降低風險。詳見隱私權政策。",
  },
  {
    q: "為什麼股價或加密貨幣沒有自動更新？",
    a: "免費方案僅支援手動同步，一天最多 3 次；升級 Zeno Pro 後可享每 10 分鐘自動背景更新。台股報價使用台灣證交所官方行情，僅在開盤時段更新。",
  },
  {
    q: "訂閱 Zeno Pro 後可以取消嗎？",
    a: "訂閱透過 App Store 處理，你可以隨時到「設定 > Apple ID > 訂閱」取消，取消後仍可使用至當期訂閱到期為止。",
  },
  {
    q: "忘記密碼怎麼辦？",
    a: "請在登入畫面使用「忘記密碼」功能，或直接寄信到下方聯絡信箱協助處理。",
  },
];

export default function SupportPage() {
  return (
    <main className="min-h-screen bg-[#EEF0EC] dark:bg-[#0B0D12] text-[#1C1F1A] dark:text-[#E7E5DE] px-6 py-12">
      <div className="max-w-2xl mx-auto space-y-8 text-sm leading-relaxed">
        <div>
          <h1 className="text-2xl font-bold mb-2">支援</h1>
          <p className="text-[#6B7066] dark:text-[#8A8F82]">使用上有任何問題，歡迎參考下方常見問題或直接與我們聯絡。</p>
        </div>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">聯絡我們</h2>
          <p>
            電子郵件：<span className="font-medium">xicmo123@gmail.com</span>
          </p>
          <p className="text-[#6B7066] dark:text-[#8A8F82]">我們會盡快回覆，通常在 1-2 個工作天內。</p>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold">常見問題</h2>
          <div className="space-y-4">
            {faqs.map((item) => (
              <div key={item.q} className="space-y-1">
                <p className="font-medium">{item.q}</p>
                <p className="text-[#6B7066] dark:text-[#8A8F82]">{item.a}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">其他資源</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <a href="/privacy" className="underline">隱私權政策</a>
            </li>
            <li>
              <a href="/terms" className="underline">服務條款</a>
            </li>
          </ul>
        </section>
      </div>
    </main>
  );
}
