import { useCallback, useEffect, useState } from 'react';

import type { ComputeYearResult } from '../../main/calc/computeYear';
import { formatSatangAsBaht } from '../../main/calc/money';
import type {
  DeductionCategoryRow,
  GeneralCategory,
  SharedCapRow,
  TaxBracketRow,
  TransactionRow,
} from '../../main/db/schema';
import CategoryDonutChart, { type DonutSegment } from '../components/CategoryDonutChart';
import MonthlyTrendChart from '../components/MonthlyTrendChart';
import { useWorkingTaxYear } from '../lib/useWorkingTaxYear';

const GENERAL_CATEGORY_LABELS: Record<GeneralCategory, string> = {
  food: 'อาหาร',
  shopping: 'ช้อปปิ้ง',
  housing: 'ที่อยู่อาศัย',
  other: 'อื่นๆ',
};

const GENERAL_CATEGORY_COLORS: Record<GeneralCategory, string> = {
  food: '#e2a24b', // amber
  shopping: '#7c92ff', // accent / blue
  housing: '#5fce93', // good / green
  other: '#9ba2b0', // gray
};

const DEDUCTION_COLORS = [
  '#7c92ff',
  '#5fce93',
  '#e2a24b',
  '#9d7cff',
  '#f0796a',
  '#38bdf8',
  '#fb7185',
  '#a3e635',
];

interface HeadroomRow {
  readonly key: string;
  readonly label: string;
  readonly usedMinor: number;
  readonly capMinor: number | null;
}

function headroomPercent(usedMinor: number, capMinor: number | null): number {
  if (capMinor === null || capMinor === 0) return 0;
  return Math.min(100, Math.round((usedMinor / capMinor) * 100));
}

interface DashboardProps {
  readonly onNavigateToEntry?: (monthIndex?: number) => void;
}

