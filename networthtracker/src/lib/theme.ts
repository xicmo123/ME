// 設計 token 的單一來源。
//
// 先前 globals.css 定義了一整套 CSS 變數，但 page.tsx 裡卻是滿滿的 hex 字面值
// （"#B8933C" 出現數十次），等於兩套並存的設計系統，改一次品牌色要全域搜尋替換。
// 需要在 JS 端使用的顏色（recharts 的 stroke/fill、inline style）集中放這裡，
// Tailwind 類別則沿用 globals.css 的變數。

import type { CSSProperties } from "react";

export const COLORS = {
  gold: "#B8933C",
  goldLight: "#DCB75F",
  ink: "#1C1F1A",
  cream: "#FFF3D6",
  sage: "#4F7B5E",
  sageLight: "#7FAE8F",
  brick: "#A24936",
  brickLight: "#C1594A",
  slateBlue: "#5A7DA0",
  plum: "#B85C7A",
  violet: "#6B5CA5",
  orchid: "#8E6FB8",
  clay: "#C97B4A",
  warmGrey: "#8A8F82",
} as const;

// ─── 漲跌配色：全站統一「紅漲綠跌」（台股慣例）。
//
// 先前個股用紅漲綠跌、走勢圖與每月增減卻用綠漲紅跌，使用者在同一個畫面上下捲動
// 會看到「紅色＝好」和「紅色＝壞」交替出現。這裡是唯一的判斷入口，不要在別處自己寫三元式。
export const DELTA_UP = COLORS.brick; // 漲／成長 → 紅
export const DELTA_DOWN = COLORS.sage; // 跌／衰退 → 綠
export const DELTA_FLAT = COLORS.warmGrey;

export function deltaColor(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return DELTA_FLAT;
  if (value === 0) return DELTA_FLAT;
  return value > 0 ? DELTA_UP : DELTA_DOWN;
}

/** 深色模式下同一組語意色要亮一點才看得清楚 */
export function deltaColorForTheme(value: number | null | undefined, isDark: boolean): string {
  if (value == null || !Number.isFinite(value) || value === 0) return DELTA_FLAT;
  if (value > 0) return isDark ? COLORS.brickLight : COLORS.brick;
  return isDark ? COLORS.sageLight : COLORS.sage;
}

// ─── 圖表軸標／次要文字。
//
// 先前圖表軸標與輸入框 placeholder 都用 #8A8F82，在白底上對比只有約 3.3:1，
// 未達 WCAG AA 的 4.5:1。淺色模式改用較深的灰綠，深色模式改用較亮的，兩邊都過 AA。
export const CHART_AXIS_COLOR = { light: "#5F6459", dark: "#9AA093" } as const;

export function chartAxisColor(isDark: boolean): string {
  return isDark ? CHART_AXIS_COLOR.dark : CHART_AXIS_COLOR.light;
}

/** recharts 的 Tooltip 外觀，四張圖共用，不要各自複製一份 */
export function chartTooltipStyle(isDark: boolean): CSSProperties {
  return {
    borderRadius: "10px",
    border: isDark ? "1px solid rgba(255,255,255,0.12)" : "1px solid rgba(0,0,0,0.08)",
    background: isDark ? "#12151C" : "#FFFFFF",
    fontFamily: "var(--font-ledger), ui-monospace, monospace",
    fontSize: "12px",
    boxShadow: "none",
  };
}

// ─── 資產分類配色：資產配置圓餅圖、帳戶分組色條、卡片 icon 底色共用
export const ALLOCATION_BUCKETS = [
  { name: "流動資金", cats: ["CASH", "BANK_ACCOUNT"], color: COLORS.gold },
  { name: "台股", cats: ["TAIWAN_STOCK"], color: COLORS.sage },
  { name: "美股", cats: ["US_STOCK"], color: COLORS.slateBlue },
  { name: "日股", cats: ["JAPAN_STOCK"], color: COLORS.plum },
  { name: "韓股", cats: ["KOREA_STOCK"], color: COLORS.violet },
  { name: "加密貨幣", cats: ["CRYPTO"], color: COLORS.brick },
  { name: "其他", cats: ["FIXED_ASSET", "RECEIVABLE"], color: COLORS.warmGrey },
] as const;

export const GROUP_COLORS = {
  liquid: COLORS.gold,
  portfolio: COLORS.slateBlue,
  liability: COLORS.brick,
} as const;

// ─── 共用的 Tailwind class 組合。
// 這些字串先前散在 page.tsx 的元件內部，切成多個分頁元件之後需要共用。
export const BG_CLASS = "bg-[#EEF0EC] dark:bg-[#0B0D12]";
export const SURFACE_CLASS =
  "bg-white dark:bg-[#151923] shadow-[0_10px_30px_-14px_rgba(28,31,26,0.16)] dark:shadow-[0_10px_30px_-14px_rgba(0,0,0,0.55)]";
export const MODAL_SURFACE_CLASS =
  "relative bg-gradient-to-b from-[#F9EDD2] via-[#FFFBF0] to-white dark:from-[#242B42] dark:via-[#181D2C] dark:to-[#12151C] shadow-[inset_0_3px_0_0_#B8933C,0_20px_50px_-20px_rgba(184,147,60,0.4)] dark:shadow-[inset_0_3px_0_0_#B8933C,0_20px_50px_-20px_rgba(0,0,0,0.7)] ring-1 ring-[#B8933C]/20 dark:ring-[#B8933C]/25";
export const TEXT_PRIMARY_CLASS = "text-brand-ink dark:text-brand-paper";
// 淺色 #5F6459 對白底約 6.1:1、深色 #9AA093 對深底約 7.3:1，兩者都通過 WCAG AA
export const TEXT_MUTED_CLASS = "text-[#5F6459] dark:text-[#9AA093]";
export const INPUT_CLASS =
  "w-full h-11 px-3.5 text-sm outline-none bg-transparent text-brand-ink dark:text-brand-paper border-b-2 border-black/15 dark:border-white/15 focus:border-[#B8933C] focus-visible:border-[#B8933C] transition-colors placeholder:text-[#5F6459] dark:placeholder:text-[#9AA093]";
export const BTN_PRIMARY_CLASS =
  "w-full py-3.5 text-sm font-semibold bg-[#1C1F1A] dark:bg-[#B8933C] text-[#EEF0EC] dark:text-[#0B0D12] rounded-lg hover:opacity-90 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50 disabled:active:scale-100";
export const BTN_SECONDARY_CLASS =
  "w-full py-3 text-sm font-semibold border border-black/15 dark:border-white/15 rounded-lg hover:bg-black/[0.03] dark:hover:bg-white/[0.04] active:scale-[0.98] transition-all cursor-pointer";
export const SECTION_LABEL_CLASS =
  "text-xs font-bold tracking-[0.18em] uppercase text-[#5F6459] dark:text-[#9AA093]";
export const CARD_TITLE_CLASS = "text-sm font-bold";
export const ICON_BTN_CLASS =
  "h-10 w-10 rounded-full bg-white dark:bg-[#151923] border border-black/[0.05] dark:border-white/[0.07] flex items-center justify-center transition-colors";
