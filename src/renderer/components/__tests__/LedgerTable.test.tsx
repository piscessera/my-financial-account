/**
 * TC-0003 — Component tests for LedgerTable and TransactionForm (AT-3.3, REQ-0003).
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import type { TransactionRow } from '../../../main/db/schema';
import LedgerTable from '../LedgerTable';
import TransactionForm from '../TransactionForm';

function makeMockTransaction(overrides: Partial<TransactionRow> = {}): TransactionRow {
  return {
    id: 1,
    taxYearId: 1,
    kind: 'income',
    taxRelevant: true,
    incomeSection: '40_1',
    generalCategory: null,
    date: '2026-03-15',
    amountMinor: 10_000_00, // 10,000.00 THB
    currency: 'THB',
    whtMinor: 300_00, // 300.00 THB
    sourcePayer: 'ACME Corp',
    payerTaxId: '1234567890123',
    note: 'March consulting fee',
    status: 'active',
    reversalOfId: null,
    deductionCategoryId: null,
    source: 'manual',
    createdAt: '2026-03-15T00:00:00.000Z',
    updatedAt: '2026-03-15T00:00:00.000Z',
    ...overrides,
  };
}

describe('TransactionForm (TC-0003 #1, #2)', () => {
  it('TC-0003 #1: renders remark input field for tax-relevant income', () => {
    const html = renderToStaticMarkup(
      <TransactionForm
        onSubmit={vi.fn()}
      />,
    );
    expect(html).toContain('หมายเหตุ (ถ้ามี)');
  });

  it('TC-0003 #2: renders remark input field with initial note when editing', () => {
    const row = makeMockTransaction({
      kind: 'expense',
      note: 'Tax-deductible actual expense',
    });
    const html = renderToStaticMarkup(
      <TransactionForm
        initial={row}
        onSubmit={vi.fn()}
      />,
    );
    expect(html).toContain('หมายเหตุ (ถ้ามี)');
    expect(html).toContain('Tax-deductible actual expense');
  });
});

describe('LedgerTable (TC-0003 #4, #5, #6, #7)', () => {
  it('TC-0003 #4: renders remark column displaying note or dash', () => {
    const txWithNote = makeMockTransaction({ id: 1, note: 'Bonus payment' });
    const txWithoutNote = makeMockTransaction({ id: 2, note: null });

    const html = renderToStaticMarkup(
      <LedgerTable
        transactions={[txWithNote, txWithoutNote]}
        onEdit={vi.fn()}
        onVoid={vi.fn()}
        onShowHistory={vi.fn()}
      />,
    );

    expect(html).toContain('<th>หมายเหตุ</th>');
    expect(html).toContain('Bonus payment');
    expect(html).toContain('<td>—</td>');
  });

  it('TC-0003 #5: renders net amount column for income (amount - wht)', () => {
    const tx = makeMockTransaction({
      id: 1,
      kind: 'income',
      amountMinor: 10_000_00,
      whtMinor: 300_00,
    });

    const html = renderToStaticMarkup(
      <LedgerTable
        transactions={[tx]}
        onEdit={vi.fn()}
        onVoid={vi.fn()}
        onShowHistory={vi.fn()}
      />,
    );

    expect(html).toContain('ยอดสุทธิ');
    // Amount: 10,000.00, WHT: 300.00, Net: 9,700.00
    expect(html).toContain('10,000.00');
    expect(html).toContain('300.00');
    expect(html).toContain('9,700.00');
  });

  it('TC-0003 #6: renders net amount column for expense (amount)', () => {
    const tx = makeMockTransaction({
      id: 1,
      kind: 'expense',
      amountMinor: 2_000_00,
      whtMinor: 0,
    });

    const html = renderToStaticMarkup(
      <LedgerTable
        transactions={[tx]}
        onEdit={vi.fn()}
        onVoid={vi.fn()}
        onShowHistory={vi.fn()}
      />,
    );

    expect(html).toContain('ยอดสุทธิ');
    expect(html).toContain('2,000.00');
  });

  it('TC-0003 #7: displays annual net income summary tile (totalIncome - totalWht)', () => {
    const tx1 = makeMockTransaction({
      id: 1,
      amountMinor: 100_000_00,
      whtMinor: 3_000_00,
    });

    const html = renderToStaticMarkup(
      <LedgerTable
        transactions={[tx1]}
        onEdit={vi.fn()}
        onVoid={vi.fn()}
        onShowHistory={vi.fn()}
      />,
    );

    expect(html).toContain('รวมทั้งปี — ยอดรับสุทธิ');
    expect(html).toContain('97,000.00');
  });
});
