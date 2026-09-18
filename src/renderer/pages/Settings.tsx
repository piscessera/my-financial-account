import { useCallback, useEffect, useState } from 'react';

import { formatSatangAsBaht, tryParseBahtToSatang } from '../../main/calc/money';
import type { CapType, DeductionCategoryRow, SharedCapRow, TaxBracketRow } from '../../main/db/schema';
import type { DataLocationInfo } from '../../main/dataLocation';

const CAP_TYPE_LABELS: Record<CapType, string> = {
  fixed: 'คงที่',
  per_count: 'นับจำนวนคน',
  shared_group_member: 'รวมกลุ่ม',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
}

function formatBracketRange(bracket: TaxBracketRow): string {
  const lower = formatSatangAsBaht(bracket.lowerBoundMinor, { grouping: true });
  if (bracket.upperBoundMinor === null) return `${lower} ขึ้นไป`;
  return `${lower} – ${formatSatangAsBaht(bracket.upperBoundMinor)}`;
}

interface CategoryEditState {
  readonly id: number;
  readonly name: string;
  readonly capAmountText: string;
}

interface BracketEditState {
  readonly id: number;
  readonly rateText: string;
}

interface NewCategoryState {
  readonly name: string;
  readonly capType: CapType;
  readonly capAmountText: string;
  readonly sharedGroupId: number | null;
  readonly description: string;
}

const BLANK_NEW_CATEGORY: NewCategoryState = {
  name: '',
  capType: 'fixed',
  capAmountText: '',
  sharedGroupId: null,
  description: '',
};

/**
 * Settings screen (AT-3.6) — PROTO-0001 `settings.html`. The mockup's "+ add category" example
 * (a brand-new shared group, "Easy e-Receipt 2569") assumes creating a shared-cap *group* too,
 * but ANA-0001's `settings` API has no `createSharedCap` — only `updateSharedCap` on an
 * existing one. Adding a `shared_group_member` category here can only attach to an *existing*
 * group; creating a new group is out of this screen's (and the design's) scope.
 */
