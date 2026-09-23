import { useCallback, useEffect, useState } from 'react';

import { formatSatangAsBaht } from '../../main/calc/money';
import type { DeductionCategoryRow, GeneralCategory, TransactionRow } from '../../main/db/schema';
import type { AuditEntry } from '../../main/repositories/auditLog';
import HistoryPanel from '../components/HistoryPanel';
import LedgerTable from '../components/LedgerTable';
import RecurringChecklist from '../components/RecurringChecklist';
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
  return (
    row.sourcePayer ??
    (row.generalCategory ? GENERAL_CATEGORY_LABELS[row.generalCategory] : `รายการ #${row.id}`)
  );
}

export default function Entry(): JSX.Element {
  const yearState = useWorkingTaxYear();
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [deductionCategories, setDeductionCategories] = useState<DeductionCategoryRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'error'; message: string } | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [editing, setEditing] = useState<TransactionRow | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'tax' | 'general' | 'all'>('tax');
  const [history, setHistory] = useState<{ row: TransactionRow; entries: AuditEntry[] } | null>(
    null,
  );

  const reload = useCallback(async (yearId: number) => {
    const [rows, cats] = await Promise.all([
      window.api.transactions.listByYear(yearId),
      window.api.deductions.listCategories(),
    ]);
    setTransactions(rows);
    setDeductionCategories(cats);
  }, []);

  useEffect(() => {
    if (yearState.status === 'ready') void reload(yearState.year.id);
  }, [yearState, reload]);

  function startEdit(row: TransactionRow): void {
    setEditing(row);
    setIsFormOpen(true);
    if (row.taxRelevant) {
      setActiveTab('tax');
    } else {
      setActiveTab('general');
    }
  }

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
        deductionCategoryId: values.deductionCategoryId,
        deductionAmountMinor: values.deductionAmountMinor,
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
      setIsFormOpen(false); // smoothly collapse after adding
      await reload(yearId);
    } catch (err) {
      setFeedback({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdate(
    yearId: number,
    id: number,
    values: TransactionFormValues,
  ): Promise<void> {
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
        deductionCategoryId: values.deductionCategoryId,
        deductionAmountMinor: values.deductionAmountMinor,
      });
      setFeedback({ kind: 'ok', message: 'บันทึกการแก้ไขเรียบร้อยแล้ว' });
      setEditing(null);
      setIsFormOpen(false);
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
  if (yearState.status === 'error')
    return (
      <div className="page" role="alert">
        {yearState.message}
      </div>
    );

  const yearId = yearState.year.id;
  const taxTransactions = transactions.filter((t) => t.taxRelevant);
  const generalTransactions = transactions.filter((t) => !t.taxRelevant && t.status === 'active');
  const generalTotalsByCategory = (Object.keys(GENERAL_CATEGORY_LABELS) as GeneralCategory[]).map(
    (category) => ({
      category,
      total: generalTransactions
        .filter((t) => t.generalCategory === category)
        .reduce((sum, t) => sum + t.amountMinor, 0),
    }),
  );

  return (
    <div className="page">
      <div className="page-head" style={{ marginBottom: 20 }}>
        <h1>บันทึกรายรับ-รายจ่าย</h1>
        <p>
          ปีภาษี {yearState.year.year} ({yearState.year.status === 'open' ? 'เปิด' : 'ปิดแล้ว'}) — บันทึกรายการรายรับ-รายจ่ายและเช็คลิสต์ประจำเดือน
        </p>
      </div>

      {feedback && (
        <div
          role={feedback.kind === 'error' ? 'alert' : 'status'}
          style={{
            marginBottom: 16,
            padding: '10px 14px',
            borderRadius: 8,
            background: feedback.kind === 'error' ? 'var(--bad-soft)' : 'var(--good-soft)',
            color: feedback.kind === 'error' ? 'var(--bad)' : 'var(--good)',
            fontWeight: 500,
            fontSize: 13.5,
          }}
        >
          {feedback.message}
        </div>
      )}

      {/* Top View Selector & Quick Action */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 20,
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div className="chip-row">
          <button
            type="button"
            className={`chip${activeTab === 'tax' ? ' active' : ''}`}
            onClick={() => {
              setActiveTab('tax');
              setEditing(null);
            }}
          >
            🧾 รายการภาษี ({taxTransactions.length})
          </button>
          <button
            type="button"
            className={`chip${activeTab === 'general' ? ' active' : ''}`}
            onClick={() => {
              setActiveTab('general');
              setEditing(null);
            }}
          >
            🛒 รายการทั่วไป & ประจำเดือน ({generalTransactions.length})
          </button>
          <button
            type="button"
            className={`chip${activeTab === 'all' ? ' active' : ''}`}
            onClick={() => {
              setActiveTab('all');
              setEditing(null);
            }}
          >
            📑 ทั้งหมด ({transactions.length})
          </button>
        </div>

        {!editing && (
          <button
            type="button"
            className={`btn ${isFormOpen ? 'btn-ghost' : 'btn-primary'}`}
            style={{ padding: '8px 16px', fontSize: 13.5 }}
            onClick={() => setIsFormOpen(!isFormOpen)}
          >
            {isFormOpen
              ? '✕ ซ่อนฟอร์มบันทึก'
              : `➕ เพิ่ม${activeTab === 'tax' ? 'รายการภาษี' : activeTab === 'general' ? 'รายการทั่วไป' : 'รายการใหม่'}`}
          </button>
        )}
      </div>

      {/* Transaction Form (Collapsible or Open on Edit) */}
      {(isFormOpen || editing) && (
        <div style={{ marginBottom: 20 }}>
          {editing ? (
            <TransactionForm
              initial={editing}
              busy={busy}
              onSubmit={(values) => handleUpdate(yearId, editing.id, values)}
              onCancel={() => {
                setEditing(null);
                setIsFormOpen(false);
              }}
            />
          ) : (
            <TransactionForm
              key={formKey}
              defaultTaxRelevant={activeTab !== 'general'}
              busy={busy}
              onSubmit={(values) => handleCreate(yearId, values)}
              onCancel={() => setIsFormOpen(false)}
            />
          )}
        </div>
      )}

      {/* General & Recurring Section (Visible in 'general' or 'all' tabs) */}
      {(activeTab === 'general' || activeTab === 'all') && (
        <>
          <RecurringChecklist
            taxYearId={yearId}
            yearMonth={`${yearState.year.year}-${String(new Date().getMonth() + 1).padStart(2, '0')}`}
            onTransactionCreated={() => void reload(yearId)}
          />

          <div className="panel" style={{ marginBottom: 20, borderColor: 'var(--amber)' }}>
            <div
              className="section-label"
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                flexWrap: 'wrap',
                gap: 8,
              }}
            >
              <span style={{ fontWeight: 600, fontSize: 15 }}>🛒 รายการทั่วไป (ไม่นับภาษี) — ปี {yearState.year.year}</span>
              <span className="muted">ไม่ถูกนำไปคำนวณภาษี (AC-14)</span>
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
                    <th>สิทธิลดหย่อน</th>
                    <th>หมายเหตุ</th>
                    <th className="num">จำนวนเงิน</th>
                    <th className="center">การจัดการ</th>
                  </tr>
                </thead>
                <tbody>
                  {generalTransactions.map((row) => {
                    const deductionCat = row.deductionCategoryId
                      ? deductionCategories.find((c) => c.id === row.deductionCategoryId)
                      : null;
                    return (
                      <tr key={row.id}>
                        <td>{row.date}</td>
                        <td>
                          {row.generalCategory && (
                            <span
                              className="tag"
                              style={{ background: 'var(--amber-soft)', color: 'var(--amber)' }}
                            >
                              {GENERAL_CATEGORY_LABELS[row.generalCategory]}
                            </span>
                          )}
                        </td>
                        <td>
                          {deductionCat ? (
                            <span
                              className="tag"
                              style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
                            >
                              🏷️ {deductionCat.name}
                              {row.deductionAmountMinor != null &&
                                row.deductionAmountMinor < row.amountMinor &&
                                ` (ลดหย่อน ${formatSatangAsBaht(row.deductionAmountMinor)})`}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td>{row.note ?? '—'}</td>
                        <td className="num">{formatSatangAsBaht(row.amountMinor)}</td>
                        <td>
                          <button type="button" className="row-action" onClick={() => startEdit(row)}>
                            แก้ไข
                          </button>
                          <button
                            type="button"
                            className="row-action muted"
                            onClick={() => void handleVoid(yearId, row)}
                          >
                            Void
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {/* Tax Ledger Section (Visible in 'tax' or 'all' tabs) */}
      {(activeTab === 'tax' || activeTab === 'all') && (
        <div className="panel" style={{ marginBottom: 20 }}>
          <div
            className="section-label"
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              flexWrap: 'wrap',
              gap: 8,
              marginBottom: 14,
            }}
          >
            <span style={{ fontWeight: 600, fontSize: 15 }}>🧾 รายการภาษี — ปี {yearState.year.year} (จัดกลุ่มรายเดือน)</span>
            <span className="muted">นำไปรวมคำนวณภาษีเงินได้บุคคลธรรมดา</span>
          </div>
          <LedgerTable
            transactions={taxTransactions}
            deductionCategories={deductionCategories}
            onEdit={(row) => startEdit(row)}
            onVoid={(row) => void handleVoid(yearId, row)}
            onShowHistory={(row) => void handleShowHistory(row)}
          />
        </div>
      )}

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
