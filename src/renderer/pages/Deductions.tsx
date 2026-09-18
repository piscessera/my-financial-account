import { useCallback, useEffect, useMemo, useState } from 'react';

import { computeDeductions } from '../../main/calc/deductions';
import { formatSatangAsBaht, tryParseBahtToSatang } from '../../main/calc/money';
import type { DeductionCategoryRow, DeductionEntryRow, SharedCapRow } from '../../main/db/schema';
import { useWorkingTaxYear } from '../lib/useWorkingTaxYear';

const CAP_TYPE_LABELS: Record<DeductionCategoryRow['capType'], string> = {
  fixed: 'คงที่',
  per_count: 'นับตามจำนวนคน',
  shared_group_member: 'รวมเพดานกลุ่ม',
};

function capDescription(category: DeductionCategoryRow, group: SharedCapRow | undefined): string {
  if (category.capType === 'fixed') {
    return `${CAP_TYPE_LABELS.fixed} — ${formatSatangAsBaht(category.capAmountMinor ?? 0)} บาท`;
  }
  if (category.capType === 'per_count') {
    return `${CAP_TYPE_LABELS.per_count} — คนละ ${formatSatangAsBaht(category.capAmountMinor ?? 0)} บาท`;
  }
  const subCap = category.capAmountMinor !== null ? ` · sub-cap ตัวเอง ${formatSatangAsBaht(category.capAmountMinor)}` : '';
  return `${CAP_TYPE_LABELS.shared_group_member}${group ? ` (${group.name})` : ''} เพดานรวม ${
    group ? formatSatangAsBaht(group.capAmountMinor) : '—'
  }${subCap}`;
}

interface RowDraft {
  readonly amountText: string;
  readonly countText: string;
}

/**
 * Deductions screen (AT-3.5) — PROTO-0001 `deductions.html`. The mockup groups categories
 * under semantic headings ("ส่วนบุคคลและครอบครัว", …) that have no field in the schema
 * (`deduction_categories` has no group-label column, only `sort_order`) — this renders one
 * flat list, sorted the same way `listCategories` already orders them, rather than inventing
 * grouping data that isn't there.
 */
export default function Deductions(): JSX.Element {
  const yearState = useWorkingTaxYear();
  const [categories, setCategories] = useState<DeductionCategoryRow[]>([]);
  const [entries, setEntries] = useState<DeductionEntryRow[]>([]);
  const [sharedCaps, setSharedCaps] = useState<SharedCapRow[]>([]);
  const [drafts, setDrafts] = useState<Record<number, RowDraft>>({});
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'error'; message: string } | null>(null);

  const reload = useCallback(async (yearId: number) => {
    const [cats, ents, caps] = await Promise.all([
      window.api.deductions.listCategories(),
      window.api.deductions.listEntries(yearId),
      window.api.settings.getSharedCaps(),
    ]);
    setCategories(cats);
    setEntries(ents);
    setSharedCaps(caps);
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

  const computed = useMemo(() => computeDeductions(categories, entries, sharedCaps), [categories, entries, sharedCaps]);
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
        if (!draft || draft.amountText.trim() === '') continue;
        const amountResult = tryParseBahtToSatang(draft.amountText);
        if (!amountResult.ok) {
          throw new Error(`"${category.name}": ${amountResult.error.message}`);
        }
        const count = category.capType === 'per_count' && draft.countText.trim() !== '' ? Number(draft.countText) : null;
        await window.api.deductions.setEntry({
          taxYearId: yearId,
          categoryId: category.id,
          amountMinor: amountResult.satang,
          count,
        });
      }
      setFeedback({ kind: 'ok', message: 'บันทึกค่าลดหย่อนเรียบร้อยแล้ว' });
      await reload(yearId);
    } catch (err) {
      setFeedback({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  if (yearState.status === 'loading') return <div className="page">กำลังโหลด...</div>;
  if (yearState.status === 'error') return <div className="page" role="alert">{yearState.message}</div>;

  const yearId = yearState.year.id;

  return (
    <div className="page">
      <div className="page-head">
        <h1>ค่าลดหย่อนภาษี — ปีภาษี {yearState.year.year}</h1>
        <p>เพดานแต่ละช่องมี 3 รูปแบบ (AC-3a): คงที่ / คูณตามจำนวนคน / รวมเพดานข้ามหลายช่อง</p>
      </div>

      {feedback && (
        <p role={feedback.kind === 'error' ? 'alert' : 'status'} className="muted">
          {feedback.message}
        </p>
      )}

      {categories.length === 0 ? (
        <div className="empty-state">
          <div className="icon">🧾</div>
          <p>ยังไม่มีหมวดหมู่ค่าลดหย่อน — เพิ่มได้ที่หน้าตั้งค่า</p>
        </div>
      ) : (
        <div className="panel">
          {categories.map((category) => {
            const draft = drafts[category.id] ?? { amountText: '', countText: '' };
            const perCategory = computed.perCategory.find((p) => p.categoryId === category.id);
            const group = category.sharedGroupId !== null ? sharedGroupById.get(category.sharedGroupId) : undefined;
            const groupContribution =
              category.sharedGroupId !== null
                ? computed.sharedGroups.find((g) => g.sharedGroupId === category.sharedGroupId)
                : undefined;
            const overCap = perCategory?.cappedByOwnCap ?? false;

            return (
              <div className="ded-row" key={category.id}>
                <div>
                  <div className="ded-name">{category.name}</div>
                  <div className="ded-cap">{capDescription(category, group)}</div>
                </div>
                <div className="muted" style={overCap ? { color: 'var(--bad)' } : undefined}>
                  {overCap && 'เกินเพดาน — '}
                  {category.capType === 'per_count' ? (
                    <>
                      จำนวนคน:{' '}
                      <input
                        className="ded-input num"
                        style={{ width: 44, textAlign: 'center', display: 'inline-block' }}
                        value={draft.countText}
                        onChange={(e) => updateDraft(category.id, { countText: e.target.value })}
                      />
                    </>
                  ) : category.capType === 'shared_group_member' && groupContribution ? (
                    `กลุ่ม: ${formatSatangAsBaht(groupContribution.rawTotalMinor)} / ${formatSatangAsBaht(group?.capAmountMinor ?? 0)}`
                  ) : (
                    '–'
                  )}
                </div>
                <input
                  className="ded-input num"
                  style={overCap ? { borderColor: 'var(--bad)', background: 'var(--bad-soft)', color: 'var(--bad)' } : undefined}
                  value={draft.amountText}
                  placeholder="0.00"
                  onChange={(e) => updateDraft(category.id, { amountText: e.target.value })}
                />
              </div>
            );
          })}

          <div className="form-actions">
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void handleSave(yearId)}>
              บันทึกค่าลดหย่อน
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
