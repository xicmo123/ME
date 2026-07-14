// 已繳期數：起算日(=貸款撥款日)當月不算一期，要等下一個「扣款日」真正到了才算繳了第 1 期。
// 例如起算日 2026-07-01、扣款日 1 號，2026-07-12 當下還是 0 期，要到 2026-08-01 才算第 1 期。
export function calcPaidInstallments(loanStartDate: Date, deductionDate: number, today: Date = new Date()): number {
  let months = (today.getFullYear() - loanStartDate.getFullYear()) * 12 + (today.getMonth() - loanStartDate.getMonth());
  if (months <= 0) return 0; // 還在起算月，扣款日還沒真正到過

  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const dueDayThisMonth = Math.min(deductionDate, daysInMonth);
  if (today.getDate() < dueDayThisMonth) months -= 1;
  return Math.max(0, months);
}

// 依「貸款總金額（本金）」「每期還款金額」「年利率（選填）」「已繳期數」推算目前剩餘餘額。
// 有利率時用標準等額還款公式（本金依複利成長、扣掉已繳款項的終值）；沒利率就是單純本金線性遞減。
export function calcLoanBalance(
  principal: number,
  monthlyPayment: number,
  annualRatePercent: number | null | undefined,
  installmentsElapsed: number
): number {
  const n = Math.max(0, installmentsElapsed);
  if (n === 0) return Math.max(0, principal);

  if (annualRatePercent && annualRatePercent > 0) {
    const r = annualRatePercent / 100 / 12;
    const growth = Math.pow(1 + r, n);
    const balance = principal * growth - monthlyPayment * ((growth - 1) / r);
    return Math.max(0, balance);
  }

  return Math.max(0, principal - monthlyPayment * n);
}
