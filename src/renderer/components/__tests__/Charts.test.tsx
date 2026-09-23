/**
 * Unit/Component tests for Dashboard Insights charts: MonthlyTrendChart & CategoryDonutChart.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { TransactionRow } from '../../../main/db/schema';
import CategoryDonutChart from '../CategoryDonutChart';
import MonthlyTrendChart from '../MonthlyTrendChart';

function makeMockTx(overrides: Partial<TransactionRow> = {}): TransactionRow {
  return {
    id: 1,
    taxYearId: 1,
    kind: 'income',
    taxRelevant: true,
    incomeSection: '40_1',
    generalCategory: null,
    date: '2026-03-15',
    amountMinor: 50_000_00,
    currency: 'THB',
    whtMinor: 1_500_00,
    sourcePayer: 'Employer',
    payerTaxId: null,
    note: null,
    status: 'active',
    reversalOfId: null,
    deductionCategoryId: null,
    source: 'manual',
    createdAt: '2026-03-15T00:00:00.000Z',
    updatedAt: '2026-03-15T00:00:00.000Z',
    ...overrides,
  };
}

describe('MonthlyTrendChart', () => {
  it('renders 12 months with labels and bars', () => {
    const tx1 = makeMockTx({ date: '2026-01-10', amountMinor: 20_000_00 });
    const tx2 = makeMockTx({ date: '2026-03-15', amountMinor: 50_000_00 });

    const html = renderToStaticMarkup(
      <MonthlyTrendChart transactions={[tx1, tx2]} year={2569} />,
    );

    expect(html).toContain('แนวโน้มรายรับ-รายจ่ายรายเดือน (ปี 2569)');
    expect(html).toContain('ม.ค.');
    expect(html).toContain('มี.ค.');
    expect(html).toContain('ธ.ค.');
    expect(html).toContain('<svg');
  });
});

describe('CategoryDonutChart', () => {
  it('renders donut segments and legend with percentages', () => {
    const segments = [
      { label: 'อาหาร', valueMinor: 60_000_00, color: '#e2a24b' },
      { label: 'ช้อปปิ้ง', valueMinor: 40_000_00, color: '#7c92ff' },
    ];

    const html = renderToStaticMarkup(
      <CategoryDonutChart title="สัดส่วนรายจ่าย" segments={segments} />,
    );

    expect(html).toContain('สัดส่วนรายจ่าย');
    expect(html).toContain('อาหาร');
    expect(html).toContain('ช้อปปิ้ง');
    expect(html).toContain('60%');
    expect(html).toContain('40%');
  });

  it('renders empty message when no segments have value', () => {
    const html = renderToStaticMarkup(
      <CategoryDonutChart
        title="สัดส่วนรายจ่าย"
        segments={[]}
        emptyMessage="ยังไม่มีรายจ่ายทั่วไปในปีนี้"
      />,
    );

    expect(html).toContain('ยังไม่มีรายจ่ายทั่วไปในปีนี้');
  });
});