export default function Dashboard({ onNavigateToEntry }: DashboardProps): JSX.Element {
  const yearState = useWorkingTaxYear();
  const [result, setResult] = useState<ComputeYearResult | null>(null);
  const [categories, setCategories] = useState<DeductionCategoryRow[]>([]);
  const [sharedCaps, setSharedCaps] = useState<SharedCapRow[]>([]);
  const [taxBrackets, setTaxBrackets] = useState<TaxBracketRow[]>([]);
  const [allTransactions, setAllTransactions] = useState<TransactionRow[]>([]);
  const [generalTransactions, setGeneralTransactions] = useState<TransactionRow[]>([]);
  const [hasAnyTransactions, setHasAnyTransactions] = useState(false);

  const reload = useCallback(async (yearId: number) => {
    const [computed, cats, caps, transactions, brackets] = await Promise.all([
      window.api.calc.computeYear(yearId),
      window.api.deductions.listCategories(),
      window.api.settings.getSharedCaps(),
      window.api.transactions.listByYear(yearId),
      window.api.settings.getBrackets(yearId),
    ]);
    setResult(computed);
    setCategories(cats);
    setSharedCaps(caps);
    setTaxBrackets(brackets);
    setAllTransactions(transactions);
    setGeneralTransactions(transactions.filter((t: TransactionRow) => !t.taxRelevant && t.status === 'active'));
    setHasAnyTransactions(transactions.length > 0);
  }, []);

  useEffect(() => {
    if (yearState.status === 'ready') void reload(yearState.year.id);
  }, [yearState, reload]);

  if (yearState.status === 'loading') return <div className="page">กำลังโหลด...</div>;
  if (yearState.status === 'error')
    return (
      <div className="page" role="alert">
        {yearState.message}
      </div>
    );
  if (!result) return <div className="page">กำลังโหลด...</div>;

  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const sharedCapById = new Map(sharedCaps.map((g) => [g.id, g]));

  const headroomRows: HeadroomRow[] = [
    ...result.deductions.perCategory
      .filter((p) => categoryById.get(p.categoryId)?.capType !== 'shared_group_member')
      .map((p) => {
        const category = categoryById.get(p.categoryId);
        return {
          key: `cat-${p.categoryId}`,
          label: category?.name ?? `หมวดหมู่ #${p.categoryId}`,
          usedMinor: p.enteredMinor,
          capMinor: category?.capAmountMinor ?? null,
        };
      }),
    ...result.deductions.sharedGroups.map((g) => {
      const group = sharedCapById.get(g.sharedGroupId);
      const memberNames = categories
        .filter((c) => c.sharedGroupId === g.sharedGroupId)
        .map((c) => c.name)
        .join(' + ');
      return {
        key: `group-${g.sharedGroupId}`,
        label: `${memberNames || group?.name || `กลุ่ม #${g.sharedGroupId}`} (กลุ่มรวม)`,
        usedMinor: g.rawTotalMinor,
        capMinor: group?.capAmountMinor ?? null,
      };
    }),
  ];

  // Cashflow & Savings calculations
  const netIncomeMinor = Math.max(0, result.totalIncomeMinor - result.whtTotalMinor);
  const totalExpenseMinor = generalTransactions.reduce((sum, t) => sum + t.amountMinor, 0);
  const netSavingsMinor = netIncomeMinor - totalExpenseMinor;
  const savingsRatePercent = netIncomeMinor > 0 ? (netSavingsMinor / netIncomeMinor) * 100 : 0;
  const avgMonthlyExpenseMinor = Math.round(totalExpenseMinor / 12);

  // Tax Bracket & Headroom calculations
  const sortedBrackets = [...taxBrackets].sort((a, b) => a.lowerBoundMinor - b.lowerBoundMinor);
  const currentBracketIndex = sortedBrackets.findIndex((b) => {
    if (b.upperBoundMinor === null) return result.netTaxableMinor >= b.lowerBoundMinor;
    return result.netTaxableMinor >= b.lowerBoundMinor && result.netTaxableMinor <= b.upperBoundMinor;
  });
  const currentBracket = currentBracketIndex >= 0 ? sortedBrackets[currentBracketIndex] : sortedBrackets[0];
  const nextBracket = currentBracketIndex >= 0 && currentBracketIndex + 1 < sortedBrackets.length
    ? sortedBrackets[currentBracketIndex + 1]
    : null;
  const headroomToNextBracket = currentBracket?.upperBoundMinor !== null && currentBracket?.upperBoundMinor !== undefined
    ? Math.max(0, currentBracket.upperBoundMinor - result.netTaxableMinor)
    : null;

  // Remaining Deduction Capacity
  const remainingDeductionCapacityMinor = headroomRows.reduce((sum, r) => {
    if (r.capMinor === null) return sum;
    return sum + Math.max(0, r.capMinor - r.usedMinor);
  }, 0);

  const generalTotalsByCategory = (Object.keys(GENERAL_CATEGORY_LABELS) as GeneralCategory[]).map(
    (category) => ({
      category,
      total: generalTransactions
        .filter((t) => t.generalCategory === category)
        .reduce((sum, t) => sum + t.amountMinor, 0),
    }),
  );

  // Build segments for General Expense Donut Chart
  const expenseSegments: DonutSegment[] = generalTotalsByCategory
    .filter((g) => g.total > 0)
    .map((g) => ({
      label: GENERAL_CATEGORY_LABELS[g.category],
      valueMinor: g.total,
      color: GENERAL_CATEGORY_COLORS[g.category],
    }));

  // Build segments for Deductions Donut Chart
  const deductionSegments: DonutSegment[] = headroomRows
    .filter((h) => h.usedMinor > 0)
    .map((h, i) => ({
      label: h.label,
      valueMinor: h.usedMinor,
      color: DEDUCTION_COLORS[i % DEDUCTION_COLORS.length],
    }));

  if (!hasAnyTransactions) {
    return (
      <div className="page">
        <div className="page-head">
          <h1>Dashboard — ปีภาษี {yearState.year.year}</h1>
        </div>
        <div className="panel">
          <div className="empty-state">
            <div className="icon">🗓️</div>
            <div>ยังไม่มีรายการในปีภาษี {yearState.year.year}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-head" style={{ marginBottom: 20 }}>
        <h1>Dashboard — ภาพรวมการเงินและภาษี ปี {yearState.year.year}</h1>
        <p>วิเคราะห์กระแสเงินสด เงินออมสะสม และสถานะภาษีเงินได้สดจากรายการจริง</p>
      </div>

      {/* Financial Health & Cashflow KPI Section */}
      <div className="section-label">💰 สรุปกระแสเงินสด & เงินออมสะสม (Cashflow & Savings)</div>
      <div className="tiles" style={{ gridTemplateColumns: 'repeat(4,1fr)', marginBottom: 20 }}>
        <div className="tile accent">
          <div className="k">รายรับสุทธิ (หลังหัก WHT)</div>
          <div className="v num">{formatSatangAsBaht(netIncomeMinor)}</div>
        </div>
        <div className="tile">
          <div className="k">รายจ่ายทั่วไปสะสม (เฉลี่ย {formatSatangAsBaht(avgMonthlyExpenseMinor)}/ด.)</div>
          <div className="v num">{formatSatangAsBaht(totalExpenseMinor)}</div>
        </div>
        <div className={`tile ${netSavingsMinor >= 0 ? 'good' : 'bad'}`}>
          <div className="k">{netSavingsMinor >= 0 ? 'เงินออมคงเหลือสุทธิ' : 'ยอดติดลบสะสม'}</div>
          <div className="v num">
            {netSavingsMinor < 0 && '-'}{formatSatangAsBaht(Math.abs(netSavingsMinor))}
          </div>
        </div>
        <div className={`tile ${savingsRatePercent >= 15 ? 'good' : savingsRatePercent > 0 ? '' : 'bad'}`}>
          <div className="k">อัตราการออม (Savings Rate)</div>
          <div className="v num">{savingsRatePercent.toFixed(1)}%</div>
        </div>
      </div>

      {/* Tax Position & Bracket Section */}
      <div className="section-label">🧾 สถานะภาษี & สิทธิลดหย่อน (Tax & Deduction Overview)</div>
      <div className="tiles" style={{ gridTemplateColumns: 'repeat(4,1fr)', marginBottom: 20 }}>
        <div className="tile">
          <div className="k">รายได้พึงประเมินสะสม</div>
          <div className="v num">{formatSatangAsBaht(result.totalIncomeMinor)}</div>
        </div>
        <div className="tile">
          <div className="k">ภาษีหัก ณ ที่จ่าย (WHT)</div>
          <div className="v num">{formatSatangAsBaht(result.whtTotalMinor)}</div>
        </div>
        <div className="tile">
          <div className="k">เงินได้สุทธิคำนวณภาษี</div>
          <div className="v num">{formatSatangAsBaht(result.netTaxableMinor)}</div>
        </div>
        <div className={`tile ${result.balance.direction === 'refund' ? 'good' : 'bad'}`}>
          <div className="k">
            {result.balance.direction === 'refund'
              ? 'ประมาณการ — ขอคืนได้'
              : 'ประมาณการ — ต้องจ่ายเพิ่ม'}
          </div>
          <div className="v num">฿{formatSatangAsBaht(result.balance.amountMinor)}</div>
        </div>
      </div>

      {/* Tax Optimization & Bracket Advisor Banner */}
      <div
        className="panel"
        style={{
          marginBottom: 20,
          background: 'var(--surface-2)',
          borderLeft: '4px solid var(--accent)',
          padding: '16px 20px',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div>
            <div style={{ fontWeight: 600, fontSize: 14.5, marginBottom: 4 }}>
              📈 ฐานภาษีปัจจุบัน:{' '}
              <span className="tag" style={{ fontSize: 13, padding: '3px 10px', background: 'var(--accent)', color: '#fff' }}>
                {currentBracket ? `${currentBracket.rateBp / 100}%` : '0%'}
              </span>
              {currentBracket && (
                <span className="muted" style={{ marginLeft: 8 }}>
                  (ช่วงเงินได้สุทธิ {formatSatangAsBaht(currentBracket.lowerBoundMinor)} - {currentBracket.upperBoundMinor !== null ? formatSatangAsBaht(currentBracket.upperBoundMinor) : 'ขึ้นไป'})
                </span>
              )}
            </div>
            <div className="muted" style={{ fontSize: 13 }}>
              {nextBracket && headroomToNextBracket !== null ? (
                <>
                  เงินได้สุทธิยังห่างจากฐานภาษีถัดไป ({nextBracket.rateBp / 100}%) อีก{' '}
                  <strong style={{ color: 'var(--ink)' }}>{formatSatangAsBaht(headroomToNextBracket)} บาท</strong>
                </>
              ) : (
                'คุณอยู่ในฐานภาษีสูงสุดตามโครงสร้างภาษีที่กำหนด'
              )}
              {remainingDeductionCapacityMinor > 0 && (
                <> · มีสิทธิลดหย่อนที่ยังเติมได้อีก <strong style={{ color: 'var(--good)' }}>{formatSatangAsBaht(remainingDeductionCapacityMinor)} บาท</strong></>
              )}
            </div>
          </div>

          {onNavigateToEntry && (
            <button
              type="button"
              className="btn btn-ghost"
              style={{ fontSize: 12.5, padding: '6px 12px' }}
              onClick={() => onNavigateToEntry()}
            >
              📝 บันทึกรายการเพิ่ม
            </button>
          )}
        </div>
      </div>

      {/* 12-Month Cashflow & Tax Trend Graph with click navigation */}
      <MonthlyTrendChart
        transactions={allTransactions}
        year={yearState.year.year}
        onSelectMonth={onNavigateToEntry}
      />

      {/* Breakdown Donut Charts Side-by-Side */}
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginTop: 20 }}>
        <CategoryDonutChart
          title="🍩 สัดส่วนรายจ่ายทั่วไปตามหมวดหมู่"
          segments={expenseSegments}
          emptyMessage="ยังไม่มีรายจ่ายทั่วไปในปีนี้"
        />
        <CategoryDonutChart
          title="🎯 สัดส่วนการใช้สิทธิลดหย่อนภาษี"
          segments={deductionSegments}
          emptyMessage="ยังไม่มีการบันทึกค่าลดหย่อนในปีนี้"
        />
      </div>

      {headroomRows.length > 0 && (
        <div className="panel" style={{ marginTop: 20 }}>
          <div
            className="section-label"
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              flexWrap: 'wrap',
              gap: 8,
              marginBottom: 12,
            }}
          >
            <span>🛡️ เพดานค่าลดหย่อน — ใช้ไปแล้ว / เพดานสูงสุด</span>
            <span className="muted">
              สิทธิลดหย่อนที่ยังเติมได้อีกรวม: {formatSatangAsBaht(remainingDeductionCapacityMinor)} บาท
            </span>
          </div>
          <div className="ded-group">
            {headroomRows.map((row) => {
              const percent = headroomPercent(row.usedMinor, row.capMinor);
              const overCap = row.capMinor !== null && row.usedMinor > row.capMinor;
              return (
                <div className="ded-row" style={{ gridTemplateColumns: '1fr 180px' }} key={row.key}>
                  <div>
                    <div className="ded-name">
                      {row.label}{' '}
                      <span className="muted">
                        (เพดาน {row.capMinor !== null ? formatSatangAsBaht(row.capMinor) : '—'})
                      </span>
                    </div>
                    <div className="headroom-bar">
                      <span
                        style={{
                          width: `${percent}%`,
                          background: overCap ? 'var(--bad)' : undefined,
                        }}
                      />
                    </div>
                  </div>
                  <div
                    className="num"
                    style={{ textAlign: 'right', color: overCap ? 'var(--bad)' : undefined }}
                  >
                    {formatSatangAsBaht(row.usedMinor)} /{' '}
                    {row.capMinor !== null ? formatSatangAsBaht(row.capMinor) : '—'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="section-label" style={{ marginTop: 28 }}>
        🛒 สรุปรายจ่ายทั่วไปตามหมวดหมู่ (ไม่นับภาษี)
      </div>
      <div className="panel">
        <div className="tiles" style={{ gridTemplateColumns: 'repeat(4,1fr)', marginBottom: 0 }}>
          {generalTotalsByCategory.map(({ category, total }) => (
            <div className="tile" key={category}>
              <div className="k">{GENERAL_CATEGORY_LABELS[category]}</div>
              <div className="v num">{formatSatangAsBaht(total)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

