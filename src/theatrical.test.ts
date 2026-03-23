import { describe, it, expect } from 'vitest';
import { formatMovieLine } from './theatrical.js';
import type { TMDBMovie } from './tmdb.js';

const genreMap = new Map([
  [28, 'Action'],
  [27, 'Horror'],
  [53, 'Thriller'],
  [35, 'Comedy'],
  [18, 'Drama'],
]);

function makeMovie(overrides: Partial<TMDBMovie> = {}): TMDBMovie {
  return {
    id: 1,
    title: 'Test Movie',
    overview: 'A great film about testing things in the real world.',
    popularity: 100,
    release_date: '2026-03-27',
    genre_ids: [28, 53],
    poster_path: '/test.jpg',
    ...overrides,
  };
}

describe('formatMovieLine', () => {
  it('includes title and genres for short titles', () => {
    const line = formatMovieLine(makeMovie({ title: 'Sinners' }), genreMap);
    expect(line).toContain('Sinners');
    expect(line).toContain('Action/Thriller');
  });

  it('handles movies with no genres', () => {
    const line = formatMovieLine(makeMovie({ genre_ids: [] }), genreMap);
    expect(line).toContain('Test Movie');
    expect(line).not.toContain('()');
  });

  it('handles movies with no overview', () => {
    const line = formatMovieLine(makeMovie({ overview: '' }), genreMap);
    expect(line).toContain('Test Movie');
  });

  it('truncates long overviews', () => {
    const movie = makeMovie({
      title: 'Short',
      overview: 'This is a very long overview that should get truncated because it exceeds the maximum length we allow per line in the bullet list format.',
    });
    const line = formatMovieLine(movie, genreMap);
    expect(line.length).toBeLessThan(120);
  });

  it('limits to 2 genres', () => {
    const movie = makeMovie({ genre_ids: [28, 27, 53, 35] });
    const line = formatMovieLine(movie, genreMap);
    // Should show Action/Horror, not all four
    expect(line).toContain('Action/Horror');
    expect(line).not.toContain('Thriller');
  });
});
