/**
 * Built-in reference data for `seed.ts` (AT-1.5, REQ-0004).
 *
 * Contains statutory Thai personal income tax progressive brackets (0% up to 35%)
 * and standard baseline deduction categories.
 */
import type { SeedDataSet } from '../seed';

export const TAX_YEAR_2025_SEED: SeedDataSet = {
  label: 'TAX-2025',
  sharedCaps: [
    {
      name: 'กลุ่มประกันชีวิตและสุขภาพ',
      capAmountMinor: 10_000_000, // 100,000.00 THB shared cap
    },
  ],
  deductionCategories: [
    {
      code: 'personal',
      name: 'ผู้มีเงินได้',
      capType: 'fixed',
      capAmountMinor: 6_000_000, // 60,000.00 THB
      sortOrder: 1,
      description: 'ค่าลดหย่อนส่วนตัวของผู้มีเงินได้',
      isBuiltin: true,
    },
    {
      code: 'life_insurance',
      name: 'เบี้ยประกันชีวิต',
      capType: 'shared_group_member',
      sharedGroupName: 'กลุ่มประกันชีวิตและสุขภาพ',
      sortOrder: 2,
      description: 'เบี้ยประกันชีวิตทั่วไป (รวมกลุ่มไม่เกิน 100,000 บาท)',
      isBuiltin: true,
    },
    {
      code: 'health_insurance',
      name: 'เบี้ยประกันสุขภาพ',
      capType: 'shared_group_member',
      capAmountMinor: 2_500_000, // 25,000.00 THB sub-cap
      sharedGroupName: 'กลุ่มประกันชีวิตและสุขภาพ',
      sortOrder: 3,
      description: 'เบี้ยประกันสุขภาพตนเอง (ไม่เกิน 25,000 บาท และรวมกับประกันชีวิตไม่เกิน 100,000 บาท)',
      isBuiltin: true,
    },
    {
      code: 'social_security',
      name: 'เงินสมทบกองทุนประกันสังคม',
      capType: 'fixed',
      capAmountMinor: 900_000, // 9,000.00 THB
      sortOrder: 4,
      description: 'เงินสมทบประกันสังคมตามที่จ่ายจริง สูงสุด 9,000 บาท',
      isBuiltin: true,
    },
    {
      code: 'home_loan_interest',
      name: 'ดอกเบี้ยเงินกู้ยืมเพื่อซื้อที่อยู่อาศัย',
      capType: 'fixed',
      capAmountMinor: 10_000_000, // 100,000.00 THB
      sortOrder: 5,
      description: 'ดอกเบี้ยเงินกู้ยืมเพื่อซื้อ เช่าซื้อ หรือสร้างอาคารที่อยู่อาศัย ตามที่จ่ายจริงไม่เกิน 100,000 บาท',
      isBuiltin: true,
    },
  ],
  taxBrackets: [
    {
      lowerBoundMinor: 0,
      upperBoundMinor: 15_000_000, // 150,000.00 THB
      rateBp: 0, // 0%
      sortOrder: 1,
    },
    {
      lowerBoundMinor: 15_000_000,
      upperBoundMinor: 30_000_000, // 300,000.00 THB
      rateBp: 500, // 5%
      sortOrder: 2,
    },
    {
      lowerBoundMinor: 30_000_000,
      upperBoundMinor: 50_000_000, // 500,000.00 THB
      rateBp: 1000, // 10%
      sortOrder: 3,
    },
    {
      lowerBoundMinor: 50_000_000,
      upperBoundMinor: 75_000_000, // 750,000.00 THB
      rateBp: 1500, // 15%
      sortOrder: 4,
    },
    {
      lowerBoundMinor: 75_000_000,
      upperBoundMinor: 100_000_000, // 1,000,000.00 THB
      rateBp: 2000, // 20%
      sortOrder: 5,
    },
    {
      lowerBoundMinor: 100_000_000,
      upperBoundMinor: 200_000_000, // 2,000,000.00 THB
      rateBp: 2500, // 25%
      sortOrder: 6,
    },
    {
      lowerBoundMinor: 200_000_000,
      upperBoundMinor: 500_000_000, // 5,000,000.00 THB
      rateBp: 3000, // 30%
      sortOrder: 7,
    },
    {
      lowerBoundMinor: 500_000_000,
      upperBoundMinor: null, // Open-ended top bracket
      rateBp: 3500, // 35%
      sortOrder: 8,
    },
  ],
};
