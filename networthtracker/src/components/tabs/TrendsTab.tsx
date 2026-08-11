"use client";

import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Lock, Maximize2 } from "lucide-react";
import { apiGet } from "@/lib/api";
import { BENCHMARKS } from "@/lib/constants";
import { todayInTaipei } from "@/lib/date";
import {
  buildAssetLiabilitySeries, computeGrowthStreak, computeInceptionCagr,
  computeMonthlyDeltas, computePeriodStats, computeWhatIf, type ChartPoint,
} from "@/lib/derive";
import { formatCompactNumber, formatInteger, formatPct, MASKED_AMOUNT } from "@/lib/format";
import {
  CARD_TITLE_CLASS, chartAxisColor, chartTooltipStyle, COLORS, deltaColorForTheme,
  INPUT_CLASS, SECTION_LABEL_CLASS, SURFACE_CLASS, TEXT_MUTED_CLASS,
} from "@/lib/theme";
import type { CurrentUser, HistoryPoint } from "@/lib/types";
import { NetWorthChart, type NetWorthChartProps, type TrendChartMode } from "@/components/charts/NetWorthChart";

// 起始淨值太接近 0 時，百分比變化會被放大到失真（淨值從 -500 變 300 會顯示成幾百 %）
const MIN_COMPARISON_BASE = 10_000;

export type Timeframe = "day" | "month" | "year" | "custom";

export type TrendsTabProps = {
  history: HistoryPoint[];
  chartData: ChartPoint[];
  netWorth: number;
  timeframe: Timeframe;
  onTimeframeChange: (timeframe: Timeframe) => void;
  customRange: { start: string; end: string } | null;
  onCustomRangeChange: (range: { start: string; end: string }) => void;
  historyLoaded: boolean;
  hideBalance: boolean;
  isDarkMode: boolean;
  currentUser: CurrentUser | null;
  onOpenBackfill: () => void;
  onOpenPlans: () => void;
  /** 展開檢視要拿到「跟內嵌圖表完全一樣」的資料，不能只傳 mode，否則展開後會是空圖 */
  onExpandChart: (chartProps: Omit<NetWorthChartProps, "heightClass">) => void;
};

// 免費方案開放到六個月——先前只給兩週，走勢頁對免費使用者幾乎是空的，
// 那不是誘餌而是把功能拿走。一年／自訂／大盤比較才是 Pro。
const TIMEFRAME_OPTIONS: { key: Timeframe; label: string; pro: boolean }[] = [
  { key: "day", label: "兩週", pro: false },
  { key: "month", label: "六個月", pro: false },
  { key: "year", label: "一年", pro: true },
  { key: "custom", label: "自訂", pro: true },
];

