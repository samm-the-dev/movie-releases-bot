import { describe, it, expect } from 'vitest';
import { formatDate, getTheatricalDateRange, ReleaseType } from './tmdb.js';

describe('formatDate', () => {
  it('formats a date as YYYY-MM-DD', () => {
    expect(formatDate(new Date('2026-03-27T12:00:00Z'))).toBe('2026-03-27');
  });
});

describe('getTheatricalDateRange', () => {
  it('returns Thursday-Wednesday range from a Thursday', () => {
    // March 26, 2026 is a Thursday
    const ref = new Date('2026-03-26T10:00:00Z');
    const range = getTheatricalDateRange(ref);
    expect(range.gte).toBe('2026-03-26');
    expect(range.lte).toBe('2026-04-01');
  });

  it('returns next Thursday-Wednesday range from a Monday', () => {
    // March 23, 2026 is a Monday
    const ref = new Date('2026-03-23T10:00:00Z');
    const range = getTheatricalDateRange(ref);
    expect(range.gte).toBe('2026-03-26');
    expect(range.lte).toBe('2026-04-01');
  });

  it('returns same-week Thursday from a Friday', () => {
    // March 27, 2026 is a Friday -- should go to next Thursday
    const ref = new Date('2026-03-27T10:00:00Z');
    const range = getTheatricalDateRange(ref);
    expect(range.gte).toBe('2026-04-02');
    expect(range.lte).toBe('2026-04-08');
  });
});

describe('ReleaseType', () => {
  it('has correct values', () => {
    expect(ReleaseType.THEATRICAL).toBe(3);
    expect(ReleaseType.DIGITAL).toBe(4);
  });
});
