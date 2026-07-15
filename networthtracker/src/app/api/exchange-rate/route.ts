import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // 🌟 改用超穩定、免金鑰的開源外匯 API，徹底解決雅虎阻擋問題
    const res = await fetch("https://open.er-api.com/v6/latest/USD", { 
      cache: "no-store",
      // 加上超時設定，防止卡死
      signal: AbortSignal.timeout(5000) 
    });
    
    if (!res.ok) throw new Error("API 狀態碼錯誤: " + res.status);

    const data = await res.json();
    const rate = data.rates.TWD;

    if (!rate) throw new Error("找不到台幣匯率資料");

    // rates：完整的「1 USD = X 該幣別」對照表，讓多幣別資產（JPY/EUR/GBP/HKD/CNY/AUD/CAD/SGD...）
    // 也能取得匯率；rate 欄位維持原樣（USD/TWD），不影響既有呼叫端
    return NextResponse.json({ rate, base: "USD", rates: data.rates });
  } catch (error) {
    console.error("抓取匯率失敗:", error);
    return NextResponse.json({ error: "Failed to fetch exchange rate" }, { status: 500 });
  }
}