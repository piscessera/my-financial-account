import { Fragment, useCallback, useEffect, useState } from 'react';

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

interface EntryProps {
  readonly initialMonth?: number | null;
}

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

export default function Entry({ initialMonth = null }: EntryProps): JSX.Element {
  const yearState = useWorkingTaxYear();
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [deductionCategories, setDeductionCategories] = useState<DeductionCategoryRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'error'; message: string } | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [editing, setEditing] = useState<TransactionRow | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'tax' | 'general' | 'all'>('tax');
  const [selectedMonth, setSelectedMonth] = useState<number | null>(initialMonth ?? null);
  const [searchQuery, setSearchQuery] = useState('');
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

  useEffect(() => {
    if (initialMonth !== undefined) {
      setSelectedMonth(initialMonth);
    }
  }, [initialMonth]);

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

  // Filter helper
  function filterRows(rows: TransactionRow[]): TransactionRow[] {
    const q = searchQuery.trim().toLowerCase();
    return rows.filter((row) => {
      // Month check
      if (selectedMonth !== null) {
        const monthNum = Number.parseInt(row.date.slice(5, 7), 10) - 1;
        if (monthNum !== selectedMonth) return false;
      }
      // Search check
      if (!q) return true;
      const noteMatch = row.note?.toLowerCase().includes(q) ?? false;
      const payerMatch = row.sourcePayer?.toLowerCase().includes(q) ?? false;
      const taxIdMatch = row.payerTaxId?.toLowerCase().includes(q) ?? false;
      const catMatch = row.generalCategory
        ? GENERAL_CATEGORY_LABELS[row.generalCategory].toLowerCase().includes(q)
        : false;
      const dedCat = row.deductionCategoryId
        ? deductionCategories.find((c) => c.id === row.deductionCategoryId)
        : null;
      const dedMatch = dedCat ? dedCat.name.toLowerCase().includes(q) : false;
      return noteMatch || payerMatch || taxIdMatch || catMatch || dedMatch;
    });
  }

  const filteredTaxTransactions = filterRows(taxTransactions);
  const filteredGeneralTransactions = filterRows(generalTransactions);
  const isFiltered = selectedMonth !== null || searchQuery.trim().length > 0;

  // Compute month counts for current active tab
  const activeTabBaseRows =
    activeTab === 'tax'
      ? taxTransactions
      : activeTab === 'general'
        ? generalTransactions
        : transactions.filter((t) => t.status === 'active');

  const monthCounts = Array.from({ length: 12 }, (_, i) => {
    return activeTabBaseRows.filter((t) => {
      const mIdx = Number.parseInt(t.date.slice(5, 7), 10) - 1;
      return mIdx === i;
    }).length;
  });

  const generalTotalsByCategory = (Object.keys(GENERAL_CATEGORY_LABELS) as GeneralCategory[]).map(
    (category) => ({
      category,
      total: filteredGeneralTransactions
        .filter((t) => t.generalCategory === category)
        .reduce((sum, t) => sum + t.amountMinor, 0),
    }),
  );

  // Group filtered general transactions by month
  const generalByMonth = new Map<string, TransactionRow[]>();
  for (const row of filteredGeneralTransactions) {
    const key = monthKeyOf(row.date);
    const bucket = generalByMonth.get(key);
    if (bucket) bucket.push(row);
    else generalByMonth.set(key, [row]);
  }
  const generalMonths = [...generalByMonth.keys()].sort().reverse();

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
          marginBottom: 16,
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

      {/* Toolbar: Month Filter Chips & Search Bar */}
      <div className="toolbar-wrap">
        <div className="month-chips-container" style={{ margin: 0, flex: '1 1 auto' }}>
          <button
            type="button"
            className={`month-chip${selectedMonth === null ? ' active' : ''}`}
            onClick={() => setSelectedMonth(null)}
          >
            ทั้งหมด
            <span className="month-chip-count">{activeTabBaseRows.length}</span>
          </button>
          {THAI_SHORT_MONTHS.map((label, idx) => {
            const count = monthCounts[idx];
            return (
              <button
                key={label}
                type="button"
                className={`month-chip${selectedMonth === idx ? ' active' : ''}`}
                onClick={() => setSelectedMonth(selectedMonth === idx ? null : idx)}
              >
                {label}
                {count > 0 && <span className="month-chip-count">{count}</span>}
              </button>
            );
          })}
        </div>

        <div className="search-bar-wrap">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            className="search-input"
            placeholder="ค้นหา หมายเหตุ, ผู้จ่าย, เลขภาษี..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              type="button"
              className="search-clear-btn"
              onClick={() => setSearchQuery('')}
              title="ล้างคำค้นหา"
            >
              ✕
            </button>
          )}
        </div>
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
            yearMonth={`${yearState.year.year}-${String(selectedMonth !== null ? selectedMonth + 1 : new Date().getMonth() + 1).padStart(2, '0')}`}
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
              <span style={{ fontWeight: 600, fontSize: 15 }}>
                🛒 รายการทั่วไป (ไม่นับภาษี) — ปี {yearState.year.year}{' '}
                {selectedMonth !== null && `(เดือน ${THAI_MONTHS[selectedMonth]})`}
              </span>
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

            {filteredGeneralTransactions.length === 0 ? (
              <div className="empty-state" style={{ padding: '30px 20px' }}>
                <div className="icon">🔍</div>
                <p>{isFiltered ? 'ไม่พบรายการทั่วไปที่ตรงกับเงื่อนไขค้นหา' : 'ยังไม่มีรายการทั่วไปในปีนี้'}</p>
              </div>
            ) : (
              <table className="month-ledger">
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
                  {generalMonths.map((monthKey) => {
                    const rows = generalByMonth.get(monthKey) ?? [];
                    const monthTotal = rows.reduce((sum, r) => sum + r.amountMinor, 0);
                    return (
                      <Fragment key={monthKey}>
                        <tr className="month-row">
                          <td colSpan={6}>
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
                              <td className="center">
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
                      </Fragment>
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
            <span style={{ fontWeight: 600, fontSize: 15 }}>
              🧾 รายการภาษี — ปี {yearState.year.year}{' '}
              {selectedMonth !== null && `(เดือน ${THAI_MONTHS[selectedMonth]})`}
            </span>
            <span className="muted">นำไปรวมคำนวณภาษีเงินได้บุคคลธรรมดา</span>
          </div>
          <LedgerTable
            transactions={filteredTaxTransactions}
            deductionCategories={deductionCategories}
            isFiltered={isFiltered}
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

