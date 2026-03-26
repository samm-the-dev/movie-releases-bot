import { describe, it, expect } from 'vitest';
import { formatMovieLine, formatMovieDetail } from './theatrical.js';
import type { TMDBMovie, TMDBMovieDetails } from './tmdb.js';

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

function makeDetails(overrides: Partial<TMDBMovieDetails> = {}): TMDBMovieDetails {
  return {
    id: 1,
    title: 'Test Movie',
    overview: 'A great film.',
    runtime: 120,
    poster_path: '/test.jpg',
    genres: [{ id: 28, name: 'Action' }, { id: 53, name: 'Thriller' }],
    directors: ['Test Director'],
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
});

describe('formatMovieDetail', () => {
  it('formats full details with title, genre, runtime, director, and TMDB link', () => {
    const text = formatMovieDetail(makeDetails());
    expect(text).toBe('Test Movie\nAction/Thriller \u00B7 2h 0m\nDir. Test Director\nhttps://www.themoviedb.org/movie/1');
  });

  it('includes opening date when provided', () => {
    const text = formatMovieDetail(makeDetails(), '2026-04-01');
    expect(text).toContain('Opens Apr 1');
    expect(text).toContain('https://www.themoviedb.org/movie/1');
    // date appears before the link
    expect(text.indexOf('Opens Apr 1')).toBeLessThan(text.indexOf('https://'));
  });

  it('omits opening date when not provided', () => {
    const text = formatMovieDetail(makeDetails());
    expect(text).not.toContain('Opens');
  });

  it('handles multiple directors', () => {
    const text = formatMovieDetail(makeDetails({ directors: ['Alice', 'Bob'] }));
    expect(text).toContain('Dir. Alice, Bob');
  });

  it('handles no runtime', () => {
    const text = formatMovieDetail(makeDetails({ runtime: null }));
    expect(text).toContain('Test Movie\nAction/Thriller\nDir. Test Director');
  });

  it('handles no directors', () => {
    const text = formatMovieDetail(makeDetails({ directors: [] }));
    expect(text).toContain('Test Movie\nAction/Thriller \u00B7 2h 0m\nhttps://');
    expect(text).not.toContain('Dir.');
  });

  it('always includes TMDB link', () => {
    const text = formatMovieDetail(makeDetails({ id: 42 }));
    expect(text).toContain('https://www.themoviedb.org/movie/42');
  });
});
