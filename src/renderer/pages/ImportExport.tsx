import { useState } from 'react';

import { formatSatangAsBaht } from '../../main/calc/money';
import type { ParseForPreviewResult } from '../../main/repositories/csv';
import type { CreateTransactionInput } from '../../main/repositories/transactions';
import { currentBuddhistYear, useWorkingTaxYear } from '../lib/useWorkingTaxYear';

function rowLabel(data: CreateTransactionInput | undefined): string {
  if (!data) return '—';
  if (data.taxRelevant) return data.sourcePayer ?? data.note ?? '(ไม่มีรายละเอียด)';
  return data.note ?? '(ทั่วไป)';
}

function rowTag(data: CreateTransactionInput | undefined): string {
  if (!data) return '—';
  if (data.taxRelevant) return data.incomeSection ?? data.kind;
  return data.generalCategory ?? 'ทั่วไป';
}

/**
 * Import/Export screen (AT-5.6) — PROTO-0001 `import-export.html`. Export is two independent
 * read-only-vs-round-trippable buttons; import is the three-step flow — choose a file, preview
 * (no write, per-row checkbox/status), confirm only the checked rows (TC-0001 #45/#46/#47's UI
 * layer, already unit-tested at AT-5.3/5.4 — this screen is presentation only).
 */
