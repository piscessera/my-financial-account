import { Fragment } from 'react';

import { formatSatangAsBaht } from '../../main/calc/money';
import type { DeductionCategoryRow, IncomeSection, TransactionRow } from '../../main/db/schema';

interface LedgerTableProps {
  /** Tax-relevant transactions for one year, any order — this component sorts/groups them. */
  readonly transactions: readonly TransactionRow[];
  readonly deductionCategories?: readonly DeductionCategoryRow[];
  readonly onEdit: (row: TransactionRow) => void;
  readonly onVoid: (row: TransactionRow) => void;
  readonly onShowHistory: (row: TransactionRow) => void;
}

const INCOME_SECTION_TAGS: Record<IncomeSection, string> = {
  '40_1': '40(1)',
  '40_2': '40(2)',
  '40_5_8': '40(5)-(8)',
};

const THAI_MONTHS = [
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

const THAI_SHORT_MONTHS = [
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

function monthKeyOf(dateIso: string): string {
  return dateIso.slice(0, 7); // "YYYY-MM"
}

function formatThaiMonthYear(monthKey: string): string {
  const [year, month] = monthKey.split('-').map(Number);
  return `${THAI_MONTHS[month - 1]} ${year + 543}`;
}

function formatShortDate(dateIso: string): string {
  const [year, month, day] = dateIso.split('-');
  const buddhistYearShort = (Number(year) + 543) % 100;
  return `${day} ${THAI_SHORT_MONTHS[Number(month) - 1]} ${buddhistYearShort}`;
}

/**
 * Tax-relevant ledger, month-grouped with a subtotal header row per month and an annual
 * totals strip above (TC-0001 #48, matching PROTO-0001 `entry.html`'s `.month-ledger`).
 */
export default function LedgerTable({
  transactions,
  deductionCategories = [],
  onEdit,
  onVoid,
  onShowHistory,
}: LedgerTableProps): JSX.Element {
  const activeOnly = transactions.filter((t) => t.status === 'active');
  const totalIncome = activeOnly
    .filter((t) => t.kind === 'income')
    .reduce((sum, t) => sum + t.amountMinor, 0);
  const totalWht = activeOnly.reduce((sum, t) => sum + t.whtMinor, 0);
  const totalNetIncome = totalIncome - totalWht;

  const byMonth = new Map<string, TransactionRow[]>();
  for (const row of transactions) {
    const key = monthKeyOf(row.date);
    const bucket = byMonth.get(key);
    if (bucket) bucket.push(row);
    else byMonth.set(key, [row]);
  }
  const months = [...byMonth.keys()].sort().reverse();

  if (transactions.length === 0) {
    return (
      <div className="empty-state">
        <div className="icon">🧾</div>
        <p>ยังไม่มีรายการภาษีในปีนี้</p>
      </div>
    );
  }

  return (
    <>
      <div className="tiles" style={{ gridTemplateColumns: 'repeat(4,1fr)', marginBottom: 18 }}>
        <div className="tile">
          <div className="k">รวมทั้งปี — รายรับ</div>
          <div className="v num">{formatSatangAsBaht(totalIncome)}</div>
        </div>
        <div className="tile">
          <div className="k">รวมทั้งปี — WHT</div>
          <div className="v num">{formatSatangAsBaht(totalWht)}</div>
        </div>
        <div className="tile">
          <div className="k">รวมทั้งปี — ยอดรับสุทธิ</div>
          <div className="v num">{formatSatangAsBaht(totalNetIncome)}</div>
        </div>
        <div className="tile">
          <div className="k">จำนวนรายการ</div>
          <div className="v num">{transactions.length}</div>
        </div>
      </div>

      <table className="month-ledger">
        <thead>
          <tr>
            <th>วันที่</th>
            <th>ประเภท</th>
            <th>แหล่งที่มา</th>
            <th>หมายเหตุ</th>
            <th className="num">จำนวนเงิน</th>
            <th className="num">WHT</th>
            <th className="num">ยอดสุทธิ</th>
            <th className="center">สถานะ</th>
            <th>การจัดการ</th>
          </tr>
        </thead>
        <tbody>
          {months.map((monthKey) => {
            const rows = byMonth.get(monthKey) ?? [];
            const monthTotal = rows
              .filter((r) => r.status === 'active')
              .reduce((sum, r) => sum + r.amountMinor, 0);
            return (
              <Fragment key={monthKey}>
                <tr className="month-row">
                  <td colSpan={9}>
                    <div className="month-row-inner">
                      <span>{formatThaiMonthYear(monthKey)}</span>
                      <span className="num">
                        {rows.length} รายการ · รวม {formatSatangAsBaht(monthTotal)}
                      </span>
                    </div>
                  </td>
                </tr>
                {rows.map((row) => {
                  const deductionCat = row.deductionCategoryId
                    ? deductionCategories.find((c) => c.id === row.deductionCategoryId)
                    : null;
                  return (
                    <tr key={row.id}>
                      <td>{formatShortDate(row.date)}</td>
                      <td>
                        {row.reversalOfId !== null ? (
                          <span className="pill reversal">reversal</span>
                        ) : (
                          <>
                            {row.incomeSection && (
                              <span className="tag">{INCOME_SECTION_TAGS[row.incomeSection]}</span>
                            )}
                            {row.kind === 'expense' && (
                              <span className="tag" style={{ background: 'var(--amber-soft)', color: 'var(--amber)' }}>
                                รายจ่าย
                              </span>
                            )}
                            {deductionCat && (
                              <span
                                className="tag"
                                style={{
                                  background: 'var(--accent-soft)',
                                  color: 'var(--accent)',
                                  marginLeft: 4,
                                }}
                              >
                                🏷️ {deductionCat.name}
                              </span>
                            )}
                          </>
                        )}
                      </td>
                      <td>{row.sourcePayer ?? '—'}</td>
                      <td>{row.note ?? '—'}</td>
                    <td className="num">{formatSatangAsBaht(row.amountMinor)}</td>
                    <td className="num">{formatSatangAsBaht(row.whtMinor)}</td>
                    <td className="num">
                      {formatSatangAsBaht(
                        row.kind === 'income' ? row.amountMinor - row.whtMinor : row.amountMinor,
                      )}
                    </td>
                    <td className="center">
                      <span className={`pill ${row.status}`}>{row.status}</span>
                    </td>
                    <td>
                      {row.status === 'active' ? (
                        <>
                          <button type="button" className="row-action" onClick={() => onEdit(row)}>
                            แก้ไข
                          </button>
                          <button
                            type="button"
                            className="row-action"
                            onClick={() => onShowHistory(row)}
                          >
                            ประวัติ
                          </button>
                          <button
                            type="button"
                            className="row-action muted"
                            onClick={() => onVoid(row)}
                          >
                            Void
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="row-action muted"
                          onClick={() => onShowHistory(row)}
                        >
                          ปรับเป็นศูนย์แล้ว — ดูประวัติ
                        </button>
                      )}
                    </td>
                    </tr>
                  );
                })}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </>
  );
}
