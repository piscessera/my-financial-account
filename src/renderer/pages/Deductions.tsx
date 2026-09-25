import { useCallback, useEffect, useMemo, useState } from 'react';

import { computeDeductions } from '../../main/calc/deductions';
import { formatSatangAsBaht, tryParseBahtToSatang } from '../../main/calc/money';
import type {
  DeductionCategoryRow,
  DeductionEntryRow,
  SharedCapRow,
  TransactionRow,
} from '../../main/db/schema';
import type { CategorySummaryItem, DeductionSummaryResult } from '../../main/repositories/deductions';
import { useWorkingTaxYear } from '../lib/useWorkingTaxYear';

function capDescription(category: DeductionCategoryRow, group: SharedCapRow | undefined): string {
  if (category.capType === 'fixed') {
    return `เพดานตามกฎหมาย ${formatSatangAsBaht(category.capAmountMinor ?? 0)} บาท`;
  }
  if (category.capType === 'per_count') {
    return `เพดานคนละ ${formatSatangAsBaht(category.capAmountMinor ?? 0)} บาท`;
  }
  const subCap =
    category.capAmountMinor !== null
      ? ` (เพดานเฉพาะตัว: ${formatSatangAsBaht(category.capAmountMinor)} บาท)`
      : '';
  return `${group ? `กลุ่ม [${group.name} เพดานรวม ${formatSatangAsBaht(group.capAmountMinor)} บาท]` : 'รวมเพดานกลุ่ม'}${subCap}`;
}

interface RowDraft {
  readonly amountText: string;
  readonly countText: string;
}

interface DeductionGroup {
  readonly id: string;
  readonly title: string;
  readonly icon: string;
  readonly matcher: (c: DeductionCategoryRow) => boolean;
}

const DEDUCTION_GROUPS: DeductionGroup[] = [
  {
    id: 'personal_family',
    title: 'ผู้มีเงินได้และครอบครัว',
    icon: '👨‍👩‍👧',
    matcher: (c) =>
      /personal|spouse|child|parent|disabled|family|birth|prenatal|มารดา|บิดา|บุตร|คู่สมรส|ผู้มีเงินได้/i.test(
        `${c.code} ${c.name}`,
      ),
  },
  {
    id: 'insurance_savings',
    title: 'เบี้ยประกันและการออม',
    icon: '🛡️',
    matcher: (c) =>
      /life_insurance|health_insurance|social_security|insurance|ประกันชีวิต|ประกันสุขภาพ|ประกันสังคม/i.test(
        `${c.code} ${c.name}`,
      ),
  },
  {
    id: 'retirement_invest',
    title: 'กองทุนเกษียณและการลงทุน (เพดานกลุ่ม 500,000 บ.)',
    icon: '📈',
    matcher: (c) =>
      /rmf|ssf|thaiesg|provident|pension|gpf|กองทุน|สำรองเลี้ยงชีพ|กบข|บำนาญ/i.test(
        `${c.code} ${c.name}`,
      ),
  },
  {
    id: 'housing_property',
    title: 'อสังหาริมทรัพย์และดอกเบี้ยบ้าน',
    icon: '🏠',
    matcher: (c) =>
      /home|house|mortgage|property|ดอกเบี้ย|ที่อยู่อาศัย|บ้าน/i.test(`${c.code} ${c.name}`),
  },
  {
    id: 'donation_other',
    title: 'เงินบริจาคและมาตรการกระตุ้นเศรษฐกิจ',
    icon: '🎗️',
    matcher: (c) =>
      /donation|charity|sport|education|receipt|travel|บริจาค|ช้อป|เที่ยว/i.test(
        `${c.code} ${c.name}`,
      ),
  },
];

/**
 * Deductions screen — Clean, high-contrast visual layout matching modern desktop aesthetic.
 */
