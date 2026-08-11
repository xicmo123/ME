"use client";

import { useMemo } from "react";
import {
  Area, AreaChart, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { BENCHMARKS } from "@/lib/constants";
import { formatCompactNumber, formatInteger, formatPct } from "@/lib/format";
import { chartAxisColor, chartTooltipStyle, COLORS, TEXT_MUTED_CLASS } from "@/lib/theme";
import type { ChartPoint } from "@/lib/derive";

export type TrendChartMode = "net" | "breakdown" | "compare";

export type NetWorthChartProps = {
  mode: TrendChartMode;
  heightClass: string;
  isDarkMode: boolean;
  loading: boolean;
  chartData: ChartPoint[];
  assetLiabData: { date: string; label: string; assets: number; liabilities: number }[];
  comparisonData: Record<string, unknown>[];
  activeBenchmarks: string[];
  comparisonBaseTooSmall: boolean;
};

export function NetWorthChart({
  mode, heightClass, isDarkMode, loading, chartData, assetLiabData,
  comparisonData, activeBenchmarks, comparisonBaseTooSmall,
}: NetWorthChartProps) {
  const axisColor = chartAxisColor(isDarkMode);
  const tooltipStyle = chartTooltipStyle(isDarkMode);

  // X 軸用 date（保證唯一）當 dataKey，避免大量重複的空字串 label 讓 recharts 的
  // hover 索引對不準；稀疏標籤改由 tickFormatter 查表顯示
  const labelByDate = useMemo(
    () => new Map(chartData.map((point) => [point.date, point.label])),
    [chartData]
  );
  const tickFormatter = (value: string) => labelByDate.get(value) ?? "";

  const axisTick = { fill: axisColor, fontSize: 11, fontFamily: "var(--font-ledger), monospace" };

  if (loading) {
    return <div className={`${heightClass} w-full animate-pulse rounded-xl bg-black/[0.04] dark:bg-white/[0.04]`} />;
  }

  if (mode === "compare" && comparisonBaseTooSmall) {
    return (
      <div className={`${heightClass} flex items-center justify-center`}>
        <p className={`text-sm ${TEXT_MUTED_CLASS}`}>起始淨值過低，無法以百分比比較走勢</p>
      </div>
    );
  }

  if (chartData.length === 0) {
    return (
      <div className={`${heightClass} flex items-center justify-center`}>
        <p className={`text-sm ${TEXT_MUTED_CLASS}`}>尚無歷史資料</p>
      </div>
    );
  }

  if (mode === "compare") {
    return (
      <div className={heightClass}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={comparisonData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
            <XAxis dataKey="date" axisLine={false} tickLine={false} tick={axisTick} tickMargin={10} interval={0} tickFormatter={tickFormatter} />
            <YAxis axisLine={false} tickLine={false} tick={axisTick} tickFormatter={(v) => `${Math.round(v)}%`} width={44} />
            <ReferenceLine y={0} stroke={axisColor} strokeDasharray="3 3" strokeOpacity={0.5} />
            <Tooltip
              contentStyle={tooltipStyle}
              labelFormatter={(label) => labelByDate.get(String(label)) || String(label)}
              formatter={(value, name) => [
                formatPct(Number(value)),
                name === "you" ? "你的淨值" : (BENCHMARKS[String(name)]?.label ?? String(name)),
              ]}
            />
            <Line type="monotone" dataKey="you" stroke={COLORS.gold} strokeWidth={2.5} dot={false} />
            {activeBenchmarks.map((key) => (
              <Line key={key} type="monotone" dataKey={key} stroke={BENCHMARKS[key].color} strokeWidth={2} dot={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (mode === "breakdown") {
    return (
      <div className={heightClass}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={assetLiabData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="assetsGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={COLORS.sage} stopOpacity={0.25} />
                <stop offset="95%" stopColor={COLORS.sage} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="liabGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={COLORS.brick} stopOpacity={0.25} />
                <stop offset="95%" stopColor={COLORS.brick} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="date" axisLine={false} tickLine={false} tick={axisTick} tickMargin={10} interval={0} tickFormatter={tickFormatter} />
            <YAxis axisLine={false} tickLine={false} tick={axisTick} tickFormatter={formatCompactNumber} width={44} />
            <Tooltip
              contentStyle={tooltipStyle}
              labelFormatter={(label) => labelByDate.get(String(label)) || String(label)}
              formatter={(value, name) => [`NT$ ${formatInteger(Number(value))}`, name === "assets" ? "總資產" : "總負債"]}
            />
            <Area type="monotone" dataKey="assets" stroke={COLORS.sage} strokeWidth={2} fillOpacity={1} fill="url(#assetsGrad)" />
            <Area type="monotone" dataKey="liabilities" stroke={COLORS.brick} strokeWidth={2} fillOpacity={1} fill="url(#liabGrad)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    );
  }

  return (
    <div className={heightClass}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={COLORS.gold} stopOpacity={0.3} />
              <stop offset="95%" stopColor={COLORS.gold} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="date" axisLine={false} tickLine={false} tick={axisTick} tickMargin={10} interval={0} tickFormatter={tickFormatter} />
          <YAxis axisLine={false} tickLine={false} tick={axisTick} tickFormatter={formatCompactNumber} width={44} />
          <Tooltip
            contentStyle={tooltipStyle}
            labelFormatter={(label) => labelByDate.get(String(label)) || String(label)}
            formatter={(value) => [`NT$ ${formatInteger(Number(value))}`, "淨資產"]}
          />
          <Area type="monotone" dataKey="netWorth" stroke={COLORS.gold} strokeWidth={2} fillOpacity={1} fill="url(#chartGrad)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
