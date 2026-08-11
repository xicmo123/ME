// 全站「今天是哪一天」的唯一來源。
//
// 這個 App 的所有日界（每日快照、記帳日期、行事曆的今天、走勢圖的 X 軸）都以台北時間為準，
// 但先前有五處直接用 `new Date().toISOString().slice(0, 10)` 取日期——那是 UTC 日期，
// 在台北 00:00~08:00 之間會早一天，造成記帳表單預設成昨天（且 max 擋住今天）、
// 行事曆的今天框標錯格、自訂區間迄日少一天。一律改用這裡的 helper。

export const APP_TIME_ZONE = "Asia/Taipei";

// en-CA 的日期格式就是 YYYY-MM-DD，剛好是我們拿來當 key 的格式
const isoDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: APP_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** 把任何時間點轉成台北時區的 YYYY-MM-DD */
export function toTaipeiDateString(value: Date | string | number): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return isoDateFormatter.format(date);
}

/** 台北時區的今天，YYYY-MM-DD */
export function todayInTaipei(): string {
  return isoDateFormatter.format(new Date());
}

/** 台北時區、相對今天位移 n 天的日期（負數往前），YYYY-MM-DD */
export function taipeiDateFromToday(offsetDays: number): string {
  return isoDateFormatter.format(new Date(Date.now() + offsetDays * 86_400_000));
}

/**
 * 把 YYYY-MM-DD 正規化成一個「代表該台北日期」的 Date。
 * 資料庫的每日快照就是用這個當 unique key，前後端必須用同一套規則產生。
 */
export function taipeiDateToUtcMidnight(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000Z`);
}
