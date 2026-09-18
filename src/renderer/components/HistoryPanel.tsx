import { formatSatangAsBaht } from '../../main/calc/money';
import type { AuditEntry } from '../../main/repositories/auditLog';

interface HistoryPanelProps {
  readonly label: string;
  readonly entries: readonly AuditEntry[];
  readonly onClose: () => void;
}

const ACTION_LABELS: Record<string, string> = {
  create: 'สร้างรายการ',
  update: 'แก้ไขรายการ',
  void: 'ปรับเป็นศูนย์ (Void)',
  reverse: 'สร้างรายการกลับรายการ (Reversal)',
};

function formatWhen(occurredAt: string): { date: string; time: string } {
  const d = new Date(occurredAt);
  return {
    date: d.toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: '2-digit' }),
    time: d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }),
  };
}

/** Describes a change in one line, the way PROTO-0001's `entry.html` history panel does. */
function describe(entry: AuditEntry): string {
  const before = entry.before as { amountMinor?: number } | null;
  const after = entry.after as { amountMinor?: number } | null;

  if (entry.action === 'create' && after?.amountMinor !== undefined) {
    return `สร้างรายการ — จำนวนเงิน ${formatSatangAsBaht(after.amountMinor)}`;
  }
  if (entry.action === 'update' && before?.amountMinor !== undefined && after?.amountMinor !== undefined) {
    if (before.amountMinor !== after.amountMinor) {
      return `แก้ไขจำนวนเงิน: ${formatSatangAsBaht(before.amountMinor)} → ${formatSatangAsBaht(after.amountMinor)}`;
    }
  }
  return ACTION_LABELS[entry.action] ?? entry.action;
}

/**
 * Transaction edit history (AC-9a, TC-0001 #25) — PROTO-0001 `entry.html`'s `#history` panel.
 */
export default function HistoryPanel({ label, entries, onClose }: HistoryPanelProps): JSX.Element {
  return (
    <div className="panel" style={{ marginTop: 20 }}>
      <div
        className="section-label"
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}
      >
        <span>ประวัติการแก้ไข — รายการ &quot;{label}&quot; (AC-9a)</span>
        <button type="button" className="row-action muted" onClick={onClose}>
          ปิด
        </button>
      </div>
      {entries.length === 0 && <p className="muted">ยังไม่มีประวัติ</p>}
      {entries.map((entry) => {
        const when = formatWhen(entry.occurredAt);
        return (
          <div className="history-item" key={entry.id}>
            <div className="when">
              {when.date}
              <br />
              {when.time}
            </div>
            <div>{describe(entry)}</div>
          </div>
        );
      })}
    </div>
  );
}
