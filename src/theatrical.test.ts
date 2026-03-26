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
  it('formats as date: title', () => {
    const line = formatMovieLine(makeMovie({ title: 'Sinners' }));
    expect(line).toBe('March 27: Sinners'); // March is not abbreviated in AP style
  });

  it('uses the movie release date', () => {
    const line = formatMovieLine(makeMovie({ release_date: '2026-04-01' }));
    expect(line).toBe('April 1: Test Movie'); // April is not abbreviated in AP style
  });

  it('does not add a period to non-abbreviated months', () => {
    // May, June, July, March, April are spelled out in AP style
    expect(formatMovieLine(makeMovie({ release_date: '2026-05-01' }))).toBe('May 1: Test Movie');
    expect(formatMovieLine(makeMovie({ release_date: '2026-06-01' }))).toBe('June 1: Test Movie');
    expect(formatMovieLine(makeMovie({ release_date: '2026-07-01' }))).toBe('July 1: Test Movie');
  });
});

describe('formatMovieDetail', () => {
  it('formats full details with title, genre, runtime, director, and TMDB link', () => {
    const text = formatMovieDetail(makeDetails());
    expect(text).toBe('Test Movie\nAction/Thriller \u2022 2h 0m\nDir. Test Director\nhttps://www.themoviedb.org/movie/1');
  });

  it('puts date before genre in meta line', () => {
    const text = formatMovieDetail(makeDetails(), '2026-04-01');
    expect(text).toBe('Test Movie\nApril 1 \u2022 Action/Thriller \u2022 2h 0m\nDir. Test Director\nhttps://www.themoviedb.org/movie/1');
  });

  it('omits date segment when not provided', () => {
    const text = formatMovieDetail(makeDetails());
    expect(text).toContain('Action/Thriller \u2022 2h 0m');
    expect(text).not.toMatch(/\w+\. \d+/); // no date prefix
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
    expect(text).toContain('Test Movie\nAction/Thriller \u2022 2h 0m\nhttps://');
    expect(text).not.toContain('Dir.');
  });

  it('always includes TMDB link', () => {
    const text = formatMovieDetail(makeDetails({ id: 42 }));
    expect(text).toContain('https://www.themoviedb.org/movie/42');
  });
});
