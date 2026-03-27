import { describe, it, expect } from 'vitest';
import { formatTrailerDetail, type TrailerEntry } from './trailers.js';

function makeTrailerEntry(overrides: Partial<TrailerEntry> = {}): TrailerEntry {
  return {
    details: {
      id: 99,
      title: 'Sinners',
      overview: 'A vampire thriller.',
      runtime: 137,
      poster_path: '/sinners.jpg',
      genres: [{ id: 27, name: 'Horror' }, { id: 53, name: 'Thriller' }],
      directors: ['Ryan Coogler'],
      trailerUrl: 'https://www.youtube.com/watch?v=abc123',
      trailerName: 'Official Trailer',
      trailerPublishedAt: '2026-03-20T00:00:00.000Z',
    },
    trailerUrl: 'https://www.youtube.com/watch?v=abc123',
    trailerName: 'Official Trailer',
    releaseDate: '2026-03-27',
    poster: null,
    ...overrides,
  };
}

describe('formatTrailerDetail', () => {
  it('formats full detail with genres, runtime, director, and release date', () => {
    const text = formatTrailerDetail(makeTrailerEntry());
    expect(text).toContain('Sinners');
    expect(text).toContain('Horror/Thriller');
    expect(text).toContain('2h 17m');
    expect(text).toContain('Dir. Ryan Coogler');
    expect(text).toContain('In theaters March 27');
  });

  it('handles no runtime', () => {
    const entry = makeTrailerEntry();
    entry.details.runtime = null;
    const text = formatTrailerDetail(entry);
    expect(text).toContain('Horror/Thriller');
    expect(text).not.toMatch(/\d+h \d+m/);
  });

  it('handles no directors', () => {
    const entry = makeTrailerEntry();
    entry.details.directors = [];
    const text = formatTrailerDetail(entry);
    expect(text).not.toContain('Dir.');
  });
});
