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
  it('formats title with genres', () => {
    const line = formatMovieLine(makeMovie({ title: 'Sinners' }), genreMap);
    expect(line).toBe('Sinners (Action/Thriller)');
  });

  it('returns title only when no genres', () => {
    const line = formatMovieLine(makeMovie({ genre_ids: [] }), genreMap);
    expect(line).toBe('Test Movie');
  });

  it('limits to 2 genres', () => {
    const movie = makeMovie({ genre_ids: [28, 27, 53, 35] });
    const line = formatMovieLine(movie, genreMap);
    expect(line).toBe('Test Movie (Action/Horror)');
  });

  it('does not include overview text', () => {
    const line = formatMovieLine(makeMovie(), genreMap);
    expect(line).not.toContain('great film');
    expect(line).toBe('Test Movie (Action/Thriller)');
  });
});
