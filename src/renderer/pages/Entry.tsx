import { useCallback, useEffect, useState } from 'react';

import { formatSatangAsBaht } from '../../main/calc/money';
import type { GeneralCategory, TransactionRow } from '../../main/db/schema';
import type { AuditEntry } from '../../main/repositories/auditLog';
import HistoryPanel from '../components/HistoryPanel';
import LedgerTable from '../components/LedgerTable';
import TransactionForm, { type TransactionFormValues } from '../components/TransactionForm';
import { useWorkingTaxYear } from '../lib/useWorkingTaxYear';

/**
 * Entry screen (AT-2.6 form + AT-2.7 ledger/history/general section) — PROTO-0001
 * `entry.html`.
 */

const GENERAL_CATEGORY_LABELS: Record<GeneralCategory, string> = {
  food: 'อาหาร',
  shopping: 'ช้อปปิ้ง',
  housing: 'ที่อยู่อาศัย',
  other: 'อื่นๆ',
};

function transactionLabel(row: TransactionRow): string {
  return row.sourcePayer ?? (row.generalCategory ? GENERAL_CATEGORY_LABELS[row.generalCategory] : `รายการ #${row.id}`);
}

export default function Entry(): JSX.Element {
  const yearState = useWorkingTaxYear();
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'error'; message: string } | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [editing, setEditing] = useState<TransactionRow | null>(null);
  const [history, setHistory] = useState<{ row: TransactionRow; entries: AuditEntry[] } | null>(null);

  const reload = useCallback(async (yearId: number) => {
    const rows = await window.api.transactions.listByYear(yearId);
    setTransactions(rows);
  }, []);

  useEffect(() => {
    if (yearState.status === 'ready') void reload(yearState.year.id);
  }, [yearState, reload]);

  async function handleCreate(yearId: number, values: TransactionFormValues): Promise<void> {
    setBusy(true);
    setFeedback(null);
    try {
      const transaction = await window.api.transactions.create({
        taxYearId: yearId,
        kind: values.kind,
        taxRelevant: values.taxRelevant,
        incomeSection: values.incomeSection,
        generalCategory: values.generalCategory,
        date: values.date,
        amountMinor: values.amountMinor,
        whtMinor: values.whtMinor,
        sourcePayer: values.sourcePayer,
        payerTaxId: values.payerTaxId,
        note: values.note,
      });
      if (values.attachmentPath) {
        await window.api.attachments.add(transaction.id, values.attachmentPath);
      }
      setFeedback({ kind: 'ok', message: 'บันทึกรายการเรียบร้อยแล้ว' });
      setFormKey((k) => k + 1); // remounts TransactionForm to clear its fields
      await reload(yearId);
    } catch (err) {
      setFeedback({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdate(yearId: number, id: number, values: TransactionFormValues): Promise<void> {
    setBusy(true);
    setFeedback(null);
    try {
      await window.api.transactions.update(id, {
        date: values.date,
        amountMinor: values.amountMinor,
        whtMinor: values.whtMinor,
        sourcePayer: values.sourcePayer,
        payerTaxId: values.payerTaxId,
        note: values.note,
        incomeSection: values.incomeSection,
        generalCategory: values.generalCategory,
      });
      setFeedback({ kind: 'ok', message: 'บันทึกการแก้ไขเรียบร้อยแล้ว' });
      setEditing(null);
      await reload(yearId);
    } catch (err) {
      setFeedback({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  async function handleVoid(yearId: number, row: TransactionRow): Promise<void> {
    setFeedback(null);
    try {
      await window.api.transactions.void(row.id);
      await reload(yearId);
    } catch (err) {
      setFeedback({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  }

  async function handleShowHistory(row: TransactionRow): Promise<void> {
    const entries = await window.api.transactions.getHistory(row.id);
    setHistory({ row, entries });
  }

  if (yearState.status === 'loading') return <div className="page">กำลังโหลด...</div>;
  if (yearState.status === 'error') return <div className="page" role="alert">{yearState.message}</div>;

  const yearId = yearState.year.id;
  const taxTransactions = transactions.filter((t) => t.taxRelevant);
  const generalTransactions = transactions.filter((t) => !t.taxRelevant && t.status === 'active');
  const generalTotalsByCategory = (Object.keys(GENERAL_CATEGORY_LABELS) as GeneralCategory[]).map((category) => ({
    category,
    total: generalTransactions
      .filter((t) => t.generalCategory === category)
      .reduce((sum, t) => sum + t.amountMinor, 0),
  }));

  return (
    <div className="page">
      <div className="page-head">
        <h1>บันทึกรายรับ-รายจ่าย</h1>
        <p>
          ปีภาษีนี้ยัง &quot;เปิด&quot; อยู่ — แก้ไขรายการที่บันทึกไว้ได้โดยตรง
          ทุกการแก้ไขจะถูกบันทึกไว้ (ดูได้ที่ &quot;ประวัติ&quot;)
        </p>
      </div>

      {feedback && (
        <p role={feedback.kind === 'error' ? 'alert' : 'status'} className="muted">
          {feedback.message}
        </p>
      )}

      {editing ? (
        <TransactionForm
          initial={editing}
          busy={busy}
          onSubmit={(values) => handleUpdate(yearId, editing.id, values)}
          onCancel={() => setEditing(null)}
        />
      ) : (
        <TransactionForm key={formKey} busy={busy} onSubmit={(values) => handleCreate(yearId, values)} />
      )}

      <div className="panel" style={{ marginTop: 20 }}>
        <div
          className="section-label"
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}
        >
          <span>🧾 รายการภาษี — ปี {yearState.year.year} (จัดกลุ่มรายเดือน)</span>
        </div>
        <LedgerTable
          transactions={taxTransactions}
          onEdit={(row) => setEditing(row)}
          onVoid={(row) => void handleVoid(yearId, row)}
          onShowHistory={(row) => void handleShowHistory(row)}
        />
      </div>

      <div className="panel" style={{ marginTop: 20, borderColor: 'var(--amber)' }}>
        <div
          className="section-label"
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}
        >
          <span>🛒 รายการทั่วไป (ไม่นับภาษี) — ปี {yearState.year.year}</span>
          <span className="muted">ไม่ถูกนำไปคำนวณภาษีเลย (AC-14)</span>
        </div>

        <div className="tiles" style={{ gridTemplateColumns: 'repeat(4,1fr)', marginBottom: 18 }}>
          {generalTotalsByCategory.map(({ category, total }) => (
            <div className="tile" key={category}>
              <div className="k">{GENERAL_CATEGORY_LABELS[category]}</div>
              <div className="v num">{formatSatangAsBaht(total)}</div>
            </div>
          ))}
        </div>

        {generalTransactions.length === 0 ? (
          <p className="muted">ยังไม่มีรายการทั่วไปในปีนี้</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>วันที่</th>
                <th>หมวดหมู่</th>
                <th>หมายเหตุ</th>
                <th>จำนวนเงิน</th>
                <th>การจัดการ</th>
              </tr>
            </thead>
            <tbody>
              {generalTransactions.map((row) => (
                <tr key={row.id}>
                  <td>{row.date}</td>
                  <td>
                    {row.generalCategory && (
                      <span className="tag" style={{ background: 'var(--amber-soft)', color: 'var(--amber)' }}>
                        {GENERAL_CATEGORY_LABELS[row.generalCategory]}
                      </span>
                    )}
                  </td>
                  <td>{row.note ?? '—'}</td>
                  <td className="num">{formatSatangAsBaht(row.amountMinor)}</td>
                  <td>
                    <button type="button" className="row-action" onClick={() => setEditing(row)}>
                      แก้ไข
                    </button>
                    <button type="button" className="row-action muted" onClick={() => void handleVoid(yearId, row)}>
                      Void
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {history && (
        <HistoryPanel
          label={transactionLabel(history.row)}
          entries={history.entries}
          onClose={() => setHistory(null)}
        />
      )}
    </div>
  );
}
