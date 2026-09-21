import { useCallback, useEffect, useState } from 'react';

import type { ComputeYearResult } from '../../main/calc/computeYear';
import { formatSatangAsBaht } from '../../main/calc/money';
import type {
  DeductionCategoryRow,
  GeneralCategory,
  SharedCapRow,
  TransactionRow,
} from '../../main/db/schema';
import { useWorkingTaxYear } from '../lib/useWorkingTaxYear';

const GENERAL_CATEGORY_LABELS: Record<GeneralCategory, string> = {
  food: 'อาหาร',
  shopping: 'ช้อปปิ้ง',
  housing: 'ที่อยู่อาศัย',
  other: 'อื่นๆ',
};

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

/**
 * Dashboard (AT-4.6) — PROTO-0001 `dashboard.html`. Live tax tiles (TC-0001 #29: reflects a
 * new transaction immediately, no close required), deduction headroom (shared-group members
 * collapsed into one combined row, matching the mockup), and a fully separate general-
 * transactions section (TC-0001 #36, AC-15 — never merged with the tax figures above it).
 */
export default function Dashboard(): JSX.Element {
  const yearState = useWorkingTaxYear();
  const [result, setResult] = useState<ComputeYearResult | null>(null);
  const [categories, setCategories] = useState<DeductionCategoryRow[]>([]);
  const [sharedCaps, setSharedCaps] = useState<SharedCapRow[]>([]);
  const [generalTransactions, setGeneralTransactions] = useState<TransactionRow[]>([]);
  const [hasAnyTransactions, setHasAnyTransactions] = useState(false);

  const reload = useCallback(async (yearId: number) => {
    const [computed, cats, caps, transactions] = await Promise.all([
      window.api.calc.computeYear(yearId),
      window.api.deductions.listCategories(),
      window.api.settings.getSharedCaps(),
      window.api.transactions.listByYear(yearId),
    ]);
    setResult(computed);
    setCategories(cats);
    setSharedCaps(caps);
    setGeneralTransactions(transactions.filter((t) => !t.taxRelevant && t.status === 'active'));
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

  const generalTotalsByCategory = (Object.keys(GENERAL_CATEGORY_LABELS) as GeneralCategory[]).map(
    (category) => ({
      category,
      total: generalTransactions
        .filter((t) => t.generalCategory === category)
        .reduce((sum, t) => sum + t.amountMinor, 0),
    }),
  );

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
      <div className="page-head">
        <h1>Dashboard — ปีภาษี {yearState.year.year}</h1>
        <p>ตัวเลขนี้คำนวณสดจากรายการที่บันทึกไว้ ไม่ต้องรอปิดปีถึงจะเห็นภาพรวม (AC-12)</p>
      </div>

      <div className="section-label">🧾 ภาษี — คำนวณจากรายการภาษีเท่านั้น</div>
      <div className="tiles">
        <div className="tile accent">
          <div className="k">รายได้สะสม</div>
          <div className="v num">{formatSatangAsBaht(result.totalIncomeMinor)}</div>
        </div>
        <div className="tile">
          <div className="k">ภาษีหัก ณ ที่จ่ายสะสม</div>
          <div className="v num">{formatSatangAsBaht(result.whtTotalMinor)}</div>
        </div>
        <div className="tile">
          <div className="k">เงินได้สุทธิโดยประมาณ</div>
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

      {headroomRows.length > 0 && (
        <div className="panel">
          <div className="section-label">เพดานค่าลดหย่อน — ใช้ไปแล้ว / คงเหลือ</div>
          <div className="ded-group">
            {headroomRows.map((row) => {
              const percent = headroomPercent(row.usedMinor, row.capMinor);
              const overCap = row.capMinor !== null && row.usedMinor > row.capMinor;
              return (
                <div className="ded-row" style={{ gridTemplateColumns: '1fr 160px' }} key={row.key}>
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
        🛒 ทั่วไป — ไม่นับภาษี (แยกจากตัวเลขด้านบนโดยสิ้นเชิง, AC-15)
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
