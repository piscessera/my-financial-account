import { useState } from 'react';

import type { DataLocationInfo } from '../../main/dataLocation';

interface OnboardingProps {
  onComplete: (info: DataLocationInfo) => void;
}

/**
 * First-run only (AC-18): choose or create the data folder, then create+seed the DB there.
 * PROTO-0001's `onboarding.html` is the visual reference; this task's done-criterion is
 * behavioral (first run shows this, second launch skips it), not pixel-matching PROTO-0001.
 */
export default function Onboarding({ onComplete }: OnboardingProps): JSX.Element {
  const [folderPath, setFolderPath] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleChooseFolder(): Promise<void> {
    setError(null);
    const chosen = await window.api.dataLocation.chooseFolder();
    if (chosen) setFolderPath(chosen);
  }

  async function handleStart(): Promise<void> {
    if (!folderPath) return;
    setBusy(true);
    setError(null);
    try {
      const info = await window.api.dataLocation.createInFolder(folderPath);
      onComplete(info);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 640, margin: '64px auto', padding: '0 16px' }}>
      <h1>ยินดีต้อนรับสู่สมุดภาษีรายปี</h1>
      <p>
        ก่อนเริ่มใช้งาน เลือกโฟลเดอร์ที่จะใช้เก็บข้อมูลของคุณ — แนะนำให้เลือกโฟลเดอร์ที่ซิงค์กับ
        Google Drive อยู่แล้ว เพื่อให้มีสำเนาสำรองและใช้งานข้ามเครื่องได้อัตโนมัติ ตัวแอปเองไม่เชื่อมต่อ
        Google Drive โดยตรง — แค่เขียนไฟล์ไว้ในโฟลเดอร์นี้ตามปกติ
      </p>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '24px 0' }}>
        <span>{folderPath ?? 'ยังไม่ได้เลือกโฟลเดอร์'}</span>
        <button type="button" onClick={() => void handleChooseFolder()} disabled={busy}>
          {folderPath ? 'เปลี่ยนโฟลเดอร์...' : 'เลือกโฟลเดอร์...'}
        </button>
      </div>

      {error && <p role="alert">{error}</p>}

      <button type="button" onClick={() => void handleStart()} disabled={!folderPath || busy}>
        {busy ? 'กำลังตั้งค่า...' : 'เริ่มใช้งาน →'}
      </button>

      <p>ครั้งต่อไปที่เปิดแอป จะข้ามหน้านี้ไปที่ Dashboard โดยอัตโนมัติ — ไม่ถามซ้ำ</p>
    </div>
  );
}