export default function Settings(): JSX.Element {
  const [dataLocation, setDataLocation] = useState<DataLocationInfo | null>(null);
  const [categories, setCategories] = useState<DeductionCategoryRow[]>([]);
  const [sharedCaps, setSharedCaps] = useState<SharedCapRow[]>([]);
  const [brackets, setBrackets] = useState<TaxBracketRow[]>([]);
  const [editingCategory, setEditingCategory] = useState<CategoryEditState | null>(null);
  const [editingBracket, setEditingBracket] = useState<BracketEditState | null>(null);
  const [addingCategory, setAddingCategory] = useState<NewCategoryState | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'error'; message: string } | null>(null);

  const reload = useCallback(async () => {
    const [info, caps, groups, bracketRows] = await Promise.all([
      window.api.dataLocation.get(),
      window.api.settings.getCaps(),
      window.api.settings.getSharedCaps(),
      window.api.settings.getBrackets(),
    ]);
    setDataLocation(info);
    setCategories(caps);
    setSharedCaps(groups);
    setBrackets(bracketRows);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  function sharedGroupName(id: number | null): string {
    if (id === null) return '';
    return sharedCaps.find((g) => g.id === id)?.name ?? `กลุ่ม #${id}`;
  }

  async function handleSaveCategoryEdit(): Promise<void> {
    if (!editingCategory) return;
    setBusy(true);
    setFeedback(null);
    try {
      const amountResult = tryParseBahtToSatang(editingCategory.capAmountText || '0');
      if (!amountResult.ok) throw new Error(amountResult.error.message);
      await window.api.settings.updateCategory(editingCategory.id, {
        name: editingCategory.name,
        capAmountMinor: editingCategory.capAmountText.trim() === '' ? null : amountResult.satang,
      });
      setEditingCategory(null);
      setFeedback({ kind: 'ok', message: 'บันทึกการเปลี่ยนแปลงเรียบร้อยแล้ว' });
      await reload();
    } catch (err) {
      setFeedback({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleActive(category: DeductionCategoryRow): Promise<void> {
    setFeedback(null);
    try {
      await window.api.settings.setCategoryActive(category.id, !category.isActive);
      await reload();
    } catch (err) {
      setFeedback({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  }

  async function handleAddCategory(): Promise<void> {
    if (!addingCategory) return;
    setBusy(true);
    setFeedback(null);
    try {
      if (addingCategory.name.trim() === '') throw new Error('กรุณาระบุชื่อหมวดหมู่');
      const needsAmount = addingCategory.capType !== 'shared_group_member';
      let capAmountMinor: number | null = null;
      if (addingCategory.capAmountText.trim() !== '') {
        const amountResult = tryParseBahtToSatang(addingCategory.capAmountText);
        if (!amountResult.ok) throw new Error(amountResult.error.message);
        capAmountMinor = amountResult.satang;
      } else if (needsAmount) {
        throw new Error('กรุณาระบุค่าเพดาน');
      }
      if (addingCategory.capType === 'shared_group_member' && addingCategory.sharedGroupId === null) {
        throw new Error('กรุณาเลือกกลุ่มที่จะรวมเพดานด้วย');
      }

      await window.api.settings.createCategory({
        code: addingCategory.name.trim().toLowerCase().replace(/\s+/g, '_'),
        name: addingCategory.name.trim(),
        capType: addingCategory.capType,
        capAmountMinor,
        sharedGroupId: addingCategory.capType === 'shared_group_member' ? addingCategory.sharedGroupId : null,
        description: addingCategory.description.trim(),
      });
      setAddingCategory(null);
      setFeedback({ kind: 'ok', message: 'เพิ่มหมวดหมู่เรียบร้อยแล้ว' });
      await reload();
    } catch (err) {
      setFeedback({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveBracketEdit(): Promise<void> {
    if (!editingBracket) return;
    setBusy(true);
    setFeedback(null);
    try {
      const rate = Number(editingBracket.rateText);
      if (!Number.isFinite(rate) || rate < 0 || rate > 100) throw new Error('กรุณาระบุอัตราภาษีเป็นเปอร์เซ็นต์ 0-100');
      await window.api.settings.updateBracket(editingBracket.id, Math.round(rate * 100));
      setEditingBracket(null);
      setFeedback({ kind: 'ok', message: 'บันทึกอัตราภาษีเรียบร้อยแล้ว' });
      await reload();
    } catch (err) {
      setFeedback({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1>ตั้งค่า</h1>
        <p>
          แก้ไขเพดานค่าลดหย่อนและอัตราภาษีขั้นบันได (AC-11) — มีผลกับปีภาษีที่ &quot;เปิด&quot;
          อยู่เท่านั้น ทุกการแก้ไขถูกบันทึกไว้
        </p>
      </div>

      {feedback && (
        <p role={feedback.kind === 'error' ? 'alert' : 'status'} className="muted">
          {feedback.message}
        </p>
      )}

      <div className="panel">
        <div className="section-label">ที่จัดเก็บข้อมูล (AC-19)</div>
        {dataLocation ? (
          <>
            <div className="field span2">
              <label>โฟลเดอร์ปัจจุบัน</label>
              <div className="control num" style={{ fontSize: 13 }}>
                {dataLocation.dbFilePath}
              </div>
            </div>
            <div className="muted" style={{ marginTop: 10 }}>
              แก้ไขล่าสุด: {formatDate(dataLocation.lastModified)} · ขนาดไฟล์{' '}
              {(dataLocation.sizeBytes / (1024 * 1024)).toFixed(1)} MB
            </div>
            <div className="muted" style={{ marginTop: 4 }}>
              ไม่มีปุ่ม &quot;ซิงค์&quot; ในแอปนี้ — Google Drive Desktop จะซิงค์โฟลเดอร์นี้ให้อัตโนมัติอยู่เบื้องหลัง
              แอปไม่ได้เชื่อมต่อ Google Drive โดยตรง
            </div>
          </>
        ) : (
          <p className="muted">กำลังโหลด...</p>
        )}
      </div>

      <div className="panel" style={{ marginTop: 20 }}>
        <div
          className="section-label"
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}
        >
          <span>เพดานค่าลดหย่อน</span>
          <button
            type="button"
            className="btn btn-primary"
            style={{ padding: '8px 14px', fontSize: 13 }}
            onClick={() => setAddingCategory(BLANK_NEW_CATEGORY)}
          >
            + เพิ่มหมวดหมู่ใหม่
          </button>
        </div>
        <table>
          <thead>
            <tr>
              <th>หมวด</th>
              <th>รูปแบบเพดาน</th>
              <th>ค่าเพดาน</th>
              <th>สถานะ</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {categories.map((category) => (
              <tr key={category.id}>
                <td>{category.name}</td>
                <td>
                  <span className="muted">
                    {CAP_TYPE_LABELS[category.capType]}
                    {category.capType === 'shared_group_member' ? ` (${sharedGroupName(category.sharedGroupId)})` : ''}
                  </span>
                </td>
                <td className="num">{category.capAmountMinor !== null ? formatSatangAsBaht(category.capAmountMinor) : '—'}</td>
                <td>
                  <span className={`pill ${category.isActive ? 'active' : 'voided'}`}>
                    {category.isActive ? 'ใช้งานอยู่' : 'เก็บถาวรแล้ว'}
                  </span>
                </td>
                <td>
                  {category.isActive ? (
                    <button
                      type="button"
                      className="row-action"
                      onClick={() =>
                        setEditingCategory({
                          id: category.id,
                          name: category.name,
                          capAmountText: category.capAmountMinor !== null ? (category.capAmountMinor / 100).toFixed(2) : '',
                        })
                      }
                    >
                      แก้ไข
                    </button>
                  ) : (
                    <button type="button" className="row-action" onClick={() => void handleToggleActive(category)}>
                      เปิดใช้อีกครั้ง
                    </button>
                  )}
                  {category.isActive && (
                    <button type="button" className="row-action muted" onClick={() => void handleToggleActive(category)}>
                      เก็บถาวร
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="muted" style={{ marginTop: 10 }}>
          หมวดหมู่ที่ &quot;เก็บถาวรแล้ว&quot; จะไม่ปรากฏเป็นตัวเลือกใหม่ในหน้าค่าลดหย่อนของปีที่เปิดอยู่
          แต่ปีภาษีที่เคยใช้อยู่แล้วจะยังเห็นข้อมูลและคำนวณเหมือนเดิมทุกประการ (AC-17)
        </div>
      </div>

      {editingCategory && (
        <div className="panel" style={{ marginTop: 20 }}>
          <div className="section-label">กำลังแก้ไข: {editingCategory.name} (AC-11 — แก้ได้ทั้งชื่อและเพดาน)</div>
          <div className="form-grid">
            <div className="field span2">
              <label>ชื่อหมวดหมู่</label>
              <input
                type="text"
                value={editingCategory.name}
                onChange={(e) => setEditingCategory({ ...editingCategory, name: e.target.value })}
              />
            </div>
            <div className="field">
              <label>ค่าเพดานใหม่ (บาท)</label>
              <input
                type="text"
                inputMode="decimal"
                value={editingCategory.capAmountText}
                onChange={(e) => setEditingCategory({ ...editingCategory, capAmountText: e.target.value })}
              />
            </div>
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setEditingCategory(null)}>
              ยกเลิก
            </button>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void handleSaveCategoryEdit()}>
              บันทึกการเปลี่ยนแปลง
            </button>
          </div>
        </div>
      )}

      {addingCategory && (
        <div className="panel" style={{ marginTop: 20 }}>
          <div className="section-label">+ เพิ่มหมวดหมู่ค่าลดหย่อนใหม่ (AC-16)</div>
          <div className="form-grid">
            <div className="field span2">
              <label>ชื่อหมวดหมู่</label>
              <input
                type="text"
                value={addingCategory.name}
                onChange={(e) => setAddingCategory({ ...addingCategory, name: e.target.value })}
              />
            </div>
            <div className="field span2">
              <label>รูปแบบเพดาน</label>
              <div className="chip-row">
                {(['fixed', 'per_count', 'shared_group_member'] as CapType[]).map((capType) => (
                  <button
                    type="button"
                    key={capType}
                    className={`chip${addingCategory.capType === capType ? ' active' : ''}`}
                    onClick={() => setAddingCategory({ ...addingCategory, capType })}
                  >
                    {CAP_TYPE_LABELS[capType]}
                  </button>
                ))}
              </div>
            </div>
            {addingCategory.capType === 'shared_group_member' && (
              <div className="field">
                <label>กลุ่มที่จะรวมเพดานด้วย</label>
                <select
                  value={addingCategory.sharedGroupId ?? ''}
                  onChange={(e) =>
                    setAddingCategory({ ...addingCategory, sharedGroupId: e.target.value === '' ? null : Number(e.target.value) })
                  }
                >
                  <option value="">— เลือกกลุ่ม —</option>
                  {sharedCaps.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="field">
              <label>{addingCategory.capType === 'shared_group_member' ? 'sub-cap ของตัวเอง (ถ้ามี)' : 'ค่าเพดาน (บาท)'}</label>
              <input
                type="text"
                inputMode="decimal"
                value={addingCategory.capAmountText}
                onChange={(e) => setAddingCategory({ ...addingCategory, capAmountText: e.target.value })}
              />
            </div>
            <div className="field">
              <label>คำอธิบาย/อ้างอิงกฎหมาย (ถ้ามี)</label>
              <input
                type="text"
                value={addingCategory.description}
                onChange={(e) => setAddingCategory({ ...addingCategory, description: e.target.value })}
              />
            </div>
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setAddingCategory(null)}>
              ยกเลิก
            </button>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void handleAddCategory()}>
              เพิ่มหมวดหมู่
            </button>
          </div>
        </div>
      )}

      <div className="panel" style={{ marginTop: 20 }}>
        <div className="section-label">อัตราภาษีขั้นบันได</div>
        {brackets.length === 0 ? (
          <p className="muted">ยังไม่มีข้อมูลอัตราภาษี — รอข้อมูลอ้างอิง TAX-2025</p>
        ) : (
          <table className="bracket-table">
            <thead>
              <tr>
                <th>ช่วงเงินได้สุทธิ (บาท)</th>
                <th>อัตรา</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {brackets.map((bracket) => (
                <tr key={bracket.id}>
                  <td>{formatBracketRange(bracket)}</td>
                  <td>{bracket.rateBp === 0 ? 'ยกเว้น' : `${(bracket.rateBp / 100).toFixed(0)}%`}</td>
                  <td>
                    <button
                      type="button"
                      className="row-action"
                      onClick={() => setEditingBracket({ id: bracket.id, rateText: (bracket.rateBp / 100).toFixed(0) })}
                    >
                      แก้ไข
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editingBracket && (
        <div className="panel" style={{ marginTop: 20 }}>
          <div className="section-label">กำลังแก้ไขอัตราภาษี</div>
          <div className="form-grid">
            <div className="field">
              <label>อัตราภาษีใหม่ (%)</label>
              <input
                type="text"
                inputMode="decimal"
                value={editingBracket.rateText}
                onChange={(e) => setEditingBracket({ ...editingBracket, rateText: e.target.value })}
              />
            </div>
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setEditingBracket(null)}>
              ยกเลิก
            </button>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void handleSaveBracketEdit()}>
              บันทึกการเปลี่ยนแปลง
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
