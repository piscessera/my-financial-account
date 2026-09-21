import { useState } from 'react';

import { tryParseBahtToSatang } from '../../main/calc/money';
import type {
  GeneralCategory,
  IncomeSection,
  TransactionKind,
  TransactionRow,
} from '../../main/db/schema';

/** What the form collects, already validated and money-converted (satang, INV-1). */
export interface TransactionFormValues {
  readonly taxRelevant: boolean;
  readonly kind: TransactionKind;
  readonly incomeSection: IncomeSection | null;
  readonly generalCategory: GeneralCategory | null;
  readonly date: string;
  readonly amountMinor: number;
  readonly whtMinor: number;
  readonly sourcePayer: string | null;
  readonly payerTaxId: string | null;
  readonly note: string | null;
  /** Absolute path of a file chosen via `window.api.attachments.chooseFile()`, if any. */
  readonly attachmentPath: string | null;
}

interface TransactionFormProps {
  /** Present → edit mode (matches the repository: taxRelevant/kind/section never change on update). */
  readonly initial?: TransactionRow;
  readonly defaultTaxRelevant?: boolean;
  readonly lockTaxRelevant?: boolean;
  readonly busy?: boolean;
  readonly submitLabel?: string;
  readonly onSubmit: (values: TransactionFormValues) => void | Promise<void>;
  readonly onCancel?: () => void;
}

const INCOME_SECTIONS: { value: IncomeSection; label: string }[] = [
  { value: '40_1', label: '40(1) เงินเดือน/ค่าจ้าง' },
  { value: '40_2', label: '40(2) ฟรีแลนซ์' },
  { value: '40_5_8', label: '40(5)–(8) ธุรกิจ/ขายของ' },
];

const GENERAL_CATEGORIES: { value: GeneralCategory; label: string }[] = [
  { value: 'food', label: 'อาหาร' },
  { value: 'shopping', label: 'ช้อปปิ้ง' },
  { value: 'housing', label: 'ที่อยู่อาศัย' },
  { value: 'other', label: 'อื่นๆ' },
];

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** A field-level error map keyed by the field name shown in the UI. */
type Errors = Partial<
  Record<'incomeSection' | 'generalCategory' | 'date' | 'amount' | 'wht', string>
>;

/**
 * Transaction create/edit form — PROTO-0001 `entry.html`'s top panel. One interactive form
 * reproduces every state the mockup shows as separate static example panels: filled happy
 * path, the missing-`income_section` error (TC-0001 #2, same Thai message as the mockup), and
 * the general-transaction toggle (TC-0001 #34).
 */
