import { useCallback, useEffect, useState } from 'react';

import { tryParseBahtToSatang } from '../../main/calc/money';
import type { ExpenseMethod, TaxYearRow } from '../../main/db/schema';

interface TaxYearSwitcherProps {
  readonly selectedYearId: number | null;
  readonly onSelectYear: (year: TaxYearRow) => void;
}

/**
 * Tax-year switcher (AT-3.7) — list of years (open/closed badge), create a new year, set the
 * 40(5)-(8) expense method, with a mid-year-switch warning (TC-0001 #5). No dedicated PROTO-0001
 * mockup page exists for this exact component; it matches the `year-pill` nav element's stated
 * behavior (ANA-0001 §UI changes) plus the Settings/Entry screens' expense-method fields.
 */
export default function TaxYearSwitcher({
  selectedYearId,
  onSelectYear,
}: TaxYearSwitcherProps): JSX.Element {
  const [years, setYears] = useState<TaxYearRow[]>([]);
  const [hasExisting40_5_8Income, setHasExisting40_5_8Income] = useState(false);
  const [newYearText, setNewYearText] = useState('');
  const [rateText, setRateText] = useState('');
  const [pendingMethod, setPendingMethod] = useState<ExpenseMethod | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'error'; message: string } | null>(null);

  const reload = useCallback(async () => {
    const list = await window.api.taxYears.list();
    setYears(list);
    return list;
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (selectedYearId === null) {
      setHasExisting40_5_8Income(false);
      return;
    }
    void window.api.transactions.listByYear(selectedYearId).then((transactions) => {
      setHasExisting40_5_8Income(
        transactions.some(
          (t) => t.status === 'active' && t.kind === 'income' && t.incomeSection === '40_5_8',
        ),
      );
    });
  }, [selectedYearId]);

  const selectedYear = years.find((y) => y.id === selectedYearId) ?? null;

  async function handleCreateYear(): Promise<void> {
    setFeedback(null);
    const year = Number(newYearText);
    if (!Number.isSafeInteger(year) || year < 2400 || year > 2700) {
      setFeedback({ kind: 'error', message: 'กรุณาระบุปี พ.ศ. ที่ถูกต้อง' });
      return;
    }
    setBusy(true);
    try {
      const created = await window.api.taxYears.create(year);
      setNewYearText('');
      const list = await reload();
      const found = list.find((y) => y.id === created.id) ?? created;
      onSelectYear(found);
    } catch (err) {
      setFeedback({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  async function applyExpenseMethod(method: ExpenseMethod): Promise<void> {
    if (!selectedYear) return;
    setBusy(true);
    setFeedback(null);
    try {
      let lumpSumRateBp: number | null = null;
      if (method === 'lump_sum') {
        const rateResult = tryParseBahtToSatang(rateText || '0');
        if (!rateResult.ok) throw new Error('กรุณาระบุอัตราเหมาจ่ายเป็นเปอร์เซ็นต์ที่ถูกต้อง');
        // rateText is a percent (e.g. "60"), not baht -- tryParseBahtToSatang just gives us
        // strict decimal parsing; convert its satang-scaled result back to basis points.
        lumpSumRateBp = Math.round(rateResult.satang);
      }
      await window.api.taxYears.setExpenseMethod(selectedYear.id, method, lumpSumRateBp);
      setPendingMethod(null);
      setFeedback({ kind: 'ok', message: 'บันทึกวิธีหักค่าใช้จ่ายเรียบร้อยแล้ว' });
      await reload();
    } catch (err) {
      setFeedback({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  function handleSelectMethod(method: ExpenseMethod): void {
    if (!selectedYear) return;
    const isMidYearSwitch =
      selectedYear.expenseMethod !== null &&
      selectedYear.expenseMethod !== method &&
      hasExisting40_5_8Income;
    if (isMidYearSwitch) {
      setPendingMethod(method);
      return;
    }
    void applyExpenseMethod(method);
  }

  return (
    <div className="panel">
      <div className="section-label">ปีภาษี</div>
      <div className="chip-row">
        {years.map((year) => (
          <button
            type="button"
            key={year.id}
            className={`chip${year.id === selectedYearId ? ' active' : ''}`}
            onClick={() => onSelectYear(year)}
          >
            <span className={`status-dot ${year.status}`} style={{ marginInlineEnd: 6 }} />
            {year.year} ({year.status === 'open' ? 'เปิด' : 'ปิด'})
          </button>
        ))}
      </div>

      <div className="form-grid" style={{ marginTop: 14 }}>
        <div className="field">
          <label>สร้างปีภาษีใหม่ (พ.ศ.)</label>
          <input
            type="text"
            inputMode="numeric"
            value={newYearText}
            onChange={(e) => setNewYearText(e.target.value)}
          />
        </div>
        <div className="field" style={{ justifyContent: 'flex-end' }}>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy}
            onClick={() => void handleCreateYear()}
          >
            + สร้างปีภาษี
          </button>
        </div>
      </div>

      {selectedYear && selectedYear.status === 'open' && (
        <div style={{ marginTop: 14 }}>
          <div className="section-label">วิธีหักค่าใช้จ่าย 40(5)-(8) — ปี {selectedYear.year}</div>
          <div className="chip-row">
            <button
              type="button"
              className={`chip${selectedYear.expenseMethod === 'lump_sum' ? ' active' : ''}`}
              onClick={() => handleSelectMethod('lump_sum')}
            >
              เหมาจ่าย (lump sum)
            </button>
            <button
              type="button"
              className={`chip${selectedYear.expenseMethod === 'actual' ? ' active' : ''}`}
              onClick={() => handleSelectMethod('actual')}
            >
              ตามจริง (actual)
            </button>
          </div>
          {(pendingMethod === 'lump_sum' || selectedYear.expenseMethod === 'lump_sum') && (
            <div className="field" style={{ marginTop: 10, maxWidth: 200 }}>
              <label>อัตราเหมาจ่าย (%)</label>
              <input
                type="text"
                inputMode="decimal"
                value={rateText}
                onChange={(e) => setRateText(e.target.value)}
              />
            </div>
          )}
        </div>
      )}

      {pendingMethod && (
        <div className="confirm-modal" style={{ marginTop: 14 }}>
          <h3>เปลี่ยนวิธีหักค่าใช้จ่ายกลางปี?</h3>
          <p>
            ปีนี้มีรายได้ 40(5)-(8) บันทึกไว้แล้วด้วยวิธี{' '}
            {selectedYear?.expenseMethod === 'lump_sum' ? 'เหมาจ่าย' : 'ตามจริง'} —
            การเปลี่ยนวิธีจะมีผลกับการคำนวณทั้งปี ไม่ใช่แค่รายการใหม่
          </p>
          <ul>
            {pendingMethod === 'actual' && (
              <li>ต้องบันทึกรายจ่ายจริงให้ครบ ไม่เช่นนั้นตัวเลขหักค่าใช้จ่ายจะเป็น 0</li>
            )}
            {pendingMethod === 'lump_sum' && (
              <li>รายจ่ายที่เคยบันทึกไว้จะไม่ถูกใช้ในการคำนวณอีกต่อไป</li>
            )}
          </ul>
          <div className="form-actions">
            <button
              type="button"
              className="btn btn-ghost"
              disabled={busy}
              onClick={() => setPendingMethod(null)}
            >
              ยกเลิก
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={() => void applyExpenseMethod(pendingMethod)}
            >
              ยืนยันการเปลี่ยน
            </button>
          </div>
        </div>
      )}

      {feedback && (
        <p
          role={feedback.kind === 'error' ? 'alert' : 'status'}
          className="muted"
          style={{ marginTop: 10 }}
        >
          {feedback.message}
        </p>
      )}
    </div>
  );
}
