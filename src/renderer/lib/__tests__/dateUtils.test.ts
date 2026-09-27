import { describe, expect, it } from 'vitest';

import {
  beYearFromYear,
  ceYearFromTaxYear,
  formatShortDate,
  formatThaiMonthYear,
  normalizeDateToCe,
  normalizeYearMonthToCe,
} from '../dateUtils';

describe('dateUtils', () => {
  describe('ceYearFromTaxYear', () => {
    it('converts Buddhist Era year to Christian Era year', () => {
      expect(ceYearFromTaxYear(2569)).toBe(2026);
      expect(ceYearFromTaxYear(2568)).toBe(2025);
    });

    it('keeps Christian Era year unchanged', () => {
      expect(ceYearFromTaxYear(2026)).toBe(2026);
      expect(ceYearFromTaxYear(2025)).toBe(2025);
    });
  });

  describe('beYearFromYear', () => {
    it('converts Christian Era year to Buddhist Era year', () => {
      expect(beYearFromYear(2026)).toBe(2569);
    });

    it('leaves Buddhist Era year unchanged', () => {
      expect(beYearFromYear(2569)).toBe(2569);
    });
  });

  describe('normalizeDateToCe', () => {
    it('converts BE date string to CE date string', () => {
      expect(normalizeDateToCe('2569-09-15')).toBe('2026-09-15');
      expect(normalizeDateToCe('2569-01-01')).toBe('2026-01-01');
    });

    it('preserves CE date string', () => {
      expect(normalizeDateToCe('2026-09-15')).toBe('2026-09-15');
    });
  });

  describe('normalizeYearMonthToCe', () => {
    it('converts BE yearMonth to CE yearMonth', () => {
      expect(normalizeYearMonthToCe('2569-09')).toBe('2026-09');
    });

    it('preserves CE yearMonth', () => {
      expect(normalizeYearMonthToCe('2026-09')).toBe('2026-09');
    });
  });

  describe('formatThaiMonthYear', () => {
    it('formats CE yearMonth correctly', () => {
      expect(formatThaiMonthYear('2026-09')).toBe('กันยายน 2569');
    });

    it('does not double-convert BE yearMonth (prevents year 3112)', () => {
      expect(formatThaiMonthYear('2569-09')).toBe('กันยายน 2569');
    });
  });

  describe('formatShortDate', () => {
    it('formats CE date correctly', () => {
      expect(formatShortDate('2026-09-15')).toBe('15 ก.ย. 69');
    });

    it('does not double-convert BE date (prevents year 3112)', () => {
      expect(formatShortDate('2569-09-15')).toBe('15 ก.ย. 69');
    });
  });
});
