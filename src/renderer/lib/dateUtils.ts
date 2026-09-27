export const THAI_MONTHS = [
  'มกราคม',
  'กุมภาพันธ์',
  'มีนาคม',
  'เมษายน',
  'พฤษภาคม',
  'มิถุนายน',
  'กรกฎาคม',
  'สิงหาคม',
  'กันยายน',
  'ตุลาคม',
  'พฤศจิกายน',
  'ธันวาคม',
];

export const THAI_SHORT_MONTHS = [
  'ม.ค.',
  'ก.พ.',
  'มี.ค.',
  'เม.ย.',
  'พ.ค.',
  'มิ.ย.',
  'ก.ค.',
  'ส.ค.',
  'ก.ย.',
  'ต.ค.',
  'พ.ย.',
  'ธ.ค.',
];

/**
 * Returns the CE (Gregorian / ค.ศ.) year given a tax year that may be in BE (e.g. 2569) or CE (2026).
 */
export function ceYearFromTaxYear(taxYear: number): number {
  return taxYear >= 2400 ? taxYear - 543 : taxYear;
}

/**
 * Returns the BE (พ.ศ.) year given a year that may be in BE (2569) or CE (2026).
 */
export function beYearFromYear(year: number): number {
  return year >= 2400 ? year : year + 543;
}

/**
 * Normalizes an ISO date `YYYY-MM-DD` so that the year is always in CE (Gregorian / ค.ศ., e.g. 2026).
 * If the input already has year in BE (>= 2400, e.g. 2569), converts it back to CE (2026).
 */
export function normalizeDateToCe(dateStr: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  const [yearStr, month, day] = dateStr.split('-');
  const y = Number(yearStr);
  if (y >= 2400) {
    return `${String(y - 543).padStart(4, '0')}-${month}-${day}`;
  }
  return dateStr;
}

/**
 * Normalizes a `YYYY-MM` month key so that the year is always in CE (Gregorian / ค.ศ., e.g. 2026).
 */
export function normalizeYearMonthToCe(yearMonth: string): string {
  if (!/^\d{4}-\d{2}$/.test(yearMonth)) return yearMonth;
  const [yearStr, month] = yearMonth.split('-');
  const y = Number(yearStr);
  if (y >= 2400) {
    return `${String(y - 543).padStart(4, '0')}-${month}`;
  }
  return yearMonth;
}

/**
 * Formats a `YYYY-MM` month key to Thai display string, e.g. "กันยายน 2569".
 * Guarantees that BE years are never double-converted (avoids year 3112).
 */
export function formatThaiMonthYear(monthKey: string): string {
  const [yearStr, monthStr] = monthKey.split('-');
  const y = Number(yearStr);
  const m = Number(monthStr);
  if (Number.isNaN(y) || Number.isNaN(m) || m < 1 || m > 12) return monthKey;
  const beYear = y >= 2400 ? y : y + 543;
  return `${THAI_MONTHS[m - 1]} ${beYear}`;
}

/**
 * Formats a `YYYY-MM-DD` date to short Thai display string, e.g. "15 ก.ย. 69".
 * Guarantees that BE years are never double-converted (avoids year 3112).
 */
export function formatShortDate(dateIso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) return dateIso;
  const [yearStr, monthStr, dayStr] = dateIso.split('-');
  const y = Number(yearStr);
  const m = Number(monthStr);
  const d = Number(dayStr);
  if (Number.isNaN(y) || Number.isNaN(m) || m < 1 || m > 12) return dateIso;
  const beYear = y >= 2400 ? y : y + 543;
  const buddhistYearShort = beYear % 100;
  return `${d} ${THAI_SHORT_MONTHS[m - 1]} ${buddhistYearShort}`;
}