export default function ImportExport(): JSX.Element {
  const yearState = useWorkingTaxYear();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'error'; message: string } | null>(null);
  const [importFilePath, setImportFilePath] = useState<string | null>(null);
  const [targetYearText, setTargetYearText] = useState(String(currentBuddhistYear()));
  const [preview, setPreview] = useState<ParseForPreviewResult | null>(null);
  const [checkedRows, setCheckedRows] = useState<Set<number>>(new Set());

  async function handleExportLedger(yearId: number, year: number): Promise<void> {
    setFeedback(null);
    const destPath = await window.api.csv.chooseSavePath(`tax-tracker-${year}-ledger.csv`);
    if (!destPath) return;
    setBusy(true);
    try {
      await window.api.csv.exportLedger(yearId, destPath);
      setFeedback({ kind: 'ok', message: `ส่งออกรายการเรียบร้อยแล้ว: ${destPath}` });
    } catch (err) {
      setFeedback({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  async function handleExportSummary(yearId: number, year: number): Promise<void> {
    setFeedback(null);
    const destPath = await window.api.csv.chooseSavePath(`tax-tracker-${year}-summary.csv`);
    if (!destPath) return;
    setBusy(true);
    try {
      await window.api.csv.exportSummary(yearId, destPath);
      setFeedback({ kind: 'ok', message: `ส่งออกสรุปภาษีเรียบร้อยแล้ว: ${destPath}` });
    } catch (err) {
      setFeedback({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  async function handleChooseImportFile(): Promise<void> {
    const path = await window.api.csv.chooseImportFile();
    if (path) {
      setImportFilePath(path);
      setPreview(null);
    }
  }

  async function handleCheckFile(): Promise<void> {
    if (!importFilePath) return;
    const targetYear = Number(targetYearText);
    if (!Number.isSafeInteger(targetYear)) {
      setFeedback({ kind: 'error', message: 'กรุณาระบุปีภาษีปลายทางที่ถูกต้อง' });
      return;
    }
    setBusy(true);
    setFeedback(null);
    try {
      const result = await window.api.csv.parseForPreview(importFilePath, targetYear);
      setPreview(result);
      setCheckedRows(new Set(result.rows.filter((r) => r.valid).map((r) => r.rowNumber)));
    } catch (err) {
      setFeedback({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  function toggleRow(rowNumber: number): void {
    setCheckedRows((prev) => {
      const next = new Set(prev);
      if (next.has(rowNumber)) next.delete(rowNumber);
      else next.add(rowNumber);
      return next;
    });
  }

  async function handleConfirmImport(): Promise<void> {
    if (!preview) return;
    setBusy(true);
    setFeedback(null);
    try {
      const confirmed = preview.rows.filter((r) => r.valid && checkedRows.has(r.rowNumber));
      const result = await window.api.csv.commitImport({
        targetYear: preview.targetYear,
        confirmedRows: confirmed.map((r) => r.data as CreateTransactionInput),
        skippedCount: preview.rows.length - confirmed.length,
        sourceFilename: importFilePath ?? '',
      });
      setFeedback({ kind: 'ok', message: `นำเข้าเรียบร้อยแล้ว: ${result.importedCount} รายการ` });
      setPreview(null);
      setImportFilePath(null);
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

  const year = yearState.year;

  return (
    <div className="page">
      <div className="page-head">
        <h1>นำเข้า/ส่งออกข้อมูล (CSV)</h1>
        <p>
          สำหรับสำรองข้อมูล ย้ายเครื่อง หรือย้ายไปใช้ account ใหม่ — ไม่ใช่เครื่องมือนำเข้า
          statement ธนาคารหรือไฟล์จากแหล่งอื่น รองรับเฉพาะไฟล์ที่ส่งออกจากแอปนี้เอง (AC-20–24)
        </p>
      </div>

      {feedback && (
        <p role={feedback.kind === 'error' ? 'alert' : 'status'} className="muted">
          {feedback.message}
        </p>
      )}

      <div className="panel">
        <div className="section-label">ส่งออกข้อมูล</div>
        <div className="form-grid">
          <div className="field">
            <label>เลือกปีภาษี</label>
            <div className="control">ปีภาษี {year.year}</div>
          </div>
          <div
            className="field"
            style={{ flexDirection: 'row', gap: 10, display: 'flex', justifyContent: 'flex-end' }}
          >
            <button
              type="button"
              className="btn btn-ghost"
              disabled={busy}
              onClick={() => void handleExportLedger(year.id, year.year)}
            >
              ⬇ ส่งออกรายการ (CSV)
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={busy}
              onClick={() => void handleExportSummary(year.id, year.year)}
            >
              ⬇ ส่งออกสรุปภาษี (CSV)
            </button>
          </div>
        </div>
        <div className="muted" style={{ marginTop: 10 }}>
          &quot;ส่งออกรายการ&quot; ได้ไฟล์ที่ใช้นำเข้ากลับได้ในอนาคต ส่วน &quot;ส่งออกสรุปภาษี&quot;
          เป็นรายงานอ่านอย่างเดียว ใช้นำเข้ากลับไม่ได้
        </div>
      </div>

      <div className="panel" style={{ marginTop: 20 }}>
        <div className="section-label">นำเข้าข้อมูล</div>
        <button type="button" className="dropzone" onClick={() => void handleChooseImportFile()}>
          คลิกเพื่อเลือกไฟล์ CSV (เฉพาะไฟล์ที่ส่งออกจากแอปนี้)
        </button>
        {importFilePath && (
          <div className="muted" style={{ marginTop: 10 }}>
            เลือกไฟล์แล้ว: <b>{importFilePath}</b>
          </div>
        )}
        <div className="form-grid" style={{ marginTop: 10 }}>
          <div className="field">
            <label>ปีภาษีปลายทาง (พ.ศ.)</label>
            <input
              type="text"
              inputMode="numeric"
              value={targetYearText}
              onChange={(e) => setTargetYearText(e.target.value)}
            />
          </div>
        </div>
        <div className="form-actions">
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || !importFilePath}
            onClick={() => void handleCheckFile()}
          >
            ตรวจสอบไฟล์ →
          </button>
        </div>
      </div>

      {preview && (
        <div className="panel" style={{ marginTop: 20 }}>
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
            <span>
              ตัวอย่างก่อนนำเข้า (AC-23) — ยังไม่มีการบันทึกข้อมูลใดๆ จนกว่าจะกด
              &quot;ยืนยันนำเข้า&quot;
            </span>
            <span className="muted">
              เลือกไว้ {checkedRows.size} จาก {preview.rows.length} แถว
            </span>
          </div>
          <table>
            <thead>
              <tr>
                <th style={{ width: 40 }} />
                <th>วันที่</th>
                <th>ประเภท</th>
                <th>รายละเอียด</th>
                <th className="num">จำนวนเงิน</th>
                <th className="center">สถานะตรวจสอบ</th>
              </tr>
            </thead>
            <tbody>
              {preview.rows.map((row) => (
                <tr key={row.rowNumber} style={row.valid ? undefined : { opacity: 0.6 }}>
                  <td>
                    <input
                      type="checkbox"
                      checked={checkedRows.has(row.rowNumber)}
                      disabled={!row.valid}
                      onChange={() => toggleRow(row.rowNumber)}
                    />
                  </td>
                  <td>{row.raw.date || '—'}</td>
                  <td>
                    <span className="tag">{rowTag(row.data)}</span>
                  </td>
                  <td>{rowLabel(row.data)}</td>
                  <td className="num">
                    {row.data ? formatSatangAsBaht(row.data.amountMinor) : '—'}
                  </td>
                  <td>
                    {row.valid ? (
                      <span className="pill active">พร้อมนำเข้า</span>
                    ) : (
                      <span className="pill voided">ข้อผิดพลาด: {row.errors[0]}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="form-actions">
            <button
              type="button"
              className="btn btn-ghost"
              disabled={busy}
              onClick={() => setPreview(null)}
            >
              ยกเลิก
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || checkedRows.size === 0}
              onClick={() => void handleConfirmImport()}
            >
              ยืนยันนำเข้า {checkedRows.size} รายการที่เลือก
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
