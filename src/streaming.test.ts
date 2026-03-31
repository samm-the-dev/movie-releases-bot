import { describe, it, expect } from 'vitest';
import { formatStreamingDetail, getStreamingDateRange } from './streaming.js';
import type { StreamingChange } from './streaming-availability.js';

function makeChange(overrides: Partial<StreamingChange> = {}): StreamingChange {
  return {
    showId: '12345',
    title: 'Havoc',
    serviceId: 'netflix',
    serviceName: 'Netflix',
    link: 'https://www.netflix.com/title/12345',
    tmdbId: 101,
    imdbId: 'tt1234567',
    overview: 'A bruising action thriller.',
    releaseYear: 2025,
    genres: ['Action', 'Thriller'],
    directors: ['Gareth Evans'],
    runtime: 118,
    rating: 72,
    ...overrides,
  };
}

describe('formatStreamingDetail', () => {
  it('formats full detail with streaming service and link', () => {
    const text = formatStreamingDetail(makeChange(), 'https://www.netflix.com/title/12345');
    expect(text).toContain('Havoc');
    expect(text).toContain('Action/Thriller');
    expect(text).toContain('1h 58m');
    expect(text).toContain('Dir. Gareth Evans');
    expect(text).toContain('▶ Watch on Netflix');
    expect(text).toContain('https://www.netflix.com/title/12345');
  });

  it('falls back to TMDB link when no streaming link', () => {
    const text = formatStreamingDetail(makeChange({ serviceName: 'Disney+', tmdbId: 101 }), null);
    expect(text).toContain('▶ Watch on Disney+');
    expect(text).toContain('https://www.themoviedb.org/movie/101');
  });

  it('handles no runtime', () => {
    const text = formatStreamingDetail(makeChange({ runtime: null }), null);
    expect(text).toContain('Action/Thriller');
    expect(text).not.toContain('·');
  });

  it('handles no genres', () => {
    const text = formatStreamingDetail(makeChange({ genres: [] }), null);
    expect(text).toContain('Havoc');
    expect(text).toContain('1h 58m');
    // No genre line like "Action/Thriller" — only genres joined by /
    const lines = text.split('\n');
    const genreLine = lines.find((l) => l.includes('/') && !l.startsWith('http'));
    expect(genreLine).toBeUndefined();
  });

  it('handles no directors', () => {
    const text = formatStreamingDetail(makeChange({ directors: [] }), null);
    expect(text).not.toContain('Dir.');
  });
});

describe('getStreamingDateRange', () => {
  it('returns 7-day range as unix timestamps', () => {
    const ref = new Date('2026-03-31T12:00:00Z');
    const { from, to } = getStreamingDateRange(ref);
    const toDate = new Date(to * 1000);
    const fromDate = new Date(from * 1000);
    expect(toDate.getUTCDate()).toBe(31);
    expect(fromDate.getUTCDate()).toBe(24);
    expect(to - from).toBeCloseTo(7 * 24 * 60 * 60, -1);
  });
});
