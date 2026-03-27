import { describe, it, expect } from 'vitest';
import { formatDate, formatRuntime, getTheatricalDateRange, pickTrailer, youtubeKeyFromUrl, youtubeThumbnailUrl, ReleaseType, type TMDBVideo } from './tmdb.js';

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

describe('formatRuntime', () => {
  it('formats hours and minutes', () => {
    expect(formatRuntime(132)).toBe('2h 12m');
  });

  it('formats sub-hour runtime', () => {
    expect(formatRuntime(45)).toBe('45m');
  });

  it('returns null for null input', () => {
    expect(formatRuntime(null)).toBeNull();
  });

  it('returns null for zero', () => {
    expect(formatRuntime(0)).toBeNull();
  });
});

describe('ReleaseType', () => {
  it('has correct values', () => {
    expect(ReleaseType.THEATRICAL).toBe(3);
    expect(ReleaseType.DIGITAL).toBe(4);
  });
});

describe('pickTrailer', () => {
  function makeVideo(overrides: Partial<TMDBVideo> = {}): TMDBVideo {
    return {
      key: 'abc123',
      site: 'YouTube',
      type: 'Trailer',
      official: true,
      name: 'Official Trailer',
      iso_639_1: 'en',
      published_at: '2026-03-20T00:00:00.000Z',
      ...overrides,
    };
  }

  it('picks the official YouTube trailer', () => {
    const result = pickTrailer([makeVideo()]);
    expect(result).toEqual({
      url: 'https://www.youtube.com/watch?v=abc123',
      name: 'Official Trailer',
      publishedAt: '2026-03-20T00:00:00.000Z',
    });
  });

  it('prefers Trailer over Teaser', () => {
    const result = pickTrailer([
      makeVideo({ key: 'teaser1', type: 'Teaser', published_at: '2026-03-25T00:00:00.000Z' }),
      makeVideo({ key: 'trailer1', type: 'Trailer', published_at: '2026-03-20T00:00:00.000Z' }),
    ]);
    expect(result?.url).toBe('https://www.youtube.com/watch?v=trailer1');
  });

  it('picks most recently published trailer of same type', () => {
    const result = pickTrailer([
      makeVideo({ key: 'old', published_at: '2026-01-01T00:00:00.000Z' }),
      makeVideo({ key: 'new', published_at: '2026-03-25T00:00:00.000Z' }),
    ]);
    expect(result?.url).toBe('https://www.youtube.com/watch?v=new');
  });

  it('ignores non-YouTube videos', () => {
    expect(pickTrailer([makeVideo({ site: 'Vimeo' })])).toBeNull();
  });

  it('ignores unofficial videos', () => {
    expect(pickTrailer([makeVideo({ official: false })])).toBeNull();
  });

  it('ignores non-English videos', () => {
    expect(pickTrailer([makeVideo({ iso_639_1: 'ja' })])).toBeNull();
  });

  it('ignores non-trailer types like Featurette', () => {
    expect(pickTrailer([makeVideo({ type: 'Featurette' })])).toBeNull();
  });

  it('returns null for empty list', () => {
    expect(pickTrailer([])).toBeNull();
  });
});

describe('youtubeKeyFromUrl', () => {
  it('extracts key from standard YouTube URL', () => {
    expect(youtubeKeyFromUrl('https://www.youtube.com/watch?v=abc123')).toBe('abc123');
  });

  it('extracts key from URL with extra params', () => {
    expect(youtubeKeyFromUrl('https://www.youtube.com/watch?v=abc123&t=10')).toBe('abc123');
  });

  it('returns null for non-YouTube URLs', () => {
    expect(youtubeKeyFromUrl('https://vimeo.com/12345')).toBeNull();
  });
});

describe('youtubeThumbnailUrl', () => {
  it('returns hqdefault thumbnail URL', () => {
    expect(youtubeThumbnailUrl('abc123')).toBe('https://i.ytimg.com/vi/abc123/hqdefault.jpg');
  });
});
