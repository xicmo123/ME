// 數字／金額格式化。
//
// 先前用的是 `toLocaleString(undefined, ...)`，會跟隨裝置語系——裝置設成德文的使用者
// 會看到 `NT$ 1.234.567,89`（千分位與小數點顛倒）。金額格式是產品的一部分，不該由
// 裝置語系決定，這裡一律釘死 zh-TW。

const NUMBER_LOCALE = "zh-TW";

const decimalFormatter = new Intl.NumberFormat(NUMBER_LOCALE, {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const compactFormatter = new Intl.NumberFormat(NUMBER_LOCALE, {
  notation: "compact",
  maximumFractionDigits: 1,
});

const integerFormatter = new Intl.NumberFormat(NUMBER_LOCALE, {
  maximumFractionDigits: 0,
});

/** 一般金額：最多兩位小數，帶千分位 */
export function formatCurrency(value: number): string {
  return decimalFormatter.format(Number.isFinite(value) ? value : 0);
}

/** 整數金額：圖表軸標、總額這種不需要小數的場合 */
export function formatInteger(value: number): string {
  return integerFormatter.format(Number.isFinite(value) ? Math.round(value) : 0);
}

/** 縮寫金額：1.2萬 這種，用在圖表軸標 */
export function formatCompactNumber(value: number): string {
  return compactFormatter.format(Number.isFinite(value) ? value : 0);
}

/** 百分比，帶正負號 */
export function formatPct(value: number, digits = 1): string {
  const safe = Number.isFinite(value) ? value : 0;
  return `${safe >= 0 ? "+" : "−"}${Math.abs(safe).toFixed(digits)}%`;
}

/**
 * 依目前的檢視幣別把 TWD 金額格式化。
 * 沒有匯率時一律退回 NT$，不會顯示未換算的數字卻掛著 US$ 前綴。
 */
export function formatMoney(
  twd: number,
  displayCurrency: "TWD" | "USD",
  exchangeRate: number | null
): string {
  if (displayCurrency === "USD" && exchangeRate) {
    return `US$ ${formatInteger(twd / exchangeRate)}`;
  }
  return `NT$ ${formatInteger(twd)}`;
}

/** 隱藏金額模式下的佔位符 */
export const MASKED_AMOUNT = "••••";
