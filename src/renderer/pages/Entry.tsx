import { useEffect, useState } from 'react';

import type { TaxYearRow } from '../../main/db/schema';
import TransactionForm, { type TransactionFormValues } from '../components/TransactionForm';

/**
 * Entry screen, part 1 (AT-2.6) — PROTO-0001 `entry.html`'s top form panel. No tax-year
 * switcher exists yet (that's AT-3.7), so this resolves a working tax year on its own: the
 * current Buddhist-era year if it already exists, or creates it on first use.
 */
function currentBuddhistYear(): number {
  return new Date().getFullYear() + 543;
}

type YearState = { status: 'loading' } | { status: 'ready'; year: TaxYearRow } | { status: 'error'; message: string };

function useWorkingTaxYear(): YearState {
  const [state, setState] = useState<YearState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const years = await window.api.taxYears.list();
        const wanted = currentBuddhistYear();
        const existing = years.find((y) => y.year === wanted) ?? years.find((y) => y.status === 'open');
        const year = existing ?? (await window.api.taxYears.create(wanted));
        if (!cancelled) setState({ status: 'ready', year });
      } catch (err) {
        if (!cancelled) setState({ status: 'error', message: err instanceof Error ? err.message : String(err) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

export default function Entry(): JSX.Element {
  const yearState = useWorkingTaxYear();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'error'; message: string } | null>(null);
  const [formKey, setFormKey] = useState(0);

  async function handleSubmit(yearId: number, values: TransactionFormValues): Promise<void> {
    setBusy(true);
    setFeedback(null);
    try {
      const transaction = await window.api.transactions.create({
        taxYearId: yearId,
        kind: values.kind,
        taxRelevant: values.taxRelevant,
        incomeSection: values.incomeSection,
        generalCategory: values.generalCategory,
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
    } catch (err) {
      setFeedback({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1>บันทึกรายรับ-รายจ่าย</h1>
        <p>
          ปีภาษีนี้ยัง &quot;เปิด&quot; อยู่ — แก้ไขรายการที่บันทึกไว้ได้โดยตรง
          ทุกการแก้ไขจะถูกบันทึกไว้ (ดูได้ที่ &quot;ประวัติ&quot;)
        </p>
      </div>

      {yearState.status === 'loading' && <p>กำลังโหลด...</p>}
      {yearState.status === 'error' && <p role="alert">{yearState.message}</p>}
      {yearState.status === 'ready' && (
        <>
          {feedback && (
            <p role={feedback.kind === 'error' ? 'alert' : 'status'} className={feedback.kind === 'error' ? 'muted' : 'muted'}>
              {feedback.message}
            </p>
          )}
          <TransactionForm
            key={formKey}
            busy={busy}
            onSubmit={(values) => handleSubmit(yearState.year.id, values)}
          />
        </>
      )}
    </div>
  );
}
