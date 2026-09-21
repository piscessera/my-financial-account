import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import RecurringChecklist from '../RecurringChecklist';
import ManageRecurringModal from '../ManageRecurringModal';

describe('REQ-0005 / TC-0005: RecurringChecklist and ManageRecurringModal UI', () => {
  it('TC-0005 #8: renders RecurringChecklist component in static markup without error', () => {
    // Mock window.api
    (globalThis as unknown as { window: { api: unknown } }).window = {
      api: {
        recurring: {
          getMonthlyChecklist: vi.fn().mockResolvedValue([]),
          listTemplates: vi.fn().mockResolvedValue([]),
        },
      },
    };

    const html = renderToStaticMarkup(
      <RecurringChecklist
        taxYearId={1}
        yearMonth="2026-03"
        onTransactionCreated={() => {}}
      />,
    );

    expect(html).toContain('รายการประจำเดือน');
    expect(html).toContain('2026-03');
    expect(html).toContain('⚙️ จัดการแม่แบบ');
  });

  it('renders ManageRecurringModal without error', () => {
    const html = renderToStaticMarkup(
      <ManageRecurringModal
        onClose={() => {}}
        onUpdated={() => {}}
      />,
    );

    expect(html).toContain('จัดการแม่แบบรายการประจำ');
    expect(html).toContain('+ เพิ่มแม่แบบใหม่');
  });
});
