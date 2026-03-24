import { describe, it, expect } from 'vitest';
import { formatPhysicalDetail, getPhysicalDateRange, type PhysicalRelease } from './physical.js';

function makeRelease(overrides: Partial<PhysicalRelease> = {}): PhysicalRelease {
  return {
    details: {
      id: 453,
      title: 'Mulholland Drive',
      overview: 'A surreal Hollywood mystery.',
      runtime: 147,
      poster_path: '/mulholland.jpg',
      genres: [{ id: 53, name: 'Thriller' }, { id: 9648, name: 'Mystery' }],
      directors: ['David Lynch'],
    },
    originalYear: 2001,
    physicalDate: '2026-03-15',
    poster: null,
    ...overrides,
  };
}

describe('formatPhysicalDetail', () => {
  it('formats full detail with original year and physical release date', () => {
    const text = formatPhysicalDetail(makeRelease());
    expect(text).toContain('Mulholland Drive (2001)');
    expect(text).toContain('Thriller/Mystery');
    expect(text).toContain('2h 27m');
    expect(text).toContain('Dir. David Lynch');
    expect(text).toContain('Physical release Mar 15');
    expect(text).toContain('https://www.themoviedb.org/movie/453');
  });

  it('omits physical date line when no date', () => {
    const text = formatPhysicalDetail(makeRelease({ physicalDate: null }));
    expect(text).not.toContain('Physical release');
    expect(text).toContain('Mulholland Drive (2001)');
  });

  it('handles no runtime', () => {
    const release = makeRelease();
    release.details.runtime = null;
    const text = formatPhysicalDetail(release);
    expect(text).toContain('Thriller/Mystery');
    expect(text).not.toContain('·');
  });

  it('handles no directors', () => {
    const release = makeRelease();
    release.details.directors = [];
    const text = formatPhysicalDetail(release);
    expect(text).not.toContain('Dir.');
    expect(text).toContain('Mulholland Drive (2001)');
  });

  it('handles no genres', () => {
    const release = makeRelease();
    release.details.genres = [];
    const text = formatPhysicalDetail(release);
    expect(text).toContain('Mulholland Drive (2001)');
    expect(text).toContain('2h 27m');
  });
});

describe('getPhysicalDateRange', () => {
  it('returns a 30-day window by default', () => {
    const ref = new Date('2026-03-24T12:00:00Z');
    const { gte, lte } = getPhysicalDateRange(ref);
    expect(lte).toBe('2026-03-24');
    expect(gte).toBe('2026-02-22');
  });

  it('respects custom lookback days', () => {
    const ref = new Date('2026-03-24T12:00:00Z');
    const { gte, lte } = getPhysicalDateRange(ref, 7);
    expect(lte).toBe('2026-03-24');
    expect(gte).toBe('2026-03-17');
  });
});
