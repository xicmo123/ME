"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { EVENT_TYPE_META } from "@/lib/constants";
import { buildCalendarWeeks } from "@/lib/derive";
import { todayInTaipei, toTaipeiDateString } from "@/lib/date";
import { CARD_TITLE_CLASS, COLORS, ICON_BTN_CLASS, SURFACE_CLASS, TEXT_MUTED_CLASS } from "@/lib/theme";
import { Skeleton } from "@/components/ui/skeleton";
import type { CalendarEventRecord, StockEvent } from "@/lib/types";

const WEEKDAY_LABELS = ["日", "一", "二", "三", "四", "五", "六"];
const WEEKDAY_FULL = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];

export type CalendarTabProps = {
  stockEvents: StockEvent[];
  calendarEvents: CalendarEventRecord[];
  loading: boolean;
  hasHoldings: boolean;
  onCreateEvent: () => void;
  onOpenStockEvent: (event: StockEvent) => void;
  onOpenCustomEvent: (event: CalendarEventRecord) => void;
};

export function CalendarTab({
  stockEvents, calendarEvents, loading, hasHoldings,
  onCreateEvent, onOpenStockEvent, onOpenCustomEvent,
}: CalendarTabProps) {
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const today = todayInTaipei();

  // 公司名稱一律用 /api/stock-events 回傳的（台股是證交所中文簡稱），不能用帳戶名稱代替——
  // 那是使用者自己填的欄位（常常填券商名稱），會變成「NVDA 凱基證券」這種錯誤顯示
  const allEvents = useMemo(() => {
    const stock = stockEvents.map((event) => ({ ...event, id: undefined }));
    const custom: StockEvent[] = calendarEvents.map((event) => ({
      symbol: "", name: event.title, date: event.eventAt, type: "CUSTOM" as const, id: event.id,
    }));
    return [...stock, ...custom].sort((a, b) => a.date.localeCompare(b.date));
  }, [stockEvents, calendarEvents]);

  const eventsByDate = useMemo(() => {
    const map: Record<string, StockEvent[]> = {};
    for (const event of allEvents) {
      const key = toTaipeiDateString(event.date) || event.date.slice(0, 10);
      (map[key] ??= []).push(event);
    }
    return map;
  }, [allEvents]);

  const weeks = useMemo(() => buildCalendarWeeks(month), [month]);
  const listedEvents = selectedDate
    ? allEvents.filter((event) => (toTaipeiDateString(event.date) || event.date.slice(0, 10)) === selectedDate)
    : allEvents;

  const isEmpty = !hasHoldings && calendarEvents.length === 0;

  return (
    <div className="mx-auto max-w-lg space-y-4 px-5 pb-4 pt-5">
      <div className="flex items-center justify-between pb-2">
        <h1 className="font-display text-[22px] font-bold tracking-tight">行事曆</h1>
        <button
          type="button"
          onClick={onCreateEvent}
          aria-label="新增行事曆事件"
          className={`${ICON_BTN_CLASS} ${TEXT_MUTED_CLASS} hover:text-[#B8933C]`}
        >
          <Plus className="h-[18px] w-[18px]" aria-hidden />
        </button>
      </div>

      {isEmpty ? (
        <div className={`${SURFACE_CLASS} rounded-2xl p-8 text-center`}>
          <div className="mb-3 text-3xl" aria-hidden>📅</div>
          <p className="mb-1.5 text-sm font-semibold">還沒有行事曆事件</p>
          <p className={`text-xs leading-relaxed ${TEXT_MUTED_CLASS}`}>
            新增台股／美股後，財報、除息、配息日期會自動出現在這裡；也可以按右上角「＋」自己新增提醒
          </p>
        </div>
      ) : (
        <>
          <section className={`${SURFACE_CLASS} rounded-2xl p-4`} aria-label="月曆">
            <div className="mb-3 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
                aria-label="上個月"
                className={`rounded-lg p-2.5 ${TEXT_MUTED_CLASS} hover:text-[#B8933C] transition-colors`}
              >
                <ChevronLeft className="h-4 w-4" aria-hidden />
              </button>
              <span className={`font-display ${CARD_TITLE_CLASS}`} aria-live="polite">
                {month.getFullYear()} 年 {month.getMonth() + 1} 月
              </span>
              <button
                type="button"
                onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
                aria-label="下個月"
                className={`rounded-lg p-2.5 ${TEXT_MUTED_CLASS} hover:text-[#B8933C] transition-colors`}
              >
                <ChevronRight className="h-4 w-4" aria-hidden />
              </button>
            </div>

            <div className="mb-1 grid grid-cols-7 gap-1" aria-hidden>
              {WEEKDAY_LABELS.map((label) => (
                <div key={label} className={`text-center text-xs font-semibold ${TEXT_MUTED_CLASS}`}>
                  {label}
                </div>
              ))}
            </div>

            <div className="space-y-1">
              {weeks.map((week, weekIndex) => (
                <div key={weekIndex} className="grid grid-cols-7 gap-1">
                  {week.map((day, dayIndex) => {
                    if (!day) return <div key={dayIndex} />;

                    const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
                    const dayEvents = eventsByDate[key] ?? [];
                    // 「今天」用台北日期比對；先前用 toISOString() 取 UTC 日期，
                    // 台北凌晨 0~8 點會把金框標在昨天那一格
                    const isToday = key === today;
                    const isSelected = selectedDate === key;
                    const dominantColor = dayEvents.length > 0 ? EVENT_TYPE_META[dayEvents[0].type].color : null;
                    const uniqueTypes = [...new Set(dayEvents.map((event) => event.type))].slice(0, 3);

                    return (
                      <button
                        key={dayIndex}
                        type="button"
                        disabled={dayEvents.length === 0}
                        onClick={() => setSelectedDate(isSelected ? null : key)}
                        aria-pressed={isSelected}
                        aria-label={`${day.getMonth() + 1} 月 ${day.getDate()} 日 ${WEEKDAY_FULL[day.getDay()]}${
                          dayEvents.length ? `，${dayEvents.length} 個事件` : "，無事件"
                        }${isToday ? "，今天" : ""}`}
                        className={`flex aspect-square flex-col items-center justify-center gap-0.5 rounded-lg text-xs transition-colors disabled:cursor-default ${
                          isToday ? "border-2" : ""
                        }`}
                        style={{
                          borderColor: isToday ? COLORS.gold : undefined,
                          background: isSelected
                            ? `${dominantColor ?? COLORS.gold}33`
                            : dominantColor
                              ? `${dominantColor}14`
                              : undefined,
                        }}
                      >
                        <span
                          className={dominantColor ? "font-semibold" : TEXT_MUTED_CLASS}
                          style={dominantColor ? { color: dominantColor } : undefined}
                        >
                          {day.getDate()}
                        </span>
                        {uniqueTypes.length > 0 && (
                          <span className="flex gap-0.5" aria-hidden>
                            {uniqueTypes.map((type) => (
                              <span
                                key={type}
                                className="h-1.5 w-1.5 rounded-full"
                                style={{ background: EVENT_TYPE_META[type].color }}
                              />
                            ))}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </section>

          <div className="flex flex-wrap items-center gap-2 px-1">
            {Object.values(EVENT_TYPE_META).map((meta) => (
              <span
                key={meta.label}
                className="flex items-center gap-1.5 rounded-full px-2.5 py-1"
                style={{ background: `${meta.color}1F`, color: meta.color }}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: meta.color }} aria-hidden />
                <span className="text-xs font-semibold">{meta.label}</span>
              </span>
            ))}
          </div>

          {selectedDate && (
            <div className="flex items-center justify-between px-1">
              <span className={`text-xs ${TEXT_MUTED_CLASS}`}>只顯示 {selectedDate} 的事件</span>
              <button
                type="button"
                onClick={() => setSelectedDate(null)}
                className="py-1 text-xs font-semibold underline-offset-2 hover:underline"
                style={{ color: COLORS.gold }}
              >
                顯示全部
              </button>
            </div>
          )}

          <ul className="space-y-2">
            {loading
              ? Array.from({ length: 3 }).map((_, index) => (
                  <li key={index} className={`${SURFACE_CLASS} flex items-center gap-3 rounded-xl p-4`}>
                    <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
                    <div className="min-w-0 flex-1 space-y-2">
                      <Skeleton className="h-3.5 w-2/3" />
                      <Skeleton className="h-3 w-1/3" />
                    </div>
                  </li>
                ))
              : listedEvents.map((event, index) => {
                  const meta = EVENT_TYPE_META[event.type];
                  return (
                    <li key={`${event.type}-${event.symbol}-${event.date}-${index}`}>
                      <button
                        type="button"
                        onClick={() =>
                          event.type === "CUSTOM"
                            ? onOpenCustomEvent({ id: event.id!, title: event.name, eventAt: event.date })
                            : onOpenStockEvent(event)
                        }
                        className={`flex w-full items-center gap-3 border-l-[3px] text-left ${SURFACE_CLASS} rounded-xl p-4`}
                        style={{ borderLeftColor: meta.color }}
                      >
                        <span
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                          style={{ background: `${meta.color}1F` }}
                          aria-hidden
                        >
                          <span className="h-2.5 w-2.5 rounded-full" style={{ background: meta.color }} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">
                            {event.type === "CUSTOM" ? event.name : `${event.symbol} · ${event.name}`}
                          </span>
                          <span className="block text-xs font-semibold" style={{ color: meta.color }}>
                            {meta.label}{" "}
                            <span className={TEXT_MUTED_CLASS}>
                              · {new Date(event.date).toLocaleDateString("zh-TW", { month: "long", day: "numeric" })}
                            </span>
                          </span>
                        </span>
                        <ChevronRight className={`h-4 w-4 shrink-0 ${TEXT_MUTED_CLASS}`} aria-hidden />
                      </button>
                    </li>
                  );
                })}
            {!loading && listedEvents.length === 0 && (
              <li className={`py-4 text-center text-sm ${TEXT_MUTED_CLASS}`}>這天沒有事件</li>
            )}
          </ul>
        </>
      )}
    </div>
  );
}
