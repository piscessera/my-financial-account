import { useState } from 'react';

import { formatSatangAsBaht } from '../../main/calc/money';
import type { TransactionRow } from '../../main/db/schema';

interface MonthlyTrendChartProps {
  readonly transactions: readonly TransactionRow[];
  readonly year: number;
}

interface MonthData {
  readonly monthIndex: number;
  readonly monthKey: string;
  readonly monthLabel: string;
  readonly grossIncome: number;
  readonly wht: number;
  readonly netIncome: number;
  readonly generalExpense: number;
}

const THAI_MONTH_SHORT = [
  'ม.ค.',
  'ก.พ.',
  'มี.ค.',
  'เม.ย.',
  'พ.ค.',
  'มิ.ย.',
  'ก.ค.',
  'ส.ค.',
  'ก.ย.',
  'ต.ค.',
  'พ.ย.',
  'ธ.ค.',
];

export default function MonthlyTrendChart({
  transactions,
  year,
}: MonthlyTrendChartProps): JSX.Element {
  const [hoveredMonth, setHoveredMonth] = useState<MonthData | null>(null);

  // Build 12 months data
  const monthsData: MonthData[] = Array.from({ length: 12 }, (_, i) => {
    const monthNum = String(i + 1).padStart(2, '0');
    return {
      monthIndex: i,
      monthKey: `${monthNum}`,
      monthLabel: THAI_MONTH_SHORT[i],
      grossIncome: 0,
      wht: 0,
      netIncome: 0,
      generalExpense: 0,
    };
  });

  for (const t of transactions) {
    if (t.status !== 'active') continue;
    const monthPart = t.date.slice(5, 7);
    const mIdx = Number.parseInt(monthPart, 10) - 1;
    if (mIdx >= 0 && mIdx < 12) {
      const current = monthsData[mIdx];
      if (t.taxRelevant && t.kind === 'income') {
        const gross = current.grossIncome + t.amountMinor;
        const wht = current.wht + t.whtMinor;
        monthsData[mIdx] = {
          ...current,
          grossIncome: gross,
          wht,
          netIncome: gross - wht,
        };
      } else if (!t.taxRelevant) {
        monthsData[mIdx] = {
          ...current,
          generalExpense: current.generalExpense + t.amountMinor,
        };
      }
    }
  }

  // Find max value for Y scale
  const maxVal = Math.max(
    ...monthsData.map((m) => Math.max(m.grossIncome, m.generalExpense, m.netIncome)),
    100_000_00, // at least 100,000 THB satang for nice base scale
  );

  // Chart layout dimensions
  const chartHeight = 220;
  const chartWidth = 720;
  const paddingLeft = 60;
  const paddingRight = 20;
  const paddingTop = 20;
  const paddingBottom = 35;

  const innerWidth = chartWidth - paddingLeft - paddingRight;
  const innerHeight = chartHeight - paddingTop - paddingBottom;
  const monthSlotWidth = innerWidth / 12;

  // Grid steps (4 lines)
  const gridSteps = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div className="panel" style={{ marginTop: 20 }}>
      <div
        className="section-label"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <span>📊 แนวโน้มรายรับ-รายจ่ายรายเดือน (ปี {year})</span>
        <div style={{ display: 'flex', gap: 14, fontSize: '12px', flexWrap: 'wrap' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--good)' }} />
            รายรับรวม (Gross)
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--accent)' }} />
            รายรับสุทธิ (Net)
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--amber)' }} />
            WHT
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--bad)' }} />
            รายจ่ายทั่วไป
          </span>
        </div>
      </div>

      <div style={{ position: 'relative', width: '100%', overflowX: 'auto' }}>
        <svg
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          style={{ width: '100%', height: 'auto', minWidth: 600, display: 'block' }}
        >
          {/* Y Axis Grid Lines */}
          {gridSteps.map((step) => {
            const y = paddingTop + innerHeight * (1 - step);
            const valMinor = Math.round(maxVal * step);
            return (
              <g key={step}>
                <line
                  x1={paddingLeft}
                  y1={y}
                  x2={chartWidth - paddingRight}
                  y2={y}
                  stroke="var(--line)"
                  strokeDasharray={step === 0 ? undefined : '3 3'}
                  strokeWidth={1}
                />
                <text
                  x={paddingLeft - 8}
                  y={y + 4}
                  textAnchor="end"
                  fontSize="10.5"
                  fill="var(--ink-soft)"
                  fontFamily="'JetBrains Mono', monospace"
                >
                  {formatSatangAsBaht(valMinor, { grouping: true }).split('.')[0]}
                </text>
              </g>
            );
          })}

          {/* Month Bars */}
          {monthsData.map((m, i) => {
            const slotX = paddingLeft + i * monthSlotWidth;
            const barWidth = Math.max(3, (monthSlotWidth - 14) / 4);

            const grossH = maxVal > 0 ? (m.grossIncome / maxVal) * innerHeight : 0;
            const netH = maxVal > 0 ? (m.netIncome / maxVal) * innerHeight : 0;
            const whtH = maxVal > 0 ? (m.wht / maxVal) * innerHeight : 0;
            const expH = maxVal > 0 ? (m.generalExpense / maxVal) * innerHeight : 0;

            const isHovered = hoveredMonth?.monthIndex === i;

            return (
              <g
                key={m.monthKey}
                onMouseEnter={() => setHoveredMonth(m)}
                onMouseLeave={() => setHoveredMonth(null)}
                style={{ cursor: 'pointer' }}
              >
                {/* Hover Background column */}
                <rect
                  x={slotX + 2}
                  y={paddingTop}
                  width={monthSlotWidth - 4}
                  height={innerHeight}
                  fill={isHovered ? 'var(--surface-2)' : 'transparent'}
                  rx={4}
                  style={{ transition: 'fill 0.15s ease' }}
                />

                {/* Gross Income Bar */}
                <rect
                  x={slotX + 4}
                  y={paddingTop + innerHeight - grossH}
                  width={barWidth}
                  height={Math.max(0, grossH)}
                  fill="var(--good)"
                  rx={2}
                  opacity={isHovered || !hoveredMonth ? 0.9 : 0.4}
                />

                {/* Net Income Bar */}
                <rect
                  x={slotX + 4 + barWidth + 1}
                  y={paddingTop + innerHeight - netH}
                  width={barWidth}
                  height={Math.max(0, netH)}
                  fill="var(--accent)"
                  rx={2}
                  opacity={isHovered || !hoveredMonth ? 0.9 : 0.4}
                />

                {/* WHT Bar */}
                <rect
                  x={slotX + 4 + (barWidth + 1) * 2}
                  y={paddingTop + innerHeight - whtH}
                  width={barWidth}
                  height={Math.max(0, whtH)}
                  fill="var(--amber)"
                  rx={2}
                  opacity={isHovered || !hoveredMonth ? 0.9 : 0.4}
                />

                {/* General Expense Bar */}
                <rect
                  x={slotX + 4 + (barWidth + 1) * 3}
                  y={paddingTop + innerHeight - expH}
                  width={barWidth}
                  height={Math.max(0, expH)}
                  fill="var(--bad)"
                  rx={2}
                  opacity={isHovered || !hoveredMonth ? 0.9 : 0.4}
                />

                {/* X Axis Month Label */}
                <text
                  x={slotX + monthSlotWidth / 2}
                  y={chartHeight - 12}
                  textAnchor="middle"
                  fontSize="11"
                  fontWeight={isHovered ? '700' : '500'}
                  fill={isHovered ? 'var(--ink)' : 'var(--ink-soft)'}
                >
                  {m.monthLabel}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Hover Tooltip Card */}
        {hoveredMonth && (
          <div
            style={{
              position: 'absolute',
              top: 10,
              right: 16,
              background: 'var(--surface)',
              border: '1px solid var(--line)',
              borderRadius: 8,
              padding: '10px 14px',
              boxShadow: 'var(--shadow)',
              fontSize: '12.5px',
              minWidth: 190,
              zIndex: 10,
              pointerEvents: 'none',
            }}
          >
            <div
              style={{
                fontWeight: 700,
                borderBottom: '1px solid var(--line)',
                paddingBottom: 4,
                marginBottom: 6,
              }}
            >
              เดือน {hoveredMonth.monthLabel} {year}
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 12,
                color: 'var(--good)',
              }}
            >
              <span>รายรับรวม:</span>
              <span className="num">{formatSatangAsBaht(hoveredMonth.grossIncome)} ฿</span>
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 12,
                color: 'var(--accent)',
              }}
            >
              <span>รายรับสุทธิ:</span>
              <span className="num">{formatSatangAsBaht(hoveredMonth.netIncome)} ฿</span>
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 12,
                color: 'var(--amber)',
              }}
            >
              <span>ภาษีหัก WHT:</span>
              <span className="num">{formatSatangAsBaht(hoveredMonth.wht)} ฿</span>
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 12,
                color: 'var(--bad)',
              }}
            >
              <span>รายจ่ายทั่วไป:</span>
              <span className="num">{formatSatangAsBaht(hoveredMonth.generalExpense)} ฿</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
