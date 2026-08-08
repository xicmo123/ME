// 貸款餘額／期數的唯一計算來源。
//
// 兩件事必須跟台灣銀行的實際帳單一致：
// 1. 日界一律是台北時間（跟 lib/date.ts 同一套規則）。伺服器跑在 UTC，若用 new Date().getMonth()
//    這種本地時間取「今天」，台北 00:00~08:00 之間會早一天，期數與扣款判斷都會差一期。
// 2. 利息是「餘額 × 年利率 × 該期天數 / 365」並四捨五入到整數（實際天數計息），
//    不是「年利率 ÷ 12」的封閉公式。兩者在 84 期的信貸上會差到上百元，
//    例：台新(一) 本金 100 萬、2.99%、月付 13,209、2025-11-28 起算，繳完第 8 期
//    銀行帳單是 913,405，÷12 公式會算成 913,510。

const APP_TIME_ZONE = "Asia/Taipei";

/** 曆日（年／月 1-12／日），刻意不用 Date 保存，避免又被時區位移一次 */
type CivilDate = { year: number; month: number; day: number };

const taipeiParts = new Intl.DateTimeFormat("en-CA", {
  timeZone: APP_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** 某個時間點在台北時區是哪一天 */
export function taipeiCivilDate(instant: Date = new Date()): CivilDate {
  const [year, month, day] = taipeiParts.format(instant).split("-").map(Number);
  return { year, month, day };
}

/**
 * 讀出 loanStartDate 代表的曆日。
 * 表單送的是 "YYYY-MM-DD"，new Date() 會解析成 UTC 午夜再存進 DB，
 * 所以要用 UTC 取值才拿得回使用者原本選的那一天。
 */
export function loanStartCivilDate(loanStartDate: Date): CivilDate {
  return {
    year: loanStartDate.getUTCFullYear(),
    month: loanStartDate.getUTCMonth() + 1,
    day: loanStartDate.getUTCDate(),
  };
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** 轉成「第幾天」的整數，只拿來算兩個曆日相差幾天 */
function epochDay({ year, month, day }: CivilDate): number {
  return Date.UTC(year, month - 1, day) / 86_400_000;
}

/** 第 i 期（i 從 1 起算）的扣款日：起算月往後推 i 個月，日期是扣款日（超過當月天數就取月底） */
function installmentDueDate(start: CivilDate, deductionDate: number, i: number): CivilDate {
  const monthIndex = start.month - 1 + i;
  const year = start.year + Math.floor(monthIndex / 12);
  const month = (monthIndex % 12) + 1;
  return { year, month, day: Math.min(deductionDate, daysInMonth(year, month)) };
}

// 已繳期數：起算日(=貸款撥款日)當月不算一期，要等下一個「扣款日」真正到了才算繳了第 1 期。
// 例如起算日 2026-07-01、扣款日 1 號，2026-07-12 當下還是 0 期，要到 2026-08-01 才算第 1 期。
export function calcPaidInstallments(loanStartDate: Date, deductionDate: number, today: Date = new Date()): number {
  const start = loanStartCivilDate(loanStartDate);
  const now = taipeiCivilDate(today);

  let months = (now.year - start.year) * 12 + (now.month - start.month);
  if (months <= 0) return 0; // 還在起算月，扣款日還沒真正到過

  const dueDayThisMonth = Math.min(deductionDate, daysInMonth(now.year, now.month));
  if (now.day < dueDayThisMonth) months -= 1;
  return Math.max(0, months);
}

export type LoanSchedule = {
  loanStartDate: Date;
  deductionDate: number;
  /** 總期數（選填）：最後一期會把尾差一次結清，餘額才不會永遠卡著幾百塊 */
  termMonths?: number | null;
};

// 依「貸款總金額（本金）」「每期還款金額」「年利率（選填）」「已繳期數」推算目前剩餘餘額。
// 有利率又有還款排程（起算日＋扣款日）時，逐期用實際天數計息並四捨五入，跟銀行帳單對得起來；
// 沒排程時退回「年利率 ÷ 12」的封閉公式（舊行為）；沒利率就是單純本金線性遞減。
export function calcLoanBalance(
  principal: number,
  monthlyPayment: number,
  annualRatePercent: number | null | undefined,
  installmentsElapsed: number,
  schedule?: LoanSchedule | null
): number {
  const n = Math.max(0, installmentsElapsed);
  if (n === 0) return Math.max(0, principal);

  if (!annualRatePercent || annualRatePercent <= 0) {
    return Math.max(0, principal - monthlyPayment * n);
  }

  if (schedule) {
    const dailyRate = annualRatePercent / 100 / 365;
    const start = loanStartCivilDate(schedule.loanStartDate);
    let balance = principal;
    let previousDay = epochDay(start);

    for (let i = 1; i <= n; i += 1) {
      const due = installmentDueDate(start, schedule.deductionDate, i);
      const dueDay = epochDay(due);
      const interest = Math.round(balance * dailyRate * (dueDay - previousDay));
      const principalPortion = monthlyPayment - interest;
      // 最後一期本金通常不足一個月付款額（或剛好是排程的最後一期），結清即可，不要讓餘額變成負數／卡住尾差
      if (principalPortion >= balance || (schedule.termMonths != null && i >= schedule.termMonths)) return 0;
      balance -= principalPortion;
      previousDay = dueDay;
    }

    return Math.max(0, balance);
  }

  const r = annualRatePercent / 100 / 12;
  const growth = Math.pow(1 + r, n);
  return Math.max(0, principal * growth - monthlyPayment * ((growth - 1) / r));
}

/** resolveAccountValue 需要用到的欄位（Account 的子集，方便讓不同來源的物件都能傳進來） */
export type LoanBalanceInput = {
  type: string;
  quantity: number | null;
  currentValue: number;
  monthlyDeductionAmount: number | null;
  deductionDate: number | null;
  interestRate: number | null;
  loanTermMonths: number | null;
  loanStartDate: Date | null;
};

/**
 * 帳戶「現在應該顯示多少錢」的唯一來源。
 *
 * 負債只要填齊起算日＋扣款日＋月付金，餘額就是本金＋已繳期數即時算出來的，資料庫的 currentValue
 * 只有每月扣款那天才會被寫新，不能直接拿來當答案——否則卡片（會算）跟每日快照／走勢圖（讀欄位）
 * 會顯示兩個不同的數字。其餘帳戶沿用資料庫的 currentValue。
 */
export function resolveAccountValue(account: LoanBalanceInput): number {
  const { type, monthlyDeductionAmount, deductionDate, loanStartDate } = account;
  if (type !== "LIABILITY" || !loanStartDate || deductionDate == null || monthlyDeductionAmount == null) {
    return Number(account.currentValue ?? 0);
  }

  const n = calcPaidInstallments(loanStartDate, deductionDate);
  const cappedN = account.loanTermMonths != null ? Math.min(n, account.loanTermMonths) : n;
  return calcLoanBalance(account.quantity ?? 0, monthlyDeductionAmount, account.interestRate, cappedN, {
    loanStartDate,
    deductionDate,
    termMonths: account.loanTermMonths,
  });
}
