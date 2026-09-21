import type { LockInfo } from '../../main/lockFile';

interface LockWarningBannerProps {
  readonly previous: LockInfo | null;
}

/** Shown at launch (AT-1.8) when the data folder's lock file looked recent (<5 min old). */
export default function LockWarningBanner({ previous }: LockWarningBannerProps): JSX.Element {
  return (
    <div role="alert" style={{ background: '#fff3cd', padding: '12px 16px', marginBottom: 16 }}>
      อาจมีอีกเครื่อง/หน้าต่างหนึ่งเปิดข้อมูลชุดนี้อยู่
      {previous ? ` (${previous.hostname}, ${previous.timestamp})` : ''} —
      การแก้ไขพร้อมกันอาจทำให้ข้อมูลขัดแย้งกัน
    </div>
  );
}
