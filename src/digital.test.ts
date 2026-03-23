import { describe, it, expect } from 'vitest';
import { formatDigitalDetail, type DigitalRelease } from './digital.js';
import type { TMDBMovieDetails } from './tmdb.js';

function makeRelease(overrides: Partial<DigitalRelease> = {}): DigitalRelease {
  return {
    details: {
      id: 42,
      title: 'Companion',
      overview: 'An AI thriller.',
      runtime: 97,
      poster_path: '/companion.jpg',
      genres: [{ id: 53, name: 'Thriller' }, { id: 878, name: 'Science Fiction' }],
      directors: ['Drew Hancock'],
    },
    theatricalDate: '2026-01-10',
    digitalDate: '2026-03-25',
    poster: null,
    ...overrides,
  };
}

describe('formatDigitalDetail', () => {
  it('formats full detail with theatrical-to-digital date window', () => {
    const text = formatDigitalDetail(makeRelease());
    expect(text).toContain('Companion');
    expect(text).toContain('Thriller/Science Fiction');
    expect(text).toContain('1h 37m');
    expect(text).toContain('Dir. Drew Hancock');
    expect(text).toContain('Theatrical Jan 10 \u2192 Digital Mar 25');
    expect(text).toContain('https://www.themoviedb.org/movie/42');
  });

  it('shows only digital date when no theatrical date', () => {
    const text = formatDigitalDetail(makeRelease({ theatricalDate: null }));
    expect(text).toContain('Digital Mar 25');
    expect(text).not.toContain('Theatrical');
    expect(text).not.toContain('\u2192');
  });

  it('handles no dates', () => {
    const text = formatDigitalDetail(makeRelease({ theatricalDate: null, digitalDate: null }));
    expect(text).not.toContain('Theatrical');
    expect(text).not.toContain('Digital');
    expect(text).toContain('Companion');
  });

  it('handles no runtime', () => {
    const release = makeRelease();
    release.details.runtime = null;
    const text = formatDigitalDetail(release);
    expect(text).toContain('Thriller/Science Fiction');
    expect(text).not.toContain('\u00B7');
  });
});