export default function TransactionForm({
  initial,
  defaultTaxRelevant,
  lockTaxRelevant = false,
  busy = false,
  submitLabel,
  onSubmit,
  onCancel,
}: TransactionFormProps): JSX.Element {
  const editing = initial !== undefined;

  const [taxRelevant, setTaxRelevant] = useState(
    initial?.taxRelevant ?? defaultTaxRelevant ?? true,
  );
  const [kind, setKind] = useState<TransactionKind>(initial?.kind ?? 'income');
  const [incomeSection, setIncomeSection] = useState<IncomeSection | null>(
    initial?.incomeSection ?? null,
  );
  const [generalCategory, setGeneralCategory] = useState<GeneralCategory | null>(
    initial?.generalCategory ?? null,
  );
  const [date, setDate] = useState(initial?.date ?? todayIso());
  const [amountText, setAmountText] = useState(
    initial ? (initial.amountMinor / 100).toFixed(2) : '',
  );
  const [whtText, setWhtText] = useState(initial ? (initial.whtMinor / 100).toFixed(2) : '');
  const [sourcePayer, setSourcePayer] = useState(initial?.sourcePayer ?? '');
  const [payerTaxId, setPayerTaxId] = useState(initial?.payerTaxId ?? '');
  const [note, setNote] = useState(initial?.note ?? '');
  const [attachmentPath, setAttachmentPath] = useState<string | null>(null);
  const [errors, setErrors] = useState<Errors>({});

  async function handleChooseAttachment(): Promise<void> {
    const chosen = await window.api.attachments.chooseFile();
    if (chosen) setAttachmentPath(chosen);
  }

  function validate(): { values: TransactionFormValues; errors: Errors } | { errors: Errors } {
    const nextErrors: Errors = {};

    if (taxRelevant && kind === 'income' && incomeSection === null) {
      nextErrors.incomeSection = 'กรุณาเลือกประเภทเงินได้ก่อนบันทึก';
    }
    if (!taxRelevant && generalCategory === null) {
      nextErrors.generalCategory = 'กรุณาเลือกหมวดหมู่ก่อนบันทึก';
    }
    if (date.trim() === '') {
      nextErrors.date = 'กรุณาระบุวันที่';
    }

    const amountResult = tryParseBahtToSatang(amountText);
    if (!amountResult.ok) {
      nextErrors.amount = 'กรุณาระบุจำนวนเงินที่ถูกต้อง';
    }

    let whtMinor = 0;
    if (taxRelevant && whtText.trim() !== '') {
      const whtResult = tryParseBahtToSatang(whtText);
      if (!whtResult.ok || whtResult.satang < 0) {
        nextErrors.wht = 'กรุณาระบุภาษีหัก ณ ที่จ่ายที่ถูกต้อง';
      } else {
        whtMinor = whtResult.satang;
      }
    }

    if (Object.keys(nextErrors).length > 0 || !amountResult.ok) {
      return { errors: nextErrors };
    }

    return {
      errors: {},
      values: {
        taxRelevant,
        kind,
        incomeSection: taxRelevant ? incomeSection : null,
        generalCategory: taxRelevant ? null : generalCategory,
        date,
        amountMinor: amountResult.satang,
        whtMinor: taxRelevant ? whtMinor : 0,
        sourcePayer: taxRelevant && sourcePayer.trim() !== '' ? sourcePayer.trim() : null,
        payerTaxId: taxRelevant && payerTaxId.trim() !== '' ? payerTaxId.trim() : null,
        note: note.trim() !== '' ? note.trim() : null,
        attachmentPath,
      },
    };
  }

  async function handleSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    const result = validate();
    setErrors(result.errors);
    if (!('values' in result)) return;
    await onSubmit(result.values);
  }

  return (
    <form className="panel" onSubmit={(e) => void handleSubmit(e)}>
      {editing && (
        <div
          style={{
            marginBottom: 16,
            padding: '8px 14px',
            background: 'var(--accent-soft)',
            borderRadius: 8,
            color: 'var(--accent)',
            fontWeight: 600,
            fontSize: 13,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>✏️ กำลังแก้ไขรายการ #{initial.id} ({initial.taxRelevant ? 'รายการภาษี' : 'รายการทั่วไป'})</span>
          {onCancel && (
            <button
              type="button"
              className="row-action"
              style={{ margin: 0, fontWeight: 600 }}
              onClick={onCancel}
            >
              ยกเลิกการแก้ไข
            </button>
          )}
        </div>
      )}
      <div className="form-grid">
        {!editing && !lockTaxRelevant && (
          <div className="field span2">
            <label>นับเป็นรายการภาษีหรือไม่</label>
            <div className="chip-row">
              <button
                type="button"
                className={`chip${taxRelevant ? ' active' : ''}`}
                onClick={() => setTaxRelevant(true)}
              >
                รายการภาษี — นำไปคำนวณภาษี
              </button>
              <button
                type="button"
                className={`chip${!taxRelevant ? ' active' : ''}`}
                onClick={() => setTaxRelevant(false)}
              >
                รายการทั่วไป — ไม่นับภาษี
              </button>
            </div>
          </div>
        )}

        {taxRelevant && !editing && (
          <div className="field span2">
            <label>ประเภทรายการ</label>
            <div className="chip-row">
              <button
                type="button"
                className={`chip${kind === 'income' ? ' active' : ''}`}
                onClick={() => setKind('income')}
              >
                รายรับ
              </button>
              <button
                type="button"
                className={`chip${kind === 'expense' ? ' active' : ''}`}
                onClick={() => setKind('expense')}
              >
                รายจ่าย (เฉพาะปีที่เลือกหักตามจริง)
              </button>
            </div>
          </div>
        )}

        {taxRelevant && kind === 'income' && (
          <div className="field span2">
            <label>ประเภทเงินได้ (มาตรา 40)</label>
            <div className="chip-row">
              {INCOME_SECTIONS.map((section) => (
                <button
                  type="button"
                  key={section.value}
                  className={`chip${incomeSection === section.value ? ' active' : ''}`}
                  onClick={() => setIncomeSection(section.value)}
                >
                  {section.label}
                </button>
              ))}
            </div>
            {errors.incomeSection && <div className="error-msg">{errors.incomeSection}</div>}
          </div>
        )}

        {!taxRelevant && (
          <div className="field span2">
            <label>หมวดหมู่</label>
            <div className="chip-row">
              {GENERAL_CATEGORIES.map((category) => (
                <button
                  type="button"
                  key={category.value}
                  className={`chip${generalCategory === category.value ? ' active' : ''}`}
                  onClick={() => setGeneralCategory(category.value)}
                >
                  {category.label}
                </button>
              ))}
            </div>
            {errors.generalCategory && <div className="error-msg">{errors.generalCategory}</div>}
          </div>
        )}

        <div className="field">
          <label>{taxRelevant ? 'วันที่รับเงิน' : 'วันที่'}</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          {errors.date && <div className="error-msg">{errors.date}</div>}
        </div>

        <div className="field">
          <label>จำนวนเงิน (บาท)</label>
          <input
            type="text"
            inputMode="decimal"
            value={amountText}
            onChange={(e) => setAmountText(e.target.value)}
            placeholder="0.00"
          />
          {errors.amount && <div className="error-msg">{errors.amount}</div>}
        </div>

        {taxRelevant && (
          <>
            <div className="field">
              <label>ภาษีหัก ณ ที่จ่าย (ถ้ามี)</label>
              <input
                type="text"
                inputMode="decimal"
                value={whtText}
                onChange={(e) => setWhtText(e.target.value)}
                placeholder="0.00"
              />
              {errors.wht && <div className="error-msg">{errors.wht}</div>}
            </div>
            <div className="field">
              <label>แหล่งที่มา / ผู้จ่าย</label>
              <input
                type="text"
                value={sourcePayer}
                onChange={(e) => setSourcePayer(e.target.value)}
              />
            </div>
            <div className="field">
              <label>เลขประจำตัวผู้เสียภาษีของผู้จ่าย (ถ้ามี)</label>
              <input
                type="text"
                value={payerTaxId}
                onChange={(e) => setPayerTaxId(e.target.value)}
              />
            </div>
          </>
        )}

        <div className="field span2">
          <label>หมายเหตุ (ถ้ามี)</label>
          <input type="text" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>

        {!editing && taxRelevant && (
          <div className="field span2">
            <label>หลักฐานประกอบ (ใบเสร็จ / สลิปเงินเดือน / ใบหัก ณ ที่จ่าย)</label>
            <button
              type="button"
              className="dropzone"
              onClick={() => void handleChooseAttachment()}
            >
              {attachmentPath ?? 'คลิกเพื่อเลือกไฟล์ — รองรับ JPG, PNG, PDF'}
            </button>
          </div>
        )}
      </div>

      <div className="form-actions">
        {onCancel && (
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>
            ยกเลิก
          </button>
        )}
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {submitLabel ?? (editing ? 'บันทึกการแก้ไข' : 'บันทึกรายการ')}
        </button>
      </div>
    </form>
  );
}
