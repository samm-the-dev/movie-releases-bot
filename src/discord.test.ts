import { describe, it, expect } from 'vitest';
import { buildDescription } from './discord.js';

describe('buildDescription', () => {
  it('links movie titles to TMDB pages (flat list, no deep links)', () => {
    const desc = buildDescription(
      ['Havoc', 'Django Unchained'],
      [101, 68718],
    );
    expect(desc).toContain('• [Havoc](https://www.themoviedb.org/movie/101)');
    expect(desc).toContain('• [Django Unchained](https://www.themoviedb.org/movie/68718)');
  });

  it('prefers deep links over TMDB when provided', () => {
    const desc = buildDescription(
      ['Havoc', 'Django Unchained'],
      [101, 68718],
      undefined,
      ['https://www.netflix.com/title/12345', 'https://www.hulu.com/movie/django-abc'],
    );
    expect(desc).toContain('• [Havoc](https://www.netflix.com/title/12345)');
    expect(desc).toContain('• [Django Unchained](https://www.hulu.com/movie/django-abc)');
    expect(desc).not.toContain('themoviedb');
  });

  it('falls back to TMDB when deep link is null', () => {
    const desc = buildDescription(
      ['Havoc'],
      [101],
      undefined,
      [null],
    );
    expect(desc).toContain('https://www.themoviedb.org/movie/101');
  });

  it('groups by service with deep links', () => {
    const desc = buildDescription(
      ['28 Years Later', 'Django Unchained'],
      [933260, 68718],
      [
        { label: 'Netflix', indices: [0] },
        { label: 'Hulu', indices: [1] },
      ],
      ['https://www.netflix.com/title/82622299/', 'https://www.hulu.com/movie/django-abc'],
    );
    expect(desc).toContain('**Netflix:**');
    expect(desc).toContain('• [28 Years Later](https://www.netflix.com/title/82622299/)');
    expect(desc).toContain('**Hulu:**');
    expect(desc).toContain('• [Django Unchained](https://www.hulu.com/movie/django-abc)');
    expect(desc).toContain('\n\n**Hulu:**');
  });

  it('appends Bluesky thread link when provided', () => {
    const desc = buildDescription(
      ['Havoc'], [101], undefined, undefined,
      'https://bsky.app/profile/lagttm.bsky.social/post/abc123',
    );
    expect(desc).toContain('[View full thread on Bluesky]');
  });

  it('falls back to plain text when ID is 0 and no link', () => {
    const desc = buildDescription(['Unknown Movie'], [0]);
    expect(desc).toBe('• Unknown Movie');
  });
});
