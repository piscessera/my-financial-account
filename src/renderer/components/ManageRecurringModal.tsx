import { useEffect, useState } from 'react';

import { formatSatangAsBaht, tryParseBahtToSatang } from '../../main/calc/money';
import type {
  GeneralCategory,
  RecurringTemplateRow,
  TransactionKind,
} from '../../main/db/schema';

const GENERAL_CATEGORY_LABELS: Record<GeneralCategory, string> = {
  food: 'อาหารและเครื่องดื่ม',
  shopping: 'ช้อปปิ้ง/ของใช้',
  housing: 'ที่อยู่อาศัย/สาธารณูปโภค',
  other: 'อื่นๆ',
};

interface ManageRecurringModalProps {
  readonly onClose: () => void;
  readonly onUpdated: () => void;
}

interface TemplateFormState {
  readonly id?: number;
  readonly name: string;
  readonly kind: TransactionKind;
  readonly generalCategory: GeneralCategory;
  readonly dueDayText: string;
  readonly defaultAmountText: string;
  readonly defaultNote: string;
}

const BLANK_FORM: TemplateFormState = {
  name: '',
  kind: 'expense',
  generalCategory: 'housing',
  dueDayText: '1',
  defaultAmountText: '',
  defaultNote: '',
};

export default function ManageRecurringModal({
  onClose,
  onUpdated,
}: ManageRecurringModalProps): JSX.Element {
  const [templates, setTemplates] = useState<RecurringTemplateRow[]>([]);
  const [editingForm, setEditingForm] = useState<TemplateFormState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadTemplates(): Promise<void> {
    try {
      const list = await window.api.recurring.listTemplates(true);
      setTemplates(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  useEffect(() => {
    void loadTemplates();
  }, []);

  async function handleSaveTemplate(): Promise<void> {
    if (!editingForm) return;
    setBusy(true);
    setError(null);
    try {
      if (!editingForm.name.trim()) throw new Error('กรุณาระบุชื่อรายการ');
      const dueDay = Number(editingForm.dueDayText);
      if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) {
        throw new Error('กรุณาระบุวันที่ทำรายการเป็นตัวเลข 1 - 31');
      }

      let defaultAmountMinor: number | null = null;
      if (editingForm.defaultAmountText.trim() !== '') {
        const parsed = tryParseBahtToSatang(editingForm.defaultAmountText);
        if (!parsed.ok) throw new Error(parsed.error.message);
        defaultAmountMinor = parsed.satang;
      }

      if (editingForm.id) {
        await window.api.recurring.updateTemplate(editingForm.id, {
          name: editingForm.name.trim(),
          kind: editingForm.kind,
          generalCategory: editingForm.generalCategory,
          dueDay,
          defaultAmountMinor,
          defaultNote: editingForm.defaultNote.trim(),
        });
      } else {
        await window.api.recurring.createTemplate({
          name: editingForm.name.trim(),
          kind: editingForm.kind,
          generalCategory: editingForm.generalCategory,
          dueDay,
          defaultAmountMinor,
          defaultNote: editingForm.defaultNote.trim(),
        });
      }

      setEditingForm(null);
      await loadTemplates();
      onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleActive(template: RecurringTemplateRow): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await window.api.recurring.setTemplateActive(template.id, !template.isActive);
      await loadTemplates();
      onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: number): Promise<void> {
    if (!window.confirm('ต้องการลบแม่แบบรายการประจำนี้หรือไม่?')) return;
    setBusy(true);
    setError(null);
    try {
      await window.api.recurring.deleteTemplate(id);
      await loadTemplates();
      onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.45)',
        backdropFilter: 'blur(3px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        className="panel"
        style={{
          width: '100%',
          maxWidth: 680,
          maxHeight: '90vh',
          overflowY: 'auto',
          background: 'var(--surface)',
          borderRadius: 14,
          boxShadow: 'var(--shadow)',
          border: '1px solid var(--line)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 16,
          }}
        >
          <h2 style={{ margin: 0, fontSize: 18, color: 'var(--ink)' }}>⚙️ จัดการแม่แบบรายการประจำ</h2>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ padding: '4px 10px', fontSize: 13, border: '1px solid var(--line)' }}
            onClick={onClose}
          >
            ✕ ปิด
          </button>
        </div>

        {error && (
          <div
            style={{
              padding: '8px 12px',
              background: 'var(--bad-soft)',
              borderLeft: '4px solid var(--bad)',
              borderRadius: 6,
              color: 'var(--bad)',
              fontSize: 13,
              marginBottom: 14,
            }}
          >
            {error}
          </div>
        )}

        {!editingForm ? (
          <>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 12,
              }}
            >
              <span className="muted" style={{ fontSize: 13 }}>
                รายการทั้งหมด ({templates.length} รายการ)
              </span>
              <button
                type="button"
                className="btn btn-primary"
                style={{ padding: '6px 12px', fontSize: 13 }}
                onClick={() => setEditingForm(BLANK_FORM)}
              >
                + เพิ่มแม่แบบใหม่
              </button>
            </div>

            {templates.length === 0 ? (
              <p className="muted" style={{ textAlign: 'center', padding: '24px 0' }}>
                ยังไม่มีแม่แบบรายการประจำ กดปุ่ม &quot;+ เพิ่มแม่แบบใหม่&quot; เพื่อเริ่มต้น
              </p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>วันที่</th>
                    <th>ชื่อรายการ</th>
                    <th>หมวด</th>
                    <th>ยอดตั้งต้น</th>
                    <th>สถานะ</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {templates.map((t) => (
                    <tr key={t.id}>
                      <td style={{ fontWeight: 600 }}>ทุกวันที่ {t.dueDay}</td>
                      <td>
                        <div>{t.name}</div>
                        {t.defaultNote && (
                          <div className="muted" style={{ fontSize: 11 }}>
                            {t.defaultNote}
                          </div>
                        )}
                      </td>
                      <td>
                        <span className="muted">
                          {t.kind === 'income' ? '🟢 รายได้' : '🔴 รายจ่าย'} ·{' '}
                          {GENERAL_CATEGORY_LABELS[t.generalCategory]}
                        </span>
                      </td>
                      <td className="num">
                        {t.defaultAmountMinor != null
                          ? formatSatangAsBaht(t.defaultAmountMinor)
                          : '—'}
                      </td>
                      <td>
                        <span className={`pill ${t.isActive ? 'active' : 'voided'}`}>
                          {t.isActive ? 'เปิดใช้' : 'ปิด'}
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="row-action"
                          onClick={() =>
                            setEditingForm({
                              id: t.id,
                              name: t.name,
                              kind: t.kind,
                              generalCategory: t.generalCategory,
                              dueDayText: String(t.dueDay),
                              defaultAmountText:
                                t.defaultAmountMinor != null
                                  ? (t.defaultAmountMinor / 100).toFixed(2)
                                  : '',
                              defaultNote: t.defaultNote || '',
                            })
                          }
                        >
                          แก้ไข
                        </button>
                        <button
                          type="button"
                          className="row-action muted"
                          onClick={() => void handleToggleActive(t)}
                        >
                          {t.isActive ? 'ปิดใช้' : 'เปิดใช้'}
                        </button>
                        <button
                          type="button"
                          className="row-action muted"
                          style={{ color: '#ef4444' }}
                          onClick={() => void handleDelete(t.id)}
                        >
                          ลบ
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        ) : (
          <div>
            <div className="section-label">
              {editingForm.id ? 'แก้ไขแม่แบบรายการประจำ' : '+ สร้างแม่แบบรายการประจำใหม่'}
            </div>
            <div className="form-grid">
              <div className="field span2">
                <label>ชื่อรายการ *</label>
                <input
                  type="text"
                  placeholder="เช่น ค่าเช่าคอนโด, ค่าเน็ตบ้าน, สตรีมมิ่ง"
                  value={editingForm.name}
                  onChange={(e) => setEditingForm({ ...editingForm, name: e.target.value })}
                />
              </div>
              <div className="field">
                <label>ประเภทรายการ</label>
                <div className="chip-row">
                  <button
                    type="button"
                    className={`chip ${editingForm.kind === 'expense' ? 'active' : ''}`}
                    onClick={() => setEditingForm({ ...editingForm, kind: 'expense' })}
                  >
                    🔴 รายจ่าย
                  </button>
                  <button
                    type="button"
                    className={`chip ${editingForm.kind === 'income' ? 'active' : ''}`}
                    onClick={() => setEditingForm({ ...editingForm, kind: 'income' })}
                  >
                    🟢 รายได้
                  </button>
                </div>
              </div>
              <div className="field">
                <label>หมวดหมู่ทั่วไป</label>
                <select
                  value={editingForm.generalCategory}
                  onChange={(e) =>
                    setEditingForm({
                      ...editingForm,
                      generalCategory: e.target.value as GeneralCategory,
                    })
                  }
                >
                  <option value="housing">ที่อยู่อาศัย / สาธารณูปโภค</option>
                  <option value="food">อาหารและเครื่องดื่ม</option>
                  <option value="shopping">ช้อปปิ้ง / ของใช้</option>
                  <option value="other">อื่นๆ</option>
                </select>
              </div>
              <div className="field">
                <label>ทุกวันที่ของเดือน (1 - 31) *</label>
                <input
                  type="number"
                  min={1}
                  max={31}
                  value={editingForm.dueDayText}
                  onChange={(e) => setEditingForm({ ...editingForm, dueDayText: e.target.value })}
                />
              </div>
              <div className="field">
                <label>จำนวนเงินตั้งต้น (บาท, ถ้ามี)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="เช่น 1500.00"
                  value={editingForm.defaultAmountText}
                  onChange={(e) =>
                    setEditingForm({ ...editingForm, defaultAmountText: e.target.value })
                  }
                />
              </div>
              <div className="field span2">
                <label>หมายเหตุตั้งต้น (ถ้ามี)</label>
                <input
                  type="text"
                  placeholder="เช่น หักผ่านบัตรเครดิต"
                  value={editingForm.defaultNote}
                  onChange={(e) =>
                    setEditingForm({ ...editingForm, defaultNote: e.target.value })
                  }
                />
              </div>
            </div>
            <div className="form-actions">
              <button
                type="button"
                className="btn btn-ghost"
                disabled={busy}
                onClick={() => setEditingForm(null)}
              >
                ยกเลิก
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy}
                onClick={() => void handleSaveTemplate()}
              >
                บันทึกแม่แบบ
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
