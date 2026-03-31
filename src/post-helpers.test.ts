import { describe, it, expect, vi } from 'vitest';
import { postThread, type ThreadResult } from './post-helpers.js';

/** Create a mock AtpAgent that records all posts and returns sequential refs. */
function mockAgent() {
  let counter = 0;
  const posts: Array<{
    text: string;
    reply?: { root: { uri: string }; parent: { uri: string } };
    embed?: unknown;
  }> = [];

  const agent = {
    post: vi.fn(async (params: Record<string, unknown>) => {
      counter++;
      const ref = { uri: `at://post/${counter}`, cid: `cid-${counter}` };
      posts.push({
        text: params.text as string,
        reply: params.reply as typeof posts[0]['reply'],
        embed: params.embed,
      });
      return ref;
    }),
    uploadBlob: vi.fn(async () => ({ data: { blob: 'blob-ref' } })),
  };

  return { agent: agent as unknown as Parameters<typeof postThread>[0], posts };
}

function makeResult(overrides: Partial<ThreadResult> = {}): ThreadResult {
  return {
    summaryPosts: ['Summary post'],
    moviePosts: ['Movie 1 detail', 'Movie 2 detail'],
    movieIds: [100, 200],
    movieTitles: ['Movie 1', 'Movie 2'],
    trailerUrls: [null, null],
    trailerNames: ['Official Trailer', 'Official Trailer'],
    albumPosters: [],
    moviePosters: [null, null],
    ...overrides,
  };
}

describe('postThread', () => {
  it('posts single summary then movie replies as a thread', async () => {
    const { agent, posts } = mockAgent();
    const refs = await postThread(agent, makeResult());

    expect(posts).toHaveLength(3); // 1 summary + 2 replies
    expect(posts[0].reply).toBeUndefined(); // summary is root
    expect(posts[1].reply?.root.uri).toBe('at://post/1'); // reply roots to summary
    expect(posts[1].reply?.parent.uri).toBe('at://post/1'); // first reply parents to summary
    expect(posts[2].reply?.root.uri).toBe('at://post/1'); // second reply roots to summary
    expect(posts[2].reply?.parent.uri).toBe('at://post/2'); // second reply parents to first reply
    expect(refs).toHaveLength(2); // only movie reply refs returned
  });

  it('posts multiple summary parts when list overflows', async () => {
    const { agent, posts } = mockAgent();
    const refs = await postThread(agent, makeResult({
      summaryPosts: ['Summary part 1', 'Summary part 2'],
      moviePosts: ['Movie detail'],
      movieIds: [100],
      movieTitles: ['Movie'],
      trailerUrls: [null],
      trailerNames: ['Official Trailer'],
      moviePosters: [null],
    }));

    expect(posts).toHaveLength(3); // 2 summary + 1 reply

    // First summary is root (no reply)
    expect(posts[0].reply).toBeUndefined();

    // Second summary replies to first, with first as root
    expect(posts[1].reply?.root.uri).toBe('at://post/1');
    expect(posts[1].reply?.parent.uri).toBe('at://post/1');

    // Movie reply chains off last summary, roots to first
    expect(posts[2].reply?.root.uri).toBe('at://post/1');
    expect(posts[2].reply?.parent.uri).toBe('at://post/2');

    expect(refs).toHaveLength(1);
  });

  it('attaches album posters only to first summary post', async () => {
    const poster = { data: new Uint8Array([1]), mimeType: 'image/jpeg', alt: 'Poster' };
    const { agent, posts } = mockAgent();
    await postThread(agent, makeResult({
      summaryPosts: ['Part 1', 'Part 2'],
      albumPosters: [poster],
      moviePosts: [],
      movieIds: [],
      movieTitles: [],
      trailerUrls: [],
      trailerNames: [],
      moviePosters: [],
    }));

    expect(posts).toHaveLength(2);
    // First summary has image embed
    expect(posts[0].embed).toBeDefined();
    // Second summary has no embed (text-only overflow)
    expect(posts[1].embed).toBeUndefined();
  });
});