export function TrendsTab(props: TrendsTabProps) {
  const {
    history, chartData, netWorth, timeframe, onTimeframeChange, customRange,
    onCustomRangeChange, historyLoaded, hideBalance, isDarkMode, currentUser,
    onOpenBackfill, onOpenPlans, onExpandChart,
  } = props;

  const isPro = currentUser?.entitlements?.isPro ?? false;
  const canUseExtendedRange = currentUser?.entitlements?.features.extendedTrendRange ?? false;

  const [trendView, setTrendView] = useState<"net" | "breakdown">("net");
  const [activeBenchmarks, setActiveBenchmarks] = useState<string[]>([]);
  const [benchmarkData, setBenchmarkData] = useState<Record<string, { date: string; level: number }[]>>({});
  const [benchmarkLoading, setBenchmarkLoading] = useState(false);
  const [showRangePicker, setShowRangePicker] = useState(false);
  const [rangeDraft, setRangeDraft] = useState({ start: todayInTaipei(), end: todayInTaipei() });
  const [rangeError, setRangeError] = useState<string | null>(null);

  const compareMode = activeBenchmarks.length > 0;
  const today = todayInTaipei();

  const monthlyDeltas = useMemo(() => computeMonthlyDeltas(history), [history]);
  const growthStreak = useMemo(() => computeGrowthStreak(monthlyDeltas), [monthlyDeltas]);
  const periodStats = useMemo(() => computePeriodStats(chartData), [chartData]);
  const inceptionCagr = useMemo(() => computeInceptionCagr(history, netWorth), [history, netWorth]);
  const assetLiabData = useMemo(() => buildAssetLiabilitySeries(chartData, history), [chartData, history]);

  const timeframeLabel =
    timeframe === "day" ? "兩週"
    : timeframe === "month" ? "六個月"
    : timeframe === "year" ? "一年"
    : customRange
      ? `${customRange.start.slice(5).replace("-", "/")} ～ ${customRange.end.slice(5).replace("-", "/")}`
      : "自訂";

  // periodStats 只反映「實際有記錄」的天數；剛開始追蹤時即使切到六個月，涵蓋範圍仍受限於
  // 最早的快照日，不講清楚容易讓人以為切換沒有生效
  const coverageNote = useMemo(() => {
    if (!periodStats || chartData.length === 0) return null;
    if (periodStats.first.date > chartData[0].date) {
      return `目前僅追蹤到 ${periodStats.first.label || periodStats.first.date}，尚未累積滿整個「${timeframeLabel}」區間`;
    }
    return null;
  }, [periodStats, chartData, timeframeLabel]);

  useEffect(() => {
    if (!compareMode || Object.keys(benchmarkData).length > 0 || benchmarkLoading) return;
    setBenchmarkLoading(true);
    void apiGet<Record<string, { date: string; level: number }[]>>("/api/benchmark?days=365", { cache: "no-store" })
      .then(setBenchmarkData)
      .catch(() => setBenchmarkData({}))
      .finally(() => setBenchmarkLoading(false));
  }, [compareMode, benchmarkData, benchmarkLoading]);

  const benchLevelMaps = useMemo(() => {
    const maps: Record<string, Map<string, number>> = {};
    for (const key of Object.keys(benchmarkData)) {
      maps[key] = new Map((benchmarkData[key] || []).map((point) => [point.date, point.level]));
    }
    return maps;
  }, [benchmarkData]);

  const comparisonBaseTooSmall = useMemo(() => {
    if (!compareMode || chartData.length === 0) return false;
    const baseIndex = chartData.findIndex((point) => point.started);
    const base = baseIndex >= 0 ? chartData[baseIndex].netWorth : 0;
    return Math.abs(base) < MIN_COMPARISON_BASE;
  }, [compareMode, chartData]);

  // 成長率比較：指數以視窗第一天為 0% 基準，缺行情的日子（假日）沿用前一天。
  // 淨值可能為負，用 |base| 當分母，語意為「相對起始規模的變化」。
  const comparisonData = useMemo(() => {
    if (!compareMode || chartData.length === 0 || comparisonBaseTooSmall) return [];
    const baseIndex = chartData.findIndex((point) => point.started);
    const baseYou = baseIndex >= 0 ? chartData[baseIndex].netWorth : 0;
    const denominator = Math.abs(baseYou);

    const carry: Record<string, number | null> = {};
    const bases: Record<string, number | null> = {};
    for (const key of activeBenchmarks) {
      carry[key] = null;
      bases[key] = null;
    }

    return chartData.map((point, index) => {
      const row: Record<string, unknown> = { label: point.label, date: point.date };
      row.you = baseIndex < 0 || index < baseIndex ? 0 : ((point.netWorth - baseYou) / denominator) * 100;

      for (const key of activeBenchmarks) {
        const level = benchLevelMaps[key]?.get(point.date);
        if (level != null) carry[key] = level;
        const current = carry[key];
        if (current != null && bases[key] == null) bases[key] = current;
        row[key] = current != null && bases[key] ? (current / bases[key]! - 1) * 100 : null;
      }
      return row;
    });
  }, [compareMode, chartData, activeBenchmarks, benchLevelMaps, comparisonBaseTooSmall]);

  const benchmarkVerdicts = useMemo(() => {
    if (comparisonData.length === 0) return [];
    let you: number | null = null;
    for (let i = comparisonData.length - 1; i >= 0; i--) {
      const value = comparisonData[i].you;
      if (typeof value === "number") {
        you = value;
        break;
      }
    }
    if (you === null) return [];

    return activeBenchmarks.flatMap((key) => {
      for (let i = comparisonData.length - 1; i >= 0; i--) {
        const value = comparisonData[i][key];
        if (typeof value === "number") {
          return [{ key, label: BENCHMARKS[key].label, you: you!, bench: value, win: you! >= value }];
        }
      }
      return [];
    });
  }, [comparisonData, activeBenchmarks]);

  const chartMode: TrendChartMode = compareMode ? "compare" : trendView;

  const chartProps: Omit<NetWorthChartProps, "heightClass"> = {
    mode: chartMode,
    isDarkMode,
    loading: !historyLoaded,
    chartData,
    assetLiabData,
    comparisonData,
    activeBenchmarks,
    comparisonBaseTooSmall,
  };

  function handleTimeframeClick(option: (typeof TIMEFRAME_OPTIONS)[number]) {
    if (option.pro && !canUseExtendedRange) {
      onOpenPlans();
      return;
    }
    if (option.key === "custom") {
      setRangeDraft(customRange ?? { start: today, end: today });
      setRangeError(null);
      setShowRangePicker(true);
      return;
    }
    onTimeframeChange(option.key);
    setShowRangePicker(false);
  }

  function applyCustomRange() {
    if (!rangeDraft.start || !rangeDraft.end) {
      setRangeError("請選擇起訖日期");
      return;
    }
    if (rangeDraft.start > rangeDraft.end) {
      setRangeError("起日不能晚於迄日");
      return;
    }
    // 指數只有到「今天」為止的歷史資料，迄日不能選未來，否則比較線會完全沒有資料可畫
    const end = rangeDraft.end > today ? today : rangeDraft.end;
    onCustomRangeChange({ start: rangeDraft.start, end });
    onTimeframeChange("custom");
    setShowRangePicker(false);
    setRangeError(null);
  }

  return (
    <div className="mx-auto max-w-lg space-y-4 px-5 pb-4 pt-5">
      <div className="flex items-center justify-between pb-2">
        <h1 className="font-display text-[22px] font-bold tracking-tight">歷史走勢</h1>
        <button
          type="button"
          onClick={onOpenBackfill}
          className="py-1 text-xs font-semibold underline-offset-2 hover:underline"
          style={{ color: COLORS.gold }}
        >
          + 手動補登
        </button>
      </div>

      {periodStats && (
        <section className={`${SURFACE_CLASS} rounded-2xl p-4`} aria-label="本期摘要">
          <div className="mb-0.5 flex items-center justify-between">
            <p className={SECTION_LABEL_CLASS}>本期摘要</p>
            <span className={`text-xs ${TEXT_MUTED_CLASS}`}>{timeframeLabel}</span>
          </div>
          <p className={`text-xs ${coverageNote ? "mb-1" : "mb-2"} ${TEXT_MUTED_CLASS}`}>
            區間：{periodStats.first.label || periodStats.first.date} → {periodStats.last.label || periodStats.last.date}
            （共 {periodStats.days} 天）
          </p>
          {coverageNote && <p className="mb-2 text-xs" style={{ color: COLORS.gold }}>{coverageNote}</p>}

          <div className="grid grid-cols-2 gap-3">
            <Stat
              label="本期變化"
              hint="區間末－區間初"
              value={hideBalance ? MASKED_AMOUNT : `${periodStats.delta >= 0 ? "+" : "−"}${formatCompactNumber(Math.abs(periodStats.delta))}`}
              suffix={periodStats.pct !== null ? formatPct(periodStats.pct) : undefined}
              color={deltaColorForTheme(periodStats.delta, isDarkMode)}
            />
            <Stat
              label="日均變化"
              hint="本期變化 ÷ 天數"
              value={hideBalance ? MASKED_AMOUNT : `${periodStats.dailyAvg >= 0 ? "+" : "−"}${formatCompactNumber(Math.round(Math.abs(periodStats.dailyAvg)))}`}
              color={deltaColorForTheme(periodStats.dailyAvg, isDarkMode)}
            />
            <Stat
              label="期間最高"
              value={hideBalance ? MASKED_AMOUNT : formatCompactNumber(periodStats.high.netWorth)}
              footnote={periodStats.high.label || periodStats.high.date}
            />
            <Stat
              label="期間最低"
              value={hideBalance ? MASKED_AMOUNT : formatCompactNumber(periodStats.low.netWorth)}
              footnote={periodStats.low.label || periodStats.low.date}
            />
          </div>
        </section>
      )}

      {/* 大盤比較 */}
      <div className="flex flex-wrap items-center gap-2 px-1">
        <button
          type="button"
          onClick={() => {
            if (!canUseExtendedRange) {
              onOpenPlans();
              return;
            }
            setActiveBenchmarks((current) => (current.length ? [] : ["tw0050", "sp500"]));
          }}
          aria-pressed={compareMode}
          className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-all ${
            compareMode ? "text-white dark:text-black" : `${TEXT_MUTED_CLASS} border-black/10 dark:border-white/10`
          }`}
          style={compareMode ? { background: COLORS.gold, borderColor: COLORS.gold } : undefined}
        >
          {!canUseExtendedRange && <Lock className="mr-1 -mt-0.5 inline h-2.5 w-2.5 opacity-60" aria-hidden />}
          比較大盤
        </button>

        {compareMode &&
          Object.entries(BENCHMARKS).map(([key, config]) => {
            const on = activeBenchmarks.includes(key);
            return (
              <button
                key={key}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  setActiveBenchmarks((current) =>
                    current.includes(key) ? current.filter((item) => item !== key) : [...current, key]
                  )
                }
                className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-semibold transition-all ${
                  on ? "text-white dark:text-black" : `${TEXT_MUTED_CLASS} border-black/10 dark:border-white/10`
                }`}
                style={on ? { background: config.color, borderColor: config.color } : undefined}
              >
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: on ? "currentColor" : config.color }} aria-hidden />
                {config.label}
              </button>
            );
          })}

        {compareMode && (
          <button
            type="button"
            onClick={() => onExpandChart(chartProps)}
            aria-label="展開走勢圖"
            className={`ml-auto flex h-9 w-9 items-center justify-center rounded-full border border-black/10 dark:border-white/10 ${TEXT_MUTED_CLASS}`}
          >
            <Maximize2 className="h-3.5 w-3.5" aria-hidden />
          </button>
        )}
      </div>

      {/* 時間範圍 */}
      <div className="flex gap-1 rounded-full bg-black/[0.05] p-1 dark:bg-white/[0.06]" role="group" aria-label="時間範圍">
        {TIMEFRAME_OPTIONS.map((option) => {
          const locked = option.pro && !canUseExtendedRange;
          const active = timeframe === option.key;
          return (
            <button
              key={option.key}
              type="button"
              onClick={() => handleTimeframeClick(option)}
              aria-pressed={active}
              className={`flex-1 rounded-full py-2 text-xs font-semibold transition-colors ${
                active ? "bg-white shadow-sm dark:bg-[#151923]" : TEXT_MUTED_CLASS
              }`}
              style={active ? { color: COLORS.gold } : undefined}
            >
              {locked && <Lock className="mr-1 -mt-0.5 inline h-2.5 w-2.5 opacity-60" aria-hidden />}
              {option.label}
            </button>
          );
        })}
      </div>

      <section className={`${SURFACE_CLASS} rounded-2xl p-4`} aria-label="淨資產走勢圖">
        {showRangePicker && (
          <div className="mb-3 space-y-3 border-b border-black/[0.06] pb-3 dark:border-white/[0.06]">
            <div className="flex flex-wrap items-center gap-2">
              <label className="sr-only" htmlFor="range-start">起始日期</label>
              <input
                id="range-start" type="date" value={rangeDraft.start} max={rangeDraft.end || today}
                onChange={(event) => setRangeDraft((r) => ({ ...r, start: event.target.value }))}
                className={`${INPUT_CLASS} h-10 min-w-[120px] flex-1 font-ledger`}
              />
              <span className={`text-xs ${TEXT_MUTED_CLASS}`} aria-hidden>～</span>
              <label className="sr-only" htmlFor="range-end">結束日期</label>
              <input
                id="range-end" type="date" value={rangeDraft.end} min={rangeDraft.start || undefined} max={today}
                onChange={(event) => setRangeDraft((r) => ({ ...r, end: event.target.value }))}
                className={`${INPUT_CLASS} h-10 min-w-[120px] flex-1 font-ledger`}
              />
              <button
                type="button" onClick={applyCustomRange}
                className="shrink-0 rounded-lg px-4 py-2.5 text-xs font-semibold text-white dark:text-black"
                style={{ background: COLORS.gold }}
              >
                套用
              </button>
            </div>
            {rangeError && <p className="text-xs font-medium text-[#A24936]">{rangeError}</p>}
            <p className={`text-xs ${TEXT_MUTED_CLASS}`}>迄日最晚只能選到今天，指數才有行情可以比較。</p>
          </div>
        )}

        {compareMode ? (
          <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-black/[0.06] pb-3 dark:border-white/[0.06]">
            <span className="flex items-center gap-1.5 text-xs font-semibold">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: COLORS.gold }} aria-hidden />
              你的淨值
            </span>
            {activeBenchmarks.map((key) => (
              <span key={key} className="flex items-center gap-1.5 text-xs font-semibold">
                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: BENCHMARKS[key].color }} aria-hidden />
                {BENCHMARKS[key].label}
              </span>
            ))}
            <span className={`ml-auto text-xs ${TEXT_MUTED_CLASS}`}>
              {benchmarkLoading ? "抓取行情中…" : "成長率 · 以區間首日為 0%"}
            </span>
          </div>
        ) : (
          <div className="mb-3 flex items-center gap-1.5 border-b border-black/[0.06] pb-3 dark:border-white/[0.06]">
            {(["net", "breakdown"] as const).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setTrendView(key)}
                aria-pressed={trendView === key}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-all ${
                  trendView === key
                    ? "bg-[#1C1F1A] text-white dark:bg-[#B8933C] dark:text-black"
                    : `${TEXT_MUTED_CLASS} border border-black/10 dark:border-white/10`
                }`}
              >
                {key === "net" ? "淨值" : "資產 vs 負債"}
              </button>
            ))}
            {trendView === "breakdown" && (
              <span className={`ml-auto flex items-center gap-3 text-xs ${TEXT_MUTED_CLASS}`}>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-full" style={{ background: COLORS.sage }} aria-hidden />資產
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-full" style={{ background: COLORS.brick }} aria-hidden />負債
                </span>
              </span>
            )}
          </div>
        )}

        <NetWorthChart {...chartProps} heightClass="h-[240px]" />

        {compareMode && benchmarkVerdicts.length > 0 && (
          <ul className="mt-3 space-y-1.5 border-t border-black/[0.06] pt-3 dark:border-white/[0.06]">
            {benchmarkVerdicts.map((verdict) => (
              <li key={verdict.key} className="flex items-center gap-1.5 text-xs font-medium">
                <span className={verdict.win ? "text-[#4F7B5E] dark:text-[#7FAE8F]" : "text-[#A24936]"}>
                  {verdict.win ? "✓" : "✗"}
                </span>
                <span>
                  本區間你 <span className="font-ledger font-bold" style={{ color: COLORS.gold }}>{formatPct(verdict.you)}</span>
                  ，{verdict.label} <span className="font-ledger font-bold">{formatPct(verdict.bench)}</span>
                </span>
                <span className={`ml-auto font-bold ${verdict.win ? "text-[#4F7B5E] dark:text-[#7FAE8F]" : "text-[#A24936]"}`}>
                  {verdict.win ? `跑贏 ${formatPct(verdict.you - verdict.bench).slice(1)}` : `落後 ${formatPct(verdict.bench - verdict.you).slice(1)}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {inceptionCagr && (
        <div className={`${SURFACE_CLASS} rounded-2xl p-4`}>
          <p className={`text-xs ${TEXT_MUTED_CLASS}`}>
            自 {String(inceptionCagr.since).slice(0, 10)} 記錄以來，年化成長率約
            <span className="ml-1 font-ledger font-bold" style={{ color: deltaColorForTheme(inceptionCagr.cagr, isDarkMode) }}>
              {formatPct(inceptionCagr.cagr)}
            </span>
          </p>
        </div>
      )}

      {monthlyDeltas.length >= 2 && (
        <section className={`${SURFACE_CLASS} rounded-2xl p-4`} aria-label="每月增減">
          <div className="mb-3 flex items-center justify-between">
            <p className={CARD_TITLE_CLASS}>每月增減</p>
            {growthStreak >= 2 && (
              <span
                className="rounded-full px-2.5 py-1 text-xs font-bold"
                style={{ background: `${COLORS.brick}1F`, color: deltaColorForTheme(1, isDarkMode) }}
              >
                連續 {growthStreak} 個月正成長
              </span>
            )}
          </div>
          <div className="h-[140px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyDeltas} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <XAxis
                  dataKey="label" axisLine={false} tickLine={false} interval={0} tickMargin={6}
                  tick={{ fill: chartAxisColor(isDarkMode), fontSize: 11, fontFamily: "var(--font-ledger), monospace" }}
                />
                <YAxis
                  axisLine={false} tickLine={false} width={40} tickFormatter={formatCompactNumber}
                  tick={{ fill: chartAxisColor(isDarkMode), fontSize: 11, fontFamily: "var(--font-ledger), monospace" }}
                />
                <ReferenceLine y={0} stroke={chartAxisColor(isDarkMode)} strokeOpacity={0.4} />
                <Tooltip
                  cursor={{ fill: "rgba(138,143,130,0.08)" }}
                  contentStyle={chartTooltipStyle(isDarkMode)}
                  formatter={(value) => [`${Number(value) >= 0 ? "+" : "−"}NT$ ${formatInteger(Math.abs(Number(value)))}`, "當月變化"]}
                />
                {/* 全站紅漲綠跌：成長為紅、衰退為綠，跟個股的今日漲跌一致 */}
                <Bar dataKey="delta" radius={[4, 4, 0, 0]} maxBarSize={26}>
                  {monthlyDeltas.map((month) => (
                    <Cell key={month.key} fill={deltaColorForTheme(month.delta, isDarkMode)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      <ScenarioSimulator netWorth={netWorth} isPro={isPro} onOpenPlans={onOpenPlans} />
    </div>
  );
}

function Stat({
  label, hint, value, suffix, footnote, color,
}: {
  label: string;
  hint?: string;
  value: string;
  suffix?: string;
  footnote?: string;
  color?: string;
}) {
  return (
    <div>
      <p className={`text-xs ${TEXT_MUTED_CLASS}`}>
        {label}
        {hint && <span className="opacity-75">（{hint}）</span>}
      </p>
      <p className="mt-0.5 font-ledger text-sm font-bold" style={color ? { color } : undefined}>
        {value}
        {suffix && <span className="ml-1.5 text-xs">{suffix}</span>}
      </p>
      {footnote && <p className={`text-xs ${TEXT_MUTED_CLASS}`}>{footnote}</p>}
    </div>
  );
}

/**
 * 情境模擬。
 * 三個輸入框的 state 留在這個元件內，先前放在最上層時每敲一個字整個 App（含所有圖表）
 * 都會重新 render。
 */
function ScenarioSimulator({
  netWorth,
  isPro,
  onOpenPlans,
}: {
  netWorth: number;
  isPro: boolean;
  onOpenPlans: () => void;
}) {
  const [monthly, setMonthly] = useState("10000");
  const [years, setYears] = useState("10");
  const [rate, setRate] = useState("5");

  const result = useMemo(
    () => computeWhatIf(netWorth, Number(monthly) || 0, Number(years) || 0, Number(rate) || 0),
    [netWorth, monthly, years, rate]
  );

  return (
    <section className={`${SURFACE_CLASS} relative rounded-2xl p-4`} aria-label="情境模擬">
      {!isPro && (
        <button
          type="button"
          onClick={onOpenPlans}
          aria-label="情境模擬是 Pro 功能，升級解鎖"
          className="absolute inset-0 z-10 cursor-pointer rounded-[inherit]"
        />
      )}
      <div className="mb-1 flex items-center gap-2">
        <p className={CARD_TITLE_CLASS}>情境模擬</p>
        {!isPro && (
          <span
            className="inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] font-bold"
            style={{ color: COLORS.gold, borderColor: COLORS.gold }}
          >
            <Lock className="h-2.5 w-2.5" aria-hidden /> Pro
          </span>
        )}
      </div>
      <p className={`mb-3 text-xs ${TEXT_MUTED_CLASS}`}>如果每月持續加碼，幾年後淨資產大概會到哪</p>

      <div className="mb-3 grid grid-cols-2 gap-3">
        <Field label="每月加碼 (NT$)" value={monthly} onChange={setMonthly} inputMode="decimal" />
        <Field label="模擬年數" value={years} onChange={setYears} inputMode="numeric" />
        <div className="col-span-2">
          <Field label="假設年化成長率 (%)" value={rate} onChange={setRate} inputMode="decimal" />
        </div>
      </div>

      {result && (
        <div className="border-t border-black/[0.06] pt-3 dark:border-white/[0.06]">
          <p className={`text-xs ${TEXT_MUTED_CLASS}`}>{years} 年後預估淨資產</p>
          <p className="mt-0.5 font-ledger text-xl font-bold" style={{ color: COLORS.gold }}>
            NT$ {formatInteger(result.total)}
          </p>
          <p className={`mt-1 text-xs ${TEXT_MUTED_CLASS}`}>
            其中額外投入 NT$ {formatInteger(result.contributed)}，成長貢獻 NT$ {formatInteger(result.total - result.contributed)}
          </p>
        </div>
      )}
    </section>
  );
}

function Field({
  label, value, onChange, inputMode,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  inputMode: "decimal" | "numeric";
}) {
  return (
    <label className="block">
      <span className={`mb-1 block text-xs ${TEXT_MUTED_CLASS}`}>{label}</span>
      <input
        type="number"
        inputMode={inputMode}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`${INPUT_CLASS} h-10 font-ledger text-sm`}
      />
    </label>
  );
}
