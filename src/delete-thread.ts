/**
 * Delete a Bluesky post thread (summary + all replies).
 *
 * Usage:
 *   BLUESKY_HANDLE=... BLUESKY_APP_PASSWORD=... npx tsx src/delete-thread.ts <post-uri>
 *
 * The post URI is the at:// URI printed when posting, e.g.:
 *   at://did:plc:xxx/app.bsky.feed.post/yyy
 *
 * You can also pass a https://bsky.app/profile/.../post/... URL.
 */
import { type AtpAgent } from '@atproto/api';
import {
  createClient,
  credentialsFromEnv,
} from '../.toolbox/lib/bluesky/client.js';

/** Convert a bsky.app URL to an at:// URI by resolving the DID. */
async function resolvePostUrl(agent: AtpAgent, url: string): Promise<string> {
  const { pathname } = new URL(url);
  const match = pathname.match(/\/profile\/([^/]+)\/post\/([^/]+)/);
  if (!match) throw new Error(`Cannot parse Bluesky URL: ${url}`);

  const [, handleOrDid, rkey] = match;
  let did: string;
  if (handleOrDid.startsWith('did:')) {
    did = handleOrDid;
  } else {
    const { data } = await agent.resolveHandle({ handle: handleOrDid });
    did = data.did;
  }
  return `at://${did}/app.bsky.feed.post/${rkey}`;
}

/** Collect all post URIs in a thread (depth-first). */
function collectUris(thread: any): string[] {
  const uris: string[] = [];

  // Collect replies first (delete children before parent)
  if (thread.replies) {
    for (const reply of thread.replies) {
      uris.push(...collectUris(reply));
    }
  }

  if (thread.post?.uri) {
    uris.push(thread.post.uri);
  }

  return uris;
}

async function main(): Promise<void> {
  const input = process.argv[2];
  if (!input) {
    console.error('Usage: npx tsx src/delete-thread.ts <post-uri-or-url>');
    process.exit(1);
  }

  const credentials = credentialsFromEnv();
  const agent = await createClient(credentials);

  // Resolve URL to AT URI if needed
  let uri = input;
  if (input.startsWith('http')) {
    uri = await resolvePostUrl(agent, input);
    console.log(`Resolved to: ${uri}`);
  }

  // Fetch the full thread
  const { data } = await agent.getPostThread({ uri, depth: 100 });
  const uris = collectUris(data.thread);

  if (uris.length === 0) {
    console.log('No posts found in thread.');
    return;
  }

  console.log(`Found ${uris.length} post(s) in thread. Deleting...`);

  // Delete bottom-up (replies first, root last)
  for (const postUri of uris) {
    try {
      await agent.deletePost(postUri);
      console.log(`  Deleted: ${postUri}`);
    } catch (err: any) {
      console.error(`  Failed to delete ${postUri}: ${err.message}`);
    }
  }

  console.log('Done.');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
