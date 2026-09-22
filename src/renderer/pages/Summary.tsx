import { useCallback, useEffect, useState } from 'react';

import type { ComputeYearResult } from '../../main/calc/computeYear';
import { formatSatangAsBaht } from '../../main/calc/money';
import type { TaxBracketRow, TransactionRow } from '../../main/db/schema';
import { useWorkingTaxYear } from '../lib/useWorkingTaxYear';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('th-TH', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatBracketRange(lowerBoundMinor: number, upperBoundMinor: number | null): string {
  const lower = formatSatangAsBaht(lowerBoundMinor);
  if (upperBoundMinor === null) return `${lower} ขึ้นไป`;
  return `${lower} – ${formatSatangAsBaht(upperBoundMinor)}`;
}

/**
 * Year Summary/Close screen (AT-4.7) — PROTO-0001 `summary.html`. An open year shows a live
 * breakdown + the close confirmation (TC-0001 #15, #21, #28); a closed year shows the frozen
 * snapshot in a locked view with a reopen action (TC-0001 #20, corroborating AT-4.3's unit
 * test at the UI layer).
 */
export default function Summary(): JSX.Element {
  const yearState = useWorkingTaxYear();
  const [result, setResult] = useState<ComputeYearResult | null>(null);
  const [brackets, setBrackets] = useState<TaxBracketRow[]>([]);
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [confirmingClose, setConfirmingClose] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'error'; message: string } | null>(null);

  const reload = useCallback(async (yearId: number) => {
    const [computed, rows, bracketRows] = await Promise.all([
      window.api.calc.computeYear(yearId),
      window.api.transactions.listByYear(yearId),
      window.api.settings.getBrackets(),
    ]);
    setResult(computed);
    setTransactions(rows);
    setBrackets(bracketRows);
  }, []);

  useEffect(() => {
    if (yearState.status === 'ready') void reload(yearState.year.id);
  }, [yearState, reload]);

  async function handleConfirmClose(yearId: number): Promise<void> {
    setBusy(true);
    setFeedback(null);
    try {
      await window.api.taxYears.close(yearId);
      setConfirmingClose(false);
      await reload(yearId);
    } catch (err) {
      setFeedback({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  async function handleReopen(yearId: number): Promise<void> {
    setBusy(true);
    setFeedback(null);
    try {
      await window.api.taxYears.reopen(yearId);
      await reload(yearId);
    } catch (err) {
      setFeedback({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  if (yearState.status === 'loading') return <div className="page">กำลังโหลด...</div>;
  if (yearState.status === 'error')
    return (
      <div className="page" role="alert">
        {yearState.message}
      </div>
    );
  if (!result) return <div className="page">กำลังโหลด...</div>;

  const year = yearState.year;
  const isClosed = year.status === 'closed';
  const reversalRow = transactions.find((t) => t.reversalOfId !== null);
  const originalOfReversal = reversalRow
    ? transactions.find((t) => t.id === reversalRow.reversalOfId)
    : undefined;

  return (
    <div className="page">
      <div className="page-head">
        <h1>
          สรุปภาษีท้ายปี — ปีภาษี {year.year} ({isClosed ? 'ปิดแล้ว' : 'เปิดอยู่'})
        </h1>
        <p>
          {isClosed
            ? 'แสดงค่าที่ "แช่แข็ง" ไว้ตอนปิดปี ไม่ใช่การคำนวณสด'
            : 'คำนวณสดจากรายการที่บันทึกไว้ทั้งหมด — กด "ปิดปีภาษี" เมื่อยื่นแบบจริงแล้วเพื่อล็อกตัวเลขนี้ไว้ (AC-7b)'}
        </p>
      </div>

      {feedback && (
        <p role="alert" className="muted">
          {feedback.message}
        </p>
      )}

      {isClosed && (
        <div className="locked-banner">
          🔒 ปีภาษีนี้ปิดแล้วเมื่อ {year.closedAt ? formatDate(year.closedAt) : '—'} —
          ตัวเลขด้านล่างคือค่าที่บันทึกไว้ ณ ตอนปิด แก้ไขตรงไม่ได้
        </div>
      )}

      <div className="tiles">
        <div className="tile">
          <div className="k">รายได้รวมทั้งปี</div>
          <div className="v num">{formatSatangAsBaht(result.totalIncomeMinor)}</div>
        </div>
        <div className="tile">
          <div className="k">ค่าใช้จ่าย + ค่าลดหย่อนรวม</div>
          <div className="v num">
            {formatSatangAsBaht(result.expenseDeductionMinor + result.totalDeductionsMinor)}
          </div>
        </div>
        <div className="tile">
          <div className="k">เงินได้สุทธิ</div>
          <div className="v num">{formatSatangAsBaht(result.netTaxableMinor)}</div>
        </div>
        <div className={`tile ${isClosed && result.balance.direction === 'due' ? 'bad' : ''}`}>
          <div className="k">
            {isClosed
              ? `ผลลัพธ์ — ${result.balance.direction === 'due' ? 'ต้องจ่ายเพิ่ม' : 'ขอคืนภาษีได้'}`
              : 'ภาษีคำนวณได้ (แช่แข็ง)'}
          </div>
          <div className="v num">
            {isClosed
              ? `฿${formatSatangAsBaht(result.balance.amountMinor)}`
              : formatSatangAsBaht(result.taxTotalMinor)}
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="section-label">อัตราภาษีขั้นบันไดที่ใช้คำนวณ</div>
        <table className="bracket-table">
          <thead>
            <tr>
              <th>ช่วงเงินได้สุทธิ (บาท)</th>
              <th>อัตรา</th>
              <th className="num">ภาษีในช่วงนี้</th>
            </tr>
          </thead>
          <tbody>
            {result.bracket.breakdown.map((b) => {
              const bracket = brackets.find((row) => row.id === b.bracketId);
              return (
                <tr key={b.bracketId} className={b.amountInBracketMinor > 0 ? 'hit' : undefined}>
                  <td>
                    {bracket
                      ? formatBracketRange(bracket.lowerBoundMinor, bracket.upperBoundMinor)
                      : '—'}
                  </td>
                  <td>{b.rateBp === 0 ? 'ยกเว้น' : `${(b.rateBp / 100).toFixed(0)}%`}</td>
                  <td className="num">{formatSatangAsBaht(b.taxMinor)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className={`result-strip ${result.balance.direction}`}>
          <div>
            <div className="label">
              ภาษีคำนวณได้ {formatSatangAsBaht(result.taxTotalMinor)} − ภาษีหัก ณ ที่จ่ายสะสม{' '}
              {formatSatangAsBaht(result.whtTotalMinor)}
            </div>
            <div className="label" style={{ marginTop: 2 }}>
              ผลลัพธ์:{' '}
              <b
                style={{
                  color: result.balance.direction === 'refund' ? 'var(--good)' : 'var(--bad)',
                }}
              >
                {result.balance.direction === 'refund' ? 'ขอคืนภาษีได้' : 'ต้องจ่ายเพิ่ม'}
              </b>
            </div>
          </div>
          <div className="amount">฿{formatSatangAsBaht(result.balance.amountMinor)}</div>
        </div>
      </div>

      {!isClosed && !confirmingClose && (
        <div className="form-actions" style={{ marginTop: 20 }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setConfirmingClose(true)}
          >
            ปิดปีภาษี
          </button>
        </div>
      )}

      {!isClosed && confirmingClose && (
        <div className="panel" style={{ marginTop: 20 }}>
          <div className="confirm-modal">
            <h3>ยืนยันปิดปีภาษี {year.year}?</h3>
            <p className="muted" style={{ margin: '0 0 8px' }}>
              เมื่อกดยืนยัน สิ่งต่อไปนี้จะเกิดขึ้นทันที (AC-7b):
            </p>
            <ul>
              <li>
                รายรับ/รายจ่ายทั้งหมดของปีนี้จะ<strong>ล็อก แก้ไขตรงไม่ได้อีก</strong>
              </li>
              <li>ค่าลดหย่อนของปีนี้จะล็อกเช่นกัน</li>
              <li>
                ตัวเลขสรุปด้านบนจะถูก &quot;แช่แข็ง&quot; ไว้ —
                ต่อให้แก้ไขเพดาน/อัตราภาษีที่หน้าตั้งค่าทีหลัง ปีนี้จะไม่เปลี่ยน (INV-7)
              </li>
              <li>แก้ไขอะไรหลังจากนี้ต้องทำผ่าน &quot;รายการกลับรายการ&quot; เท่านั้น</li>
            </ul>
            <div className="form-actions" style={{ marginTop: 0 }}>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={busy}
                onClick={() => setConfirmingClose(false)}
              >
                ยกเลิก
              </button>
              <button
                type="button"
                className="btn"
                style={{ background: 'var(--amber)', color: '#fff' }}
                disabled={busy}
                onClick={() => void handleConfirmClose(year.id)}
              >
                ยืนยันปิดปีภาษี
              </button>
            </div>
          </div>
        </div>
      )}

      {isClosed && reversalRow && (
        <div className="panel">
          <div className="section-label">แก้ไขหลังปิดปี — ตัวอย่างรายการกลับรายการ (AC-7a)</div>
          <table>
            <thead>
              <tr>
                <th>วันที่</th>
                <th>รายการ</th>
                <th className="num">จำนวนเงิน</th>
                <th className="center">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {originalOfReversal && (
                <tr>
                  <td>{formatDate(originalOfReversal.date)}</td>
                  <td>
                    {originalOfReversal.note ?? originalOfReversal.sourcePayer ?? '(ต้นฉบับ)'}
                  </td>
                  <td className="num">{formatSatangAsBaht(originalOfReversal.amountMinor)}</td>
                  <td>
                    <span className="pill active">active</span>
                  </td>
                </tr>
              )}
              <tr>
                <td>{formatDate(reversalRow.date)}</td>
                <td>{reversalRow.note ?? 'รายการกลับรายการ'}</td>
                <td className="num">{formatSatangAsBaht(reversalRow.amountMinor)}</td>
                <td>
                  <span className="pill reversal">reversal</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
      {isClosed && (
        <div className="form-actions" style={{ marginTop: 20 }}>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy}
            onClick={() => void handleReopen(year.id)}
          >
            🔓 เปิดปีภาษีนี้อีกครั้ง
          </button>
        </div>
      )}
    </div>
  );
}
