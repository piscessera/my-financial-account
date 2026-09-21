import { describe, expect, it } from 'vitest';

import { openTempDatabase } from '../../db/__tests__/helpers';
import { createTaxYear } from '../taxYears';
import {
  createTemplate,
  deleteTemplate,
  getMonthlyChecklist,
  listTemplates,
  recordRecurringItem,
  setTemplateActive,
  skipRecurringItem,
  undoRecurringItem,
  updateTemplate,
} from '../recurring';
import { listByYear } from '../transactions';

describe('REQ-0005 / TC-0005: Monthly Recurring Checklist Repository', () => {
  it('TC-0005 #2: performs CRUD on recurring templates', () => {
    const db = openTempDatabase();
    try {
      const template = createTemplate(db.sqlite, {
        name: 'ค่าเน็ตบ้าน',
        kind: 'expense',
        generalCategory: 'housing',
        dueDay: 15,
        defaultAmountMinor: 699_00,
        defaultNote: 'หักอัตโนมัติ',
      });

      expect(template.id).toBeGreaterThan(0);
      expect(template.name).toBe('ค่าเน็ตบ้าน');
      expect(template.dueDay).toBe(15);
      expect(template.defaultAmountMinor).toBe(699_00);
      expect(template.isActive).toBe(true);

      const updated = updateTemplate(db.sqlite, template.id, {
        name: 'ค่าเน็ตบ้าน AIS Fibre',
        defaultAmountMinor: 749_00,
      });
      expect(updated.name).toBe('ค่าเน็ตบ้าน AIS Fibre');
      expect(updated.defaultAmountMinor).toBe(749_00);

      const deactivated = setTemplateActive(db.sqlite, template.id, false);
      expect(deactivated.isActive).toBe(false);

      expect(listTemplates(db.sqlite, false)).toHaveLength(0);
      expect(listTemplates(db.sqlite, true)).toHaveLength(1);

      deleteTemplate(db.sqlite, template.id);
      expect(listTemplates(db.sqlite, true)).toHaveLength(0);
    } finally {
      db.dispose();
    }
  });

  it('TC-0005 #3, #4, #5, #6: manages monthly checklist state (record, skip, undo)', () => {
    const db = openTempDatabase();
    try {
      const year = createTaxYear(db.sqlite, { year: 2026 });
      const rent = createTemplate(db.sqlite, {
        name: 'ค่าเช่าคอนโด',
        kind: 'expense',
        generalCategory: 'housing',
        dueDay: 1,
        defaultAmountMinor: 12000_00,
      });
      const net = createTemplate(db.sqlite, {
        name: 'ค่าเน็ตบ้าน',
        kind: 'expense',
        generalCategory: 'housing',
        dueDay: 15,
        defaultAmountMinor: 699_00,
      });

      // 1. Initial checklist for 2026-03 should have 2 pending items
      const initial = getMonthlyChecklist(db.sqlite, '2026-03');
      expect(initial).toHaveLength(2);
      expect(initial.every((i) => i.status === 'pending')).toBe(true);

      // 2. Record rent
      const { log, transaction } = recordRecurringItem(db.sqlite, {
        templateId: rent.id,
        yearMonth: '2026-03',
        taxYearId: year.id,
        date: '2026-03-01',
      });
      expect(log.status).toBe('completed');
      expect(transaction.taxRelevant).toBe(false);
      expect(transaction.amountMinor).toBe(12000_00);

      // Verify transactions in year
      const txs = listByYear(db.sqlite, year.id);
      expect(txs).toHaveLength(1);
      expect(txs[0].id).toBe(transaction.id);

      // 3. Skip net
      const skipLog = skipRecurringItem(db.sqlite, net.id, '2026-03');
      expect(skipLog.status).toBe('skipped');

      // 4. Checklist now shows 1 completed, 1 skipped
      const after = getMonthlyChecklist(db.sqlite, '2026-03');
      const rentItem = after.find((i) => i.template.id === rent.id)!;
      const netItem = after.find((i) => i.template.id === net.id)!;
      expect(rentItem.status).toBe('completed');
      expect(rentItem.transaction?.id).toBe(transaction.id);
      expect(netItem.status).toBe('skipped');

      // 5. Checklist for another month (2026-04) is still clean pending
      const april = getMonthlyChecklist(db.sqlite, '2026-04');
      expect(april.every((i) => i.status === 'pending')).toBe(true);

      // 6. Undo rent
      undoRecurringItem(db.sqlite, rent.id, '2026-03');
      const undone = getMonthlyChecklist(db.sqlite, '2026-03');
      expect(undone.find((i) => i.template.id === rent.id)!.status).toBe('pending');
    } finally {
      db.dispose();
    }
  });

  it('TC-0005 #7: deactivated template stops appearing in new months', () => {
    const db = openTempDatabase();
    try {
      const t = createTemplate(db.sqlite, {
        name: 'สตรีมมิ่ง Netflix',
        kind: 'expense',
        generalCategory: 'shopping',
        dueDay: 25,
        defaultAmountMinor: 419_00,
      });

      expect(getMonthlyChecklist(db.sqlite, '2026-03')).toHaveLength(1);
      setTemplateActive(db.sqlite, t.id, false);
      expect(getMonthlyChecklist(db.sqlite, '2026-03')).toHaveLength(0);
    } finally {
      db.dispose();
    }
  });
});
