import { useCallback, useEffect, useState } from 'react';

import { formatSatangAsBaht, tryParseBahtToSatang } from '../../main/calc/money';
import type { MonthlyChecklistItem } from '../../main/repositories/recurring';
import ManageRecurringModal from './ManageRecurringModal';

interface RecurringChecklistProps {
  readonly taxYearId: number;
  readonly yearMonth: string; // e.g. '2026-03'
  readonly onTransactionCreated: () => void;
}

interface QuickRecordPromptState {
  readonly templateId: number;
  readonly name: string;
  readonly dueDay: number;
  readonly amountText: string;
  readonly note: string;
}

export default function RecurringChecklist({
  taxYearId,
  yearMonth,
  onTransactionCreated,
}: RecurringChecklistProps): JSX.Element {
  const [checklist, setChecklist] = useState<MonthlyChecklistItem[]>([]);
  const [showManageModal, setShowManageModal] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);
  const [quickRecord, setQuickRecord] = useState<QuickRecordPromptState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadChecklist = useCallback(async () => {
    try {
      const items = await window.api.recurring.getMonthlyChecklist(yearMonth);
      setChecklist(items);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [yearMonth]);

  useEffect(() => {
    void loadChecklist();
  }, [loadChecklist]);

  const completedCount = checklist.filter((i) => i.status === 'completed').length;
  const skippedCount = checklist.filter((i) => i.status === 'skipped').length;
  const pendingCount = checklist.filter((i) => i.status === 'pending').length;

  async function handleDirectRecord(item: MonthlyChecklistItem): Promise<void> {
    if (item.template.defaultAmountMinor === null) {
      // Prompt for amount
      setQuickRecord({
        templateId: item.template.id,
        name: item.template.name,
        dueDay: item.template.dueDay,
        amountText: '',
        note: item.template.defaultNote || '',
      });
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const dateDay = String(item.template.dueDay).padStart(2, '0');
      const dateStr = `${yearMonth}-${dateDay}`;
      await window.api.recurring.record({
        templateId: item.template.id,
        yearMonth,
        taxYearId,
        date: dateStr,
        amountMinor: item.template.defaultAmountMinor,
        note: item.template.defaultNote || item.template.name,
      });
      await loadChecklist();
      onTransactionCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirmQuickRecord(): Promise<void> {
    if (!quickRecord) return;
    setBusy(true);
    setError(null);
    try {
      const parsed = tryParseBahtToSatang(quickRecord.amountText || '0');
      if (!parsed.ok) throw new Error(parsed.error.message);

      const dateDay = String(quickRecord.dueDay).padStart(2, '0');
      const dateStr = `${yearMonth}-${dateDay}`;
      await window.api.recurring.record({
        templateId: quickRecord.templateId,
        yearMonth,
        taxYearId,
        date: dateStr,
        amountMinor: parsed.satang,
        note: quickRecord.note.trim(),
      });
      setQuickRecord(null);
      await loadChecklist();
      onTransactionCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleSkip(templateId: number): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await window.api.recurring.skip(templateId, yearMonth);
      await loadChecklist();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleUndo(templateId: number): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await window.api.recurring.undo(templateId, yearMonth);
      await loadChecklist();
      onTransactionCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="panel"
      style={{
        marginBottom: 20,
        background: 'var(--surface)',
        border: '1px solid var(--line)',
        boxShadow: 'var(--shadow)',
        padding: '16px 20px',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: 'pointer',
          userSelect: 'none',
        }}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              background: 'var(--accent-soft)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 18,
            }}
          >
            📋
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink)' }}>
                รายการประจำเดือน ({yearMonth})
              </span>
              <div style={{ display: 'inline-flex', gap: 6 }}>
                {completedCount > 0 && (
                  <span className="pill active" style={{ fontSize: 11 }}>
                    ✓ {completedCount} บันทึกแล้ว
                  </span>
                )}
                {skippedCount > 0 && (
                  <span className="pill voided" style={{ fontSize: 11 }}>
                    ⏭️ {skippedCount} ข้าม
                  </span>
                )}
                {pendingCount > 0 && (
                  <span
                    className="pill"
                    style={{
                      fontSize: 11,
                      background: 'var(--amber-soft)',
                      color: 'var(--amber)',
                    }}
                  >
                    ⏳ {pendingCount} รอทำรายการ
                  </span>
                )}
              </div>
            </div>
            <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
              เช็คลิสต์ค่าใช้จ่ายประจำเดือน (ค่าเช่า, บิล, ค่าน้ำไฟ, สมาชิก)
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ padding: '6px 12px', fontSize: 12, border: '1px solid var(--line)' }}
            onClick={(e) => {
              e.stopPropagation();
              setShowManageModal(true);
            }}
          >
            ⚙️ จัดการแม่แบบ
          </button>
          <span style={{ color: 'var(--accent)', fontSize: 13, fontWeight: 600 }}>
            {isExpanded ? '▲ ซ่อน' : '▼ แสดง'}
          </span>
        </div>
      </div>

      {error && (
        <div
          style={{
            marginTop: 12,
            padding: '8px 12px',
            background: 'var(--bad-soft)',
            borderLeft: '4px solid var(--bad)',
            borderRadius: 6,
            color: 'var(--bad)',
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      {isExpanded && (
        <div style={{ marginTop: 16 }}>
          {checklist.length === 0 ? (
            <p className="muted" style={{ textAlign: 'center', padding: '16px 0', fontSize: 13 }}>
              ยังไม่มีแม่แบบรายการประจำ — กด &quot;⚙️ จัดการแม่แบบ&quot; เพื่อตั้งค่ารายการประจำเดือน
            </p>
          ) : (
            <table style={{ margin: 0 }}>
              <thead>
                <tr>
                  <th>วันที่</th>
                  <th>รายการ</th>
                  <th>ยอดเงิน</th>
                  <th>สถานะ</th>
                  <th style={{ textAlign: 'right' }}>การดำเนินการ</th>
                </tr>
              </thead>
              <tbody>
                {checklist.map((item) => (
                  <tr key={item.template.id}>
                    <td style={{ width: 110, fontSize: 13 }}>
                      ทุกวันที่ {item.template.dueDay}
                    </td>
                    <td>
                      <div style={{ fontWeight: 500 }}>{item.template.name}</div>
                      {item.template.defaultNote && (
                        <div className="muted" style={{ fontSize: 11 }}>
                          {item.template.defaultNote}
                        </div>
                      )}
                    </td>
                    <td className="num" style={{ fontSize: 13 }}>
                      {item.transaction
                        ? formatSatangAsBaht(item.transaction.amountMinor)
                        : item.template.defaultAmountMinor !== null
                          ? formatSatangAsBaht(item.template.defaultAmountMinor)
                          : '—'}
                    </td>
                    <td>
                      {item.status === 'completed' && (
                        <span className="pill active" style={{ fontSize: 11 }}>
                          ✓ บันทึกแล้ว
                        </span>
                      )}
                      {item.status === 'skipped' && (
                        <span className="pill voided" style={{ fontSize: 11 }}>
                          ⏭️ ข้ามเดือนนี้
                        </span>
                      )}
                      {item.status === 'pending' && (
                        <span
                          className="pill"
                          style={{
                            fontSize: 11,
                            background: 'rgba(234, 179, 8, 0.15)',
                            color: '#fde047',
                            border: '1px solid rgba(234, 179, 8, 0.3)',
                          }}
                        >
                          ⏳ รอทำรายการ
                        </span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {item.status === 'pending' && (
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <button
                            type="button"
                            className="btn btn-primary"
                            style={{ padding: '4px 10px', fontSize: 12 }}
                            disabled={busy}
                            onClick={() => void handleDirectRecord(item)}
                          >
                            ✓ บันทึก
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost"
                            style={{ padding: '4px 8px', fontSize: 12 }}
                            disabled={busy}
                            onClick={() => void handleSkip(item.template.id)}
                          >
                            ข้าม
                          </button>
                        </div>
                      )}
                      {(item.status === 'completed' || item.status === 'skipped') && (
                        <button
                          type="button"
                          className="row-action muted"
                          style={{ fontSize: 12 }}
                          disabled={busy}
                          onClick={() => void handleUndo(item.template.id)}
                        >
                          ↩ ยกเลิก
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Quick Record Prompt Modal */}
      {quickRecord && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.7)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1100,
            padding: 20,
          }}
          onClick={() => setQuickRecord(null)}
        >
          <div
            className="panel"
            style={{
              width: '100%',
              maxWidth: 440,
              background: 'var(--panel-bg, #181824)',
              borderRadius: 12,
              boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
              border: '1px solid var(--border, #333)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="section-label">บันทึกรายการประจำ: {quickRecord.name}</div>
            <div className="form-grid">
              <div className="field">
                <label>จำนวนเงิน (บาท) *</label>
                <input
                  type="text"
                  inputMode="decimal"
                  autoFocus
                  placeholder="0.00"
                  value={quickRecord.amountText}
                  onChange={(e) =>
                    setQuickRecord({ ...quickRecord, amountText: e.target.value })
                  }
                />
              </div>
              <div className="field">
                <label>หมายเหตุ</label>
                <input
                  type="text"
                  value={quickRecord.note}
                  onChange={(e) =>
                    setQuickRecord({ ...quickRecord, note: e.target.value })
                  }
                />
              </div>
            </div>
            <div className="form-actions" style={{ marginTop: 16 }}>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={busy}
                onClick={() => setQuickRecord(null)}
              >
                ยกเลิก
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy}
                onClick={() => void handleConfirmQuickRecord()}
              >
                บันทึกรายการ
              </button>
            </div>
          </div>
        </div>
      )}

      {showManageModal && (
        <ManageRecurringModal
          onClose={() => setShowManageModal(false)}
          onUpdated={() => void loadChecklist()}
        />
      )}
    </div>
  );
}