export default function Deductions(): JSX.Element {
  const yearState = useWorkingTaxYear();
  const [categories, setCategories] = useState<DeductionCategoryRow[]>([]);
  const [sharedCaps, setSharedCaps] = useState<SharedCapRow[]>([]);
  const [summary, setSummary] = useState<DeductionSummaryResult | null>(null);
  const [drafts, setDrafts] = useState<Record<number, RowDraft>>({});
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'error'; message: string } | null>(null);
  const [drillDown, setDrillDown] = useState<{
    category: DeductionCategoryRow;
    transactions: TransactionRow[];
    loading: boolean;
  } | null>(null);

  const reload = useCallback(async (yearId: number) => {
    const [cats, ents, caps, sums] = await Promise.all([
      window.api.deductions.listCategories(),
      window.api.deductions.listEntries(yearId),
      window.api.settings.getSharedCaps(),
      window.api.deductions.getSummary(yearId),
    ]);
    setCategories(cats);
    setSharedCaps(caps);
    setSummary(sums);
    setDrafts(
      Object.fromEntries(
        cats.map((c) => {
          const entry = ents.find((e) => e.categoryId === c.id);
          return [
            c.id,
            {
              amountText: entry ? (entry.amountMinor / 100).toFixed(2) : '',
              countText: entry?.count != null ? String(entry.count) : '',
            },
          ];
        }),
      ),
    );
  }, []);

  useEffect(() => {
    if (yearState.status === 'ready') void reload(yearState.year.id);
  }, [yearState, reload]);

  async function openDrillDown(category: DeductionCategoryRow): Promise<void> {
    if (yearState.status !== 'ready') return;
    setDrillDown({ category, transactions: [], loading: true });
    try {
      const txs = await window.api.deductions.getSourceTransactions(yearState.year.id, category.id);
      setDrillDown({ category, transactions: txs, loading: false });
    } catch {
      setDrillDown({ category, transactions: [], loading: false });
    }
  }

  const summaryMap = useMemo(
    () =>
      new Map<number, CategorySummaryItem>(
        (summary?.items ?? []).map((s) => [s.category.id, s]),
      ),
    [summary],
  );

  // Build live mock entries from drafts for instant real-time computation (manual + linked)
  const liveEntries = useMemo(() => {
    const result: DeductionEntryRow[] = [];
    for (const c of categories) {
      const draft = drafts[c.id];
      const sumItem = summaryMap.get(c.id);
      const manualSatang =
        draft && draft.amountText.trim() !== ''
          ? tryParseBahtToSatang(draft.amountText).ok
            ? (tryParseBahtToSatang(draft.amountText) as { ok: true; satang: number }).satang
            : 0
          : 0;
      const linkedSatang = sumItem?.sourceExpenseMinor ?? 0;
      const totalCombinedSatang = manualSatang + linkedSatang;

      if (totalCombinedSatang > 0 || (draft && draft.countText.trim() !== '')) {
        result.push({
          id: 0,
          taxYearId: yearState.status === 'ready' ? yearState.year.id : 0,
          categoryId: c.id,
          amountMinor: totalCombinedSatang,
          count: draft?.countText?.trim() ? Number(draft.countText) : null,
          updatedAt: '',
        });
      }
    }
    return result;
  }, [categories, drafts, summaryMap, yearState]);

  const computed = useMemo(
    () => computeDeductions(categories, liveEntries, sharedCaps),
    [categories, liveEntries, sharedCaps],
  );

  const sharedGroupById = useMemo(() => new Map(sharedCaps.map((g) => [g.id, g])), [sharedCaps]);

  function updateDraft(categoryId: number, patch: Partial<RowDraft>): void {
    setDrafts((prev) => ({ ...prev, [categoryId]: { ...prev[categoryId], ...patch } }));
  }

  async function handleSave(yearId: number): Promise<void> {
    setBusy(true);
    setFeedback(null);
    try {
      for (const category of categories) {
        const draft = drafts[category.id];
        if (!draft || draft.amountText.trim() === '') {
          continue;
        }
        const amountResult = tryParseBahtToSatang(draft.amountText);
        if (!amountResult.ok) {
          throw new Error(`"${category.name}": ${amountResult.error.message}`);
        }
        const count =
          category.capType === 'per_count' && draft.countText.trim() !== ''
            ? Number(draft.countText)
            : null;
        await window.api.deductions.setEntry({
          taxYearId: yearId,
          categoryId: category.id,
          amountMinor: amountResult.satang,
          count,
        });
      }
      setFeedback({ kind: 'ok', message: '✓ บันทึกค่าลดหย่อนเรียบร้อยแล้ว' });
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

  const yearId = yearState.year.id;
  const isClosed = yearState.year.closedAt != null;

  // Grouping categories into structured sections
  const categorizedIds = new Set<number>();
  const groupedSections = DEDUCTION_GROUPS.map((grp) => {
    const matched = categories.filter((c) => {
      if (categorizedIds.has(c.id)) return false;
      if (grp.matcher(c)) {
        categorizedIds.add(c.id);
        return true;
      }
      return false;
    });
    return { ...grp, items: matched };
  }).filter((grp) => grp.items.length > 0);

  // Remaining categories not matched into main groups
  const otherCategories = categories.filter((c) => !categorizedIds.has(c.id));
  if (otherCategories.length > 0) {
    groupedSections.push({
      id: 'others',
      title: 'ค่าลดหย่อนอื่นๆ',
      icon: '📂',
      matcher: () => true,
      items: otherCategories,
    });
  }

  const rawEnteredTotalMinor = liveEntries.reduce((sum, e) => sum + e.amountMinor, 0);
  const activeEntriesCount = liveEntries.filter((e) => e.amountMinor > 0).length;

  return (
    <div className="page">
      <div className="page-head" style={{ marginBottom: 20 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div>
            <h1>ค่าลดหย่อนภาษี — ปีภาษี {yearState.year.year}</h1>
            <p>
              กรอกรายการค่าลดหย่อนตามจริง ระบบจะคำนวณและจำกัดเพดานสิทธิ์ตามประมวลรัษฎากรอัตโนมัติ (AC-3a)
            </p>
          </div>
          {!isClosed && (
            <button
              type="button"
              className="btn btn-primary"
              style={{ padding: '9px 20px', fontSize: 13.5 }}
              disabled={busy}
              onClick={() => void handleSave(yearId)}
            >
              ✓ บันทึกค่าลดหย่อน
            </button>
          )}
        </div>
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

      {/* Summary Live Calculation Tiles */}
      <div className="tiles" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 22 }}>
        <div
          className="tile"
          style={{
            background: 'var(--surface)',
            border: '1.5px solid var(--accent)',
            boxShadow: '0 2px 8px rgba(52, 80, 201, 0.08)',
          }}
        >
          <div className="k" style={{ color: 'var(--accent)', fontWeight: 600 }}>
            🌟 สิทธิลดหย่อนที่นำไปคำนวณภาษีจริง (Effective)
          </div>
          <div className="v num" style={{ color: 'var(--accent)', fontSize: 24, fontWeight: 700 }}>
            {formatSatangAsBaht(computed.totalMinor)}
          </div>
          <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>
            ยอดรวมหลังหักเพดานรายหมวดและเพดานกลุ่ม
          </div>
        </div>

        <div className="tile">
          <div className="k">ยอดที่กรอกจริงรวม (Raw Total)</div>
          <div className="v num" style={{ fontSize: 22 }}>
            {formatSatangAsBaht(rawEnteredTotalMinor)}
          </div>
          <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>
            {rawEnteredTotalMinor > computed.totalMinor ? (
              <span style={{ color: 'var(--bad)', fontWeight: 500 }}>
                ⚠️ เกินเพดาน {formatSatangAsBaht(rawEnteredTotalMinor - computed.totalMinor)} บาท
              </span>
            ) : (
              'ไม่มียอดเกินเพดาน'
            )}
          </div>
        </div>

        <div className="tile">
          <div className="k">รายการที่ใช้สิทธิ</div>
          <div className="v" style={{ fontSize: 22 }}>
            {activeEntriesCount} <span style={{ fontSize: 14, fontWeight: 400, color: 'var(--ink-soft)' }}>หมวด</span>
          </div>
          <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>
            จากทั้งหมด {categories.length} หมวดหมู่
          </div>
        </div>
      </div>

      {categories.length === 0 ? (
        <div className="empty-state">
          <div className="icon">🧾</div>
          <p>ยังไม่มีหมวดหมู่ค่าลดหย่อน — เพิ่มได้ที่หน้าตั้งค่า</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {groupedSections.map((section) => (
            <div
              className="panel"
              key={section.id}
              style={{
                padding: '0',
                overflow: 'hidden',
                background: 'var(--surface)',
                border: '1px solid var(--line)',
                boxShadow: 'var(--shadow)',
              }}
            >
              {/* Section Header */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '14px 20px',
                  background: 'rgba(0, 0, 0, 0.02)',
                  borderBottom: '1px solid var(--line)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 16 }}>{section.icon}</span>
                  <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>
                    {section.title}
                  </span>
                </div>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 500,
                    color: 'var(--ink-soft)',
                    background: 'var(--surface-2)',
                    padding: '2px 8px',
                    borderRadius: 999,
                  }}
                >
                  {section.items.length} รายการ
                </span>
              </div>

              {/* Section Rows List */}
              <div style={{ padding: '6px 20px' }}>
                {section.items.map((category, index) => {
                  const draft = drafts[category.id] ?? { amountText: '', countText: '' };
                  const sumItem = summaryMap.get(category.id);
                  const perCategory = computed.perCategory.find((p) => p.categoryId === category.id);
                  const group =
                    category.sharedGroupId !== null
                      ? sharedGroupById.get(category.sharedGroupId)
                      : undefined;
                  const groupContribution =
                    category.sharedGroupId !== null
                      ? computed.sharedGroups.find((g) => g.sharedGroupId === category.sharedGroupId)
                      : undefined;
                  const overCap = (perCategory?.cappedByOwnCap ?? false) || (sumItem?.isOverCap ?? false);
                  const hasValue =
                    (draft.amountText.trim() !== '' && draft.amountText !== '0' && draft.amountText !== '0.00') ||
                    (sumItem ? sumItem.sourceExpenseMinor > 0 : false);
                  const hasLinkedExpenses = sumItem ? sumItem.sourceExpenseMinor > 0 : false;

                  return (
                    <div
                      key={category.id}
                      style={{
                        display: 'grid',
                        gridTemplateColumns:
                          category.capType === 'per_count' ? '1fr 140px 190px' : '1fr 190px',
                        gap: 16,
                        alignItems: 'center',
                        padding: '14px 0',
                        borderBottom:
                          index < section.items.length - 1 ? '1px solid var(--line)' : 'none',
                        background: overCap ? 'var(--bad-soft)' : 'transparent',
                        margin: overCap ? '4px -12px' : '0',
                        paddingLeft: overCap ? '12px' : '0',
                        paddingRight: overCap ? '12px' : '0',
                        borderRadius: overCap ? 8 : 0,
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 600, fontSize: 14.5, color: 'var(--ink)' }}>
                            {category.name}
                          </span>
                          {hasValue && !overCap && (
                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: 600,
                                color: 'var(--good)',
                                background: 'var(--good-soft)',
                                padding: '1px 6px',
                                borderRadius: 4,
                              }}
                            >
                              ✓ ใช้สิทธิ
                            </span>
                          )}
                          {hasLinkedExpenses && (
                            <button
                              type="button"
                              onClick={() => void openDrillDown(category)}
                              style={{
                                fontSize: 11,
                                fontWeight: 600,
                                color: 'var(--accent)',
                                background: 'var(--accent-soft)',
                                border: 'none',
                                padding: '2px 8px',
                                borderRadius: 4,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                              }}
                            >
                              📥 ลิงก์จากรายจ่าย {formatSatangAsBaht(sumItem?.sourceExpenseMinor ?? 0)} บาท ({sumItem?.sourceExpenseCount} รายการ) 🔍 ดูรายการ
                            </button>
                          )}
                        </div>
                        <div className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>
                          {capDescription(category, group)}
                        </div>
                        {category.description && (
                          <div className="muted" style={{ fontSize: 11.5, marginTop: 2, opacity: 0.8 }}>
                            {category.description}
                          </div>
                        )}
                        {hasLinkedExpenses && (
                          <div className="muted" style={{ fontSize: 11.5, marginTop: 4, color: 'var(--ink-soft)' }}>
                            💡 ยอดรวมก่อนเพดาน: <strong>{formatSatangAsBaht((sumItem?.sourceExpenseMinor ?? 0) + (tryParseBahtToSatang(draft.amountText).ok ? (tryParseBahtToSatang(draft.amountText) as { ok: true; satang: number }).satang : 0))} บาท</strong>
                            {draft.amountText.trim() !== '' && draft.amountText !== '0' && ` (รายจ่าย ${formatSatangAsBaht(sumItem?.sourceExpenseMinor ?? 0)} + กรอกตรงนี้ ${draft.amountText})`}
                          </div>
                        )}
                        {overCap && (
                          <div
                            style={{
                              fontSize: 12,
                              color: 'var(--bad)',
                              fontWeight: 600,
                              marginTop: 4,
                            }}
                          >
                            ⚠️ ยอดรวมเกินเพดาน {sumItem?.overCapMinor ? `(ส่วนเกิน ${formatSatangAsBaht(sumItem.overCapMinor)} บาท)` : ''} — สิทธิที่นำไปคำนวณจริงคือ{' '}
                            {formatSatangAsBaht(sumItem?.effectiveMinor ?? perCategory?.effectiveMinor ?? 0)} บาท
                          </div>
                        )}
                        {category.capType === 'shared_group_member' &&
                          groupContribution &&
                          group && (
                            <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>
                              📊 ยอดรวมกลุ่ม &quot;{group.name}&quot;: {formatSatangAsBaht(groupContribution.rawTotalMinor)} / เพดานกลุ่ม {formatSatangAsBaht(group.capAmountMinor)} บาท
                            </div>
                          )}
                      </div>

                      {/* Per-count input field */}
                      {category.capType === 'per_count' && (
                        <div className="field">
                          <label style={{ fontSize: 11.5, color: 'var(--ink-soft)' }}>
                            จำนวน (คน/รายการ)
                          </label>
                          <input
                            type="text"
                            inputMode="numeric"
                            className="num"
                            disabled={isClosed}
                            style={{
                              textAlign: 'center',
                              background: 'var(--surface)',
                            }}
                            value={draft.countText}
                            placeholder="1"
                            onChange={(e) =>
                              updateDraft(category.id, { countText: e.target.value })
                            }
                          />
                        </div>
                      )}

                      {/* Amount input field */}
                      <div className="field">
                        <label style={{ fontSize: 11.5, color: 'var(--ink-soft)' }}>
                          {hasLinkedExpenses ? '✍️ กรอกเพิ่ม/ยอดตรงนี้ (บาท)' : 'จำนวนเงิน (บาท)'}
                        </label>
                        <input
                          type="text"
                          inputMode="decimal"
                          className="num"
                          disabled={isClosed}
                          style={{
                            textAlign: 'right',
                            fontWeight: 600,
                            background: 'var(--surface)',
                            borderColor: overCap ? 'var(--bad)' : undefined,
                          }}
                          value={draft.amountText}
                          placeholder={hasLinkedExpenses ? '0.00 (ยอดเพิ่ม)' : '0.00'}
                          onChange={(e) =>
                            updateDraft(category.id, { amountText: e.target.value })
                          }
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {!isClosed && (
            <div className="form-actions" style={{ marginTop: 12 }}>
              <button
                type="button"
                className="btn btn-primary"
                style={{ padding: '10px 24px', fontSize: 14, fontWeight: 600 }}
                disabled={busy}
                onClick={() => void handleSave(yearId)}
              >
                ✓ บันทึกค่าลดหย่อนทั้งหมด
              </button>
            </div>
          )}
        </div>
      )}

      {/* Drill-down Modal for Linked Source Expenses */}
      {drillDown && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.65)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 1000,
            padding: 20,
          }}
          onClick={() => setDrillDown(null)}
        >
          <div
            className="panel"
            style={{
              maxWidth: 700,
              width: '100%',
              maxHeight: '85vh',
              overflowY: 'auto',
              background: 'var(--surface)',
              border: '1px solid var(--line)',
              boxShadow: '0 8px 30px rgba(0,0,0,0.3)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 16,
                borderBottom: '1px solid var(--line)',
                paddingBottom: 12,
              }}
            >
              <div>
                <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>
                  🔍 รายการรายจ่ายที่เชื่อมโยง: {drillDown.category.name}
                </h2>
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                  รายการรายจ่ายที่ถูกแท็กหมวดลดหย่อนนี้จากเมนู &quot;บันทึกรายรับ-รายจ่าย&quot;
                </div>
              </div>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ padding: '4px 10px', fontSize: 14 }}
                onClick={() => setDrillDown(null)}
              >
                ✕ ปิด
              </button>
            </div>

            {drillDown.loading ? (
              <p className="muted">กำลังโหลดรายการ...</p>
            ) : drillDown.transactions.length === 0 ? (
              <div className="empty-state" style={{ padding: '30px 0' }}>
                <p className="muted">ไม่พบรายการรายจ่ายที่เชื่อมโยงกับหมวดนี้</p>
              </div>
            ) : (
              <>
                <table>
                  <thead>
                    <tr>
                      <th>วันที่</th>
                      <th>ประเภท/หมวดหมู่</th>
                      <th>ผู้รับเงิน/แหล่งที่มา</th>
                      <th>หมายเหตุ</th>
                      <th className="num">ยอดรายการ</th>
                      <th className="num">ยอดลดหย่อน</th>
                    </tr>
                  </thead>
                  <tbody>
                    {drillDown.transactions.map((tx) => (
                      <tr key={tx.id}>
                        <td>{tx.date}</td>
                        <td>
                          <span
                            className="tag"
                            style={{
                              background: tx.taxRelevant ? 'var(--accent-soft)' : 'var(--amber-soft)',
                              color: tx.taxRelevant ? 'var(--accent)' : 'var(--amber)',
                            }}
                          >
                            {tx.taxRelevant ? 'รายการภาษี' : 'รายการทั่วไป'}
                          </span>
                        </td>
                        <td>{tx.sourcePayer ?? '—'}</td>
                        <td>{tx.note ?? '—'}</td>
                        <td className="num">{formatSatangAsBaht(tx.amountMinor)}</td>
                        <td className="num" style={{ fontWeight: 600, color: 'var(--accent)' }}>
                          {formatSatangAsBaht(tx.deductionAmountMinor ?? tx.amountMinor)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={4} style={{ fontWeight: 700, textAlign: 'right' }}>
                        ยอดรวมทั้งหมด ({drillDown.transactions.length} รายการ):
                      </td>
                      <td className="num" style={{ fontWeight: 600 }}>
                        {formatSatangAsBaht(
                          drillDown.transactions.reduce((sum, t) => sum + t.amountMinor, 0),
                        )}
                      </td>
                      <td className="num" style={{ fontWeight: 700, color: 'var(--accent)' }}>
                        {formatSatangAsBaht(
                          drillDown.transactions.reduce(
                            (sum, t) => sum + (t.deductionAmountMinor ?? t.amountMinor),
                            0,
                          ),
                        )}
                      </td>
                    </tr>
                  </tfoot>
                </table>

                <div className="form-actions" style={{ marginTop: 20 }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => setDrillDown(null)}
                  >
                    ปิดหน้าต่าง
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
